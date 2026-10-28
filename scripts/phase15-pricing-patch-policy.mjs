// Reviewed patch policy. Importing performs no reads, authentication or writes.
// Root supplies authenticated existing APIs, readonly snapshot functions and private ledger persistence.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {canonical,digest,verifyPackage} from '../packages/module-sdk/dist/index.js';
const ID='steward.pricing.management',CAT='steward.catalog.universal';
const workers=['worker-1','worker-2','worker-3'];
export async function assertCompleteClusterDump(file){
 const stat=await fs.lstat(file);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0,'Complete original database dump required');
 const handle=await fs.open(file,'r');let tail;
 try{const length=Math.min(65536,stat.size),buffer=Buffer.alloc(length);const {bytesRead}=await handle.read(buffer,0,length,stat.size-length);assert.equal(bytesRead,length,'Database dump changed while reading');tail=buffer.toString('utf8');}finally{await handle.close();}
 const lines=tail.split(/\r?\n/),marker=lines.findLastIndex(line=>line==='-- PostgreSQL database cluster dump complete');
 assert(marker>=0,'Database dump completion marker missing; do not use a partial backup');
 assert(lines.slice(marker+1).every(line=>line===''||line==='--'||/^\\unrestrict [A-Za-z0-9_]+$/.test(line)),'Database dump has unexpected content after completion marker');
 const after=await fs.lstat(file);assert.equal(after.size,stat.size,'Database dump changed during verification');assert.equal(after.mtimeMs,stat.mtimeMs,'Database dump changed during verification');return{bytes:stat.size,clusterComplete:true};
}
const operationSets={
 'catalog.offerings.read':['catalog.lookup','catalog.read','catalog.discover','catalog.import-preview'],
 'catalog.pricing-subjects.read':['catalog.pricing.lookup'],
 'costs.procurement.read':['cost-evidence.discover','cost-evidence.lookup']
};
export function assertRetainedPatchGovernance(before,after,{pricingInstallation,retainedBindingIds=[],closedWorkflowIds=[]}){
 const strip=(row,keys)=>Object.fromEntries(Object.entries(row).filter(([key])=>!keys.includes(key)));
 for(const key of ['obligations','routes','permissions','accounts','enrollment'])assert.equal(canonical(after[key]),canonical(before[key]),'Original authority changed: '+key);
 for(const old of before.installations){const current=after.installations.find(row=>row.moduleId===old.moduleId);assert(current,'Original installation missing');if(old.moduleId===ID){assert.equal(current.version,'1.3.1');assert.equal(current.operationId,pricingInstallation.operationId);assert.equal(current.imageId,pricingInstallation.imageId);assert.equal(current.state,'active');assert.equal(canonical(current.configuration),canonical(old.configuration));}else assert.equal(canonical(current),canonical(old),'Unrelated provider identity/configuration changed');}
 for(const old of before.bindings){const current=after.bindings.find(row=>row.binding_id===old.binding_id);assert(current,'Original binding missing');if(retainedBindingIds.includes(old.binding_id)){assert.equal(current.state,'retained');assert.equal(canonical(strip(current,['state','reason','updated_at','revision'])),canonical(strip(old,['state','reason','updated_at','revision'])),'Original binding/provider pin rewritten');}else assert.equal(canonical(current),canonical(old),'Unrelated binding changed');}
 for(const old of before.workflows){const current=after.workflows.find(row=>row.workflow_id===old.workflow_id);assert(current,'Original workflow missing');if(closedWorkflowIds.includes(old.workflow_id)){assert.equal(current.accepting_new,false,'Original workflow must retain old obligations only');assert.equal(canonical(strip(current,['accepting_new'])),canonical(strip(old,['accepting_new'])),'Original workflow terms changed');}else assert.equal(canonical(current),canonical(old),'Unrelated workflow changed');}
}
export function preparePricingPatch({selection,snapshots,catalog,trust,includeW3ProcurementCosts=false,includeW3SalesPricing=false}){
 const descriptor=catalog.packages.find(d=>d.payload.manifest.moduleId===ID&&d.payload.manifest.version==='1.3.1');assert(descriptor,'Publish and verify new immutable 1.3.1 first');
 assert(selection.directory&&selection.project);
 const candidate=verifyPackage(descriptor,trust),plan={version:1,selectedDirectory:path.resolve(selection.directory),project:selection.project,backupDirectory:null,reason:'Explicit reviewed Pricing1.3.0 timestamp fallback correction as immutable new1.3.1; original rules/models/decisions remain unchanged; new cohorts require fresh human review',descriptor,packageDigest:digest(canonical(descriptor)),workers:[],salesRebinding:null};
 for(const worker of workers){
  const s=snapshots[worker],current=s.installed.find(m=>m.moduleId===ID);assert.equal(current?.version,'1.3.0');assert.equal(current.state,'active');assert.equal(s.pendingPricingJobs,0,'Drain original pending quotes/catalog/cost reads first');assert.equal(s.pendingPricingOutbox,0,'Original outbound obligations must finish before upgrade');
  const sameManifest=structuredClone(current.manifest);sameManifest.version='1.3.1';assert.equal(canonical(sameManifest),canonical(candidate.manifest),'Patch cannot silently change signed APIs, permissions, configuration or capability contracts');
  assert.equal(canonical(current.manifest.persistence),canonical(candidate.manifest.persistence),'Patch must append no SQL or reinterpret existing schema');
  assert.equal(canonical(s.appliedMigrations),canonical(current.manifest.persistence.migrations),'Actual applied ancestry differs');
  const item={worker,workerInstallationId:s.installationId,entityId:s.entityId,oldOperationId:current.operationId,oldImageId:current.imageId,newOperationId:randomUUID(),configuration:structuredClone(current.configuration),configurationDigest:digest(canonical(current.configuration)),protectedDatabase:s.protectedDatabase,oldGovernance:s.governanceProof,bindings:[],workflow:{workflowId:randomUUID(),name:'Phase15 Pricing131 '+worker,version:1,consumerId:ID,steps:[],reason:plan.reason},stage:'reviewed-not-executed'};
  const targets=[[CAT,'catalog.offerings.read'],[CAT,'catalog.pricing-subjects.read']];
  if(worker==='worker-3'&&includeW3ProcurementCosts)targets.push(['cee.procurement','costs.procurement.read']);
  for(const [providerId,capabilityId]of targets){
   const provider=s.installed.find(m=>m.moduleId===providerId);assert.equal(provider?.state,'active');
   const signed=catalog.packages.find(d=>d.payload.manifest.moduleId===providerId&&d.payload.manifest.version===provider.version);assert(signed);const p=verifyPackage(signed,trust);assert.equal(p.imageId,provider.imageId);
   const cap=p.manifest.smart.provides.find(c=>c.capabilityId===capabilityId),req=candidate.manifest.smart.consumes.find(c=>c.capabilityId===capabilityId);assert(cap&&req);
   const ops=operationSets[capabilityId];for(const op of ops)assert(cap.operations.some(o=>o.name===op)&&req.operations.some(o=>o.name===op));
   const old=s.bindings.filter(b=>b.consumer_id===ID&&b.capability_id===capabilityId&&b.state==='approved');assert.equal(old.length,1,'Existing reviewed route must be inspected exactly; do not select an arbitrary provider');
   assert.equal(old[0].provider_id,providerId);assert.equal(old[0].package_digest,digest(canonical(signed)));assert.equal(old[0].provider_installation_id,provider.operationId);assert.equal(old[0].peer_installation_id,null,'This draft never changes remote grants');
   for(const field of ['peer_grant_id','source_program_id','destination_program_id','purpose','expires_at'])assert(old[0][field]==null,'Never widen a scoped or expiring approval into a general route');
   const bindingId=randomUUID();item.bindings.push({bindingId,consumerId:ID,providerId,capabilityId,packageDigest:old[0].package_digest,reason:plan.reason,preserveExistingObligations:true,originalBindingId:old[0].binding_id,providerOperationId:provider.operationId});item.workflow.steps.push(...ops.map(operation=>({bindingId,operation})));
  }
  assert(item.workflow.steps.length<=16);plan.workers.push(item);
 }
 if(includeW3SalesPricing){
  const s=snapshots['worker-3'],pricing=plan.workers.find(w=>w.worker==='worker-3'),sales=s.installed.find(m=>m.moduleId==='cee.sales');assert.equal(sales?.state,'active');
  assert.equal(s.pendingSalesIntents,0);assert.equal(s.pendingSalesOutbox,0);assert.equal(s.pendingSalesQuotes,0,'Original Sales quote requests must complete/expire, never transfer');assert(s.protectedSalesDatabase);
  const old=s.bindings.filter(b=>b.consumer_id==='cee.sales'&&b.capability_id==='pricing.prices.resolve'&&b.state==='approved');assert.equal(old.length,1);assert.equal(old[0].provider_id,ID);assert.equal(old[0].provider_installation_id,pricing.oldOperationId);assert.equal(old[0].peer_installation_id,null);
  for(const field of ['peer_grant_id','source_program_id','destination_program_id','purpose','expires_at'])assert(old[0][field]==null,'Never widen original Sales scope');
  const active=s.workflows.filter(w=>w.consumer_id==='cee.sales'&&w.state==='active'&&w.accepting_new);assert.equal(active.length,1,'Inspect exact current Sales new-work workflow');
  const oldSteps=active[0].definition.steps;assert(oldSteps.some(step=>step.bindingId===old[0].binding_id));assert(oldSteps.filter(step=>step.bindingId===old[0].binding_id).every(step=>['pricing.request','pricing.status'].includes(step.operation)));
  const bindingId=randomUUID();plan.salesRebinding={worker:'worker-3',salesOperationId:sales.operationId,originalBindingId:old[0].binding_id,originalWorkflowId:active[0].workflow_id,protectedSalesDatabase:s.protectedSalesDatabase,binding:{bindingId,consumerId:'cee.sales',providerId:ID,capabilityId:'pricing.prices.resolve',packageDigest:plan.packageDigest,preserveExistingObligations:true,reason:plan.reason},workflow:{workflowId:randomUUID(),name:'Phase15 Sales Pricing131 newwork',version:1,consumerId:'cee.sales',steps:oldSteps.map(step=>step.bindingId===old[0].binding_id?{...step,bindingId}:{...step}),reason:plan.reason}};
  assert(plan.salesRebinding.workflow.steps.length<=16);
 }
 return plan; // Persist entire private plan BEFORE calling apply; never regenerate IDs on retry.
}

async function verifyFullBackup(plan){
 assert(plan.backupDirectory,'Root must create a complete private selected-stack backup first');
 const directory=path.resolve(plan.backupDirectory);assert.notEqual(directory,plan.selectedDirectory);
 const manifest=JSON.parse(await fs.readFile(path.join(directory,'configuration/manifest.json'),'utf8'));assert.equal(manifest.project,plan.project);
 for(const worker of plan.workers)assert.equal(manifest.instances.find(i=>i.key===worker.worker)?.installationId,worker.workerInstallationId);
 for(const key of ['master','worker-1','worker-2','worker-3'])await assertCompleteClusterDump(path.join(directory,key+'-databases.sql'));
 await fs.access(path.join(directory,'backup.json'));await fs.access(path.join(directory,'configuration/security'));await fs.access(path.join(directory,'configuration/commerce/private'));
}

/** Not a CLI. Root must explicitly pass reviewed:true and an already persisted exact plan.
 * snapshot returns original-owner SQL hashes/counts for ALL Pricing data/history/migration/identity
 * tables (exclude only observational outbox attempts/error metadata), plus current module and route pins.
 * assertRetainedGovernance checks original obligations/route envelopes unchanged; old binding state
 * approved->retained and original workflow accepting_new true->false are the only expected changes. */
export async function applyPricingPatch({reviewed,plan,api,snapshot,persist,waitFor,assertRetainedGovernance,createFullPrivateBackup}){
 assert.equal(reviewed,true);assert.equal(plan.version,1);assert.equal(plan.workers.length,3);
 if(!plan.backupDirectory){plan.backupDirectory=await createFullPrivateBackup(plan);await persist(plan);}
 await verifyFullBackup(plan); // No installation call can occur before complete private backup proof.
 for(const w of plan.workers){
  let live=await snapshot(w.worker);assert.equal(live.installationId,w.workerInstallationId);assert.equal(live.entityId,w.entityId);
  assert.equal(live.pendingPricingJobs,0);assert.equal(live.pendingPricingOutbox,0);assert.equal(canonical(live.protectedDatabase),canonical(w.protectedDatabase),'Original Pricing data/history changed since review');
  let current=live.installed.find(m=>m.moduleId===ID);assert(['1.3.0','1.3.1'].includes(current.version));assert.notEqual(current.state,'failed','Actual Pricing failure: '+current.errorCode);
  assert.equal(canonical(current.configuration),canonical(w.configuration),'Preserve exact original public configuration');
  if(current.version==='1.3.0'){
   assert.equal(current.operationId,w.oldOperationId);assert.equal(current.imageId,w.oldImageId);
   w.stage='upgrade-requested';await persist(plan);
   await api(w.worker,'/api/v3/modules/install','POST',{packageId:ID+'@1.3.1',operationId:w.newOperationId,configuration:w.configuration,upgrade:true});
   current=await waitFor(async()=>{const s=await snapshot(w.worker),m=s.installed.find(v=>v.moduleId===ID);return m.version==='1.3.1'&&m.state!=='installing'?m:null;},'Pricing131 installation '+w.worker);
  }
  assert.equal(current.operationId,w.newOperationId);assert.equal(current.imageId,plan.descriptor.payload.imageId);assert.notEqual(current.state,'failed','Pricing installation failed: '+current.errorCode);
  if(current.state==='installed'){w.stage='activation-requested';await persist(plan);await api(w.worker,'/api/v3/modules/'+ID+'/lifecycle','POST',{action:'activate'});current=await waitFor(async()=>{const s=await snapshot(w.worker),m=s.installed.find(v=>v.moduleId===ID);return m.state==='active'?m:null;},'Pricing131 activation '+w.worker);}else assert.equal(current.state,'active','Never re-enable a disabled module automatically');
  live=await snapshot(w.worker);assert.equal(canonical(live.protectedDatabase),canonical(w.protectedDatabase),'Upgrade rewrote original Pricing tables');assert.equal(canonical(current.configuration),canonical(w.configuration));w.stage='upgraded-data-preserved';await persist(plan);
  for(const binding of w.bindings){
   const provider=live.installed.find(m=>m.moduleId===binding.providerId);assert.equal(provider.operationId,binding.providerOperationId,'Original Catalog/cost provider changed');
   const {originalBindingId,providerOperationId,...body}=binding;await api(w.worker,'/api/v8/smart-modules/bindings','POST',body);
  }
  await api(w.worker,'/api/v8/smart-modules/workflows','POST',w.workflow);
  let workflow=(await api(w.worker,'/api/v8/smart-modules')).workflows.find(v=>v.workflow_id===w.workflow.workflowId);assert(workflow);
  if(workflow.state==='proposed'){await api(w.worker,'/api/v8/smart-modules/workflows/'+w.workflow.workflowId+'/lifecycle','POST',{action:'approve',reason:plan.reason});workflow={state:'approved'};}
  if(workflow.state==='approved')await api(w.worker,'/api/v8/smart-modules/workflows/'+w.workflow.workflowId+'/lifecycle','POST',{action:'activate',reason:plan.reason});else assert.equal(workflow.state,'active','Do not auto-renew disabled or obsolete approvals');
  const after=await snapshot(w.worker);assert.equal(canonical(after.protectedDatabase),canonical(w.protectedDatabase));await assertRetainedGovernance(w.oldGovernance,after.governanceProof,w);w.stage='new-work-reviewed';await persist(plan);
 }
 if(plan.salesRebinding){
  const s=plan.salesRebinding,live=await snapshot(s.worker),sales=live.installed.find(m=>m.moduleId==='cee.sales'),pricing=live.installed.find(m=>m.moduleId===ID),patched=plan.workers.find(w=>w.worker===s.worker);
  assert.equal(sales.operationId,s.salesOperationId);assert.equal(pricing.operationId,patched.newOperationId);assert.equal(live.pendingSalesIntents,0);assert.equal(live.pendingSalesOutbox,0);assert.equal(live.pendingSalesQuotes,0);assert.equal(canonical(live.protectedSalesDatabase),canonical(s.protectedSalesDatabase));
  await api(s.worker,'/api/v8/smart-modules/bindings','POST',s.binding);await api(s.worker,'/api/v8/smart-modules/workflows','POST',s.workflow);
  let workflow=(await api(s.worker,'/api/v8/smart-modules')).workflows.find(w=>w.workflow_id===s.workflow.workflowId);assert(workflow);
  if(workflow.state==='proposed'){await api(s.worker,'/api/v8/smart-modules/workflows/'+s.workflow.workflowId+'/lifecycle','POST',{action:'approve',reason:plan.reason});workflow={state:'approved'};}
  if(workflow.state==='approved')await api(s.worker,'/api/v8/smart-modules/workflows/'+s.workflow.workflowId+'/lifecycle','POST',{action:'activate',reason:plan.reason});else assert.equal(workflow.state,'active');
  const after=await snapshot(s.worker);assert.equal(canonical(after.protectedSalesDatabase),canonical(s.protectedSalesDatabase));await assertRetainedGovernance(patched.oldGovernance,after.governanceProof,{...patched,salesRebinding:s});s.stage='new-work-reviewed';await persist(plan);
 }
 return{completed:true,originalRowsUntouched:true,newCohortsRequired:true,oldProviderPinsRetained:true};
}
