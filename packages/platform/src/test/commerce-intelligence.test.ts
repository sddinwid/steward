import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commerceIntelligence,orderProfitability,commerceExceptions,type CommerceFacts} from '@steward/commerce-kit';
const order=(extra:Partial<CommerceFacts>={}):CommerceFacts=>({sourceId:'synthetic-order-1',channel:'shopify',currency:'USD',orderCreatedAt:'2026-10-01T12:00:00.000Z',fulfilledAt:'2026-10-02T12:00:00.000Z',status:'fulfilled',productionStatus:'shipped',recognizedRevenueCents:9000,refundCents:500,productionCostCents:2000,shippingCostCents:500,costBasis:'estimated',products:[{sku:'TEE',quantity:3,unitPriceCents:3500,lineRevenueCents:9000,fulfilledQuantity:3,recognizedRevenueCents:9000}],...extra});
test('contribution uses exact integer discounts, refunds, production, shipping and both fees',()=>{
 const c=orderProfitability(order({financials:{productionCostCents:2000,shippingCostCents:500,transactionFeeCents:300,channelFeeCents:100,basis:'known',reference:'Synthetic supplier invoice and fee statement'}}));
 assert.equal(c.grossSalesCents,10500);assert.equal(c.discountCents,1500);assert.equal(c.netRecognizedRevenueCents,8500);assert.equal(c.contributionMarginCents,5600);assert.equal(c.contributionMarginBasisPoints,6588);assert.equal(c.marginBasis,'known');
});
test('missing fee evidence prevents contribution margin and estimates remain estimates',()=>{
 const c=orderProfitability(order());assert.equal(c.totalCostCents,null);assert.equal(c.recordedCostSubtotalCents,2500);assert.equal(c.contributionMarginCents,null);assert.deepEqual(c.missingCosts,['transactionFees','channelFees']);
 const e=orderProfitability(order({financials:{productionCostCents:2000,shippingCostCents:500,transactionFeeCents:300,channelFeeCents:100,basis:'estimated',reference:'Synthetic quotes'}}));assert.equal(e.contributionMarginCents,5600);assert.equal(e.marginBasis,'estimated');
});
test('currencies are isolated, repeated orders rejected and gross bounds checked',()=>{
 const groups=commerceIntelligence([order(),order({currency:'EUR',sourceId:'synthetic-2'})]);assert.deepEqual(groups.map(g=>g.currency),['EUR','USD']);assert.equal(groups[1]!.averageOrderValueCents,9000);
 assert.throws(()=>commerceIntelligence([order(),order()]));assert.throws(()=>orderProfitability(order({products:[{sku:'x',quantity:1,unitPriceCents:1,lineRevenueCents:2,fulfilledQuantity:1,recognizedRevenueCents:2}]})));
});
test('mixed SKU costs are never arbitrarily allocated and partial recognition prevents whole-order margin',()=>{
 const partial=order({products:[{sku:'TEE',quantity:3,unitPriceCents:3500,lineRevenueCents:9000,fulfilledQuantity:1,recognizedRevenueCents:3000}],recognizedRevenueCents:3000});assert.equal(orderProfitability(partial).contributionMarginCents,null);
 const mixed=order({products:[...order().products,{sku:'MUG',quantity:1,unitPriceCents:1000,lineRevenueCents:1000,fulfilledQuantity:1,recognizedRevenueCents:1000}]});assert.ok(commerceIntelligence([mixed])[0]!.products.every(p=>p.contributionMarginCents===null));
});
test('exception identities are stable across polling, canceled orders do not produce active conditions',()=>{
 const delayed=order({fulfilledAt:null,productionStatus:'uncertain'});const a=commerceExceptions(delayed,Date.parse('2026-10-20T12:00:00Z')),b=commerceExceptions(delayed,Date.parse('2026-10-21T12:00:00Z'));assert.deepEqual(a,b);assert.ok(a.some(i=>i.code==='production_uncertain'&&i.explanation.includes('do not resubmit')));assert.deepEqual(commerceExceptions({...delayed,status:'canceled'}),[]);
});
