// Labelled reproducible protocol fixture; never presented as a real language model.
import assert from 'node:assert/strict';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {directory,compose,docker} from './lib.mjs';
import {calculateCommerce} from '../packages/platform/dist/commerce-analysis.js';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');
process.env.STEWARD_DEMO_RETRY_LOGIN='1';
const {api,login,credentials,waitFor}=await import('./phase4-client.mjs');
const configFile=path.join(directory,'analyst/config/model.json'),keyFile=path.join(directory,'analyst/config/api-key.txt'),fixture=path.join(directory,'analyst/config/verification-phase10a-fixture.mjs');
const priorConfig=await readFile(configFile),priorKey=await readFile(keyFile),container=compose('ps','-q','master-api');
const config={provider:'responses-compatible',model:'explicit-phase10a-protocol-fixture',endpoint:'https://127.0.0.1:9443/responses',apiKeyFile:'/etc/steward/analyst/api-key.txt',caFile:'/etc/steward/analyst/ca.pem',servername:'master.localhost',testModel:true,toolProfile:'compact',maxSteps:12,maxToolCalls:16,maxOutputTokens:3000,investigationTimeoutMs:90000};
const report={startedAt:new Date().toISOString(),testModel:true,checks:[],runs:[]};let started=false;
async function run(prompt,overrides={}){
 await writeFile(configFile,JSON.stringify({...config,...overrides}));let id;
 for(let n=0;n<8;n++)try{id=(await api('master','/api/v5/analyst/investigations','POST',{capability:'commerce-performance',prompt},202)).value.investigationId;break;}catch(e){if(!e.message.includes('429'))throw e;await new Promise(r=>setTimeout(r,10000));}assert(id);
 const value=await waitFor(async()=>{const r=(await api('master','/api/v5/analyst/investigations/'+id)).value;return r.investigation.status!=='running'?r:false;},'commerce test-model investigation',120000);assert.equal(value.investigation.test_model,true);report.runs.push({id,status:value.investigation.status,error:value.investigation.error_code,activity:value.activity,result:value.investigation.result});return value;
}
try{
 await login('master',credentials.accounts.registry);await writeFile(keyFile,randomUUID()+'\n');await writeFile(fixture,await readFile('scripts/test-model-server.mjs'));docker(['exec','-d',container,'node','/etc/steward/analyst/verification-phase10a-fixture.mjs']);started=true;await new Promise(r=>setTimeout(r,500));
 const success=await run('Reproducible TEST MODEL cross-entity commerce investigation using actual authorized MCP source evidence.');assert.equal(success.investigation.status,'completed',success.investigation.error_code);
 const analysis=success.investigation.result.analyses[0];assert(analysis.affectedEntities.length>=2);assert.deepEqual(analysis.calculation,calculateCommerce(analysis.observed.sources.map(s=>s.payload.projection)));assert(success.activity.some(a=>a.tool==='analyze_commerce_by_id'&&a.status==='success'));report.checks.push('Labelled test-model investigation discovers authorized entities, invokes live MCP, retains exact sources and deterministic fee-aware calculations');
 for(const [prompt,overrides,error]of [['[fixture:model-error]',{},'MODEL_UNAVAILABLE'],['[fixture:malformed]',{},'MODEL_OUTPUT_INVALID'],['[fixture:undeclared]',{},'MODEL_UNDECLARED_TOOL'],['[fixture:timeout]',{modelCallTimeoutMs:1000},'TRANSPORT_TIMEOUT'],['[fixture:loop]',{maxToolCalls:1},'TOOL_BUDGET_EXCEEDED']]){const value=await run(prompt,overrides);assert.equal(value.investigation.status,'failed');assert.equal(value.investigation.error_code,error);assert.equal(value.investigation.result,null);report.checks.push(error+' remains explicit with retained partial activity and no fabricated conclusion');}
 report.status='passed';console.log('PASS reproducible commerce test-model MCP/calculation and provider, malformed, undeclared-tool, timeout and tool-budget failures');
}catch(e){report.status='failed';report.error=e.message;throw e;}finally{
 if(started)try{docker(['exec',container,'node','-e',"const fs=require('fs');for(const p of fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p))){try{if(+p!==process.pid&&fs.readFileSync('/proc/'+p+'/cmdline','utf8').includes('/etc/steward/analyst/verification-phase10a-fixture.mjs'))process.kill(+p,'SIGTERM')}catch{}}"]);}catch{}
 await writeFile(configFile,priorConfig);await writeFile(keyFile,priorKey);await unlink(fixture).catch(()=>{});report.configurationRestored=true;report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase10a-test-model.json',JSON.stringify(report,null,2)+'\n');
}
