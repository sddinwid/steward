// Compose pre_stop hook. Only disposable containers owned by this installation
// are removed; databases, state volumes, identities and desired activation remain.
import {readFile} from 'node:fs/promises';
import {request} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
function docker(method,url,allowed){return new Promise((resolve,reject)=>{const req=request({socketPath:'/var/run/docker.sock',method,path:'/v1.51'+url,timeout:12000},res=>{let data='';res.setEncoding('utf8');res.on('data',c=>{data+=c;if(data.length>1048576)req.destroy(Error('Docker response too large'));});res.on('end',()=>{if(!allowed.includes(res.statusCode))return reject(Error('Docker lifecycle operation failed: '+res.statusCode));try{resolve(data?JSON.parse(data):undefined);}catch{reject(Error('Invalid Docker response'));}});});req.on('timeout',()=>req.destroy(Error('Docker lifecycle deadline exceeded')));req.on('error',reject);req.end();});}
export async function stopOwnedModules(config,call=docker){
 if(!/^[a-f0-9-]{36}$/i.test(config.installationId??''))throw Error('Invalid installation identity');
 const labels={'steward.installation':config.installationId,'steward.managed-by':'module-host-v1'};
 const filters=encodeURIComponent(JSON.stringify({label:Object.entries(labels).map(([k,v])=>k+'='+v)}));
 const rows=await call('GET','/containers/json?all=1&filters='+filters,[200]);
 // Validate the complete result before touching any container.
 const owned=rows.map(r=>{if(!/^[a-f0-9]{64}$/i.test(r.Id??'')||Object.entries(labels).some(([k,v])=>r.Labels?.[k]!==v)||!r.Labels?.['steward.module'])throw Error('Module container ownership mismatch');return r;});
 for(const r of owned){await call('POST','/containers/'+r.Id+'/stop?t=5',[204,304,404]);await call('DELETE','/containers/'+r.Id,[204,404]);}
 return owned.length;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const config=JSON.parse(await readFile(process.env.MODULE_HOST_CONFIG,'utf8'));console.log('Stopped '+await stopOwnedModules(config)+' owned module containers; persistent data retained.');}catch(e){console.error(e.message);process.exitCode=1;}
}
