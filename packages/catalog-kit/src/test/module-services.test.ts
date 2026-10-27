import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCapabilityValue,type ModulePackageManifest} from '@steward/module-sdk';
import {moduleServiceOperations,moduleServiceReferenceResponse,moduleServiceDefinitionDigest,moduleServicesCapability,moduleServicesRequirement,validateModuleServiceDefinition,type ModuleServiceDefinition} from '../module-services.js';
const moduleId='cee.workforce',manifest={moduleId,smart:{provides:[{capabilityId:'workforce.pathways',contract:'steward.workforce-pathways',version:'1.0.0'}]}} as ModulePackageManifest;
const declarations=[{kind:'training' as const,capabilityId:'workforce.pathways',name:'Training interface'},{kind:'employment' as const,capabilityId:'workforce.pathways',name:'Employment interface'}];
const input={contractVersion:1,query:'',offset:0,limit:1},now=Date.parse('2026-10-27T00:00:00.000Z');
test('signed interface descriptors paginate without claiming programme, capacity or service authorization',()=>{
 const first=moduleServiceReferenceResponse(manifest,declarations,'module-services.discover',input,now) as {records:ModuleServiceDefinition[];nextOffset:number|null};
 assert.equal(first.records.length,1);assert.equal(first.nextOffset,1);
 const second=moduleServiceReferenceResponse(manifest,declarations,'module-services.discover',{...input,offset:1},now) as typeof first;assert.equal(second.nextOffset,null);assert.notEqual(first.records[0]!.recordId,second.records[0]!.recordId);
 for(const r of [...first.records,...second.records]){validateModuleServiceDefinition(r);assert.equal(r.availability,'unverified');assert.equal(r.programmeAuthorization,'required');for(const key of ['programId','participantAlias','capacity','availableSeats','placements','cost'])assert.equal(Object.hasOwn(r,key),false);}
});
test('module descriptor lookup is exact; no caller supplied identity or authority enters results',()=>{
 const response=moduleServiceReferenceResponse(manifest,declarations,'module-services.discover',{...input,limit:20},now) as {records:ModuleServiceDefinition[]};const r=response.records[0]!;
 assert.deepEqual(moduleServiceReferenceResponse(manifest,declarations,'module-services.lookup',{contractVersion:1,recordId:r.recordId},now),{contractVersion:1,status:'found',record:r});
 assert.deepEqual(moduleServiceReferenceResponse(manifest,declarations,'module-services.lookup',{contractVersion:1,recordId:'11111111-1111-4111-8111-111111111111'},now),{contractVersion:1,status:'not_found',record:null});
 for(const extra of [{programId:'private'},{provider:{}},{authorized:true}])assert.throws(()=>moduleServiceReferenceResponse(manifest,declarations,'module-services.discover',{...input,...extra},now));
});
test('descriptor identity stays stable while semantic interface changes invalidate its proof',()=>{
 const get=(m:ModulePackageManifest,t=now)=>(moduleServiceReferenceResponse(m,declarations,'module-services.discover',{...input,limit:20},t) as {records:ModuleServiceDefinition[]}).records[0]!;
 const original=get(manifest),later=get(manifest,now+1000);assert.equal(original.recordId,later.recordId);assert.equal(original.definitionDigest,later.definitionDigest);assert.notEqual(original.observedAt,later.observedAt);
 const changed=structuredClone(manifest);changed.smart!.provides[0]!.version='1.1.0';assert.notEqual(original.definitionDigest,get(changed).definitionDigest);
 assert.throws(()=>validateModuleServiceDefinition({...original,name:'changed'}));assert.throws(()=>validateModuleServiceDefinition({...original,availability:'available',definitionDigest:moduleServiceDefinitionDigest(original)}));
});
test('only declared known module interfaces are exposed, with bounded data and matching capability contracts',()=>{
 assert.throws(()=>moduleServiceReferenceResponse({...manifest,moduleId:'arbitrary.module'},declarations,'module-services.discover',input,now));
 assert.throws(()=>moduleServiceReferenceResponse(manifest,[{...declarations[0]!,capabilityId:'private.unknown'}],'module-services.discover',input,now));
 assert.throws(()=>moduleServiceReferenceResponse(manifest,[declarations[0]!,declarations[0]!],'module-services.discover',input,now));
 const c=moduleServicesCapability(moduleId),r=moduleServicesRequirement(moduleId);assert.equal(c.capabilityId,r.capabilityId);assert.equal(c.sensitivity,'business');assert.equal(r.maximumSensitivity,'business');
 for(const op of moduleServiceOperations){const result=moduleServiceReferenceResponse(manifest,declarations,op.name,op.name.endsWith('discover')?input:{contractVersion:1,recordId:'11111111-1111-4111-8111-111111111111'},now);validateCapabilityValue(result,op.output);}
});
