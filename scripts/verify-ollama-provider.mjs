import {purchasingOpportunities} from '../packages/platform/dist/simulation-analysis.js';
import {purchasingBaseline} from '../packages/platform/dist/simulation-analysis.js';
import {compactScientificCalculation,containsScientificAmount} from '../packages/platform/dist/scientific-context.js';
// Temporary real-provider validation. No simulated model output or core changes.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { directory } from './lib.mjs';
import { api, logins, waitFor } from './phase4-client.mjs';
import {calculateCommerce} from '../packages/platform/dist/commerce-analysis.js';
import { resourceSharing } from '../packages/platform/dist/analytical-capabilities.js';
import {calculateProcurement,calculateWorkforce,canonicalBusinessPayload} from '../packages/platform/dist/business-analysis.js';
import {calculateMissionSustainability} from '../packages/platform/dist/mission-analysis.js';
const capability=process.env.STEWARD_ANALYST_CAPABILITY??'resource-sharing';
assert.ok(['resource-sharing','shared-procurement','workforce-opportunity','commerce-performance','simulation-purchasing','scientific-procurement','mission-sustainability'].includes(capability));

const baseModel=process.env.STEWARD_OLLAMA_MODEL??'qwen2.5:7b';
const context=Number(process.env.STEWARD_OLLAMA_CONTEXT??16384);
assert.ok(Number.isInteger(context)&&context>=4096&&context<=32768,'Context must be 4096–32768 tokens');
const model=`steward-analyst-qwen2.5-ctx${context}:7b`;
const modelTimeout=Number(process.env.STEWARD_OLLAMA_TIMEOUT_MS??90000);
assert.ok(modelTimeout>=1000&&modelTimeout<=120000,'Model deadline must be 1000–120000 ms');
const port=19443, token=randomBytes(32).toString('hex');
const configPath=path.join(directory,'analyst/config/model.json');
const keyPath=path.join(directory,'analyst/config/api-key.txt');
// An interrupted presenter run must be recoverable without losing operator configuration.
const lockPath=path.join(directory,'analyst/.local-provider-lock');await mkdir(lockPath);
const originalConfig=await readFile(configPath), originalKey=await readFile(keyPath);
const recoveryPath=path.join(directory,'analyst/local-provider-recovery.json');
await writeFile(recoveryPath,JSON.stringify({pid:process.pid,createdAt:new Date().toISOString(),config:originalConfig.toString('base64'),key:originalKey.toString('base64'),model}),{flag:'wx',mode:0o600});
const report={verifiedAt:new Date().toISOString(),status:'not_verified',provider:'local-ollama',capability,baseModel,model,context,modelTimeout,testModel:false,modelTurns:[],checks:[],configurationRestored:false,modelUnloaded:false};
await mkdir('artifacts',{recursive:true});
let active=0;let browserSession;
const server=createServer({cert:await readFile(path.join(directory,'security/master/tls-cert.pem')),key:await readFile(path.join(directory,'security/master/tls-key.pem'))},async(req,res)=>{
  const supplied=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+token);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(401).end();return;}
  if(!['host.docker.internal:'+port,'localhost:'+port].includes(req.headers.host??'')||req.headers.origin){res.writeHead(403).end();return;}
  if(req.method==='GET'&&req.url==='/api/tags'){try{const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2500)});const value=await response.json();res.writeHead(response.status,{'content-type':'application/json'}).end(JSON.stringify({models:(value.models??[]).filter(v=>v.name===model).map(v=>({name:v.name}))}));}catch{res.writeHead(503).end();}return;}
  if(req.method!=='POST'||req.url!=='/api/chat'){res.writeHead(403).end();return;}
  if(active>=1){res.writeHead(429).end();return;}active++;
  const abort=new AbortController(),start=Date.now();let turn;res.on('close',()=>abort.abort());
  try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>1048576)throw new Error('REQUEST_TOO_LARGE');chunks.push(chunk);}
    const body=Buffer.concat(chunks),parsed=JSON.parse(body.toString());
    if(parsed.model!==model||parsed.stream!==false)throw new Error('UNAPPROVED_MODEL');
    turn={toolDefinitions:parsed.tools?.map(t=>t.function.name)??[],inputChars:JSON.stringify(parsed.messages).length,requestBytes:body.length,status:'running'};report.modelTurns.push(turn);
    const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(modelTimeout+2000)])});
    const out=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>1048576)throw new Error('RESPONSE_TOO_LARGE');out.push(chunk);}
    const bytesOut=Buffer.concat(out),value=JSON.parse(bytesOut.toString());
    Object.assign(turn,{status:response.status,elapsedMs:Date.now()-start,selectedTools:(value.message?.tool_calls??[]).map(v=>({name:v.function.name,arguments:JSON.stringify(v.function.arguments)})),responseStatus:value.done_reason,outputText:value.message?.content?.slice(0,16000),usage:{promptTokens:value.prompt_eval_count,outputTokens:value.eval_count,totalDurationNs:value.total_duration}});
    res.writeHead(response.status,{'content-type':'application/json'}).end(bytesOut);
  }catch{if(turn)Object.assign(turn,{status:'transport_failed',elapsedMs:Date.now()-start});if(!res.destroyed)res.writeHead(502).end('{"error":"LOCAL_PROVIDER_UNAVAILABLE"}');}
  finally{active--;}
});
server.requestTimeout=modelTimeout+5000;server.headersTimeout=5000;
try{
  const tags=await (await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(4000)})).json();
  const installed=tags.models.find(m=>m.name===baseModel);assert.ok(installed,'Selected base model must already be installed locally');report.modelDigest=installed.digest;
  const alias=await fetch('http://127.0.0.1:11434/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,from:baseModel,parameters:{num_ctx:context,num_predict:1200,temperature:0},stream:false}),signal:AbortSignal.timeout(60000)});assert.equal(alias.status,200);await alias.json();
  const warmupStart=Date.now();const warmup=await fetch('http://127.0.0.1:11434/v1/responses',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,input:'Reply ready.',max_output_tokens:10}),signal:AbortSignal.timeout(120000)});assert.equal(warmup.status,200);await warmup.json();report.warmupMs=Date.now()-warmupStart;
  report.ollamaVersion=(await (await fetch('http://127.0.0.1:11434/api/version')).json()).version;
  const processes=await(await fetch('http://127.0.0.1:11434/api/ps',{signal:AbortSignal.timeout(4000)})).json();
  report.modelResources=processes.models.filter(m=>m.name===model).map(m=>({model:m.name,sizeBytes:m.size,vramBytes:m.size_vram,contextLength:m.context_length,parameterSize:m.details?.parameter_size,quantization:m.details?.quantization_level}));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  await logins();
  await writeFile(keyPath,token+'\n');
  await writeFile(configPath,JSON.stringify({provider:'ollama',model,endpoint:`https://host.docker.internal:${port}/api/chat`,apiKeyFile:'/etc/steward/analyst/api-key.txt',caFile:'/etc/steward/analyst/ca.pem',servername:'master.localhost',testModel:false,toolProfile:'compact',maxSteps:12,maxToolCalls:16,maxOutputTokens:1200,investigationTimeoutMs:600000,modelCallTimeoutMs:modelTimeout,toolTimeoutMs:['scientific-procurement','mission-sustainability'].includes(capability)?20000:8000,maxContextChars:48000}));
  if(process.env.STEWARD_VERIFY_PROVIDER_STATUS==='1'){report.providerStatus=(await api('master','/api/v5/analyst/provider-status')).value;assert.equal(report.providerStatus.state,'reachable');assert.equal(report.providerStatus.testModel,false);}
  if(process.env.STEWARD_OLLAMA_BROWSER==='1')browserSession=await(await import('./analyst-browser-session.mjs')).analystBrowserSession();
  const investigationStart=Date.now();
  const startInvestigation=(body)=>browserSession?browserSession.start(body.capability,body.prompt):api('master','/api/v5/analyst/investigations','POST',body,202);
  const started=await startInvestigation({capability,prompt:process.env.STEWARD_ANALYST_PROMPT??'Investigate intercompany storage sharing using the synthetic business dataset. Discover authorized entities and inspect their source records and relationships through tools. Choose actual compatible supply and external demand records. Use explicit illustrative assumptions of EUR 3000 internal monthly payment, EUR 1000 incremental monthly cost, EUR 6000 transition expense, 12 months, full proportional avoidance and conditional location compatibility; test EUR 2000 incremental cost/EUR 12000 transition as a sensitivity. Calculate through analyze_resource_sharing. Report only tool-supported observations and calculations, label location and cost assumptions, compare the baseline and sensitivity, and list human decisions. Do not publish a finding. In the final narrative, call unchanged external storage the zero-change baseline with zero benefit. Call the positive-benefit sharing arrangement the proposal. Distinguish illustrative assumptions from observed facts. Include a sensitivity array in the calculation tool arguments.'});
  report.investigationId=started.value.investigationId;
  const run=await waitFor(async()=>{const r=(await api('master','/api/v5/analyst/investigations/'+report.investigationId)).value;return r.investigation.status!=='running'?r:false;},'real Ollama investigation',620000);report.investigationMs=Date.now()-investigationStart;
  report.investigationStatus=run.investigation.status;report.error=run.investigation.error_code;report.activity=run.activity;report.result=run.investigation.result;
  assert.equal(run.investigation.test_model,false);
  assert.equal(run.investigation.status,'completed',run.investigation.error_code??'Model did not complete');
  const tools=run.activity.filter(a=>a.kind==='tool'&&a.status==='success').map(a=>a.tool);
  for(const name of capability==='mission-sustainability'?['query_mission_programmes','query_mission_scenarios','analyze_mission_sustainability']:capability==='scientific-procurement'?['list_entities','query_scientific_datasets','forecast_demand','query_scientific_constraints','optimize_procurement','compare_procurement_scenarios']:capability==='simulation-purchasing'?['list_entities','query_simulation_purchasing','analyze_simulation_purchasing']:capability==='commerce-performance'?['list_entities','query_commerce_evidence','analyze_commerce_by_id']:capability==='shared-procurement'?['list_entities','query_procurement_matches','analyze_shared_procurement_by_id']:capability==='workforce-opportunity'?['list_entities','query_workforce_matches','analyze_workforce_opportunity_by_id']:['query_resource_matches','query_business_relationships','analyze_resource_sharing_by_id'])assert.ok(tools.includes(name),'Real model must select '+name);
  report.checks.push('real model selected and invoked live MCP tools');
  for(const analysis of report.result.analyses){
    if(capability==='mission-sustainability'){
      assert(analysis.missionCalculationId,'Retained real mission calculation identity required');
      const saved=(await api('master','/api/v13/mission/calculations/'+analysis.missionCalculationId)).value.calculation;
      assert.equal(saved.result.status,'completed');assert.deepEqual(analysis.calculation,saved.result);
      const {scientific,...deterministic}=saved.result;
      assert.deepEqual(deterministic,calculateMissionSustainability(saved.input.releases,saved.input.allocations,saved.input.scenario));
      assert.equal(scientific.calculation.maximumAdditionalUnits,deterministic.planning.maximumAdditionalUnits);
      assert.equal(scientific.calculation.additionalCostCents,deterministic.planning.additionalCostCents);
      assert.deepEqual(analysis.supportingReferences,saved.source_references);
      assert(saved.source_references.every(r=>r.streamId==='mission_aggregates_v1'||r.streamId==='mission_resources_v1'));
      assert.equal(new Set(saved.source_references.map(r=>r.entityId)).size,2);
      for(const value of Object.values(deterministic.displayAmounts))assert(report.result.narrative.includes(value),'Narrative preserves actual deterministic amount '+value);
      report.missionCalculation={calculationId:saved.calculation_id,sourceReferences:saved.source_references,result:saved.result};
    }else if(capability==='resource-sharing'){
    const s=analysis.observed.supply,d=analysis.observed.demand;
    const successful=run.activity.find(a=>a.tool==='analyze_resource_sharing_by_id'&&a.status==='success'&&a.detail.result.structuredContent.data.supportingReferences[0].recordId===analysis.supportingReferences[0].recordId);assert.ok(successful);
    const inputCall=run.activity.slice(0,run.activity.indexOf(successful)).findLast(a=>a.tool==='analyze_resource_sharing_by_id'&&a.status==='running');assert.ok(inputCall);
    const {supplyRecordId,demandRecordId,supplyRevision,demandRevision,...assumptions}=inputCall.detail.arguments;
    const recomputed=resourceSharing.calculate({...assumptions,sensitivity:assumptions.sensitivity??[],availableCapacity:Number(s.available_m3),requiredCapacity:Number(d.required_m3),externalMonthlyCost:Number(d.monthly_external_cost),currency:s.currency});
    assert.deepEqual(analysis.calculation,recomputed);
    assert.ok(analysis.observed.supplyWorker&&analysis.observed.demandWorker&&analysis.supportingReferences.length===2);
    }else if(capability==='simulation-purchasing'){
      const sourceRows=analysis.observed.sources.map(s=>({entity_id:s.reference.entityId,installation_id:s.sourceWorker,module_id:s.reference.moduleId,stream_id:s.reference.streamId,record_id:s.reference.recordId,revision:s.reference.revision,source_at:s.observedAt,ingested_at:s.ingestedAt,payload:s.payload}));
      const opportunity=purchasingOpportunities(sourceRows).find(o=>o.key===analysis.calculation.key);assert(opportunity,'Observed source evidence must reconstruct the purchasing cohort');assert.deepEqual(analysis.calculation,{capabilityId:'steward.simulation-purchasing',schemaVersion:1,...opportunity});assert(analysis.affectedEntities.length>=2);assert(analysis.supportingReferences.every(r=>['simulation_runs','commerce_orders'].includes(r.streamId)));for(const value of Object.values(opportunity.displayAmounts))assert(report.result.narrative.includes(value),'Narrative must copy actual service-calculated amount '+value);
    }else if(capability==='scientific-procurement'){
      const ref=analysis.scientificReference;assert(ref?.jobId&&ref.inputDigest,'Actual governed scientific reference required');
      const saved=(await api('master','/api/v4/scientific/runs/'+ref.jobId)).value.run;assert.equal(saved.state,'completed');assert.equal(saved.result.inputDigest,ref.inputDigest);assert.equal(saved.dataset_id,ref.datasetId);assert.equal(saved.result.provenance.synthetic,true);
      assert.deepEqual(analysis.calculation,{...saved.result.calculation,capabilityId:'steward.scientific.'+saved.capability,schemaVersion:1});
      if(saved.capability==='procurement-optimization'){
        const p=saved.request.parameters,c=saved.result.calculation,baseline=purchasingBaseline(p.entities,p.requirements).baselineExternalCents;
        assert.equal(c.baselineExternalCents,baseline);assert.equal(c.proposedCostCents,c.allocations.reduce((n,a)=>n+a.merchandiseCents,0)+c.suppliers.reduce((n,s)=>n+s.shippingCents,0)+p.entities.reduce((n,e)=>n+e.transitionCents,0));
        assert.equal(c.ecosystemBenefitCents,baseline-c.proposedCostCents);assert.equal(c.impacts.reduce((n,i)=>n+i.benefitCents,0),c.ecosystemBenefitCents);
        for(const requirement of p.requirements)assert.equal(c.allocations.filter(a=>a.entityId===requirement.entityId&&a.product===requirement.product).reduce((n,a)=>n+a.quantity,0),requirement.quantity);
        for(const supplier of c.suppliers){const terms=p.suppliers.find(s=>s.id===supplier.id);assert(supplier.quantity<=terms.capacity);if(supplier.quantity){assert(supplier.quantity>=terms.minimumUnits);assert(supplier.quantity>=terms.tiers[supplier.tier].minimumUnits);for(const a of c.allocations.filter(a=>a.supplierId===supplier.id)){assert(Number.isInteger(a.quantity));assert.equal(a.unitCents,terms.tiers[supplier.tier].unitCosts[a.product]);}}}
        const compact=compactScientificCalculation(c);for(const value of [...Object.values(compact.displayAmounts),...compact.impacts.map(i=>i.displayBenefit)])assert(containsScientificAmount(report.result.narrative,value),'Narrative preserves actual scientific service currency amounts');
      }
      if(saved.capability!=='demand-forecast'){const forecast=report.result.analyses.find(a=>a.calculation.capabilityId==='steward.scientific.demand-forecast');assert.equal(saved.result.provenance.derivedFrom[0].jobId,forecast.scientificReference.jobId);assert.equal(saved.result.provenance.derivedFrom[0].inputDigest,forecast.scientificReference.inputDigest);}
      assert(!report.result.partialInvestigation,'Full scientific investigation required');
    }else{
      const sources=analysis.observed.sources.map(s=>canonicalBusinessPayload({payload:s.payload}));
      const recomputed=capability==='commerce-performance'?calculateCommerce(sources):capability==='shared-procurement'?calculateProcurement(sources[0],sources[1],sources[2],analysis.calculation.assumptions.internalTransferCents):calculateWorkforce(sources[0],sources[1],sources[2]);
      assert.deepEqual(analysis.calculation,recomputed);if(capability==='commerce-performance')assert.ok(analysis.supportingReferences.length>=2);else assert.equal(analysis.supportingReferences.length,3);assert(analysis.observed.sources.every(s=>s.sourceWorker&&s.observedAt));
    }
    for(const ref of capability==='mission-sustainability'?[]:analysis.supportingReferences){const rows=(await api('master','/api/v4/analytics?entityId='+ref.entityId)).value.records;assert.ok(rows.some(r=>r.entity_id===ref.entityId&&r.module_id===ref.moduleId&&r.stream_id===ref.streamId&&r.record_id===ref.recordId&&Number(r.revision)===ref.revision));}
  }
  report.checks.push('deterministic calculations independently recomputed and source revisions rechecked');
  if((capability==='resource-sharing'&&process.env.STEWARD_OLLAMA_DEFER_PUBLICATION!=='1')||process.env.STEWARD_OLLAMA_PUBLISH_REVIEWED==='1'){
  // Legacy storage verifier compatibility; Phase 7 defaults to separate text review.
  const finding=(await (browserSession?browserSession.publish(report.investigationId):api('master','/api/v5/analyst/investigations/'+report.investigationId+'/finding','POST',{}))).value;
  report.findingId=finding.findingId;report.deliveries=[];
  for(const worker of ['worker-1','worker-2','worker-3']){
    const entityId=(await api(worker,'/api/v2/worker/status')).value.entityId;
    const affected=report.result.analyses.some(a=>a.affectedEntities.includes(entityId));
    const rows=affected?await waitFor(async()=>{const fs=(await api(worker,'/api/v4/findings')).value.findings;return fs.some(f=>f.finding_id===finding.findingId)?fs:false;},'real finding delivery '+worker):(await api(worker,'/api/v4/findings')).value.findings;
    assert.equal(rows.some(f=>f.finding_id===finding.findingId),affected);report.deliveries.push({worker,affected,received:affected});
  }
  report.checks.push('explicit finding publication delivered only to affected Workers');
  }else report.checks.push('Finding publication deferred until separate operator narrative review');
  if(browserSession)await browserSession.verify(report);
  report.status='passed_pending_narrative_review';
  console.log('PASS real local model MCP investigation and independently recomputed source-backed calculations. Review narrative before publishing a finding.');
}catch(error){report.status='failed';report.failure=error.message;process.exitCode=1;console.log('Real Ollama validation failed: '+error.message);}
finally{
  if(browserSession)await browserSession.close();
  await writeFile(configPath,originalConfig);await writeFile(keyPath,originalKey);report.configurationRestored=true;
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  try{const stop=await fetch('http://127.0.0.1:11434/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,keep_alive:0}),signal:AbortSignal.timeout(10000)});await stop.text();report.modelUnloaded=stop.ok;}catch{}
  await writeFile(process.env.STEWARD_OLLAMA_REPORT??'artifacts/phase5-ollama-provider.json',JSON.stringify(report,null,2)+'\n');
  await unlink(recoveryPath);await rmdir(lockPath);
}
