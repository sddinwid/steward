// Historical suites require an unenrolled / module-free starting topology.
// Use a separate project and volumes; never erase the seeded development state.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {signPackage} from '../packages/module-sdk/dist/index.js';
import {directory} from './lib.mjs';
const suffix=Date.now().toString(36);
const fixture=path.resolve(process.env.STEWARD_LEGACY_FIXTURE??'.steward/phase5-legacy-'+suffix);
const prior=existsSync(path.join(fixture,'manifest.json'))?JSON.parse(await readFile(path.join(fixture,'manifest.json'),'utf8')):null;
if(prior&&existsSync(path.join(fixture,'security/verification.json')))throw new Error('Resume only a provisioned regression fixture before its authentication suites have started; use a new project for later failures');
const project=prior?.project??'steward-p5-reg-'+suffix;
const node=(file,args=[],env={})=>execFileSync(process.execPath,[file,...args],{stdio:'inherit',env:{...process.env,STEWARD_SEED_CREDENTIALS_FILE:path.join(fixture,'security/verification.json'),...env},timeout:600000});
const env={STEWARD_DEPLOYMENT:fixture};
const isolated=process.env.STEWARD_LEGACY_PORT_OFFSET;
node('tools/installer/dist/cli.js',['provision','--directory',fixture,'--project',project,...(isolated?['--port-offset',isolated]:[])]);
for(const cli of ['security','modules','data','analyst'])node('tools/installer/dist/'+cli+'-cli.js',[fixture]);
if(isolated)node('scripts/configure-network-pool.mjs',[fixture,process.env.STEWARD_LEGACY_NETWORK_PREFIX??'10.242']);
const source=JSON.parse(await readFile(path.join(directory,'modules/public/catalog.json'),'utf8'));
const legacy=source.packages.find(p=>p.payload.manifest.moduleId==='cee.inventory'&&p.payload.manifest.version==='1.0.0');
if(!legacy)throw new Error('Historical signed Inventory 1.0.0 descriptor and image required');
const key=await readFile(path.join(fixture,'security/module-publisher-key.pem'),'utf8');
const descriptor=signPackage(legacy.payload,key);
await writeFile(path.join(fixture,'modules/public/catalog.json'),JSON.stringify({catalogVersion:1,packages:[descriptor]},null,2));
await mkdir('artifacts',{recursive:true});
const originalSeed=await readFile('artifacts/phase4-seed.json');let success=false;
try{
 if(!isolated)node('scripts/compose.mjs',['down'],{STEWARD_DEPLOYMENT:directory});
 node('scripts/compose.mjs',['up','-d','--wait','--wait-timeout','180'],env);
 node('scripts/verify-phase2.mjs',[fixture]);
 node('scripts/verify-phase3.mjs',[fixture]);
 const newer=source.packages.filter(p=>p.payload.manifest.moduleId==='cee.operations'||p.payload.manifest.moduleId==='cee.inventory'&&p.payload.manifest.version==='1.2.1').map(p=>signPackage(p.payload,key));
 await writeFile(path.join(fixture,'modules/public/catalog.json'),JSON.stringify({catalogVersion:1,packages:[descriptor,...newer]},null,2));
 node('scripts/seed-phase4.mjs',[fixture]);
 node('scripts/verify-phase5.mjs',[fixture]);
 await writeFile('artifacts/phase5-fresh-topology-results.json',await readFile('artifacts/phase5-results.json'));
 success=true;
 await writeFile('artifacts/phase5-legacy-regressions.json',JSON.stringify({verifiedAt:new Date().toISOString(),project,phase2:'passed',phase3:'passed',existingDevelopmentVolumes:'preserved'},null,2)+'\n');
}finally{
 await writeFile('artifacts/phase4-seed.json',originalSeed);
 node('scripts/compose.mjs',['down'],env);
 if(!isolated)node('scripts/compose.mjs',['up','-d','--wait','--wait-timeout','180'],{STEWARD_DEPLOYMENT:directory});
 console.log(success?'PASS historical Phase 2/3 regressions on separate persistent volumes; seeded deployment restored':'Historical regression failed; seeded deployment restored. Separate test volumes retained for diagnosis.');
}
