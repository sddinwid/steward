import {mkdir,readFile,writeFile,mkdtemp,rmdir,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {publishDirectory} from './atomic.js';
const directory=path.resolve(process.argv[2]??'.steward/dev'),target=path.join(directory,'mission'),lock=path.join(directory,'.mission-provision-lock');
const quote=(s:string)=>JSON.stringify(s.replaceAll('\\','/'));let staging:string|undefined,locked=false;
try{
 const deployment=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8')),installations=deployment.instances.map((i:any)=>i.installationId);
 await mkdir(lock);locked=true;
 if(existsSync(target)){
  const previous=JSON.parse(await readFile(path.join(target,'manifest.json'),'utf8'));if(previous.version!==1||JSON.stringify(previous.installations)!==JSON.stringify(installations))throw new Error('Mission routing identity mismatch');
  for(const i of deployment.instances){const nginx=await readFile(path.join(target,i.key,'nginx.conf'),'utf8');if(!nginx.includes('location /api/v13/ {')||!nginx.includes('proxy_pass $secure_backend'))throw new Error('Mission routing configuration requires review');}
  console.log('Preserved Phase 13 public routing configuration.');
 }else{
  staging=await mkdtemp(path.join(directory,'.mission-staging-'));const services:string[]=[];
  for(const i of deployment.instances){
   let original:string|undefined;for(const layer of ['commerce','analyst','data','modules','security']){const file=path.join(directory,layer,i.key,'nginx.conf');if(existsSync(file)){original=await readFile(file,'utf8');break;}}
   if(!original?.includes('location /api/v2/ {')||original.includes('location /api/v13/ {'))throw new Error('A secured base proxy configuration is required');
   await mkdir(path.join(staging,i.key));await writeFile(path.join(staging,i.key,'nginx.conf'),original.replace('location /api/v2/ {','location /api/v13/ { proxy_read_timeout 90s; client_max_body_size 1m; proxy_pass $secure_backend; }\n  location /api/v2/ {'));
   services.push(`  ${i.key}-web:\n    volumes:\n      - type: bind\n        source: ${quote(path.join(target,i.key,'nginx.conf'))}\n        target: /etc/nginx/conf.d/security.conf\n        read_only: true`);
  }
  await writeFile(path.join(staging,'compose.yaml'),'services:\n'+services.join('\n')+'\n');await writeFile(path.join(staging,'manifest.json'),JSON.stringify({version:1,installations},null,2)+'\n');
  await publishDirectory(staging,target);staging=undefined;console.log('Created additive Phase 13 secure routing overlay; no accounts, credentials, databases or module settings changed.');
 }
}catch(e){console.error('Phase 13 routing provisioning failed: '+(e as Error).message);process.exitCode=1;}
finally{if(staging){const resolved=path.resolve(staging);if(!resolved.startsWith(directory+path.sep)||!path.basename(resolved).startsWith('.mission-staging-'))throw new Error('Unsafe staging path');await rm(resolved,{recursive:true,force:true});}if(locked)await rmdir(lock);}
