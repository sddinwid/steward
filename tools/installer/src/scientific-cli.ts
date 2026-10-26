import {mkdir,mkdtemp,readFile,writeFile,rm,rmdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {privateDirectory} from './security.js';
import {publishDirectory} from './atomic.js';
import {scientificVersionForPlatform} from './scientific-version.js';
const directory=path.resolve(process.argv[2]??'.steward/dev'),target=path.join(directory,'scientific'),lock=path.join(directory,'.scientific-provision-lock');
const quote=(s:string)=>JSON.stringify(s.replaceAll('\\','/'));let staging:string|undefined,locked=false;
try{
 const platform=JSON.parse(await readFile(new URL('../../../package.json',import.meta.url),'utf8'));
 const serviceVersion=scientificVersionForPlatform(platform.version);
 const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
 const master=manifest.instances.find((i:any)=>i.role==='master');if(!master||!existsSync(path.join(directory,'security/manifest.json')))throw Error('Secure Master installation required');
 await mkdir(lock);locked=true;
 if(existsSync(target)){
  const saved=JSON.parse(await readFile(path.join(target,'manifest.json'),'utf8'));if(saved.version!==1||saved.installationId!==master.installationId||!['1.0.0','1.1.0'].includes(saved.serviceVersion))throw Error('Scientific installation identity or service version mismatch');
  for(const file of ['config.json','key.txt','compose.yaml'])if(!existsSync(path.join(target,file)))throw Error('Existing scientific setup is incomplete; restore its private backup');
  const overlayFile=path.join(target,'compose.yaml'),overlay=await readFile(overlayFile,'utf8');
  // Narrow repair for the initial generated flow-list quoting defect. Never
  // regenerate keys, rewrite configured endpoints or replace other operator data.
  if(overlay.includes('tmpfs: [/tmp:rw,noexec,nosuid,size=32m]')){
   await writeFile(overlayFile,overlay.replace('tmpfs: [/tmp:rw,noexec,nosuid,size=32m]','tmpfs: ["/tmp:rw,noexec,nosuid,size=32m"]'));
   console.log('Corrected generated tmpfs quoting; scientific identity, key and endpoint retained.');
  }
  console.log('Preserved scientific configuration, authentication key, network and configured image. A new service image requires an explicit digest-pinned release overlay.');
 }else{
  staging=await mkdtemp(path.join(directory,'.scientific-staging-'));privateDirectory(staging);
  await writeFile(path.join(staging,'key.txt'),randomBytes(32).toString('hex')+'\n',{mode:0o600});
  await writeFile(path.join(staging,'config.json'),JSON.stringify({version:1,endpoint:'http://scientific:8080',keyFile:'/etc/steward/scientific/key.txt',allowIsolatedHttp:true,maximumExecutionMillis:12000},null,2)+'\n',{mode:0o600});
  await writeFile(path.join(staging,'manifest.json'),JSON.stringify({version:1,installationId:master.installationId,serviceVersion},null,2)+'\n');
  await writeFile(path.join(staging,'compose.yaml'),`services:
  ${master.key}-api:
    environment:
      STEWARD_SCIENTIFIC_FILE: /etc/steward/scientific/config.json
    volumes:
      - type: bind
        source: ${quote(path.join(target,'config.json'))}
        target: /etc/steward/scientific/config.json
        read_only: true
      - type: bind
        source: ${quote(path.join(target,'key.txt'))}
        target: /etc/steward/scientific/key.txt
        read_only: true
    networks:
      scientific: {}
  scientific:
    image: steward-scientific:${serviceVersion}
    restart: unless-stopped
    read_only: true
    user: "10001:10001"
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    pids_limit: 128
    mem_limit: 768m
    cpus: 2
    tmpfs: ["/tmp:rw,noexec,nosuid,size=32m"]
    volumes:
      - type: bind
        source: ${quote(path.join(target,'key.txt'))}
        target: /run/secrets/science-key
        read_only: true
    networks:
      scientific:
        aliases: [scientific]
networks:
  scientific:
    internal: true
`);
  await publishDirectory(staging,target);staging=undefined;console.log('Created optional isolated Master scientific service. No Worker or business credentials are mounted.');
 }
}catch(error){console.error(error instanceof Error?error.message:'Scientific provisioning failed');process.exitCode=1;}
finally{if(staging){const resolved=path.resolve(staging);if(!resolved.startsWith(directory+path.sep)||!path.basename(resolved).startsWith('.scientific-staging-'))throw new Error('Unsafe scientific staging cleanup path');await rm(resolved,{recursive:true,force:true});}if(locked)await rmdir(lock);}
