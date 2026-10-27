import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonical,validateCapabilityValue} from '@steward/module-sdk';
import {catalogOperations} from '../capabilities.js';
import {catalogPricingCapability,catalogPricingRequirement,catalogPricingLookupSchema,catalogPricingOperations} from '../catalog-pricing.js';
const offering={contractVersion:1,id:'00000000-0000-4000-8000-000000000001',ownerEntityId:'00000000-0000-4000-8000-000000000002',type:'service',name:'Service',code:'SERVICE',status:'active',revision:1,variants:[],capabilityReferences:[],externalReferences:[],variantsTruncated:false,referencesTruncated:false};
test('pricing subject eligibility has a separate capability and preserves the original closed Catalog lookup ABI',()=>{
 const old={contractVersion:1,offering};validateCapabilityValue(old,catalogOperations[0].output);
 const current={...old,promotionEligibility:true,promotionGroups:['seasonal']};validateCapabilityValue(current,catalogPricingLookupSchema);
 assert.throws(()=>validateCapabilityValue(current,catalogOperations[0].output));assert.throws(()=>validateCapabilityValue(old,catalogPricingLookupSchema));
 assert.throws(()=>validateCapabilityValue({...current,promotionEligibility:'yes'},catalogPricingLookupSchema));
});
test('pricing lookup cannot accept caller promotion authority or expose transaction or fulfillment authority',()=>{
 const input={contractVersion:1,offeringId:offering.id,variantId:null};validateCapabilityValue(input,catalogPricingOperations[0].input);
 for(const extra of [{promotionEligibility:true},{entityId:offering.ownerEntityId},{providerInstallationId:offering.id},{approved:true}])assert.throws(()=>validateCapabilityValue({...input,...extra},catalogPricingOperations[0].input));
 for(const extra of [{priceCents:1},{productionAuthorized:true},{approved:true}])assert.throws(()=>validateCapabilityValue({contractVersion:1,offering,promotionEligibility:false,promotionGroups:[],...extra},catalogPricingLookupSchema));
});
test('new Catalog pricing metadata travels only through bounded optional durable read contracts',()=>{
 const capability=catalogPricingCapability(),requirement=catalogPricingRequirement();assert.equal(requirement.optional,true);assert.equal(capability.scope,'entity');
 assert.equal(capability.operations[0]!.permission,'steward.catalog.universal.read');assert.equal(capability.operations[0]!.mode,'durable');assert.equal(capability.operations[0]!.retry,'safe');assert.equal(capability.operations[0]!.idempotency,'required');
 for(const op of requirement.operations){assert(Buffer.byteLength(canonical(op.input))<=16384);assert(Buffer.byteLength(canonical(op.output))<=16384);}
 assert.equal(catalogPricingRequirement(false).optional,false);
});
