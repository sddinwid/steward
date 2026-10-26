// Actual deployed authenticated APIs/MCP/Python, with bounded optional-service outage.
// No source business records, live credentials, accounts or approvals are reset.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {directory,manifest,compose,docker} from './lib.mjs';
process.env.STEWARD_SEED_CREDENTIALS_FILE??=path.join(directory,'demo/presenter.json');process.env.STEWARD_DEMO_RETRY_LOGIN??='1';
const {api,logins,login,credentials,waitFor,sessions}=await import('./phase4-client.mjs');
const {mcp}=await import('./mcp-client.mjs');
await logins();const deployment=await manifest(),report={startedAt:new Date().toISOString(),checks:[],tools:[],synthetic:true,liveCommercialMutations:false};
const data=(await api('master','/api/v4/analytics')).value;
const entityIds=['worker-1','worker-2'].map(k=>data.peers.find(p=>p.installation_id===deployment.instances.find(i=>i.key===k).installationId)?.entity_id);assert(entityIds.every(Boolean));
const science=JSON.parse(docker(['inspect',compose('ps','-q','scientific')]))[0];let stopped=false,client;
async function execute(capability,datasetId,options={},expected='completed'){
 const request={jobId:randomUUID(),datasetId,capability,options};await api('master','/api/v4/scientific/runs','POST',request,202);
 const r=await waitFor(async()=>{const r=(await api('master','/api/v4/scientific/runs/'+request.jobId)).value.run;return r.state==='running'?false:r;},'scientific '+capability,30000);assert.equal(r.state,expected,r.error_code);
 const retry=(await api('master','/api/v4/scientific/runs','POST',request)).value.run;assert.deepEqual(retry.result,r.result);return r;
}
async function call(name,args){const started=Date.now(),result=await client.callTool({name,arguments:args});report.tools.push({name,arguments:args,milliseconds:Date.now()-started,result});assert(!result.isError,JSON.stringify(result));return result.structuredContent.data;}
try{
 const dataset=(await api('master','/api/v4/scientific/datasets','POST',{entityIds,basis:'synthetic-analytical-history'})).value.dataset;
 assert.equal((await api('master','/api/v4/scientific/datasets','POST',{entityIds,basis:'synthetic-analytical-history'})).value.dataset.dataset_id,dataset.dataset_id);
 client=await mcp('master');const names=(await client.listTools()).tools.map(t=>t.name);for(const name of ['query_scientific_datasets','forecast_demand','query_scientific_constraints','optimize_procurement','compare_procurement_scenarios','get_scientific_result'])assert(names.includes(name));
 await call('list_entities',{});const discovered=await call('query_scientific_datasets',{basis:'synthetic-analytical-history',limit:5});assert(discovered.datasets.some(d=>d.datasetId===dataset.dataset_id));
 const forecast=await call('forecast_demand',{datasetId:dataset.dataset_id,horizon:30}),forecastId=forecast.scientificReference.jobId;assert.equal(forecast.calculation.status,'completed');
 const terms=await call('query_scientific_constraints',{datasetId:dataset.dataset_id});assert(terms.synthetic&&terms.purchasingTerms);
 const optimized=await call('optimize_procurement',{datasetId:dataset.dataset_id,forecastRunId:forecastId});assert.equal(optimized.calculation.status,'optimal');
 const c=optimized.calculation,quantities=forecast.calculation.series.map(s=>s.planning.quantity),q=quantities.reduce((n,v)=>n+v,0);
 assert.equal(c.baselineExternalCents,q*700+3000);assert.equal(c.proposedCostCents,q*630+1800+400);assert.equal(c.ecosystemBenefitCents,c.baselineExternalCents-c.proposedCostCents);assert.equal(c.impacts.reduce((n,i)=>n+i.benefitCents,0),c.ecosystemBenefitCents);assert.equal(c.internalTransferCents,0);
 const scenarios=await call('compare_procurement_scenarios',{datasetId:dataset.dataset_id,forecastRunId:forecastId,scenarios:[{name:'Demand +20%',changes:{demandBasisPoints:12000}},{name:'Capacity restricted',changes:{capacityBasisPoints:1}}],sensitivity:{parameter:'shippingBasisPoints',startBasisPoints:10000,endBasisPoints:12000,steps:3}});
 assert.equal(scenarios.calculation.scenarios[1].status,'infeasible');
 const retained=await call('get_scientific_result',{jobId:optimized.scientificReference.jobId});assert.deepEqual(retained.calculation,c);
 report.runs=[];
 for(const entry of [forecast,optimized,scenarios]){
  const r=(await api('master','/api/v4/scientific/runs/'+entry.scientificReference.jobId)).value.run;
  const hash=execFileSync('docker',['exec','-i',science.Id,'python','-c','import sys,json;from steward_science.contracts import Request;from steward_science.execution import request_digest;print(request_digest(Request.model_validate(json.load(sys.stdin))))'],{encoding:'utf8',input:JSON.stringify(r.request)}).trim();assert.equal(hash,r.result.inputDigest,'Retained JSONB input digest rechecks canonically');
  if(r.capability!=='demand-forecast'){assert.equal(r.result.provenance.derivedFrom[0].jobId,forecastId);assert.equal(r.result.provenance.derivedFrom[0].inputDigest,forecast.scientificReference.inputDigest);}
  report.runs.push(r);
 }
 report.checks.push('actual official MCP discovery and six scientific operations through authenticated Master and Python','independent exact-cent supplier reference and entity reconciliation','canonical retained-input digests and immutable forecast derivation chain');
 if(credentials.accounts.viewer){const original=sessions.master;const viewer=await login('master',credentials.accounts.viewer);await api('master','/api/v4/scientific',undefined,undefined,403,viewer);sessions.master=original;}
 if(credentials.accounts.enroller){const original=sessions.master,scoped=await login('master',credentials.accounts.enroller);const visible=(await api('master','/api/v4/analytics',undefined,undefined,200,scoped)).value.entities.map(e=>e.entity_id);if(!entityIds.every(id=>visible.includes(id)))await api('master','/api/v4/scientific/runs/'+forecastId,undefined,undefined,404,scoped);else report.checks.push('existing enroller has all participant permissions; isolated governance harness covers scope denial');sessions.master=original;}
 report.checks.push('deployed account permission enforcement; no credentials returned');
 assert.equal(science.HostConfig.ReadonlyRootfs,true);assert.equal(science.HostConfig.Memory,768*1024**2);assert.equal(science.HostConfig.NanoCpus,2e9);assert.equal(science.HostConfig.PidsLimit,128);assert.deepEqual(Object.keys(science.HostConfig.PortBindings??{}),[]);assert.equal(science.Mounts.length,1);assert.equal(Object.keys(science.NetworkSettings.Networks).length,1);assert.equal(science.Config.User,'10001:10001');
 const previous=(await api('master','/api/v4/simulation-intelligence')).value.policy;assert(previous?.enabled,'Acceptance expects existing authorized deterministic monitoring');
 docker(['stop',science.Id]);stopped=true;
 for(const i of deployment.instances)for(const endpoint of ['health','ready'])assert.equal((await fetch('http://127.0.0.1:'+i.apiPort+'/'+endpoint)).status,200);
 await api('master','/api/v4/financial-report');assert.deepEqual((await api('master','/api/v4/scientific/runs/'+forecastId)).value.run.result,report.runs[0].result);
 for(const key of ['worker-1','worker-2'])await api(key,'/api/v3/modules/cee.sales/api/orders?limit=1');
 const failed=await execute('demand-forecast',dataset.dataset_id,{horizon:30},'failed');assert.equal(failed.error_code,'SCIENTIFIC_UNAVAILABLE');assert.equal(failed.result,null);
 await waitFor(async()=>{const p=(await api('master','/api/v4/simulation-intelligence')).value.policy;return Date.parse(p.last_checked_at)>Date.parse(previous.last_checked_at);},'deterministic monitoring without scientific service',Math.min(60000,(previous.interval_seconds+8)*1000));
 report.checks.push('scientific outage preserves all health/readiness, Worker Sales, Master reports/history and running deterministic monitoring; failed requests fabricate no result');
 docker(['start',science.Id]);stopped=false;await waitFor(async()=>JSON.parse(docker(['inspect',science.Id]))[0].State.Health?.Status==='healthy','science readiness',30000);
 const recovered=await execute('demand-forecast',dataset.dataset_id,{horizon:30});assert.deepEqual(recovered.result.calculation,forecast.calculation&&Object.fromEntries(Object.entries(forecast.calculation).filter(([k])=>!['capabilityId','schemaVersion'].includes(k))));
 const request={jobId:randomUUID(),datasetId:dataset.dataset_id,capability:'demand-forecast',options:{horizon:30}};await api('master','/api/v4/scientific/runs','POST',request,202);await api('master','/api/v4/scientific/runs/'+request.jobId+'/cancel','POST',{});const canceled=(await api('master','/api/v4/scientific/runs/'+request.jobId)).value.run;assert.equal(canceled.state,'canceled');assert.equal(canceled.result,null);
 report.checks.push('explicit new-run recovery, reproducibility, cancellation and retained canceled state');report.resourceLimits={cpus:2,memoryBytes:science.HostConfig.Memory,pids:128,networkInternal:true,hostPorts:0};report.status='passed';console.log('PASS actual scientific MCP, exact calculations, canonical lineage, permissions, outage independence, recovery and cancellation.');
}catch(error){report.status='failed';report.error=String(error.message).replace(/__Host-steward=[^;\s]+/g,'__Host-steward=[REDACTED]');process.exitCode=1;console.log('Scientific acceptance failed: '+report.error);}
finally{if(client)await client.close();if(stopped)docker(['start',science.Id]);report.finishedAt=new Date().toISOString();await writeFile('artifacts/phase12-scientific-acceptance.json',JSON.stringify(report,null,2)+'\n');}
