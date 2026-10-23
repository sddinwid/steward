import { mkdir, readFile, writeFile, rename, mkdtemp, rm, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { privateDirectory } from './security.js';
import {PLATFORM_RELEASE} from '@steward/contracts';
const directory=path.resolve(process.argv[2]??'.steward/dev');
const target=path.join(directory,'analyst');const lock=path.join(directory,'.analyst-provision-lock');
const q=(s:string)=>JSON.stringify(s.replaceAll('\\','/'));
let staging:string|undefined,locked=false;
try{
 const deployment=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
 await mkdir(lock);locked=true;
 if(existsSync(target)){
   const previous=JSON.parse(await readFile(path.join(target,'manifest.json'),'utf8'));
   if(JSON.stringify(previous.installations)!==JSON.stringify(deployment.instances.map((i:any)=>i.installationId)))throw new Error('Identity mismatch');
   console.log('Preserved Phase 5 configuration and model secrets.');
 }else{
   staging=await mkdtemp(path.join(directory,'.analyst-staging-'));privateDirectory(staging);
   const services:string[]=[];
   for(const i of deployment.instances){
     await mkdir(path.join(staging,i.key));
     const nginx=await readFile(path.join(directory,'data',i.key,'nginx.conf'),'utf8');
     await writeFile(path.join(staging,i.key,'nginx.conf'),nginx.replace('location /api/v4/','location /api/v5/ { proxy_read_timeout 30s; proxy_pass $secure_backend; }\n  location /api/v4/'));
     services.push(`  ${i.key}-api:\n    image: steward-${i.role}-api:${PLATFORM_RELEASE}${i.role==='master'?`\n    environment:\n      STEWARD_ANALYST_FILE: /etc/steward/analyst/model.json\n      STEWARD_MCP_CA_FILE: /etc/steward/analyst/ca.pem\n    volumes:\n      - type: bind\n        source: ${q(path.join(target,'config'))}\n        target: /etc/steward/analyst\n        read_only: true`:''}\n  ${i.key}-web:\n    image: steward-${i.role}-web:${PLATFORM_RELEASE}\n    volumes:\n      - type: bind\n        source: ${q(path.join(target,i.key,'nginx.conf'))}\n        target: /etc/nginx/conf.d/security.conf\n        read_only: true`);
     if(i.role==='worker')services.push(`  ${i.key}-module-host:\n    image: steward-module-host:${PLATFORM_RELEASE}`);
   }
   await mkdir(path.join(staging,'config'));privateDirectory(path.join(staging,'config'));
   await writeFile(path.join(staging,'config/model.json'),'{}\n',{mode:0o600});
   await writeFile(path.join(staging,'config/api-key.txt'),'\n',{mode:0o600});
   await writeFile(path.join(staging,'config/ca.pem'),await readFile(path.join(directory,'security/ca-cert.pem')));
   await writeFile(path.join(staging,'compose.yaml'),'services:\n'+services.join('\n')+'\n');
   await writeFile(path.join(staging,'manifest.json'),JSON.stringify({version:1,installations:deployment.instances.map((i:any)=>i.installationId)},null,2)+'\n');
   await rename(staging,target);staging=undefined;console.log('Created additive Phase 5 overlay; model unavailable until configured.');
 }
}catch{console.error('Phase 5 provisioning failed; existing deployment preserved.');process.exitCode=1;}
finally{if(staging)await rm(staging,{recursive:true,force:true});if(locked)await rmdir(lock);}
