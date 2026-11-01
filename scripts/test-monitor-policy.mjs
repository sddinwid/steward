import test from 'node:test';
import assert from 'node:assert/strict';
import {monitoringIssues,withMonitoringPolicy} from '../modules/shopify/dist/monitor-policy.js';
import {monitoringFinancials} from '../modules/shopify/dist/monitor-financials.js';
import {monitoringPage} from '../modules/shopify/dist/monitor-pages.js';
import {orderCostEvidence} from '../modules/printify/dist/order-costs.js';
const now=Date.parse('2026-11-01T12:00:00Z'),iso=n=>new Date(n).toISOString();
const policy={includePending:true,includeKnownTest:false,freshnessSeconds:300,graceSeconds:600,delaySeconds:3600};
const order={financialStatus:'paid',fulfillmentStatus:'UNFULFILLED',canceled:false};
const profile={ordersStatus:'synced',ordersSyncedAt:iso(now)};
const result=(items=[],extra={})=>({status:'matched',result:{status:'ok',connection:{observedAt:iso(now),expiresAt:iso(now+300000)},items,nextOffset:null,...extra}});
const codes=(o=order,m=result(),p=profile,seen=now-600000)=>monitoringIssues(o,m,p,policy,seen,now).map(i=>i.code);
test('missing observation requires complete fresh sources and local grace boundary',()=>{
 assert.deepEqual(codes(order,result(),profile,now-599999),[]);
 assert.deepEqual(codes(),['no_observed_match']);
 for(const status of ['unavailable','incomplete','stale'])assert.deepEqual(codes(order,result([],{status})),['source_unavailable']);
 assert.deepEqual(codes(order,result([],{nextOffset:20})),['comparison_incomplete']);
 assert.deepEqual(codes(order,result(),{...profile,ordersSyncedAt:iso(now-300001)}),['source_unavailable']);
 assert.deepEqual(codes(order,result(),{...profile,ordersSyncedAt:iso(now+1)}),['source_unavailable']);
});
test('pending payment, canceled, refunded and identifiable test orders cannot produce false missing alerts',()=>{
 for(const financialStatus of ['pending','authorized','partially_paid','refunded'])assert.deepEqual(codes({...order,financialStatus}),[]);
 assert.deepEqual(codes({...order,canceled:true}),[]);assert.deepEqual(codes({...order,test:true}),[]);
});
test('split orders preserve hold, failure and partial fulfillment review without manufactured tracking',()=>{
 assert.deepEqual(codes(order,result([{status:'fulfilled'},{status:'on-hold'}])),['production_hold']);
 assert.deepEqual(codes(order,result([{status:'failed'}])),['production_exception']);
 assert.deepEqual(codes({...order,fulfillmentStatus:'FULFILLED'},result([{status:'in-production'}])),['fulfillment_review']);
 assert.deepEqual(codes({...order,fulfillmentStatus:'PARTIALLY_FULFILLED'},result([{status:'fulfilled'},{status:'in-production'}])),[]);
 assert.deepEqual(codes(order,result([{status:'fulfilled',tracking:['tracking']}]),profile,now-7200000),[]);
 assert.deepEqual(codes(order,result([{status:'in-production'}]),profile,now-3600000),['production_delayed']);
});
test('pending comparisons and expired leases never establish missing orders',()=>{
 assert.deepEqual(codes(order,{status:'pending',requestedAt:iso(now)}),[]);
 assert.deepEqual(codes(order,{status:'pending',requestedAt:iso(now-300001)}),['comparison_timeout']);
 assert.deepEqual(codes(order,result([],{connection:{observedAt:iso(now),expiresAt:iso(now)}})),['source_unavailable']);
});
test('policy rejects unauthorized administrators before reading any records',async()=>{
 const def=withMonitoringPolicy({resources:[],actions:[]},()=>{throw Error('unexpected request');});
 await assert.rejects(def.resources[0].prepare({},null,{permissions:[]}),/administrator permission/);
});
test('financial evidence uses exact merchandise arithmetic without inventing costs, allocation or profit',()=>{
 const record={id:'source-record',revision:3,data:{sourceId:'store:order',remoteSourceId:'gid://shopify/Order/1',connectionId:'shop',sourceCreatedAt:iso(now),currency:'USD',financialStatus:'paid',refundCents:100,lines:[{remoteLineId:'line-1',quantity:2,unitPriceCents:1000,lineRevenueCents:1800}]}};
 const f=monitoringFinancials(record);assert.equal(f.grossMerchandiseCents,2000);assert.equal(f.discountCents,200);assert.equal(f.bookedMerchandiseCents,1800);assert.equal(f.totalSourceRefundCents,100);
 for(const k of ['recognizedRevenueCents','merchandiseRefundCents','productionCostCents','shippingCostCents','contributionMarginCents','transactionFeeCents','channelFeeCents','taxCents'])assert.equal(f[k],null);
 assert.equal(f.evidence.recordId,record.id);assert.equal(f.evidence.revision,3);
 assert.equal(monitoringFinancials({...record,data:{...record.data,lines:[...record.data.lines,...record.data.lines]}}).bookedMerchandiseCents,null);
 assert.equal(monitoringFinancials({...record,data:{...record.data,currency:'unknown'}}).bookedMerchandiseCents,null);
});
test('pagination retains bounded same-snapshot evidence and rejects reordering, duplicates and snapshot changes',()=>{
 const a={status:'ok',connection:{observedAt:iso(now)},items:[{remoteOrderId:'a'}],nextOffset:1};
 assert.equal(monitoringPage(undefined,a,0).status,'incomplete');
 const b={...a,items:[{remoteOrderId:'b'}],nextOffset:null};const final=monitoringPage(a,b,1);assert.equal(final.status,'matched');assert.equal(final.result.items.length,2);assert.equal(final.offset,0);
 assert.equal(monitoringPage(a,{...b,connection:{observedAt:iso(now+1)}},1).status,'stale');
 assert.equal(monitoringPage(a,{...b,items:a.items},1).status,'ambiguous');
 assert.equal(monitoringPage(a,{...b,nextOffset:1},1).status,'ambiguous');
});
test('Printify evidence never treats retail total_price as cost or invents quantity allocation/currency',()=>{
 assert.equal(orderCostEvidence({total_price:9999},null).productionCostCents,null);
 const o={currency:'USD',total_shipping:400,line_items:[{quantity:1,cost:1000,shipping_cost:400,status:'fulfilled'}]};
 assert.equal(orderCostEvidence(o,null).productionCostCents,1000);assert.equal(orderCostEvidence(o,null).basis,'provider-recorded');
 assert.equal(orderCostEvidence({...o,line_items:[{...o.line_items[0],quantity:2}]},null).productionCostCents,null);
 assert.equal(orderCostEvidence({...o,currency:undefined},null).productionCostCents,null);
 assert.equal(orderCostEvidence({...o,currency:undefined},'USD').currencyBasis,'administrator-confirmed');
 assert.equal(orderCostEvidence({...o,line_items:[{...o.line_items[0],status:'on-hold'}]},null).basis,'incomplete');
});
