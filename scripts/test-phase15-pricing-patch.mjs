// Pure signed-contract and preservation checks; never Docker, login or deployment.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {signPackage,digest,canonical} from '../packages/module-sdk/dist/index.js';
import {preparePricingPatch,assertRetainedPatchGovernance,assertCompleteClusterDump} from './phase15-pricing-patch-policy.mjs';
const ID='steward.pricing.management',C='steward.catalog.universal',keys=generateKeyPairSync('ed25519'),key=keys.privateKey.export({type:'pkcs8',format:'pem'}).toString(),trust={publishers:[{publisherId:'fixture-only',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()}]};
const load=async name=>JSON.parse(await fs.readFile(new URL('../modules/'+name+'/manifest.json',import.meta.url),'utf8'));
const pricing=await load('pricing');pricing.version='1.3.0';const catalogManifest=await load('catalog'),procurement=await load('procurement'),sales=await load('sales');
const sign=(manifest,id)=>signPackage({formatVersion:1,publisherId:'fixture-only',imageId:'sha256:'+id.repeat(64),manifest},key);
function fixture(change=()=>{}){
 const newer=structuredClone(pricing);newer.version='1.3.1';change(newer);
 const old=sign(structuredClone(pricing),'a'),candidate=sign(newer,'b'),cat=sign(structuredClone(catalogManifest),'c'),proc=sign(structuredClone(procurement),'d'),sale=sign(structuredClone(sales),'e');
 const snapshots={};
 for(const worker of ['worker-1','worker-2','worker-3']){
  const p={moduleId:ID,version:'1.3.0',state:'active',operationId:randomUUID(),imageId:old.payload.imageId,manifest:structuredClone(pricing),configuration:{integrationsEnabled:true}},c={moduleId:C,version:catalogManifest.version,state:'active',operationId:randomUUID(),imageId:cat.payload.imageId,manifest:catalogManifest,configuration:{}};
  const bindings=['catalog.offerings.read','catalog.pricing-subjects.read'].map(capability_id=>({binding_id:randomUUID(),consumer_id:ID,capability_id,state:'approved',provider_id:C,provider_installation_id:c.operationId,package_digest:digest(canonical(cat)),peer_installation_id:null}));
  const s=snapshots[worker]={installationId:randomUUID(),entityId:randomUUID(),installed:[p,c],bindings,workflows:[],pendingPricingJobs:0,pendingPricingOutbox:0,appliedMigrations:structuredClone(pricing.persistence.migrations),protectedDatabase:{business_records:{count:3,hash:'original'},module_identity:{count:1,hash:'original'}},governanceProof:{fixture:true}};
  if(worker==='worker-3'){
   const q={moduleId:'cee.procurement',version:procurement.version,state:'active',operationId:randomUUID(),imageId:proc.payload.imageId,manifest:procurement,configuration:{}},v={moduleId:'cee.sales',version:sales.version,state:'active',operationId:randomUUID(),imageId:sale.payload.imageId,manifest:sales,configuration:{}};s.installed.push(q,v);
   bindings.push({binding_id:randomUUID(),consumer_id:ID,capability_id:'costs.procurement.read',state:'approved',provider_id:q.moduleId,provider_installation_id:q.operationId,package_digest:digest(canonical(proc)),peer_installation_id:null});
   const oldBinding={binding_id:randomUUID(),consumer_id:'cee.sales',capability_id:'pricing.prices.resolve',state:'approved',provider_id:ID,provider_installation_id:p.operationId,package_digest:digest(canonical(old)),peer_installation_id:null};bindings.push(oldBinding);
   s.workflows=[{workflow_id:randomUUID(),consumer_id:'cee.sales',state:'active',accepting_new:true,definition:{steps:[{bindingId:oldBinding.binding_id,operation:'pricing.request'},{bindingId:oldBinding.binding_id,operation:'pricing.status'},{bindingId:'original-inventory-binding',operation:'stock.verified.reserve'}]}}];
   Object.assign(s,{pendingSalesIntents:0,pendingSalesOutbox:0,pendingSalesQuotes:0,protectedSalesDatabase:{accepted:{count:1,hash:'immutable'}}});
  }
 }
 return{selection:{directory:'original-selected',project:'original-project'},snapshots,catalog:{packages:[old,candidate,cat,proc,sale]},trust,includeW3ProcurementCosts:true,includeW3SalesPricing:true};
}
let passed=0;const test=(name,run)=>{run();passed++;console.log('PASS '+name);};
test('default CLI cannot access private state or Docker from unrelated working directory',()=>{const result=execFileSync(process.execPath,[fileURLToPath(new URL('upgrade-phase15-pricing-patch.mjs',import.meta.url))],{cwd:tmpdir(),env:{PATH:''},encoding:'utf8'});assert.equal(JSON.parse(result).executed,false);});
test('explicit flag still requires root readiness before any private state access',()=>assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(new URL('upgrade-phase15-pricing-patch.mjs',import.meta.url)),'--execute-authorized'],{cwd:tmpdir(),env:{PATH:''},stdio:['ignore','pipe','pipe']}),e=>/readiness required/i.test(e.stderr)));
test('signed patch plan preserves original operation IDs and records new stable distinct IDs',()=>{const f=fixture(),before=canonical(f.snapshots),plan=preparePricingPatch(f);assert.equal(plan.workers.length,3);for(const w of plan.workers){assert.notEqual(w.newOperationId,w.oldOperationId);assert.equal(w.oldOperationId,f.snapshots[w.worker].installed[0].operationId);assert.equal(canonical(w.configuration),canonical(f.snapshots[w.worker].installed[0].configuration));}assert.equal(canonical(f.snapshots),before);assert.equal(plan.workers[2].bindings.length,3);const unchanged=plan.salesRebinding.workflow.steps.find(s=>s.operation==='stock.verified.reserve');assert.equal(unchanged.bindingId,'original-inventory-binding');});
test('pending original work blocks patch',()=>{for(const field of ['pendingPricingJobs','pendingPricingOutbox']){const f=fixture();f.snapshots['worker-1'][field]=1;assert.throws(()=>preparePricingPatch(f));}for(const field of ['pendingSalesIntents','pendingSalesOutbox','pendingSalesQuotes']){const f=fixture();f.snapshots['worker-3'][field]=1;assert.throws(()=>preparePricingPatch(f));}});
test('SQL ancestry, permission widening and provider substitution are refused',()=>{assert.throws(()=>preparePricingPatch(fixture(m=>m.persistence.migrations[0].sha256='f'.repeat(64))));assert.throws(()=>preparePricingPatch(fixture(m=>m.api[0].permission='unreviewed.permission')));const f=fixture();f.snapshots['worker-1'].bindings[0].provider_installation_id=randomUUID();assert.throws(()=>preparePricingPatch(f));});
test('scoped or expiring approvals cannot be widened into ordinary local routes',()=>{for(const field of ['source_program_id','destination_program_id','purpose','expires_at']){const f=fixture();f.snapshots['worker-1'].bindings[0][field]='original-reviewed-scope';assert.throws(()=>preparePricingPatch(f));}});
const before={installations:[{moduleId:ID,version:'1.3.0',operationId:'old',imageId:'old',state:'active',configuration:{currency:'USD'}},{moduleId:C,version:'1.4.0',operationId:'catalog-original',imageId:'catalog',state:'active',configuration:{}}],bindings:[{binding_id:'old-binding',provider_installation_id:'catalog-original',package_digest:'original-digest',state:'approved',reason:'original',revision:1}],workflows:[{workflow_id:'old-workflow',definition:{steps:[{bindingId:'old-binding',operation:'catalog.lookup'}]},state:'active',accepting_new:true}],obligations:{count:1,hash:'original'},routes:{count:1,hash:'original'},permissions:{count:1,hash:'original'},accounts:{count:1,hash:'original'},enrollment:{count:1,hash:'original'}};
function afterFixture(){const x=structuredClone(before);Object.assign(x.installations[0],{version:'1.3.1',operationId:'new',imageId:'new'});Object.assign(x.bindings[0],{state:'retained',reason:'Retained old obligations',revision:2});x.workflows[0].accepting_new=false;return x;}
const options={pricingInstallation:{operationId:'new',imageId:'new'},retainedBindingIds:['old-binding'],closedWorkflowIds:['old-workflow']};
test('only reviewed installation and new-work metadata changes are permitted',()=>assertRetainedPatchGovernance(before,afterFixture(),options));
test('original provider, workflow terms, obligations and permissions cannot be rewritten',()=>{for(const mutate of [x=>x.bindings[0].package_digest='new',x=>x.bindings[0].provider_installation_id='new',x=>x.workflows[0].definition.steps[0].operation='unreviewed',x=>x.obligations.hash='changed',x=>x.permissions.hash='changed',x=>x.installations[1].operationId='new-catalog',x=>x.installations[0].configuration.currency='EUR']){const after=afterFixture();mutate(after);assert.throws(()=>assertRetainedPatchGovernance(before,after,options));}});
const temporary=await fs.mkdtemp(path.join(tmpdir(),'steward-patch-dump-'));
try{
 const dump=path.join(temporary,'fixture.sql');
 for(const ending of ['-- PostgreSQL database cluster dump complete\n--\n','-- PostgreSQL database cluster dump complete\r\n--\r\n\\unrestrict fixtureToken\r\n']){await fs.writeFile(dump,'-- Explicit synthetic dump fixture; never restored\n'+ending);assert.equal((await assertCompleteClusterDump(dump)).clusterComplete,true);}
 passed++;console.log('PASS complete pg_dumpall fixtures accept LF, CRLF and unrestrict trailer');
 for(const content of ['', '-- PostgreSQL database dump complete\n', '-- PostgreSQL database cluster dump comple', '-- PostgreSQL database cluster dump complete\nSELECT unexpected_after_completion;\n']){await fs.writeFile(dump,content);await assert.rejects(assertCompleteClusterDump(dump));}
 passed++;console.log('PASS empty, database-only, truncated and appended dump fixtures fail before operational work');
}finally{assert.equal(path.dirname(temporary),path.resolve(tmpdir()));assert(path.basename(temporary).startsWith('steward-patch-dump-'));await fs.rm(temporary,{recursive:true,force:true});}
console.log(JSON.stringify({passed,operatorMutations:false}));
