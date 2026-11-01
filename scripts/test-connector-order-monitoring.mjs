import assert from 'node:assert/strict';
import {test} from 'node:test';
import {liveClient} from '../modules/shopify/dist/live.js';
const secret={connectionId:'fixture',shopDomain:'fixture.myshopify.com',baseUrl:'https://fixture.myshopify.com',auth:{grantType:'client_credentials'}};
function fixture(options={}){
 const calls=[],money={shopMoney:{amount:'12.34',currencyCode:'USD'}};
 const order={id:'gid://shopify/Order/1',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',currencyCode:'USD',displayFinancialStatus:'PAID',displayFulfillmentStatus:'UNFULFILLED',cancelledAt:null,totalRefundedSet:{shopMoney:{amount:'0.00',currencyCode:'USD'}},lineItems:{nodes:[{id:'gid://shopify/LineItem/1',sku:'TEST',quantity:1,variant:{id:'gid://shopify/ProductVariant/1'},originalUnitPriceSet:money,discountedTotalSet:money}],pageInfo:{hasNextPage:!!options.partial}}};
 const transport=async(url,b)=>{calls.push(b);assert(!b.query.includes('mutation'));if(b.query.includes('StewardLiveShop'))return {data:{shop:{id:'gid://shopify/Shop/1',myshopifyDomain:secret.shopDomain,plan:{partnerDevelopment:true}},currentAppInstallation:{accessScopes:[{handle:'read_products'},...(options.denied?[]:[{handle:'read_orders'}])]}}};return {data:{orders:{nodes:b.variables.after?[]:[order],pageInfo:{hasNextPage:options.loop||!b.variables.after,endCursor:'next'}}}};};
 return {calls,client:liveClient(transport,{get:async()=>({accessToken:'fixture',expiresAt:Date.now()+60000})})};
}
test('read-only order pagination retains identity and exact money without dispatch authority',async()=>{const f=fixture(),r=await f.client.orders(secret);assert.equal(r.orders.length,1);assert.equal(r.orders[0].lines[0].lineRevenueCents,1234);assert.equal(r.orders[0].dispatchEnabled,false);assert.equal(r.orders[0].remoteSourceId,'gid://shopify/Order/1');assert.equal(f.calls.filter(c=>c.query.includes('StewardLiveOrders')).length,2);assert(!JSON.stringify(r.orders).includes('accessToken'));});
test('order permission is checked before fetching orders',async()=>{const f=fixture({denied:true});await assert.rejects(f.client.orders(secret),/SHOPIFY_READ_ORDERS_SCOPE_REQUIRED/);assert.equal(f.calls.length,1);});
test('incomplete line items reject the entire observation batch',async()=>{await assert.rejects(fixture({partial:true}).client.orders(secret),/SHOPIFY_ORDER_LINES_INCOMPLETE/);});
test('repeated cursors reject the entire observation batch',async()=>{await assert.rejects(fixture({loop:true}).client.orders(secret),/SHOPIFY_ORDER_CURSOR_INVALID/);});
import {orderMatchState,orderReadOperations} from '../packages/commerce-kit/dist/index.js';
import {validateCapabilityValue} from '../packages/module-sdk/dist/index.js';
test('matching differentiates incomplete, stale, unavailable and successful empty results',()=>{assert.equal(orderMatchState('ok',[],null),'no_observed_match');assert.equal(orderMatchState('ok',[{}],null),'matched');assert.equal(orderMatchState('ok',[{}],20),'incomplete');for(const state of ['stale','unavailable','incomplete'])assert.equal(orderMatchState(state,[],null),state);});
test('closed observation contract rejects arbitrary filters and unbounded queries',()=>{const op=orderReadOperations[0];assert.throws(()=>validateCapabilityValue({contractVersion:1,offset:0,limit:100},op.input));assert.throws(()=>validateCapabilityValue({contractVersion:1,offset:0,limit:20,sql:'untrusted'},op.input));});
