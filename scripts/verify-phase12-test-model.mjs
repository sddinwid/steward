// Reproducible wire-protocol fixture, explicitly distinguished from live Qwen.
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {directory,compose,docker} from './lib.mjs';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,login,credentials,waitFor}=await import('./phase4-client.mjs');
const configFile=path.join(directory,'analyst/config/model.json'),keyFile=path.join(directory,'analyst/config/api-key.txt'),fixtureFile=path.join(directory,'analyst/config/verification-phase12-fixture.mjs');
const original=await readFile(configFile),originalKey=await readFile(keyFile),container=compose('ps','-q','master-api');
const config={provider:'responses-compatible',model:'explicit-phase12-protocol-fixture',endpoint:'https://127.0.0.1:9443/responses',apiKeyFile:'/etc/steward/analyst/api-key.txt',caFile:'/etc/steward/analyst/ca.pem',servername:'master.localhost',testModel:true,toolProfile:'compact',maxSteps:12,maxToolCalls:16,maxOutputTokens:1200,investigationTimeoutMs:60000,toolTimeoutMs:20000};
const report={startedAt:new Date().toISOString(),testModel:true,runs:[],checks:[]};let started=false;
async function run(capability,prompt,overrides={}){
 await writeFile(configFile,JSON.stringify({...config,...overrides}));let id;for(let n=0;n<8;n++)try{id=(await api('master','/api/v5/analyst/investigations','POST',{capability,prompt},202)).value.investigationId;break;}catch(e){if(!e.message.includes('429'))throw e;console.log('Waiting for existing Analyst admission window; no security limit is bypassed.');await new Promise(r=>setTimeout(r,10000));}assert(id);
 const result=await waitFor(async()=>{const r=(await api('master','/api/v5/analyst/investigations/'+id)).value;return r.investigation.status!=='running'?r:false;},'Phase 12 test-model investigation',90000);assert.equal(result.investigation.test_model,true);report.runs.push({id,capability,prompt,status:result.investigation.status,error:result.investigation.error_code,activity:result.activity});return result;
}
try{
 await login('master',credentials.accounts.registry);await writeFile(keyFile,randomUUID()+'\n');await writeFile(fixtureFile,await readFile('scripts/test-model-server.mjs'));docker(['exec','-d',container,'node','/etc/steward/analyst/verification-phase12-fixture.mjs']);started=true;await new Promise(r=>setTimeout(r,500));
 const success=await run('scientific-procurement','Reproducible TEST MODEL investigation using actual authorized synthetic history and all scientific MCP stages.');assert.equal(success.investigation.status,'completed',success.investigation.error_code);assert.equal(success.investigation.result.partialInvestigation,false);assert.equal(success.investigation.result.analyses.length,3);assert.equal(success.investigation.finding_id,null);
 const tools=success.activity.filter(a=>a.kind==='tool'&&a.status==='success').map(a=>a.tool);for(const t of ['list_entities','query_scientific_datasets','forecast_demand','query_scientific_constraints','optimize_procurement','compare_procurement_scenarios'])assert(tools.includes(t));
 const optimized=success.investigation.result.analyses.find(a=>a.calculation.capabilityId==='steward.scientific.procurement-optimization'),c=optimized.calculation;assert.equal(c.baselineExternalCents-c.proposedCostCents,c.ecosystemBenefitCents);const saved=(await api('master','/api/v4/scientific/runs/'+optimized.scientificReference.jobId)).value.run;assert.equal(saved.result.inputDigest,optimized.scientificReference.inputDigest);const {capabilityId,schemaVersion,...originalCalculation}=c;assert.deepEqual(saved.result.calculation,originalCalculation);
 report.checks.push('labelled test model selected six actual MCP stages, completed three governed scientific calculations and retained digest/source references without publishing');
 const wrong=await run('scientific-procurement','[fixture:wrong-amount]');assert.equal(wrong.investigation.error_code,'MODEL_EVIDENCE_MISMATCH');assert.equal(wrong.investigation.result,null);report.checks.push('incorrect financial conclusion blocked without a fabricated finding');
 for(const [prompt,overrides,expected]of [['[fixture:model-error]',{},'MODEL_UNAVAILABLE'],['[fixture:malformed]',{},'MODEL_OUTPUT_INVALID'],['[fixture:undeclared]',{},'MODEL_UNDECLARED_TOOL'],['[fixture:timeout]',{modelCallTimeoutMs:1000},'TRANSPORT_TIMEOUT']]){const r=await run('scientific-procurement',prompt,overrides);assert.equal(r.investigation.error_code,expected);assert.equal(r.investigation.result,null);report.checks.push(expected+' is explicit and retains partial activity');}
 const limit=await run('resource-sharing','[fixture:budget]',{maxToolCalls:1});assert.equal(limit.investigation.error_code,'TOOL_BUDGET_EXCEEDED');report.checks.push('tool execution limit remains enforced');report.status='passed';console.log('PASS reproducible scientific model fixture: real MCP/Python, evidence rejection and explicit provider/malformed/undeclared/timeout/tool-budget failures');
}catch(error){report.status='failed';report.failure=error.message;throw error;}
finally{
 if(started)try{docker(['exec',container,'node','-e',"const fs=require('fs');for(const p of fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p))){try{if(fs.readFileSync('/proc/'+p+'/cmdline','utf8').includes('/etc/steward/analyst/verification-phase12-fixture.mjs')&&+p!==process.pid)process.kill(+p,'SIGTERM')}catch{}}"]);}catch{}
 await writeFile(configFile,original);await writeFile(keyFile,originalKey);await unlink(fixtureFile).catch(()=>{});report.configurationRestored=true;report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase12-test-model.json',JSON.stringify(report,null,2)+'\n');
}
