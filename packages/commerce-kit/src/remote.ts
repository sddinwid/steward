import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {boundedLookup} from '@steward/module-sdk';
import {ensure,type Data} from '@steward/business-kit';
export class ConnectorError extends Error{constructor(public code:string,public retryable=false){super(code);}}
export async function connectorConnections(provider:'shopify'|'printify',mode:string,file='/run/module-secrets/connector.json'):Promise<Data[]>{
 let bundle:Data;try{bundle=JSON.parse(await readFile(file,'utf8'));}catch{throw new ConnectorError('CONNECTOR_CONFIGURATION_REQUIRED');}
 const connections:Data[]=bundle.version===2?bundle.connections:[{...bundle,connectionId:'default'}];
 ensure(Array.isArray(connections)&&connections.length>0&&connections.length<=10,'Invalid connector connection bundle',503);
 ensure(connections.every(s=>/^[a-z][a-z0-9-]{0,39}$/.test(s.connectionId))&&new Set(connections.map(s=>s.connectionId)).size===connections.length,'Connection identities must be unique',503);
 ensure(new Set(connections.map(s=>provider==='shopify'?s.shopDomain:s.shopId)).size===connections.length,'Store identities must be unique',503);
 return connections.map(s=>validateSecret(provider,mode,s));
}
export async function connectorSecret(provider:'shopify'|'printify',mode:string,file='/run/module-secrets/connector.json',connectionId='default'):Promise<Data>{
 const s=(await connectorConnections(provider,mode,file)).find(s=>s.connectionId===connectionId);if(!s)throw new ConnectorError('CONNECTOR_CONNECTION_NOT_CONFIGURED');return s;
}
function validateSecret(provider:'shopify'|'printify',mode:string,s:Data):Data{
 const url=new URL(s.baseUrl);ensure(s.provider===provider&&s.mode===mode&&url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&typeof s.token==='string'&&s.token.length>=24&&typeof s.webhookSecret==='string'&&s.webhookSecret.length>=24,'Connector trust or credential configuration invalid',503);
 if(s.expiresAt&&(!Number.isFinite(Date.parse(s.expiresAt))||Date.parse(s.expiresAt)<=Date.now()))throw new ConnectorError('CONNECTOR_CREDENTIAL_EXPIRED');
 if(mode==='live')ensure(provider==='shopify'?/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(url.hostname):url.hostname==='api.printify.com','Untrusted commercial endpoint',503);
 else ensure(mode==='simulator'&&['localhost','127.0.0.1',provider+'-simulator'].includes(url.hostname)&&typeof s.caPem==='string'&&s.serverName===provider+'-simulator','Untrusted simulator endpoint',503);
 return s;
}
export function hmac(body:Buffer|string,key:string){return createHmac('sha256',key).update(body).digest('base64');}
export function verifyHmac(body:Buffer,key:string,signature:unknown){if(typeof signature!=='string')return false;const a=Buffer.from(signature,'base64'),b=Buffer.from(hmac(body,key),'base64');return a.length===b.length&&timingSafeEqual(a,b);}
export function verifyPrintify(body:Buffer,key:string,signature:unknown){if(typeof signature!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;const a=Buffer.from(signature.slice(7),'hex'),b=createHmac('sha256',key).update(body).digest();return timingSafeEqual(a,b);}
export function connectorHeaders(secret:Data):Record<string,string>{return secret.provider==='shopify'?{'X-Shopify-Access-Token':secret.token}:{authorization:'Bearer '+secret.token,'User-Agent':'Steward','Accept':'application/json'};}
export async function remote(secret:Data,path:string,method='GET',body?:unknown):Promise<any>{
 ensure(path.startsWith('/')&&!path.startsWith('//'),'Invalid connector path');
 const base=new URL(secret.baseUrl),data=body===undefined?undefined:JSON.stringify(body);
 return new Promise((resolve,reject)=>{
  const req=request(new URL(path,base),{method,lookup:boundedLookup,servername:secret.serverName??base.hostname,ca:secret.mode==='simulator'?secret.caPem:undefined,rejectUnauthorized:true,timeout:3000,signal:AbortSignal.timeout(3500),headers:{...connectorHeaders(secret),...(data?{'content-type':'application/json','content-length':Buffer.byteLength(data)}:{})}},res=>{
   let text='';res.setEncoding('utf8');res.on('data',chunk=>{text+=chunk;if(Buffer.byteLength(text)>524288)req.destroy();});res.on('end',()=>{
    if(res.statusCode===401||res.statusCode===403)return reject(new ConnectorError('CONNECTOR_CREDENTIAL_OR_SCOPE_REJECTED'));
    if(res.statusCode===429)return reject(new ConnectorError('CONNECTOR_RATE_LIMITED',true));
    if(!res.statusCode||res.statusCode>=500)return reject(new ConnectorError('CONNECTOR_UNAVAILABLE',true));
    if(res.statusCode>=300)return reject(new ConnectorError('CONNECTOR_REQUEST_REJECTED'));
    try{const value=JSON.parse(text);if(value.errors?.length)return reject(new ConnectorError(value.errors.some((e:any)=>e.extensions?.code==='THROTTLED')?'CONNECTOR_RATE_LIMITED':'CONNECTOR_API_ERROR',true));resolve(value);}catch{reject(new ConnectorError('CONNECTOR_MALFORMED_RESPONSE'));}
   });
  });req.on('error',()=>reject(new ConnectorError('CONNECTOR_UNAVAILABLE',true)));req.on('timeout',()=>req.destroy());req.end(data);
 });
}
export const SHOPIFY_API_VERSION='2026-10';
export async function graphql(s:Data,query:string,variables:Data={}){const r=await remote(s,`/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,'POST',{query,variables});return r.data;}
