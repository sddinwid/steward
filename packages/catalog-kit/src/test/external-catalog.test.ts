import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCapabilityValue} from '@steward/module-sdk';
import {externalCatalogCapability,externalCatalogRequirement,externalCatalogOperations,externalCatalogRecordId,externalCatalogFactsDigest,validateExternalCatalogConnection,validateExternalCatalogItem,type ExternalCatalogItem,type ExternalCatalogConnection} from '../external-catalog.js';
const observedAt='2026-10-27T00:00:00.000Z',expiresAt='2026-10-27T01:00:00.000Z';
const connection:ExternalCatalogConnection={contractVersion:1,provider:'shopify',connectionId:'fixture',label:'Named connection',mode:'live',accountId:'shop-id',originDigest:'a'.repeat(64),state:'ready',generation:1,observedAt,expiresAt,reason:null};
function item(update:Partial<ExternalCatalogItem>={}):ExternalCatalogItem {const base={contractVersion:1 as const,provider:'shopify' as const,connectionId:'fixture',accountId:'shop-id',originDigest:'a'.repeat(64),kind:'variant' as const,sourceRecordId:externalCatalogRecordId('shopify','fixture','product-id','variant-id'),sourceStreamId:'external_catalog_variants_v1',sourceRevision:1,generation:1,productId:'product-id',externalVariantId:'variant-id',name:null,sku:null,type:null,status:'unknown' as const,observedAt,expiresAt,...update};return{...base,factsDigest:externalCatalogFactsDigest(base)};}
test('provider observations preserve unknown type/name/SKU and long bounded native fields without local classification',()=>{
 validateExternalCatalogConnection(connection);validateExternalCatalogItem(item());validateExternalCatalogItem(item({name:'N'.repeat(500),sku:'S'.repeat(512)}));
 for(const update of [{name:''},{name:'N'.repeat(501)},{sku:'S'.repeat(513)},{type:'unclassified'},{costCents:100},{accessToken:'must never be public'}])assert.throws(()=>validateExternalCatalogItem({...item(),...update}));
 assert.equal(item().type,null);assert.equal(item().sku,null);
});
test('exact source identity binds stream, original remote IDs, profile and semantic projection revision',()=>{
 const original=item();assert.notEqual(original.sourceRecordId,externalCatalogRecordId('shopify','other','product-id','variant-id'));assert.notEqual(original.sourceRecordId,externalCatalogRecordId('printify','fixture','product-id','variant-id'));
 for(const update of [{sourceStreamId:'external_catalog_products_v1'},{kind:'product'},{externalVariantId:null},{sourceRevision:2},{sourceRecordId:externalCatalogRecordId('shopify','fixture','other-product','variant-id')},{generation:2}])assert.throws(()=>validateExternalCatalogItem({...original,...update}));
 assert.throws(()=>validateExternalCatalogItem({...original,name:'changed'}));
});
test('semantic digests exclude read freshness and revision but retain real changed provider facts',()=>{
 const a=item(),b=item({observedAt:'2026-10-27T00:10:00.000Z',expiresAt:'2026-10-27T01:10:00.000Z'});assert.equal(a.factsDigest,b.factsDigest);
 assert.equal(a.factsDigest,item({generation:2,sourceRevision:2}).factsDigest);assert.notEqual(a.factsDigest,item({name:'Observed name'}).factsDigest);assert.notEqual(a.factsDigest,item({status:'removed'}).factsDigest);
 assert.throws(()=>validateExternalCatalogItem(item({expiresAt:observedAt})));assert.throws(()=>validateExternalCatalogItem(item({expiresAt:'2026-10-29T00:00:00.000Z'})));
});
test('profile availability requires real origin/generation/lease proof; unavailable history remains representable',()=>{
 validateExternalCatalogConnection({...connection,state:'unverified',mode:null,accountId:null,originDigest:null,generation:null,observedAt:null,expiresAt:null,reason:'No successful verified catalog read'});
 validateExternalCatalogConnection({...connection,state:'unavailable',reason:'Provider unavailable; retained history is not fresh evidence'});
 for(const update of [{accountId:null},{originDigest:null},{generation:null},{observedAt:null},{expiresAt:null},{reason:'not ready'}])assert.throws(()=>validateExternalCatalogConnection({...connection,...update}));
});
test('new provider-specific contracts keep v1 untouched and reject oversized pages and fabricated result status',()=>{
 for(const provider of ['shopify','printify'] as const){const c=externalCatalogCapability(provider),r=externalCatalogRequirement(provider);assert.equal(c.capabilityId,r.capabilityId);assert.deepEqual(c.configuration,{catalogReadEnabled:true});assert(c.operations.every(o=>o.retry==='safe'&&o.permission==='cee.'+provider+'.read'));}
 assert.throws(()=>validateCapabilityValue({contractVersion:1,offset:0,limit:21},externalCatalogOperations[0].input));
 validateCapabilityValue({contractVersion:1,status:'found',connection,item:item(),reason:null},externalCatalogOperations[2].output);
 assert.throws(()=>validateCapabilityValue({contractVersion:1,status:'not_found',connection,item:item(),reason:null},externalCatalogOperations[2].output));
 assert.throws(()=>validateCapabilityValue({contractVersion:1,status:'unavailable',connection,items:[item()],nextOffset:null,reason:'Unavailable'},externalCatalogOperations[1].output));
});
