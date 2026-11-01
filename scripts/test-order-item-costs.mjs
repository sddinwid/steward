import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {orderItemCosts,orderCostEvidence} from '../modules/printify/dist/order-costs.js';
import {itemCostView} from '../modules/shopify/dist/order-item-costs.js';
import {withOrderObservations} from '../modules/printify/dist/order-observations.js';
import {validateManifest,validateCapabilityValue} from '../packages/module-sdk/dist/index.js';
import {orderItemCostOperation} from '../packages/commerce-kit/dist/index.js';
const line={product_id:'product',variant_id:1,quantity:1,cost:1050,shipping_cost:400,status:'on-hold',metadata:{external_id:'gid://shopify/LineItem/7'}};
test('item observations preserve reported zero and absent amounts without retail substitution',()=>{
 const [a,b]=orderItemCosts({line_items:[{...line,product_id:'a',cost:0},{...line,product_id:'b',cost:undefined,total_price:99999}]},'USD').sort((a,b)=>a.productId.localeCompare(b.productId));
 assert.equal(a.productionCostCents,0);assert.equal(a.rawProductionCost,'0');assert.equal(b.productionCostCents,null);assert.equal(b.rawProductionCost,null);assert.equal(a.basis,'provisional');
});
test('multi-quantity amounts remain reported values with unresolved allocation',()=>{const o={line_items:[{...line,quantity:3}]};const [i]=orderItemCosts(o,'USD');assert.equal(i.productionCostCents,1050);assert.equal(i.allocation,'unknown');assert.equal(orderCostEvidence(o,'USD').productionCostCents,null);});
test('invalid, fractional and oversized monetary values cannot become usable costs',()=>{for(const cost of [-1,1.2,Number.MAX_SAFE_INTEGER+1,'100',null]){const [i]=orderItemCosts({line_items:[{...line,cost}]},'USD');assert.equal(i.productionCostCents,null);assert.equal(i.basis,'unknown');}});
test('currency conflict and malformed currency do not silently use configuration',()=>{for(const currency of ['EUR','invalid'])assert.equal(orderItemCosts({currency,line_items:[line]},'USD')[0].currency,null);assert.equal(orderItemCosts({line_items:[line]},undefined)[0].currency,null);assert.equal(orderItemCosts({line_items:[line]},'USD')[0].currencyBasis,'administrator-confirmed');});
test('fulfilled cost evidence is provider-recorded but never declared settled',()=>{const [i]=orderItemCosts({currency:'USD',line_items:[{...line,status:'fulfilled',fulfilled_at:'2026-11-01T12:00:00Z'}]},'USD');assert.equal(i.basis,'provider-recorded');assert.equal(i.fulfilledAt,'2026-11-01T12:00:00Z');assert(!('settled' in i));});
test('reordered lines preserve identities and duplicates remain ambiguous without double counting',()=>{const b={...line,variant_id:2,metadata:{external_id:'other'}};assert.deepEqual(orderItemCosts({line_items:[line,b]},'USD'),orderItemCosts({line_items:[b,line]},'USD'));const o={line_items:[line,line]};assert(orderItemCosts(o,'USD').every(i=>i.identityStatus==='ambiguous'));assert.equal(orderCostEvidence(o,'USD').productionCostCents,null);});
test('safe unit-line totals agree with item observations',()=>{const o={total_shipping:800,line_items:[line,{...line,variant_id:2,metadata:{external_id:'other'},cost:2000}]};assert.equal(orderCostEvidence(o,'USD').productionCostCents,3050);assert.equal(orderCostEvidence(o,'USD').shippingCostCents,800);});
test('line matching never uses positions, titles or coincident prices; split/reprint ambiguity is retained',()=>{
 const item=orderItemCosts({line_items:[line]},'USD')[0],v={remoteOrderId:'remote',item,isReprint:false};
 const view=items=>itemCostView({data:{costStatus:'complete',costResult:{items}}},{data:{lines:[{remoteLineId:'gid://shopify/LineItem/7'}]}});
 assert.equal(view([v]).items[0].shopifyLineMatch,'exact_external_reference');assert.equal(view([{...v,item:{...item,externalLineId:'7'}}]).items[0].shopifyLineMatch,'unmatched');
 assert(view([v,{...v,remoteOrderId:'split'}]).items.every(i=>i.shopifyLineMatch==='ambiguous'));
 assert.notEqual(view([{...v,isReprint:true}]).items[0].shopifyLineMatch,'exact_external_reference');
});
test('new capability is bounded and original matching declarations remain unchanged',()=>{
 assert.throws(()=>validateCapabilityValue({contractVersion:1,connectionId:'a',accountId:'b',originDigest:'a'.repeat(64),shopOrderId:'7',offset:0,limit:21},orderItemCostOperation.input));
 for(const name of ['shopify','printify']){const m=JSON.parse(fs.readFileSync('modules/'+name+'/manifest.json'));validateManifest(m);const old=JSON.parse(execFileSync('git',['show','261b85a:modules/'+name+'/manifest.json'],{encoding:'utf8'}));const key=name==='shopify'?'consumes':'provides';assert.deepEqual(m.smart[key].find(x=>x.capabilityId==='commerce.printify.orders.read'),old.smart[key].find(x=>x.capabilityId==='commerce.printify.orders.read'));}
});
test('item bounds fail closed and external references exclude non-identifier personal strings',()=>{assert.throws(()=>orderItemCosts({line_items:Array(1001).fill(line)},'USD'),/bound/);assert.equal(orderItemCosts({line_items:[{...line,metadata:{external_id:'customer@example.com'}}]},'USD')[0].externalLineId,null);});
test('native fulfillment view requires cost permission and includes source provenance',async()=>{
 const def=withOrderObservations({queries:[{path:'/external-orders',run:async()=>({records:[{id:'record',revision:2,itemCostsObservedAt:'2026-11-01T00:00:00Z',itemCostEvidence:[{productionCostCents:100}]}]})}]});
 const denied=await def.queries[0].run({permissions:[]});assert(!('itemCostEvidence' in denied.records[0]));
 const allowed=await def.queries[0].run({permissions:['cee.printify.cost.read']});assert.equal(allowed.records[0].itemCostEvidence.sourceRevision,2);assert.equal(allowed.records[0].itemCostEvidence.observedAt,'2026-11-01T00:00:00Z');
});
test('order shipping includes unallocated adjustments without changing or double counting item evidence',()=>{
 const o={total_shipping:769,total_tax:0,line_items:[{...line,cost:640,shipping_cost:729}]};
 const e=orderCostEvidence(o,'USD');assert.equal(e.shippingCostCents,769);assert.equal(e.itemShippingCostCents,729);assert.equal(e.shippingAdjustmentCents,40);assert.equal(e.productionCostCents+e.shippingCostCents,1409);assert.equal(orderItemCosts(o,'USD')[0].shippingCostCents,729);
 const multi=orderCostEvidence({total_shipping:840,line_items:[line,{...line,variant_id:2}]},'USD');assert.equal(multi.itemShippingCostCents,800);assert.equal(multi.shippingCostCents,840);assert.equal(multi.shippingAdjustmentCents,40);
});
test('missing or invalid order totals stay unknown even when item shipping exists',()=>{
 for(const total_shipping of [undefined,null,-1,1.5,'769',Number.MAX_SAFE_INTEGER+1]){const e=orderCostEvidence({total_shipping,line_items:[line]},'USD');assert.equal(e.shippingCostCents,null);assert.equal(e.shippingAdjustmentCents,null);assert.equal(e.itemShippingCostCents,400);assert.equal(e.basis,'incomplete');}
 const zero=orderCostEvidence({total_shipping:0,line_items:[line]},'USD');assert.equal(zero.shippingCostCents,0);assert.equal(zero.shippingAdjustmentCents,-400);
});
test('order totals do not invent missing item allocation or currency',()=>{
 const o={total_shipping:769,line_items:[{...line,quantity:2}]};const e=orderCostEvidence(o,'USD');assert.equal(e.shippingCostCents,769);assert.equal(e.itemShippingCostCents,null);assert.equal(e.shippingAdjustmentCents,null);assert.equal(e.productionCostCents,null);
 assert.equal(orderCostEvidence(o,undefined).shippingCostCents,null);assert.equal(orderCostEvidence({...o,currency:'EUR'},'USD').shippingCostCents,null);
});
