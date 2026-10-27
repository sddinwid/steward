// Released declarations are retained independently of later package version numbers.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const fixture=JSON.parse(await readFile(new URL('./fixtures/phase14-module-contracts.json',import.meta.url),'utf8'));
const identities=JSON.parse(await readFile(new URL('./fixtures/phase14-package-identities.json',import.meta.url),'utf8'));
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function retained(actual,expected,path){
 if(Array.isArray(expected)){
  assert(Array.isArray(actual),path+' remains declared');
  for(const entry of expected){
   const key=entry&&typeof entry==='object'?['streamId','name','moduleId','operationId'].find(k=>Object.hasOwn(entry,k)):undefined;
   const found=key?actual.find(item=>item?.[key]===entry[key]):actual.find(item=>canonical(item)===canonical(entry));
   assert.notEqual(found,undefined,path+' retains '+(key?entry[key]:canonical(entry)));
   retained(found,entry,path+(key?'.'+entry[key]:''));
  }
 }else if(expected&&typeof expected==='object'){
  assert(actual&&typeof actual==='object',path+' remains declared');
  for(const[key,value]of Object.entries(expected))retained(actual[key],value,path+'.'+key);
 }else assert.deepEqual(actual,expected,path+' retains its released meaning');
}
function audit(manifest,baseline){
 assert.equal(manifest.moduleId,baseline.moduleId);
 assert.equal(manifest.sdkVersion,baseline.sdkVersion);
 retained(manifest.requiredPermissions,baseline.requiredPermissions,'requiredPermissions');
 if(baseline.replication)retained(manifest.replication,baseline.replication,'replication');
 for(const[key,value]of Object.entries(baseline.retainedMetadata))retained(manifest[key],value,key);
 for(const api of baseline.api){const current=manifest.api.find(a=>a.operationId===api.operationId);assert(current,'Released API '+api.operationId+' remains declared');assert.equal(hash(current),api.sha256,'Released API '+api.operationId+' remains unchanged');}
 for(const id of baseline.screenIds)assert(manifest.ui.some(screen=>screen.screenId===id),'Released screen '+id+' remains present');
 for(const key of['requiresActive','requiresHealthy'])if(baseline.smart[key]!==undefined)assert.equal(manifest.smart?.prerequisites[key],baseline.smart[key],key);
 for(const side of['provides','consumes'])for(const edge of baseline.smart[side]){
  const current=manifest.smart?.[side].find(c=>c.capabilityId===edge.capabilityId);
  assert(current,'Released '+side+' '+edge.capabilityId+' remains declared');
  const{configuration,...abi}=current;
  assert.equal(hash(abi),edge.abiSha256,'Released capability ABI '+edge.capabilityId+' remains unchanged');
  const global=manifest.smart.prerequisites.configuration;
  for(const[key,value]of Object.entries(global))if(Object.hasOwn(configuration??{},key))assert.equal(configuration[key],value,'Released gates '+edge.capabilityId+' must not become contradictory');
  assert.deepEqual({...global,...configuration},edge.configuration,'Released effective gates '+edge.capabilityId+' remain unchanged');
 }
}
test('legacy package contract fixture is anchored to the public Phase14 source identity, without current version pins',()=>{
 assert.equal(fixture.formatVersion,1);assert.equal(fixture.release,'0.14.0');
 assert.equal(fixture.sourceCommit,'811793c89d13c05557ad468551c5a79290961eda');
 assert.equal(fixture.sourceCommit,identities.sourceCommit);assert.equal(fixture.modules.length,9);
 for(const entry of fixture.modules){assert(identities.packages.some(p=>p.directory===entry.directory&&p.moduleId===entry.moduleId));assert(!Object.hasOwn(entry,'version'));}
});
for(const baseline of fixture.modules)test('Phase15 preserves released streams and contributions for '+baseline.moduleId,async()=>{
 const manifest=JSON.parse(await readFile(new URL('../'+baseline.directory+'/manifest.json',import.meta.url),'utf8'));
 audit(manifest,baseline);
});
test('legacy audit detects lost replication and changed integration declarations',async()=>{
 const baseline=fixture.modules.find(m=>m.moduleId==='cee.sales');
 assert.deepEqual(baseline.replication.streams.map(s=>s.streamId),['sales_demand','commerce_orders']);
 const manifest=JSON.parse(await readFile(new URL('../'+baseline.directory+'/manifest.json',import.meta.url),'utf8'));
 const missing=structuredClone(manifest);missing.replication.streams=missing.replication.streams.filter(s=>s.streamId!=='commerce_orders');
 assert.throws(()=>audit(missing,baseline),/replication.*commerce_orders/);
 const changed=structuredClone(manifest);changed.integration.inboxPath='/different-inbox';
 assert.throws(()=>audit(changed,baseline),/integration.inboxPath/);
});
