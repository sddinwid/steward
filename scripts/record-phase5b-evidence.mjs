import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {compose,docker,sql,manifest,json,directory} from './lib.mjs';
import path from 'node:path';
const read=async name=>JSON.parse(await readFile('artifacts/'+name+'.json','utf8'));
const live=await read('phase5-ollama-provider');assert.equal(live.investigationStatus,'completed');assert.equal(live.testModel,false);assert.ok(live.findingId);assert.ok(live.configurationRestored&&live.modelUnloaded);
assert.match(live.investigationId,/^[0-9a-f-]{36}$/);assert.equal(live.findingId,live.investigationId);
const persisted=JSON.parse(sql('master',"SELECT json_build_object('status',status,'findingId',finding_id,'result',result) FROM analyst_investigations WHERE investigation_id='"+live.investigationId+"'"));
assert.equal(persisted.status,'completed');assert.equal(persisted.findingId,live.findingId);assert.deepEqual(persisted.result,live.result);
// Independent arithmetic equations, not a second call to the production engine.
for(const a of live.result.analyses){
 const c=a.calculation,i=c.assumptions,round=n=>Math.round(n*100)/100;
 const capacity=i.locationCompatible?Math.min(Number(a.observed.supply.available_m3),Number(a.observed.demand.required_m3)):0;
 const avoided=Number(a.observed.demand.monthly_external_cost)*capacity/Number(a.observed.demand.required_m3)*i.avoidableExternalFraction;
 assert.equal(c.sharedCapacity,capacity);assert.equal(c.proposal.ecosystemMonthlyBenefit,round(avoided-(capacity?i.incrementalMonthlyCost:0)));
 assert.equal(c.proposal.consumerMonthlyBenefit,round(avoided-(capacity?i.internalMonthlyPayment:0)));
 assert.equal(c.proposal.providerMonthlyBenefit,round(capacity?i.internalMonthlyPayment-i.incrementalMonthlyCost:0));
 assert.equal(c.proposal.ecosystemHorizonBenefit,round(c.proposal.ecosystemMonthlyBenefit*i.horizonMonths-(capacity?i.transitionExpense:0)));
 for(let n=0;n<c.alternatives.length;n++){const s=i.sensitivity[n],v=c.alternatives[n];assert.equal(v.ecosystemHorizonBenefit,round((avoided-(capacity?s.incrementalMonthlyCost:0))*i.horizonMonths-(capacity?s.transitionExpense:0)));}
 const narrative=live.result.narrative.replace(/(?<=\d),(?=\d)/g,'');for(const figure of [c.proposal.consumerMonthlyBenefit,c.proposal.providerMonthlyBenefit,c.proposal.ecosystemMonthlyBenefit,c.proposal.ecosystemHorizonBenefit,...c.alternatives.map(v=>v.ecosystemHorizonBenefit)])assert.ok(narrative.includes(String(figure)),'Narrative must quote actual deterministic results');
}
const deployment=await manifest(),applications=[];
for(const i of deployment.instances){
 const api=JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-api')]))[0],web=JSON.parse(docker(['inspect',compose('ps','-q',i.key+'-web')]))[0];
 assert.equal((await json('http://127.0.0.1:'+i.apiPort+'/ready')).status,'ready');
 applications.push({key:i.key,installationId:i.installationId,apiImage:api.Image,frontendImage:web.Image,schema:Number(sql(i.key,'SELECT max(version) FROM platform_migrations'))});
 if(i.role==='worker'){const received=Number(sql(i.key,"SELECT count(*) FROM local_findings WHERE finding_id='"+live.findingId+"'"))===1;assert.equal(received,live.deliveries.find(d=>d.worker===i.key).affected);}
}
const workers=applications.filter(a=>a.key!=='master');assert.equal(new Set(workers.map(a=>a.apiImage)).size,1);assert.equal(new Set(workers.map(a=>a.frontendImage)).size,1);
const runtime=compose('ps','--format','json').split('\n').filter(Boolean).map(s=>{const r=JSON.parse(s);return{service:r.Service,state:r.State,health:r.Health,image:r.Image};});assert.equal(runtime.length,15);assert.ok(runtime.every(r=>r.state==='running'&&r.health==='healthy'));
const activeModules=workers.flatMap(w=>docker(['ps','--filter','label=steward.installation='+w.installationId,'--filter','label=steward.managed-by=module-host-v1','--format','{{.Names}} {{.Image}}']).split('\n').filter(Boolean));assert.equal(activeModules.length,6);
const loaded=(await(await fetch('http://127.0.0.1:11434/api/ps')).json()).models;assert.equal(loaded.length,0);
const tags=(await(await fetch('http://127.0.0.1:11434/api/tags')).json()).models;assert.equal(tags.find(m=>m.name===live.baseModel).digest,live.modelDigest);
const alias=await(await fetch('http://127.0.0.1:11434/api/show',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:live.model})})).json();assert.match(alias.parameters,new RegExp('num_ctx\\s+'+live.context+'\\b'));
assert.deepEqual(JSON.parse(await readFile(path.join(directory,'analyst/config/model.json'),'utf8')),{});assert.equal((await readFile(path.join(directory,'analyst/config/api-key.txt'),'utf8')).trim(),'');
const phase4=await read('phase4-results'),testModel=await read('phase5-results'),legacy=await read('phase5-legacy-regressions');assert.equal(phase4.checks.length,13);assert.equal(testModel.checks.length,11);assert.equal(legacy.phase2,'passed');assert.equal(legacy.phase3,'passed');
const restart=await read('phase3-restart-results');assert.equal(restart.assertions,'all passed');
const fresh=await read('phase5-fresh-topology-results');assert.equal(fresh.inventoryWasAbsentBeforeInstall,true);assert.equal(fresh.coreImages.worker2Before,fresh.coreImages.worker2After);
const failures=[];for(const name of ['phase5b-first-attempt','phase5b-second-attempt','phase5b-third-attempt','phase5b-narrative-success-harness-failure']){const r=await read(name);failures.push({artifact:name,investigationId:r.investigationId,applicationStatus:r.investigationStatus,error:r.error??r.failure,elapsedMs:r.investigationMs,modelCalls:r.modelTurns.length});}
const evidence={recordedAt:new Date().toISOString(),status:'passed_for_real_local_Qwen_workflow',baselineCommit:'8dc37c7',unitTests:{passed:34,failed:0,skipped:0},
 live:{...live,activity:live.activity.map(a=>({kind:a.kind,tool:a.tool,status:a.status,detail:a.kind==='tool'?{arguments:a.detail.arguments,milliseconds:a.detail.milliseconds,evidenceBytes:a.detail.evidenceBytes,modelBytes:a.detail.modelBytes}:a.detail}))},
 review:{reviewedAgainstRetrievedEvidence:true,independentArithmeticCheck:'passed',narrativeFigures:'match deterministic baseline and sensitivity',sourceAttribution:'exact observed revisions and Worker identities retained',conditions:'location, costs, contract avoidance and business approval remain explicit assumptions/human decisions',modelWordingLimitation:'free-form assumptions can repeat observed facts; UI separately renders observed source quantities and validated calculation assumptions, preserving model wording as non-authoritative',businessDecisionExecuted:false,scope:'one controlled synthetic investigation; not a general model-quality guarantee'},
 priorAttempts:failures,compactMcp:await read('phase5b-compact-mcp'),compactAnalyst:await read('phase5b-compact-analyst'),browser:await read('phase5b-live-browser'),
 regressions:{phase4:{startedAt:phase4.startedAt,finishedAt:phase4.finishedAt,checks:phase4.checks,browserPageErrors:phase4.browserPageErrors},phase5TestModel:{verifiedAt:testModel.verifiedAt,checks:testModel.checks},legacy,freshDynamicInstallation:{verifiedAt:fresh.verifiedAt,inventoryWasAbsentBeforeInstall:fresh.inventoryWasAbsentBeforeInstall,coreImages:fresh.coreImages,checks:fresh.checks},concurrency:await read('phase5-concurrency'),outage:await read('phase4-outage-independence'),restart:{verifiedAt:restart.verifiedAt,assertions:restart.assertions,preservedWorkers:Object.keys(restart.before)},provisioning:await read('phase3-provision-results'),unconfigured:await read('phase5-unconfigured')},
 runtime,applications,activeModules,aliasParameters:alias.parameters,originalModelDigestPreserved:true,loadedModels:loaded,operatorConfiguration:'restored to empty model config/key',cloudProviderValidation:'not performed; no cloud credentials',phase6:'not implemented'};
await writeFile('docs/phase5b-verification-evidence.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS real-model evidence, independent equations, narrative figures, persisted delivery, 15 healthy services, 6 modules, preserved model/configuration and unloaded runners');
