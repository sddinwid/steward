import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {scientificHeaders,ScientificClient} from '../scientific-client.js';
import {analyticalCapabilityCatalog} from '../analytical-capabilities.js';
import {procurementSchema,assertScientificScope,forecastProcurement} from '../scientific-schema.js';
import {operationalScienceDataset} from '../scientific.js';
import {randomUUID} from 'node:crypto';
test('scientific transport authentication binds method, route, timestamp, nonce and exact minimized body',()=>{
 const key=Buffer.from('x'.repeat(64)),body='{"schemaVersion":1}',nonce='1'.repeat(32),headers=scientificHeaders(key,'POST','/v1/execute',body,1234567890,nonce);
 assert.equal(headers['x-steward-signature'],createHmac('sha256',key).update('1234567890\n'+nonce+'\nPOST\n/v1/execute\n'+body).digest('hex'));
 assert.notEqual(scientificHeaders(key,'DELETE','/v1/jobs/id',body,1234567890,nonce)['x-steward-signature'],headers['x-steward-signature']);
 assert(!JSON.stringify(headers).includes('x'.repeat(64)));
});
test('optional unconfigured scientific transport fails explicitly; the existing capability remains registered',async()=>{
 await assert.rejects(new ScientificClient().analyze({},new AbortController().signal),/SCIENTIFIC_NOT_CONFIGURED/);
 assert.equal(analyticalCapabilityCatalog['steward.resource-sharing']?.engine,'typescript');
 assert.equal(analyticalCapabilityCatalog['steward.scientific.describe-series']?.resources.maximumConcurrency,2);
});

test('scientific source extraction is disclosed, stream-scoped and never invents empty interval demand',()=>{
 const entityId=randomUUID(),record_id=randomUUID();
 const row={entity_id:entityId,record_id,module_id:'cee.sales',stream_id:'commerce_orders',revision:2,payload:{projection:{approved:true,status:'fulfilled',orderCreatedAt:'2026-01-01T00:00:00Z',products:[{sku:'SKU',quantity:3}]}}};
 const result=operationalScienceDataset([row,{...row,record_id:randomUUID(),payload:{projection:{...row.payload.projection,orderCreatedAt:'2026-01-03T00:00:00Z'}}},{...row,stream_id:'private_users'}],[entityId],'units','day');
 assert.deepEqual(result.series[0]!.observations.map(r=>r.value),[3,3]);assert.equal(result.coverage,'unknown');assert.equal(result.references.length,2);assert.equal(result.references[0].streamId,'commerce_orders');
 assert.equal(operationalScienceDataset([row],[randomUUID()],'orders','day').series[0]!.observations.length,0);
 assert.throws(()=>assertScientificScope([entityId],[entityId,randomUUID()]),/scope denied/);
});

test('forecast-derived integer requirements reuse the existing exact purchasing baseline and reject partial estimates',()=>{
 const entities=[randomUUID(),randomUUID()],dataset={basis:'synthetic-analytical-history',entity_ids:entities,content:{purchasingTerms:{currency:'USD',product:'test',baselineUnitCents:700,baselineShippingCents:1500,transitionCents:200,suppliers:[{id:'supplier',products:['test'],capacity:1000,minimumUnits:1,shippingCents:1800,tiers:[{minimumUnits:0,unitCosts:{test:630}}]}]}}};
 const result={status:'completed',series:entities.map((entityId,i)=>({entityId,status:'completed',forecast:[{value:i?36.2:38.2}]}))};
 const p=forecastProcurement(dataset,result);assert.equal(p.baselineExternalCents,56200);assert.deepEqual(p.requirements.map(r=>r.quantity),[39,37]);assert(procurementSchema.safeParse(p).success);
 assert.throws(()=>forecastProcurement(dataset,{...result,status:'partial'}),/completed forecast/);
 assert.throws(()=>forecastProcurement({...dataset,basis:'authorized-synchronized-projection'},result),/Declare approved supplier/);
 assert(!procurementSchema.safeParse({...p,suppliers:[{...p.suppliers[0],currency:'EUR'}]}).success);
});
