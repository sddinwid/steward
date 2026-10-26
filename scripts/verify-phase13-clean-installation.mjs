// Full-stack acceptance is mutually exclusive with the retained operator stack.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
const target=path.resolve(process.argv[2]??'.steward/phase13-clean-acceptance'),bundle=path.resolve(process.env.STEWARD_RELEASE_BUNDLE??'artifacts/releases/steward-0.13.0');
assert(target.startsWith(path.resolve('.steward')+path.sep));assert(/^phase13-clean-[a-z0-9-]+$/.test(path.basename(target)));
try{await access(target);throw Error('Clean acceptance requires a new dedicated directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const selected=JSON.parse(await readFile('.steward/operator/selection.json','utf8'));assert.notEqual(target,path.resolve(selected.directory));
const docker=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim(),running=project=>{const result=docker(['ps','-q','--filter','label=com.docker.compose.project='+project]).split('\n').filter(Boolean),manifestFile=path.join(project===selected.project?path.resolve(selected.directory):target,'manifest.json');if(existsSync(manifestFile))for(const i of JSON.parse(readFileSync(manifestFile,'utf8')).instances)result.push(...docker(['ps','-q','--filter','label=steward.installation='+i.installationId]).split('\n').filter(Boolean));return [...new Set(result)];},operatorIds=running(selected.project);assert(operatorIds.length);
const project='steward-'+path.basename(target);assert.equal(running(project).length,0);
const report={startedAt:new Date().toISOString(),project,checks:[],operatorProject:selected.project,operatorRestored:false};
const toolkit=path.join(bundle,'toolkit');
const env={...process.env,STEWARD_DEMO_RETRY_LOGIN:'1',STEWARD_SEED_CREDENTIALS_FILE:path.join(target,'security/verification.json'),STEWARD_PHASE4_BASELINE_FILE:path.join(target,'data/phase4-verification-baseline.json')};
const run=(script,args=[])=>execFileSync(process.execPath,[path.join(toolkit,script),...args],{cwd:toolkit,stdio:'inherit',env,timeout:1200000});
try{
 execFileSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm ci && npm run build'],{cwd:toolkit,stdio:'inherit',timeout:1200000});report.checks.push('copied release toolkit npm ci and full build without developer checkout dependencies');
 docker(['stop',...operatorIds]);report.stoppedOperatorContainers=operatorIds.length;console.log('Stopped all retained operator core and managed module containers:',operatorIds.length);assert.equal(running(selected.project).length,0);
 run('scripts/release.mjs',['install','--bundle',bundle,'--directory',target,'--project',project,'--port-offset','30000','--trust-bundled-modules','--simulators']);
 run('scripts/release.mjs',['start','--directory',target]);
 run('scripts/smoke.mjs',[target]);run('scripts/verify-isolation.mjs',[target]);report.checks.push('clean digest-pinned initialization, API/frontend smoke, repeated provisioning, isolated databases and outage/restart preservation');
 run('scripts/verify-phase2.mjs',[target]);report.checks.push('real Chromium and authenticated enrollment, rejection, identity, trust, replay, outage/restart and secret non-disclosure regressions');
 run('scripts/seed-phase4.mjs',[target]);run('scripts/capture-phase4-baseline.mjs',[target]);run('scripts/verify-phase4.mjs',[target]);report.checks.push('three independent enrolled Workers, genuine operational seeding and durable synchronization/finding regressions');
 run('scripts/verify-phase5.mjs',[target]);report.checks.push('actual deployed MCP and reproducible test-model investigations, failures, evidence, permissions and outage regressions; not live model validation');
 run('scripts/verify-phase12-installation.mjs',[target]);run('scripts/configure-phase12-demo.mjs',[target]);report.checks.push('independent browser module installation without core image replacement; approved synthetic bindings and workflows');
 run('scripts/verify-phase12-browser.mjs',[target]);run('scripts/verify-phase12-test-model.mjs',[target]);report.checks.push('actual scientific forecast/optimization/scenario UI, affected-only reviewed findings, local outage recovery and reproducible scientific MCP model/failure coverage');
 run('scripts/verify-phase13-housing.mjs',[target]);
 run('scripts/verify-phase13-participants.mjs',[target]);
 run('scripts/verify-phase13-employment.mjs',[target,'--prove-master-outage']);
 run('scripts/verify-phase13-capacity.mjs',[target]);
 run('scripts/verify-phase13-food.mjs',[target]);
 run('scripts/verify-phase13-essential-services.mjs',[target]);
 run('scripts/verify-phase13-participant-food.mjs',[target]);
 report.checks.push('Four independently installed mission modules and complete six-case synthetic housing/food/training/employment pathway through governed SSMA; no elapsed retention invented');
 run('scripts/verify-phase13-mission.mjs',[target,'--prove-master-outage']);
 run('scripts/verify-phase13-operational-alerts.mjs',[target,'--require-positive']);
 run('scripts/verify-phase13-comparison.mjs',[target]);
 report.checks.push('Closed operational module cohorts survive Master outage in their own durable outboxes; named programme/finance disclosures, real scientific calculation, reviewed browser finding and affected-only Worker acknowledgments');
 run('scripts/release.mjs',['upgrade','--bundle',bundle,'--directory',target,'--trust-bundled-modules']);run('scripts/release.mjs',['stop','--directory',target]);run('scripts/release.mjs',['start','--directory',target]);run('scripts/smoke.mjs',[target]);report.checks.push('repeat installation/upgrade and pinned image redeployment');report.status='passed';
}catch(e){report.status='failed';report.error='Acceptance child failed; inspect the retained log for its exact assertion.';process.exitCode=1;console.log(report.error);}finally{
 report.cleanupErrors=[];
 const cleanup=(label,fn)=>{try{fn();}catch{report.cleanupErrors.push(label);report.status='failed';process.exitCode=1;}};
 try{
  let temporaryStopped=false;
  for(let attempt=0;attempt<2&&!temporaryStopped;attempt++)cleanup('Stop temporary acceptance containers, attempt '+(attempt+1),()=>{const ids=running(project);if(ids.length)docker(['stop','--time','60',...ids]);temporaryStopped=running(project).length===0;assert(temporaryStopped);});
  if(temporaryStopped){
   cleanup('Restore each original operator container',()=>{for(const id of operatorIds)cleanup('Restore original container '+id,()=>docker(['start',id]));});
   cleanup('Restore selected Compose services',()=>run('scripts/release.mjs',['start','--directory',path.resolve(selected.directory)]));
  }else{report.cleanupErrors.push('Temporary stack could not be stopped; do not run two operator stacks concurrently. Manual Docker recovery is required.');report.status='failed';process.exitCode=1;}
  cleanup('Verify original container restoration',()=>{report.operatorRestored=running(selected.project).length>=operatorIds.length;assert(report.operatorRestored);});
  cleanup('Verify restored operator API and frontend readiness',()=>run('scripts/smoke.mjs',[path.resolve(selected.directory)]));
  cleanup('Verify single selected stack',()=>execFileSync(process.execPath,['scripts/verify-single-stack.mjs'],{stdio:'inherit',timeout:60000}));
 }finally{report.finishedAt=new Date().toISOString();await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase13-clean-installation.json',JSON.stringify(report,null,2)+'\n');}
}
