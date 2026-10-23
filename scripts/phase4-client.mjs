import { request } from 'node:https';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { directory, manifest } from './lib.mjs';
export const deployment=await manifest();
const ca=await readFile(path.join(directory,'security/ca-cert.pem'));
export const credentials=JSON.parse(await readFile(process.env.STEWARD_SEED_CREDENTIALS_FILE??path.join(directory,'security/verification.json'),'utf8'));
export const origin=key=>{const i=deployment.instances.find(i=>i.key===key);return `https://${key}.localhost:${i.webPort+1000}`;};
export const sessions={};
export async function api(key,url,method='GET',body,expected=200,session=sessions[key]){
 return new Promise((resolve,reject)=>{
  const data=body===undefined?undefined:JSON.stringify(body);
  const req=request(origin(key)+url,{method,ca,rejectUnauthorized:true,timeout:100000,lookup:(_h,_o,cb)=>cb(null,[{address:'127.0.0.1',family:4}]),headers:{...(session?{cookie:session.cookie}:{}),...(data?{'content-type':'application/json',origin:origin(key),'x-csrf-token':session?.csrfToken??''}:{})}},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>{try{const value=JSON.parse(text);if(res.statusCode!==expected)throw new Error(`${key} ${method} ${url}: expected ${expected}, received ${res.statusCode} (${value.error??'request failed'})`);resolve({value,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]});}catch(e){reject(e);}});});req.on('error',()=>reject(new Error('TLS connection unavailable')));req.on('timeout',()=>req.destroy());req.end(data);
 });
}
export async function login(key,account){let r;try{r=await api(key,'/api/v2/auth/login','POST',account,200,null);}catch(e){if(process.env.STEWARD_DEMO_RETRY_LOGIN!=='1'||!e.message.includes('received 429'))throw e;console.log('Authentication is throttled; waiting for the existing one-minute security window before one retry.');await new Promise(resolve=>setTimeout(resolve,60000));r=await api(key,'/api/v2/auth/login','POST',account,200,null);}sessions[key]={cookie:r.cookie,csrfToken:r.value.csrfToken,account:r.value.account};return sessions[key];}
export async function logins(){await login('master',credentials.accounts.registry);for(const key of ['worker-1','worker-2','worker-3'])await login(key,credentials.accounts[key]);}
export async function waitFor(check,label,timeout=90000){const until=Date.now()+timeout;while(Date.now()<until){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,700));}throw new Error('Timed out: '+label);}
