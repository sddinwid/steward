// Deployment-mutating suites intentionally run sequentially.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {directory} from './lib.mjs';
const report={startedAt:new Date().toISOString(),checks:[]};await mkdir('artifacts',{recursive:true});
const suites=['smoke','browser-smoke','verify-legacy-regressions','verify-phase4-seed','verify-phase4','verify-inventory-mcp-upgrade','mcp-smoke','verify-phase5','verify-analyst-browser','verify-compact-mcp','verify-compact-analyst','verify-analyst-concurrency','verify-isolation','verify-outage-independence','verify-module-restart','verify-module-provision','verify-module-secrets','verify-analyst-unconfigured'];
const start=process.env.STEWARD_REGRESSION_FROM?suites.indexOf(process.env.STEWARD_REGRESSION_FROM):0;
if(start<0)throw new Error('Unknown regression resume stage');
if(start){const previous=JSON.parse(await readFile('artifacts/phase6-regressions.json','utf8'));if(previous.checks.length<start||previous.checks.slice(0,start).some((c,i)=>c.suite!==suites[i]||c.status!=='passed'))throw new Error('Cannot resume without successful preceding suite evidence');report.checks=previous.checks.slice(0,start);report.previousFailure=previous.failure??null;report.originalStartedAt=previous.originalStartedAt??previous.startedAt;}
try{
 report.status='running';await writeFile('artifacts/phase6-regressions.json',JSON.stringify(report,null,2)+'\n');
 for(const suite of suites.slice(start)){const started=Date.now();console.log('RUN Phase 6 regression: '+suite);
  execFileSync(process.execPath,['scripts/'+suite+'.mjs',directory],{stdio:'inherit',timeout:1800000,env:{...process.env,STEWARD_DEPLOYMENT:directory,STEWARD_DEMO_RETRY_LOGIN:'1'}});
  report.checks.push({suite,status:'passed',elapsedMs:Date.now()-started});await writeFile('artifacts/phase6-regressions.json',JSON.stringify(report,null,2)+'\n');
 }
 report.status='passed';report.finishedAt=new Date().toISOString();
}catch(e){report.status='failed';report.failure={suite:suites[report.checks.length],exitCode:e.status??null};process.exitCode=1;}
finally{await writeFile('artifacts/phase6-regressions.json',JSON.stringify(report,null,2)+'\n');}
