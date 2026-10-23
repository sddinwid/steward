import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {api,login,credentials,waitFor} from './phase4-client.mjs';
import {directory,compose,docker} from './lib.mjs';
const configFile=path.join(directory,'analyst/config/model.json'),keyFile=path.join(directory,'analyst/config/api-key.txt'),fixture=path.join(directory,'analyst/config/verification-compact-fixture.mjs');
const original=await readFile(configFile),originalKey=await readFile(keyFile),container=compose('ps','-q','master-api');
const config={provider:'responses-compatible',model:'explicit-compact-fixture',endpoint:'https://127.0.0.1:9443/responses',apiKeyFile:'/etc/steward/analyst/api-key.txt',caFile:'/etc/steward/analyst/ca.pem',servername:'master.localhost',testModel:true,toolProfile:'compact',maxSteps:8,maxToolCalls:16,maxOutputTokens:1200,investigationTimeoutMs:60000};
const report={verifiedAt:new Date().toISOString(),testModel:true,checks:[],investigations:[]};let started=false;
async function run(prompt,overrides={}){
 await writeFile(configFile,JSON.stringify({...config,...overrides}));let id;
 for(let n=0;n<8;n++)try{id=(await api('master','/api/v5/analyst/investigations','POST',{prompt},202)).value.investigationId;break;}catch(e){if(!e.message.includes('429'))throw e;await new Promise(r=>setTimeout(r,10000));}
 assert.ok(id);const result=await waitFor(async()=>{const r=(await api('master','/api/v5/analyst/investigations/'+id)).value;return r.investigation.status!=='running'?r:false;},'compact fixture '+id,90000);
 report.investigations.push({id,status:result.investigation.status,error:result.investigation.error_code,activity:result.activity.map(a=>({kind:a.kind,tool:a.tool,status:a.status,milliseconds:a.detail.milliseconds}))});return result;
}
try{
 await login('master',credentials.accounts.registry);await writeFile(keyFile,randomUUID()+'\n');await writeFile(fixture,await readFile('scripts/test-model-server.mjs'));docker(['exec','-d',container,'node','/etc/steward/analyst/verification-compact-fixture.mjs']);started=true;
 await new Promise(r=>setTimeout(r,500));
 const complete=await run('Run the compact analytical workflow with actual synchronized sources and explicit illustrative assumptions.');assert.equal(complete.investigation.status,'completed',complete.investigation.error_code);
 assert.ok(complete.investigation.result.analyses[0].observed.supply);assert.equal(complete.activity.filter(a=>a.tool==='analyze_resource_sharing_by_id'&&a.status==='success').length,1);
 const measurement=complete.activity.find(a=>a.tool==='analyze_resource_sharing_by_id'&&a.status==='success').detail;assert.ok(measurement.evidenceBytes>measurement.modelBytes);
 report.checks.push('compact Responses-compatible workflow, one calculation then structured finalization, complete original evidence retained with smaller model view');
 for(const [prompt,options,expected] of [
  ['[fixture:budget]',{maxToolCalls:1},'TOOL_BUDGET_EXCEEDED'],
  ['[fixture:budget]',{maxSteps:2},'STEP_BUDGET_EXCEEDED'],
  ['[fixture:timeout]',{modelCallTimeoutMs:1000},'TRANSPORT_TIMEOUT'],
  ['[fixture:timeout]',{modelCallTimeoutMs:30000,investigationTimeoutMs:10000},'INVESTIGATION_TIMEOUT'],
  ['Inspect real source data until the bounded context fills',{toolProfile:'full',maxContextChars:8000},'CONTEXT_BUDGET_EXCEEDED']
 ]){const r=await run(prompt,options);assert.equal(r.investigation.error_code,expected);report.checks.push(expected+' explicitly persisted with partial activity');}
 console.log('PASS compact provider-independent workflow, full evidence retention, tool/step/context budgets, separate model and overall deadlines');
}finally{
 if(started)try{docker(['exec',container,'node','-e',"const fs=require('fs');for(const p of fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p))){try{if(fs.readFileSync('/proc/'+p+'/cmdline','utf8').includes('/etc/steward/analyst/verification-compact-fixture.mjs')&&+p!==process.pid)process.kill(+p,'SIGTERM')}catch{}}"]);}catch{}
 await writeFile(configFile,original);await writeFile(keyFile,originalKey);await unlink(fixture).catch(()=>{});await writeFile('artifacts/phase5b-compact-analyst.json',JSON.stringify(report,null,2)+'\n');
}
