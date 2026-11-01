import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {transaction,save,find} from '../packages/business-kit/dist/index.js';import {context,orderReadCapabilityId} from '../packages/commerce-kit/dist/index.js';import {withOrderMonitoring,combinedOrders} from '../modules/shopify/dist/order-monitoring.js';import {orderObservationsReceive} from '../modules/printify/dist/order-observations.js';
import {orderItemCostsReceive} from '../modules/printify/dist/order-observations.js';
import {orderItemCosts} from '../modules/printify/dist/order-costs.js';
export async function verifyOrderMonitoring({test,worker}){
 const shop=worker('cee.shopify'),print=worker('cee.printify'),entityId=randomUUID(),pin=id=>({workerInstallationId:shop.runtime.installationId,entityId,moduleId:id,moduleInstallationId:randomUUID(),packageDigest:'a'.repeat(64)}),own=pin('cee.shopify'),provider=pin('cee.printify');
 const ctx=(db,w,p)=>({...context(db,w.runtime),entityId,providerIdentity:p,actor:'synthetic-admin',permissions:['cee.shopify.configure']});const def=withOrderMonitoring({resources:[],actions:[],queries:[]});
 const local=fn=>transaction(shop.pool,db=>fn(ctx(db,shop,own))),remote=(command,overrides={})=>transaction(print.pool,db=>orderObservationsReceive(command,{...ctx(db,print,provider),incomingProviderIdentity:own,...overrides}));
 const create=async(kind,b)=>local(async c=>{const resource=def.resources.find(r=>r.kind===kind),data=await resource.prepare(b,null,c),r=await save(c,kind,b.key,data);await resource.after?.(r,null,c);return r;});
 const command=async id=>(await shop.pool.query("SELECT envelope FROM integration_outbox WHERE envelope->>'aggregateId'=$1 ORDER BY (envelope->>'sequence')::int DESC LIMIT 1",[id])).rows[0].envelope;
 const reply=async cmd=>{const body=await remote(cmd);return{...body,_steward:{providerModuleId:provider.moduleId,providerInstallationId:provider.moduleInstallationId,packageDigest:provider.packageDigest}};};
 const ack=(cmd,result)=>local(c=>def.acknowledge(cmd,'delivered',result,c));
 let association,order,match,cmd,result;
 await test('monitoring provider rejects absent sender and foreign entity authority',async()=>{const c={command:'order-observations.connections',sourceModuleId:'cee.shopify',capability:{capabilityId:orderReadCapabilityId},payload:{contractVersion:1,offset:0,limit:20}};await assert.rejects(remote(c,{incomingProviderIdentity:undefined}));await assert.rejects(remote(c,{entityId:randomUUID()}));});
 await test('monitoring discovers scoped simulator stores and creates immutable association',async()=>{
  await transaction(print.pool,async db=>{const c=ctx(db,print,provider);await save(c,'connector-identity','monitor-store',{mode:'simulator',shopId:'monitor-account'});await db.query("INSERT INTO printify_order_sync VALUES('monitor-store','ready',now(),'[]')");});
  const r=await create('order-discovery',{key:randomUUID(),offset:0}),d=await command(r.id);await ack(d,await reply(d));
  await local(async c=>{await save(c,'connector-identity','monitor-shop',{mode:'simulator',shopId:'shop'});await save(c,'live-connection','monitor-shop',{ordersStatus:'synced',ordersSyncedAt:new Date().toISOString()});});
  const profile=(await shop.pool.query("SELECT id FROM business_records WHERE kind='order-provider-profile' AND data->'connection'->>'connectionId'='monitor-store'")).rows[0];association=await create('order-association',{key:randomUUID(),shopifyConnectionId:'monitor-shop',profileId:profile.id});
  await assert.rejects(local(c=>def.resources.find(r=>r.kind==='order-association').prepare({},association,c)));
  order=await local(c=>save(c,'order','monitor-order',{connectionId:'monitor-shop',remoteSourceId:'gid://shopify/Order/777',orderName:'#TEST',financialStatus:'pending',fulfillmentStatus:'UNFULFILLED'}));
 });
 await test('monitoring fresh empty lookup is distinct from an unavailable source',async()=>{match=await create('order-match',{key:randomUUID(),associationId:association.id,orderId:order.id,offset:0});cmd=await command(match.id);result=await reply(cmd);await ack(cmd,result);const rows=await local(c=>combinedOrders(c));assert.equal(rows.records.find(r=>r.id===match.id).status,'no_observed_match');});
 await test('monitoring preserves split order matches and source revisions without production',async()=>{
  await transaction(print.pool,async db=>{for(let n=0;n<2;n++)await save(ctx(db,print,provider),'external-order','monitor-'+n,{connectionId:'monitor-store',remoteSourceId:'remote-'+n,shopOrderId:'777',status:'on-hold',tracking:[],currency:null});await db.query("UPDATE printify_order_sync SET order_ids='[\"remote-0\",\"remote-1\"]' WHERE connection_id='monitor-store'");});
  await local(async c=>{const r=await find(c,'order-match',match.key);await def.actions[0].run(r,c);});cmd=await command(match.id);result=await reply(cmd);assert.equal(result.items.length,2);await ack(cmd,result);await ack(cmd,result);assert.equal((await local(c=>combinedOrders(c))).records.find(r=>r.id===match.id).status,'matched');
 });
 await test('monitoring rejects conflicting duplicates, wrong provider pins and wrong stores',async()=>{await assert.rejects(ack(cmd,{...result,status:'unavailable'}));await local(async c=>def.actions[0].run(await find(c,'order-match',match.key),c));cmd=await command(match.id);result=await reply(cmd);await assert.rejects(ack(cmd,{...result,_steward:{...result._steward,packageDigest:'b'.repeat(64)}}));await assert.rejects(remote({...cmd,payload:{...cmd.payload,accountId:'different'}}));await ack(cmd,result);});
 await test('monitoring pagination does not report truncated results as complete',async()=>{const r=await remote({...cmd,payload:{...cmd.payload,limit:1}});assert.equal(r.items.length,1);assert.equal(r.nextOffset,1);await assert.rejects(remote({...cmd,payload:{...cmd.payload,limit:21}}));});
 await test('monitoring outage and expired observations never imply missing orders',async()=>{await print.pool.query("UPDATE printify_order_sync SET status='unavailable' WHERE connection_id='monitor-store'");let r=await remote(cmd);assert.equal(r.status,'unavailable');assert.equal(r.items.length,0);await print.pool.query("UPDATE printify_order_sync SET status='ready',observed_at=now()-interval '10 minutes' WHERE connection_id='monitor-store'");r=await remote(cmd);assert.equal(r.status,'stale');await print.pool.query("UPDATE printify_order_sync SET observed_at=now() WHERE connection_id='monitor-store'");r=await remote(cmd);assert.equal(r.items.length,2);});
 await test('monitoring outbox contains only governed observation requests',async()=>{const rows=(await shop.pool.query("SELECT envelope FROM integration_outbox WHERE envelope->>'aggregateId'=$1",[match.id])).rows;assert(rows.length>0);assert(rows.every(r=>r.envelope.command==='order-observations.lookup'&&r.envelope.capability.providerConstraint.packageDigest===provider.packageDigest));});
 let policy,automatic,condition;
 await test('approved monitoring policy discovers orders and deduplicates durable requests',async()=>{
  policy=await create('monitor-policy',{key:randomUUID(),associationId:association.id,enabled:true,intervalSeconds:60,batchSize:20,graceSeconds:600,freshnessSeconds:300,delaySeconds:3600,includePending:true,includeKnownTest:false});
  await local(c=>def.tick(c));
  automatic=(await shop.pool.query("SELECT * FROM business_records WHERE kind='order-match' AND data->>'policyId'=$1",[policy.id])).rows[0];assert(automatic);const first=await command(automatic.id);
  await local(c=>def.tick(c));assert.equal((await command(automatic.id)).commandId,first.commandId);
  await ack(first,await reply(first));
 });
 await test('automatic conditions deduplicate, acknowledge and survive repeated ticks',async()=>{
  await local(async c=>{const p=await find(c,'monitor-policy',policy.key);await save(c,p.kind,p.key,{...p.data,nextRunAt:null},p);await def.tick(c);});
  condition=(await shop.pool.query("SELECT * FROM business_records WHERE kind='commerce-condition' AND data->>'sourceId'=$1 AND data->>'code'='production_hold'",[automatic.id])).rows[0];assert(condition);assert.equal(condition.data.episode,1);assert.equal(condition.data.approved,false);
  await local(c=>def.actions.find(a=>a.path==='/acknowledge-monitor-condition/:id').run(condition,c));
  await local(c=>def.tick(c));const unchanged=await local(c=>find(c,condition.kind,condition.key));assert.equal(unchanged.data.episode,1);assert(unchanged.data.acknowledgedAt);
 });
 await test('policy configuration rejects association substitution and duplicate policies',async()=>{
  await assert.rejects(create('monitor-policy',{...policy.data,key:randomUUID()}),/already has/);
  await assert.rejects(local(c=>def.resources.find(r=>r.kind==='monitor-policy').prepare({...policy.data,associationId:randomUUID()},policy,c)));
 });
 await test('monitoring recovery resolves episodes and a recurrence creates exactly one new episode',async()=>{
  const refresh=async()=>{await local(async c=>{const r=await find(c,'order-match',automatic.key);if(r.data.status!=='pending')await def.actions[0].run(r,c);});const cmd=await command(automatic.id);await ack(cmd,await reply(cmd));await local(async c=>{const p=await find(c,'monitor-policy',policy.key);await save(c,p.kind,p.key,{...p.data,nextRunAt:null},p);await def.tick(c);});};
  await print.pool.query("UPDATE business_records SET data=jsonb_set(data,'{status}','\"fulfilled\"'),revision=revision+1 WHERE kind='external-order' AND data->>'connectionId'='monitor-store'");
  await refresh();let r=await local(c=>find(c,condition.kind,condition.key));assert.equal(r.data.active,false);assert.equal(r.data.status,'resolved');
  await print.pool.query("UPDATE business_records SET data=jsonb_set(data,'{status}','\"on-hold\"'),revision=revision+1 WHERE kind='external-order' AND data->>'connectionId'='monitor-store'");
  await refresh();r=await local(c=>find(c,condition.kind,condition.key));assert.equal(r.data.active,true);assert.equal(r.data.episode,2);assert.equal(r.data.acknowledgedAt,null);
 });
 let costCommand,costBody;
 const readCosts=(cmd,extra={})=>transaction(print.pool,db=>orderItemCostsReceive(cmd,{...ctx(db,print,provider),incomingProviderIdentity:own,config:{...print.runtime.configuration,costReadEnabled:true},...extra}));
 await test('item cost requests use separate pinned read capability and retain authoritative source references',async()=>{
  await transaction(print.pool,async db=>{const c=ctx(db,print,provider);for(let n=0;n<2;n++){const r=await find(c,'external-order','monitor-'+n);await save(c,r.kind,r.key,{...r.data,itemCostEvidence:orderItemCosts({line_items:[{product_id:'p'+n,variant_id:1,quantity:1,cost:100+n,shipping_cost:20,status:'on-hold'}]},'USD'),isReprint:false},r);}});
  const value=await local(async c=>def.actions.find(a=>a.path==='/read-order-item-costs/:id').run(await find(c,'order-match',automatic.key),{...c,permissions:['cee.shopify.cost.read']}));
  costCommand=(await shop.pool.query('SELECT envelope FROM integration_outbox WHERE command_id=$1',[value.record.costCommandId])).rows[0].envelope;
  assert.equal(costCommand.command,'order-costs.lookup');assert.equal(costCommand.capability.providerConstraint.packageDigest,provider.packageDigest);
  costBody=await readCosts(costCommand);assert.equal(costBody.items.length,2);assert.equal(costBody.items[0].sourceStreamId,'printify_order_item_costs_v1');assert.equal(costBody.items[0].item.productionCostCents,100);
 });
 await test('item costs reject disabled permissions, absent authority and wrong original stores',async()=>{
  await assert.rejects(readCosts(costCommand,{config:{...print.runtime.configuration,costReadEnabled:false}}));await assert.rejects(readCosts(costCommand,{incomingProviderIdentity:undefined}));await assert.rejects(readCosts(costCommand,{entityId:randomUUID()}));await assert.rejects(readCosts({...costCommand,payload:{...costCommand.payload,accountId:'foreign'}}));
  await assert.rejects(local(async c=>def.actions.find(a=>a.path==='/read-order-item-costs/:id').run(await find(c,'order-match',automatic.key),c)),/permission/);
 });
 await test('cost receipts deduplicate and general matching reads cannot disclose cost detail',async()=>{
  const result={...costBody,_steward:{providerModuleId:provider.moduleId,providerInstallationId:provider.moduleInstallationId,packageDigest:provider.packageDigest}};
  await assert.rejects(ack(costCommand,{...result,_steward:{...result._steward,packageDigest:'c'.repeat(64)}}));await ack(costCommand,result);await ack(costCommand,result);await assert.rejects(ack(costCommand,{...result,status:'unavailable'}));
  const hidden=(await local(c=>combinedOrders(c))).records.find(r=>r.id===automatic.id);assert.equal(hidden.supplierItemCosts.status,'permission_required');assert(!('costResult' in hidden));
  const visible=(await local(c=>combinedOrders({...c,permissions:['cee.shopify.cost.read']}))).records.find(r=>r.id===automatic.id);assert.equal(visible.supplierItemCosts.items.length,2);assert(visible.supplierItemCosts.items.every(i=>i.shopifyLineMatch==='unmatched'));
  const stored=await local(c=>find(c,'order-match',automatic.key));assert(!('costResult' in stored.data));
 });
 await test('cost pagination is bounded and outages do not invent zero supplier cost',async()=>{
  const page=await readCosts({...costCommand,payload:{...costCommand.payload,limit:1}});assert.equal(page.items.length,1);assert.equal(page.nextOffset,1);
  await print.pool.query("UPDATE printify_order_sync SET status='unavailable' WHERE connection_id='monitor-store'");const result=await readCosts(costCommand);assert.equal(result.status,'unavailable');assert.equal(result.items.length,0);
  await print.pool.query("UPDATE printify_order_sync SET status='ready',observed_at=now() WHERE connection_id='monitor-store'");
 });
}
