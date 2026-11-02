import test from 'node:test';
import assert from 'node:assert/strict';
import {withOrderMonitoring} from '../modules/shopify/dist/order-monitoring.js';
const definition=withOrderMonitoring({resources:[],actions:[],queries:[]});
test('monitoring reads use current state while retaining permission and pending guards',async()=>{
 const refresh=definition.actions.find(a=>a.path==='/refresh-order-match/:id');
 const costs=definition.actions.find(a=>a.path==='/read-order-item-costs/:id');
 assert.equal(refresh.concurrency,'current-state');assert.equal(costs.concurrency,'current-state');
 assert.equal(refresh.permission,'cee.shopify.configure');assert.equal(costs.permission,'cee.shopify.cost.read');
 const pin={moduleId:'cee.shopify'};
 const context={providerIdentity:pin,entityId:'entity',permissions:['cee.shopify.cost.read'],db:{query:async()=>({rows:[{id:'policy',data:{enabled:true,owner:pin,associationId:'association'}}]})}};
 const record={id:'record',kind:'order-match',key:'key',revision:99,data:{associationId:'association',owner:pin,status:'pending',requestedAt:new Date().toISOString(),costStatus:'pending',costRequestedAt:new Date().toISOString()}};
 await assert.rejects(refresh.run(record,context),/Read already pending/);
 await assert.rejects(costs.run(record,context),/Cost read pending/);
 await assert.rejects(costs.run(record,{...context,permissions:[]}),/permission required/);
 await assert.rejects(refresh.run(record,{...context,providerIdentity:{moduleId:'different'}}),/Historical comparison/);
});
