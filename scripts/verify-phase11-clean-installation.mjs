// Full-stack acceptance is mutually exclusive with the retained operator stack.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import path from 'node:path';
const target=path.resolve(process.argv[2]??'.steward/phase11-clean-acceptance'),bundle=path.resolve(process.env.STEWARD_RELEASE_BUNDLE??'artifacts/releases/steward-0.11.0');
assert(target.startsWith(path.resolve('.steward')+path.sep));assert(path.basename(target).startsWith('phase11-clean-'));
try{await access(target);throw Error('Clean acceptance requires a new dedicated directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const selected=JSON.parse(await readFile('.steward/operator/selection.json','utf8'));assert.notEqual(target,path.resolve(selected.directory));
const docker=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:16*1024*1024}).trim(),running=project=>docker(['ps','-q','--filter','label=com.docker.compose.project='+project]).split('\n').filter(Boolean),operatorIds=running(selected.project);assert(operatorIds.length);
const project='steward-phase11-clean-acceptance';assert.equal(running(project).length,0);
const report={startedAt:new Date().toISOString(),project,checks:[],operatorProject:selected.project,operatorRestored:false};
const toolkit=path.join(bundle,'toolkit');
const env={...process.env,STEWARD_DEMO_RETRY_LOGIN:'1',STEWARD_SEED_CREDENTIALS_FILE:path.join(target,'security/verification.json')};
const run=(script,args=[])=>execFileSync(process.execPath,[path.join(toolkit,script),...args],{cwd:toolkit,stdio:'inherit',env,timeout:1200000});
try{
 execFileSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c','npm ci && npm run build'],{cwd:toolkit,stdio:'inherit',timeout:1200000});report.checks.push('copied release toolkit npm ci and full build without developer checkout dependencies');
 docker(['stop',...operatorIds]);assert.equal(running(selected.project).length,0);
 run('scripts/release.mjs',['install','--bundle',bundle,'--directory',target,'--project',project,'--port-offset','30000','--trust-bundled-modules','--simulators']);
 run('scripts/release.mjs',['start','--directory',target]);
 run('scripts/smoke.mjs',[target]);run('scripts/verify-isolation.mjs',[target]);report.checks.push('clean digest-pinned initialization, API/frontend smoke, repeated provisioning, isolated databases and outage/restart preservation');
 run('scripts/verify-phase2.mjs',[target]);report.checks.push('real Chromium and authenticated enrollment, rejection, identity, trust, replay, outage/restart and secret non-disclosure regressions');
 run('scripts/seed-phase4.mjs',[target]);run('scripts/verify-phase4.mjs',[target]);report.checks.push('three independent enrolled Workers, genuine operational seeding and durable synchronization/finding regressions');
 run('scripts/verify-phase11-installation.mjs',[target]);run('scripts/configure-phase11-demo.mjs',[target]);report.checks.push('independent browser module installation without core image replacement; approved synthetic bindings and workflows');
 run('scripts/release.mjs',['upgrade','--bundle',bundle,'--directory',target,'--trust-bundled-modules']);run('scripts/release.mjs',['stop','--directory',target]);run('scripts/release.mjs',['start','--directory',target]);run('scripts/smoke.mjs',[target]);report.checks.push('repeat installation/upgrade and pinned image redeployment');report.status='passed';
}catch(e){report.status='failed';report.error='Acceptance child failed; inspect the retained log for its exact assertion.';process.exitCode=1;console.log(report.error);}finally{
 const ids=running(project);if(ids.length)docker(['stop',...ids]);docker(['start',...operatorIds]);
 run('scripts/release.mjs',['start','--directory',path.resolve(selected.directory)]);report.operatorRestored=running(selected.project).length>=operatorIds.length;assert(report.operatorRestored);execFileSync(process.execPath,['scripts/verify-single-stack.mjs'],{stdio:'inherit',timeout:60000});
 report.finishedAt=new Date().toISOString();await mkdir('artifacts',{recursive:true});await writeFile('artifacts/phase11-clean-installation.json',JSON.stringify(report,null,2)+'\n');
}
