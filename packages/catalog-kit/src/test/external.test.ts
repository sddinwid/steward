import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,validateCapabilityValue} from '@steward/module-sdk';
import {externalObservationSchema,extensionObservationSchema,sourceCapabilityRequirement,extensionCapabilityRequirement} from '../external.js';

const observation={contractVersion:1,sourceRecordId:'connection/product/variant',sourceStreamId:'provider-products',sourceRevision:2,externalProvider:'shopify',accountId:'original-store',productId:'gid://shopify/Product/123',externalVariantId:'gid://shopify/ProductVariant/456',name:'Observed product',code:'SOURCE-SKU',type:'physical',observedAt:'2026-10-27T12:00:00.000Z',supportedCapabilities:[]};
test('external observations preserve provider identity fields without importing financial or stock authority',()=>{
 validateCapabilityValue(observation,externalObservationSchema);
 for(const extra of [{priceCents:100},{stockBalance:1},{ownerEntityId:'other'},{provider:{moduleId:'forged'}},{approved:true}])assert.throws(()=>validateCapabilityValue({...observation,...extra},externalObservationSchema));
 assert.throws(()=>validateCapabilityValue({...observation,sourceRevision:0},externalObservationSchema));
 assert.throws(()=>validateCapabilityValue({...observation,externalVariantId:12},externalObservationSchema));
});
test('source and extension read contracts remain closed safe inputs without caller authority',()=>{
 for(const requirement of [sourceCapabilityRequirement,extensionCapabilityRequirement]){
  assert.equal(requirement.optional,true);assert.equal(requirement.maximumSensitivity,'business');
  for(const operation of requirement.operations){
   const input={contractVersion:1,sourceRecordId:'original-record',sourceStreamId:'declared-stream'};
   validateCapabilityValue(input,operation.input);
   for(const extra of [{providerInstallationId:'forged'},{entityId:'other'},{approved:true},{authorization:'secret'}])assert.throws(()=>validateCapabilityValue({...input,...extra},operation.input));
   assert(Buffer.byteLength(canonical(operation.input))<=16384);assert(Buffer.byteLength(canonical(operation.output))<=16384);
  }
 }
});
test('extension observations carry typed definition values and no executable or caller-pinned schema',()=>{
 const definition={contractVersion:1,sourceRecordId:'definition-1',sourceStreamId:'definitions',sourceRevision:1,observedAt:observation.observedAt,key:'material',attributes:[{contractVersion:1,key:'material',name:'Material',type:'text',required:true}]};
 validateCapabilityValue(definition,extensionObservationSchema);
 for(const extra of [{provider:{moduleId:'forged'}},{schema:{type:'object'}},{script:'execute'}])assert.throws(()=>validateCapabilityValue({...definition,...extra},extensionObservationSchema));
 assert.throws(()=>validateCapabilityValue({...definition,attributes:[{...definition.attributes[0],type:'json'}]},extensionObservationSchema));
});
