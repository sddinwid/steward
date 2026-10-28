// Actual clean release acceptance. Always stop selected core AND managed modules before starting this full stack.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access,rmdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stopSelectedWithRecovery} from './phase15-clean-recovery.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));process.chdir(root);
const{values}=parseArgs({options:{'execute-authorized':{type:'boolean'},directory:{type:'string'},bundle:{type:'string'},'network-prefix':{type:'string'}}});
if(!values['execute-authorized'])throw Error('Explicit clean-installation readiness required; this acceptance temporarily stops the selected operator stack.');
const runId=randomUUID(),target=path.resolve(values.directory??'.steward/phase15-clean-'+runId),bundle=path.resolve(values.bundle??process.env.STEWARD_RELEASE_BUNDLE??''),prefix=values['network-prefix']??process.env.STEWARD_TEST_NETWORK_PREFIX;
assert(target.startsWith(path.resolve('.steward')+path.sep)&&/^phase15-clean-[a-z0-9-]+$/.test(path.basename(target)));assert(values.bundle||process.env.STEWARD_RELEASE_BUNDLE,'Select the actual Phase15 candidate bundle explicitly');assert(/^10\.(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(prefix??''),'Explicit private network prefix required; existing Docker networks are never pruned');
try{await access(target);throw Error('Clean acceptance requires a genuinely new directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const selectionFile=path.join(root,'.steward/operator/selection.json'),selectionBytes=await readFile(selectionFile),selected=JSON.parse(selectionBytes),selectedDirectory=path.resolve(selected.directory);assert.notEqual(target,selectedDirectory);
const selectedManifest=JSON.parse(await readFile(path.join(selectedDirectory,'manifest.json'),'utf8')),project='steward-'+path.basename(target),toolkit=path.join(bundle,'toolkit'),lock=path.join(root,'.steward/full-stack-acceptance.lock');
assert.equal(selectedManifest.project,selected.project);assert.equal(selectedManifest.instances.length,4);const release=JSON.parse(await readFile(path.join(bundle,'release.json'),'utf8'));assert.equal(release.version,'0.15.0');assert.equal(release.platformCompatibility,'0.15.0');
for(const required of['scripts/release.mjs','scripts/verify-phase15-clean-modules.mjs','docs/phase15-module-versions.json'])await access(path.join(toolkit,required));
const docker=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:128*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
function ownedRunning(manifest){const ids=docker(['ps','-q']).split(/\s+/).filter(Boolean);if(!ids.length)return[];const rows=JSON.parse(docker(['inspect',...ids]));return rows.filter(c=>c.Config.Labels?.['com.docker.compose.project']===manifest.project||manifest.instances.some(i=>c.Config.Labels?.['steward.installation']===i.installationId)).map(c=>({id:c.Id,name:c.Name,image:c.Image,installationId:c.Config.Labels?.['steward.installation']??null,composeService:c.Config.Labels?.['com.docker.compose.service']??null,mounts:c.Mounts.filter(m=>m.Type==='volume').map(m=>({name:m.Name,destination:m.Destination}))}));}
const originalContainers=ownedRunning(selectedManifest);assert(originalContainers.length);assert(!docker(['ps','-q','--filter','label=com.docker.compose.project='+project]));
const env={...process.env,STEWARD_ACCEPTANCE_RELEASE:'0.15.0',STEWARD_ACCEPTANCE_OPERATOR_PROJECT:selected.project,STEWARD_ACCEPTANCE_OPERATOR_INSTALLATIONS:JSON.stringify(selectedManifest.instances.map(i=>i.installationId)),STEWARD_TEST_NETWORK_PREFIX:prefix,STEWARD_SEED_CREDENTIALS_FILE:path.join(target,'security/verification.json'),STEWARD_PHASE4_BASELINE_FILE:path.join(target,'data/phase4-verification-baseline.json')};
// Never inherit selected-stack Compose routing into the isolated deployment. The parent environment is unchanged.
env.COMPOSE_PROJECT_NAME=project;env.STEWARD_COMPOSE_PROJECT=project;env.STEWARD_DEPLOYMENT=target;delete env.COMPOSE_FILE;delete env.STEWARD_COMPOSE_ENTRYPOINT;delete env.STEWARD_COMPOSE_OVERRIDE_FILE;
const report={runId,startedAt:new Date().toISOString(),status:'unverified',target,project,candidateSourceCommit:release.sourceCommit,operatorProject:selected.project,originalContainers,checks:[],cleanupErrors:[],operatorRestored:false};let locked=false,operatorStopped=false,temporaryIdentity={project,instances:[]};
const invoke=(base,script,args=[],extra={})=>execFileSync(process.execPath,[path.join(base,script),...args],{cwd:base,env:{...env,...extra},stdio:'inherit',timeout:1200000});
const run=(script,args=[])=>{if(operatorStopped)assert.equal(ownedRunning(selectedManifest).length,0,'Do not run a temporary full stack alongside any selected core or managed container');return invoke(toolkit,script,args);};
await mkdir(lock);locked=true; // On a busy lock, exit before any finally restoration can interfere with another acceptance.
try{
 const recovery={pid:process.pid,runId,project,target,selectedDirectory,operatorProject:selected.project,operatorSelection:selected,originalContainers};
 await writeFile(path.join(lock,'owner.json'),JSON.stringify(recovery)+'\n',{mode:0o600});
 invoke(root,'scripts/release.mjs',['verify','--bundle',bundle]);
 execFileSync(process.platform==='win32'?(process.env.ComSpec??'cmd.exe'):'sh',process.platform==='win32'?['/d','/s','/c','npm ci && npm run build']:['-c','npm ci && npm run build'],{cwd:toolkit,env,stdio:'inherit',timeout:1200000});report.checks.push('Copied candidate toolkit npm ci and full build without developer checkout dependencies');
 // Stop every selected container by exact captured IDs, including module-host managed containers outside Compose.
 await stopSelectedWithRecovery({recovery,verifySingleStack:()=>invoke(root,'scripts/verify-single-stack.mjs'),persistRecovery:proof=>writeFile(path.join(lock,'owner.json'),JSON.stringify(proof)+'\n',{mode:0o600}),stopSelected:()=>docker(['stop','--time','60',...originalContainers.map(c=>c.id)])});assert.equal(ownedRunning(selectedManifest).length,0);operatorStopped=true;report.stoppedOperatorContainers=originalContainers.length;
 run('scripts/release.mjs',['install','--bundle',bundle,'--directory',target,'--project',project,'--port-offset','30000','--trust-bundled-modules','--simulators']);temporaryIdentity=JSON.parse(await readFile(path.join(target,'manifest.json'),'utf8'));run('scripts/configure-network-pool.mjs',[target,prefix]);run('scripts/release.mjs',['start','--directory',target]);
 run('scripts/smoke.mjs',[target]);run('scripts/verify-isolation.mjs',[target]);report.checks.push('Actual digest-pinned release15/schema19 initialization, repeated provisioning, database isolation and core outage/restart durability');
 run('scripts/verify-phase2.mjs',[target]);run('scripts/release.mjs',['start','--directory',target]);run('scripts/smoke.mjs',[target]);run('scripts/seed-phase4.mjs',[target]);run('scripts/capture-phase4-baseline.mjs',[target]);run('scripts/verify-phase4.mjs',[target]);report.checks.push('Genuine clean TLS accounts/enrollment and three independent Workers, real legacy module seeding and durable synchronization');
 run('scripts/verify-phase5.mjs',[target]);report.checks.push('Existing deployed MCP/test-model regressions; this is not native model quality acceptance');
 run('scripts/verify-phase15-clean-modules.mjs',[target]);report.checks.push('Real signed Module Manager independent Pricing-alone/Catalog-alone, legacy Sales without either, six offering types, reviewed explicit SKU activation, accepted money and module restart durability');
 // Repeat the real release upgrade process, including full private configuration and database backups.
 run('scripts/release.mjs',['upgrade','--bundle',bundle,'--directory',target,'--trust-bundled-modules']);run('scripts/release.mjs',['stop','--directory',target]);run('scripts/release.mjs',['start','--directory',target]);run('scripts/smoke.mjs',[target]);run('scripts/verify-phase15-clean-modules.mjs',[target,'--verify-only']);report.checks.push('Repeat release upgrade/redeployment preserves original clean identities, module operation/package pins, all six Catalog types, Pricing terms/reviews and immutable accepted Sales; isolated new scratch database restored from actual Catalog backup');report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;console.error('Clean Phase15 acceptance failed: '+e.message);}
finally{
 const attempt=(label,fn)=>{try{fn();return true;}catch(e){report.cleanupErrors.push({step:label,error:e.message});report.status='failed';process.exitCode=1;return false;}};
 const temporary=temporaryIdentity;let temporaryStopped=false;for(let retry=0;retry<2&&!temporaryStopped;retry++)attempt('Stop ALL temporary core and managed containers '+(retry+1),()=>{const rows=ownedRunning(temporary);if(rows.length)docker(['stop','--time','60',...rows.map(c=>c.id)]);temporaryStopped=ownedRunning(temporary).length===0;assert(temporaryStopped);});
 if(temporaryStopped){
  // Restore only original IDs; do not recreate/reselect an older deployment or start archived module containers.
  const priority=c=>c.composeService?.endsWith('-db')?0:c.composeService==='scientific'?1:c.composeService?.endsWith('-api')?2:c.composeService?.endsWith('-module-host')?3:c.installationId?4:5;
  for(const container of originalContainers.slice().sort((a,b)=>priority(a)-priority(b)))attempt('Restore original '+container.name,()=>docker(['start',container.id]));
  attempt('Original operator exact IDs/images/volumes preserved',()=>{const now=ownedRunning(selectedManifest),byId=new Map(now.map(c=>[c.id,c]));for(const original of originalContainers){const actual=byId.get(original.id);assert(actual,'Original container not restored: '+original.name);assert.equal(actual.image,original.image);assert.deepEqual(actual.mounts,original.mounts);}assert.equal(now.length,originalContainers.length);report.operatorContainersRestored=true;});
  const healthy=attempt('Selected operator readiness',()=>execFileSync(process.execPath,[path.join(root,'scripts/smoke.mjs'),selectedDirectory],{cwd:root,env:{...process.env,COMPOSE_PROJECT_NAME:selected.project,STEWARD_COMPOSE_PROJECT:selected.project,STEWARD_DEPLOYMENT:selectedDirectory},stdio:'inherit',timeout:180000}));report.operatorRestored=healthy&&report.operatorContainersRestored===true;
 }else{report.cleanupErrors.push({step:'Temporary stack not fully stopped',error:'Selected stack was not restarted to avoid concurrent full stacks; explicit Docker recovery required'});report.status='failed';process.exitCode=1;}
 try{assert((await readFile(selectionFile)).equals(selectionBytes),'Operator selection changed during isolated acceptance');report.operatorSelectionPreserved=true;}catch(e){report.cleanupErrors.push({step:'Operator selection',error:e.message});report.status='failed';process.exitCode=1;}
 attempt('Single selected stack',()=>execFileSync(process.execPath,[path.join(root,'scripts/verify-single-stack.mjs')],{cwd:root,stdio:'inherit',timeout:60000}));
 if(locked&&temporaryStopped&&report.operatorRestored){try{await import('node:fs/promises').then(fs=>fs.unlink(path.join(lock,'owner.json')));await rmdir(lock);}catch(e){report.cleanupErrors.push({step:'Acceptance lock',error:e.message});report.status='failed';process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();await mkdir(path.join(root,'artifacts'),{recursive:true});await writeFile(path.join(root,'artifacts/phase15-clean-installation-'+runId+'.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(root,'artifacts/phase15-clean-installation.json'),JSON.stringify(report,null,2)+'\n');
}
