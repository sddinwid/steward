import {commerceDemandTrends} from '../commerce-analysis.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {calculateCommerce,commercePage,commerceAnomalies,commerceQuerySchema} from '../commerce-analysis.js';
import {dataEvent,validateEvent} from '../synchronization.js';
import {parseConfig} from '../config.js';
const projection=(extra={})=>({approved:true as const,contractVersion:1 as const,channel:'shopify',sourceId:'gid://shopify/Order/1',sourceUpdatedAt:'2026-10-20T12:00:00.000Z',orderCreatedAt:'2026-10-20T12:00:00.000Z',fulfilledAt:'2026-10-21T12:00:00.000Z',status:'fulfilled',productionStatus:'shipped',currency:'EUR',units:'items' as const,quantity:2,recognizedRevenueCents:5000,refundCents:200,productionCostCents:1000,shippingCostCents:300,costBasis:'estimated',products:[{sku:'SYN-TEE',sourceVariantId:'gid://shopify/ProductVariant/1',quantity:2,unitPriceCents:2500,lineRevenueCents:5000,fulfilledQuantity:2,recognizedRevenueCents:5000}],revenueBasis:'Completed discounted merchandise, excludes tax/shipping',refundBasis:'Source total refunds, unallocated',costSource:'Catalog and shipping quote',stockout:false,...extra});
const row=(p=projection(),entityId=randomUUID())=>({record_id:randomUUID(),entity_id:entityId,module_id:'cee.sales',stream_id:'commerce_orders',revision:2,installation_id:randomUUID(),source_at:'2026-10-21T12:00:00.000Z',ingested_at:'2026-10-21T12:00:01.000Z',payload:{projection:p}});
test('commerce calculations use exact cents, explicit estimates, product/channel quantities and unknown cost coverage',()=>{
 const c=calculateCommerce([projection()]);assert.equal(c.netRevenueCents,4800);assert.equal(c.totalCostCents,1300);assert.equal(c.grossMarginCents,3500);assert.equal(c.displayAmounts.grossMargin,'EUR 35.00');assert.equal(c.grossMarginBasisPoints,7291);assert.equal(c.costBasis,'estimated');assert.equal(c.products[0]!.fulfilledQuantity,2);assert.equal(c.products[0]!.grossMarginCents,3500);assert.equal(c.fulfillmentTimeSeconds.average,86400);
 const unknown=calculateCommerce([projection({productionCostCents:null,costBasis:'incomplete'})]);assert.equal(unknown.grossMarginCents,null);assert.equal(unknown.estimatedCOGSCents,null);assert.equal(unknown.displayAmounts.grossMargin,'UNKNOWN');assert.deepEqual(unknown.costCoverage,{completeOrders:0,totalOrders:1});
 assert.throws(()=>calculateCommerce([projection(),projection({currency:'USD'})]));assert.throws(()=>calculateCommerce([projection({recognizedRevenueCents:1,refundCents:0,productionCostCents:100000000000000})]));
});
test('commerce evidence is approved, period-bounded, attributed and paginated with strict query fields',()=>{
 const a=row(),b=row(projection({approved:false as any})),c=row(projection({orderCreatedAt:'2026-10-22T12:00:00.000Z'}));
 const page=commercePage([a,b,c],{entityId:a.entity_id,from:'2026-10-20T00:00:00.000Z',to:'2026-10-22T00:00:00.000Z',limit:1});assert.equal(page.total,1);assert.equal(page.records[0]!.reference.recordId,a.record_id);assert.equal(page.records[0]!.sourceWorker,a.installation_id);assert.equal(page.records[0]!.costBasis,'estimated');assert.equal(page.nextOffset,null);assert.equal(commercePage([a],{sku:'OTHER-SKU'}).total,0);assert.equal(commercePage([a],{sku:'SYN-TEE'}).total,1);
 assert.throws(()=>commerceQuerySchema.parse({apiKey:'never allowed'}));assert.throws(()=>commercePage([a],{from:'2026-10-22T00:00:00.000Z',to:'2026-10-20T00:00:00.000Z'}));
});
test('deterministic anomaly screening distinguishes high estimated costs, delays and observed stockouts',()=>{
 const costly=row(projection({productionCostCents:4000})),delayed=row(projection({status:'confirmed',fulfilledAt:null as any,orderCreatedAt:new Date(Date.now()-72*3600000).toISOString(),stockout:true}));const result=commerceAnomalies([costly,delayed],{});assert.equal(result.total,2);assert.ok(result.matches.some(r=>r.issues.includes('high_estimated_cost')));assert.ok(result.matches.some(r=>r.issues.includes('delayed')&&r.issues.includes('stockout')));
});
test('commerce synchronization rejects unexpected private fields before persistence, including nested product data',()=>{
 const identity=parseConfig({configVersion:1,role:'worker',installationId:randomUUID(),entity:{entityId:randomUUID(),displayName:'Synthetic privacy fixture'}},'worker'),id=randomUUID();
 const event={...dataEvent(identity,randomUUID(),'record.upsert',id,2,{id,revision:2,projection:projection()}),moduleId:'cee.sales',streamId:'commerce_orders'};validateEvent(event);
 for(const privateProjection of [{...projection(),customerEmail:'synthetic@example.invalid'},{...projection(),products:[{...projection().products[0],address:'Synthetic private field'}]}])assert.throws(()=>validateEvent({...event,payload:{...event.payload,projection:privateProjection}}));
 assert.throws(()=>validateEvent({...event,payload:{...event.payload,privateKey:'forbidden'}}));
});

test('declining margin compares chronological same-entity/product/currency evidence, never cross-entity differences',()=>{
 const entity=randomUUID(),first=row(projection({orderCreatedAt:'2026-10-19T12:00:00.000Z',productionCostCents:1000}),entity),second=row(projection({productionCostCents:2000}),entity);
 const result=commerceAnomalies([first,second],{});assert.equal(result.matches[0]!.issues.includes('declining_estimated_margin'),true);assert.equal(result.matches[0]!.supportingReferences.length,2);assert.equal(result.matches[0]!.marginComparison!.declineBasisPoints,2083);
 assert.equal(commerceAnomalies([first,{...second,entity_id:randomUUID()}],{}).matches.some(v=>v.issues.includes('declining_estimated_margin')),false);
});

test('commerce demand windows keep cohort refunds/cancellations separate and supplier comparisons conditional',()=>{
 const a=row(projection({currency:'USD',sourceId:'one'})),b=row(projection({currency:'USD',sourceId:'two',productionCostCents:2000,status:'canceled'}));
 const result=commerceDemandTrends([a,b],{from:'2026-10-01T00:00:00Z',split:'2026-10-20T00:00:00Z',to:'2026-11-01T00:00:00Z'});assert.equal(result.records.length,2);assert.equal(result.records[0]!.beforeQuantity,0);assert.equal(result.records[0]!.changeBasisPoints,null);assert.equal(result.orderCohorts.records.reduce((n,g)=>n+g.after.refundCents,0),400);assert.equal(result.orderCohorts.records.reduce((n,g)=>n+g.after.canceledOrders,0),1);assert.equal(Math.abs(result.supplierCostComparisons[0]!.differenceCentsPerOrderedUnit.exactCents!),500);assert.match(result.supplierCostComparisons[0]!.opportunity,/not procurement savings/);
 assert.equal(commerceDemandTrends([a,{...b,entity_id:a.entity_id}],{from:'2026-10-01T00:00:00Z',split:'2026-10-20T00:00:00Z',to:'2026-11-01T00:00:00Z'}).supplierCostComparisons.length,0);
 assert.throws(()=>commerceDemandTrends([a],{from:'2026-10-21T00:00:00Z',split:'2026-10-20T00:00:00Z',to:'2026-11-01T00:00:00Z'}));
});

test('model-facing contribution totals are exact formatted service amounts and remain unknown without fees',()=>{
 const known=projection({currency:'USD',financials:{productionCostCents:1000,shippingCostCents:300,transactionFeeCents:100,channelFeeCents:50,basis:'estimated',reference:'Synthetic fee schedule'}});
 const c=calculateCommerce([known]);assert.equal(c.contributionSummary.contributionMarginCents,3350);assert.equal(c.contributionSummary.displayAmounts.contributionMargin,'USD 33.50');assert.equal(c.contributionAnalysis[0]!.displayAmounts.transactionFees,'USD 1.00');assert.equal(c.contributionSummary.marginBasis,'estimated');assert.equal(calculateCommerce([projection()]).contributionSummary.displayAmounts.contributionMargin,'UNKNOWN');
});
