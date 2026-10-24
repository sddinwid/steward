import {publishDirectory} from './atomic.js';
import { mkdir, readFile, writeFile, mkdtemp, rename, rm, rmdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateDirectory } from './security.js';
const directory=path.resolve(process.argv[2]??'.steward/dev');
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const q=(s:string)=>JSON.stringify(s.replaceAll('\\','/'));
let staging:string|undefined;let locked=false;
try{
 const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
 const target=path.join(directory,'data');await mkdir(path.join(directory,'.data-provision-lock'));locked=true;
 if(existsSync(target)){const old=JSON.parse(await readFile(path.join(target,'manifest.json'),'utf8'));if(JSON.stringify(old.installations)!==JSON.stringify(manifest.instances.map((i:any)=>i.installationId)))throw new Error('Identity mismatch');console.log('Preserved Phase 4 configuration.');}
 else{
  staging=await mkdtemp(path.join(directory,'.data-staging-'));privateDirectory(staging);const services=[];let provider=false;
  for(const i of manifest.instances){await mkdir(path.join(staging,i.key));const nginx=await readFile(path.join(directory,'modules',i.key,'nginx.conf'),'utf8');await writeFile(path.join(staging,i.key,'nginx.conf'),nginx.replace('location /api/v3/', 'location /api/v4/ { proxy_read_timeout 90s; proxy_pass $secure_backend; }\n  location /api/v3/'));
   services.push(`  ${i.key}-api:\n    image: steward-${i.role}-api:0.4.0\n  ${i.key}-web:\n    image: steward-${i.role}-web:0.4.0\n    volumes:\n      - type: bind\n        source: ${q(path.join(target,i.key,'nginx.conf'))}\n        target: /etc/nginx/conf.d/security.conf\n        read_only: true`);
   if(i.role==='worker'){services.push(`  ${i.key}-module-host:\n    image: steward-module-host:0.4.0${!provider?`\n    build:\n      context: ${q(sourceRoot)}\n      dockerfile: infra/Dockerfile.module-host`:''}`);provider=true;}
  }
  await writeFile(path.join(staging,'compose.yaml'),'services:\n'+services.join('\n')+'\n');await writeFile(path.join(staging,'manifest.json'),JSON.stringify({version:1,installations:manifest.instances.map((i:any)=>i.installationId)},null,2));await publishDirectory(staging,target);staging=undefined;console.log('Created additive Phase 4 overlay; identities, installed modules and records preserved.');
 }
}catch{console.error('Phase 4 provisioning failed; existing files and databases preserved.');process.exitCode=1;}
finally{if(staging)await rm(staging,{recursive:true,force:true});if(locked)await rmdir(path.join(directory,'.data-provision-lock'));}
