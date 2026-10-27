import {withExternalCatalog} from './external-catalog.js';
import {recordCatalogSync,catalogSyncUnavailable,catalogConnectionsConfigured} from './catalog-provenance.js';
import {liveActions,liveProfileResource,liveBackground,productCatalog,productVariants} from './live.js';
import {loadShopifyConnections} from './live-auth.js';
import {connectorConnections,connectionSource,nextPoll,deferPoll,bindConnectionIdentity,unavailableConnections} from '@steward/commerce-kit';
import {connectorConditions,publishConnectorConditions} from '@steward/commerce-kit';
import {createHash} from 'node:crypto';
import {ensure,find,save,records,publicRecord,enqueueCapability,object,text,transaction,type Definition,type Data,type Context} from '@steward/business-kit';
import {canonical,digest,type ModulePackageManifest} from '@steward/module-sdk';
import {connectorSecret,verifyHmac,graphql,ConnectorError,context,connectorState,issued,reconciled,page,cents,contracts} from '@steward/commerce-kit';
import type pg from 'pg';
export function shopify(manifest:ModulePackageManifest,secretFile?:string):Definition{return withExternalCatalog({manifest,resources:[liveProfileResource,{kind:'mapping',path:'/mappings',key:'sourceVariantId',schema:object({sourceVariantId:text(),sku:text(80)}),prepare:async(b,old,ctx)=>{
 ensure((await records(ctx,'product')).some(p=>p.data.variants.some((v:Data)=>v.sourceVariantId===b.sourceVariantId)),'Unknown Shopify variant');
 ensure(!old||old.data.sku===b.sku||!(await records(ctx,'order')).some(o=>o.data.lines.some((l:Data)=>l.sourceVariantId===b.sourceVariantId)&&o.data.dispatchStatus!=='not_dispatched'),'A used mapping requires explicit order reconciliation',409);return b;
}}],actions:[...liveActions,{path:'/dispatch/:id',kind:'order',permission:manifest.moduleId+'.write',run:async(r,ctx)=>{
 ensure(ctx.config.mode!=='live','SHOPIFY_LIVE_READ_ONLY',403);ensure(ctx.config.integrationsEnabled===true,'Integrations disabled',403);ensure(r.data.dispatchEnabled||!r.data.nativeFulfillment,'This order has native or external fulfillment; monitoring only. Reconcile ownership before Steward routing.',409);const normalized=await normalize(ctx,r.data);await enqueueCapability(ctx,contracts.orders!.id,'commerce.order.import',r.id,normalized);
 return{record:publicRecord(await save(ctx,'order',r.key,{...r.data,dispatchEnabled:true,dispatchDigest:digest(canonical(normalized)),dispatchStatus:'pending'},r))};
}},{path:'/synchronize/:id',kind:'connector',permission:manifest.moduleId+'.write',run:async(r,ctx)=>{ensure(ctx.config.mode!=='live','SHOPIFY_USE_LIVE_CONNECTION_ACTIONS',409);return{record:publicRecord(await save(ctx,'connector',r.key,{...r.data,requestedAt:new Date().toISOString()},r))};}}],
 tick:ctx=>publishConnectorConditions(ctx,'shopify'),queries:[{path:'/commerce-exceptions',run:async ctx=>({records:(await connectorConditions(ctx,'shopify')).map(i=>({id:i.sourceId+':'+i.code,...i})),summary:'Read-only operational conditions. No uncertain production is automatically retried.'})},{path:'/connections',run:(ctx,q)=>page(ctx,'connector',q,['name','mode','status','error'])},{path:'/catalog',run:productCatalog},{path:'/catalog-variants',run:productVariants},{path:'/orders',run:(ctx,q)=>page(ctx,'order',q,['sourceId','currency','lines','financialStatus','dispatchStatus'])}],
 receive:async(command,ctx)=>{ensure(ctx.config.mode!=='live','SHOPIFY_LIVE_READ_ONLY',403);ensure(command.command==='channel.fulfillment','Unsupported channel operation',403);const order=(await records(ctx,'order')).find(r=>r.data.sourceId===command.payload.sourceId);ensure(order,'Unknown Shopify order');
 const b=command.payload as Data;ensure(order.data.salesProviderId,'Sales provider receipt has not arrived',503);ensure(order.data.salesOrderId===b.orderId&&order.data.salesProviderId===command.sourceModuleId&&b.orderId===command.aggregateId,'Sales order does not match imported Shopify order',403);
 const existing=await find(ctx,'channel-job',b.orderId);if(existing){ensure(canonical(existing.data.input)===canonical(b),'Channel fulfillment identity conflict',409);return{queued:true};}
 await save(ctx,'channel-job',b.orderId,{connectionId:order.data.connectionId??'default',input:b,status:'queued',error:null});return{queued:true};
 },acknowledge:async(command,status,result,ctx)=>{if(command.command!=='commerce.order.import')return;const order=await (async()=>{const r=(await ctx.db.query("SELECT * FROM business_records WHERE kind='order' AND id=$1 FOR UPDATE",[command.aggregateId])).rows[0];ensure(r,'Original channel order unavailable');return r;})();await save(ctx,'order',order.key,{...order.data,dispatchStatus:status==='delivered'?'imported':'rejected',salesOrderId:status==='delivered'?result.orderId:order.data.salesOrderId,salesProviderId:status==='delivered'?result._steward?.providerModuleId:order.data.salesProviderId},order);},
 webhook:async(b,ctx)=>{
 const raw=Buffer.from(String(b.bodyBase64??''),'base64'),h=b.headers??{};ensure(raw.length<=131072&&raw.toString('base64')===b.bodyBase64,'Invalid raw webhook',400);
 const s=(await loadShopifyConnections(ctx.config.mode,secretFile)).find(s=>s.shopDomain===h['x-shopify-shop-domain']);ensure(s,'Unknown Shopify store',403);
 ensure(verifyHmac(raw,s.webhookSecret,h['x-shopify-hmac-sha256'])&&h['x-shopify-shop-domain']===s.shopDomain&&h['x-shopify-api-version']==='2026-10'&&manifest.connector!.webhookTopics.includes(h['x-shopify-topic']),'Invalid Shopify webhook identity or signature',403);
 if(ctx.config.mode==='live')ensure(['products/create','products/update','products/delete'].includes(h['x-shopify-topic']),'SHOPIFY_LIVE_WEBHOOK_TOPIC_NOT_ENABLED',403);
 const id=h['x-shopify-webhook-id'];ensure(typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id),'Invalid event identity',400);return remember(ctx,connectionSource(s.connectionId,id),raw);
 }});}
async function remember(ctx:Context,id:string,raw:Buffer){const hash=createHash('sha256').update(raw).digest('hex'),old=(await ctx.db.query('SELECT digest FROM connector_events WHERE event_id=$1',[id])).rows[0];if(old){ensure(old.digest===hash,'Webhook identity conflict',409);return{accepted:true,replay:true};}JSON.parse(raw.toString());await ctx.db.query('INSERT INTO connector_events(event_id,digest) VALUES($1,$2)',[id,hash]);return{accepted:true,replay:false};}
async function normalize(ctx:Context,data:Data){const lines=[];for(const l of data.lines){const m=await find(ctx,'mapping',l.sourceVariantId);ensure(m,'Explicit local mapping required for every Shopify variant');lines.push({sourceVariantId:l.sourceVariantId,sku:m.data.sku,quantity:l.quantity,unitPriceCents:l.unitPriceCents,lineRevenueCents:l.lineRevenueCents});}return{sourceId:data.sourceId,sourceCreatedAt:data.sourceCreatedAt,sourceUpdatedAt:data.sourceUpdatedAt,channel:'shopify',currency:data.currency,financialStatus:data.financialStatus,fulfillmentStatus:data.fulfillmentStatus,canceled:data.canceled,refundCents:data.refundCents,lines};}
const productsQuery=`query StewardProducts($first:Int!,$after:String){products(first:$first,after:$after){nodes{id title status updatedAt variants(first:100){nodes{id sku inventoryQuantity inventoryItem{id inventoryLevels(first:20){nodes{location{id} quantities(names:["available"]){name quantity}}}}} pageInfo{hasNextPage}}} pageInfo{hasNextPage endCursor}}}`;
const orderFields=`id name createdAt updatedAt currencyCode displayFinancialStatus displayFulfillmentStatus cancelledAt totalRefundedSet{shopMoney{amount currencyCode}} lineItems(first:100){nodes{id sku quantity originalUnitPriceSet{shopMoney{amount currencyCode}} discountedTotalSet{shopMoney{amount currencyCode}} variant{id}} pageInfo{hasNextPage}} fulfillmentOrders(first:20){nodes{id status assignedLocation{name} lineItems(first:100){nodes{id remainingQuantity lineItem{id sku}}}}} fulfillments{id status trackingInfo{number} fulfillmentLineItems(first:100){nodes{quantity lineItem{id}}}}`;
const ordersQuery=`query StewardOrders($first:Int!,$after:String){orders(first:$first,after:$after){nodes{${orderFields}} pageInfo{hasNextPage endCursor}}}`;
export const orderQuery=`query StewardOrder($id:ID!){order(id:$id){${orderFields}}}`;
const fulfillmentQuery=`mutation StewardFulfillment($fulfillment:FulfillmentInput!){fulfillmentCreate(fulfillment:$fulfillment){fulfillment{id status} userErrors{field message}}}`;

export async function shopifyBackground(pool:pg.Pool,runtime:Data,secretFile?:string){
 if(runtime.configuration.mode==='live'){await liveBackground(pool,runtime,secretFile);return;}
 let connections:Data[];try{connections=await connectorConnections('shopify',runtime.configuration.mode,secretFile);}catch(e){const error=e instanceof ConnectorError?e.code:'CONNECTOR_CONFIGURATION_OR_DATA_INVALID';await catalogSyncUnavailable(pool,undefined,error);await unavailableConnections(pool,runtime,[],error);await connectorState(pool,runtime,'connection_unavailable',error);return;}
 await catalogConnectionsConfigured(pool,connections.map(s=>s.connectionId));await unavailableConnections(pool,runtime,connections.map(s=>s.connectionId));
 for(const secret of connections)await pollConnection(pool,{...runtime,connectionId:secret.connectionId},secretFile,secret);
}
async function pollConnection(pool:pg.Pool,runtime:Data,secretFile:string|undefined,s:Data){
 if(nextPoll(pool,runtime)>Date.now())return;deferPoll(pool,runtime,2000);
 const lock=await pool.connect();let acquired=false,catalogSynced=false;
 try{
  acquired=(await lock.query('SELECT pg_try_advisory_lock(8148001) acquired')).rows[0].acquired;if(!acquired)return;await bindConnectionIdentity(pool,runtime,s);
  
  const fetched:Record<string,Data[]>={products:[],orders:[]};
  for(const [kind,query]of [['products',productsQuery],['orders',ordersQuery]]){
   let after=null;for(let n=0;;n++){ensure(n<50,'Connector page budget reached');const data=await graphql(s,query!,{first:2,after}),part=data[kind!];ensure(Array.isArray(part?.nodes),'Invalid Shopify page');fetched[kind!]!.push(...part.nodes);if(!part.pageInfo.hasNextPage)break;ensure(part.pageInfo.endCursor&&part.pageInfo.endCursor!==after,'Invalid Shopify cursor');after=part.pageInfo.endCursor;}
  }
  await transaction(pool,async db=>{const ctx=context(db,runtime),seen=new Set();
   for(const p of fetched.products!){ensure(!p.variants.pageInfo?.hasNextPage,'Shopify product exceeds declared 100-variant import bound');const data={sourceId:connectionSource(s.connectionId,p.id),remoteSourceId:p.id,connectionId:s.connectionId,title:p.title,status:p.status,sourceUpdatedAt:p.updatedAt,variants:p.variants.nodes.map((v:Data)=>({sourceVariantId:connectionSource(s.connectionId,v.id),remoteSourceVariantId:v.id,sourceSku:v.sku,observedQuantity:v.inventoryQuantity,locations:(v.inventoryItem?.inventoryLevels?.nodes??[]).map((l:Data)=>({sourceLocationId:l.location.id,available:l.quantities.find((q:Data)=>q.name==='available')?.quantity??null}))}))};seen.add(data.sourceId);const old=await find(ctx,'product',data.sourceId);if(!old||canonical(old.data)!==canonical(data))await save(ctx,'product',data.sourceId,data,old);}
   for(const old of await records(ctx,'product'))if((old.data.connectionId??'default')===s.connectionId&&!seen.has(old.key)&&old.data.status!=='REMOVED')await save(ctx,'product',old.key,{...old.data,status:'REMOVED'},old);
   await recordCatalogSync(ctx,{provider:'shopify',mode:s.mode,connectionId:s.connectionId,accountId:s.shopId??s.shopDomain,shopDomain:s.shopDomain},fetched.products!);
   for(const o of fetched.orders!){
    ensure(!o.lineItems.pageInfo?.hasNextPage&&Number.isFinite(Date.parse(o.updatedAt)),'Unsupported or incomplete Shopify order');
    const data:Data={sourceId:connectionSource(s.connectionId,o.id),remoteSourceId:o.id,connectionId:s.connectionId,sourceCreatedAt:o.createdAt,sourceUpdatedAt:o.updatedAt,currency:o.currencyCode,financialStatus:String(o.displayFinancialStatus).toLowerCase(),fulfillmentStatus:o.displayFulfillmentStatus,canceled:!!o.cancelledAt,refundCents:cents(o.totalRefundedSet.shopMoney.amount),lines:o.lineItems.nodes.map((l:Data)=>({sourceVariantId:connectionSource(s.connectionId,l.variant?.id??'unmapped'),remoteSourceVariantId:l.variant?.id??'unmapped',sku:l.sku,quantity:l.quantity,unitPriceCents:cents(l.originalUnitPriceSet.shopMoney.amount),lineRevenueCents:cents(l.discountedTotalSet.shopMoney.amount)})),fulfillmentOrders:o.fulfillmentOrders.nodes,fulfillments:o.fulfillments};
    const old=await find(ctx,'order',data.sourceId);if(old&&old.data.sourceUpdatedAt>o.updatedAt)continue;
    const nativeFulfillment=!!o.fulfillments?.length||o.fulfillmentOrders.nodes.some((f:Data)=>/printify/i.test(f.assignedLocation?.name??''));data.nativeFulfillment=nativeFulfillment;data.fulfillmentOwner=old?.data.dispatchEnabled?'Steward':nativeFulfillment?'Native/external · monitor only':'Unassigned · explicit Steward dispatch required';
    const merged={dispatchEnabled:false,dispatchDigest:null,dispatchStatus:'not_dispatched',...old?.data,...data};
    let updated=old;if(!old||canonical(old.data)!==canonical(merged))updated=await save(ctx,'order',data.sourceId,merged,old);
    if(merged.dispatchEnabled){const normalized=await normalize(ctx,merged),hash=digest(canonical(normalized));if(hash!==merged.dispatchDigest){await enqueueCapability(ctx,contracts.orders!.id,'commerce.order.import',updated!.id,normalized);await save(ctx,'order',data.sourceId,{...merged,dispatchDigest:hash,dispatchStatus:'pending'},updated);}}
   }
  });
  catalogSynced=true;const jobs=(await pool.query("SELECT * FROM business_records WHERE kind='channel-job' AND data->>'status' IN ('queued','uncertain') AND coalesce(data->>'connectionId','default')=$1 ORDER BY key LIMIT 4",[s.connectionId])).rows;
  for(const job of jobs)await channelJob(pool,runtime,s,job);
  await connectorState(pool,runtime,'available');
 }catch(e){if(!catalogSynced)await catalogSyncUnavailable(pool,s.connectionId,'SHOPIFY_CATALOG_READ_UNAVAILABLE');deferPoll(pool,runtime,(e instanceof ConnectorError&&e.retryable)?5000:30000);await connectorState(pool,runtime,'connection_unavailable',e instanceof ConnectorError?e.code:'CONNECTOR_CONFIGURATION_OR_DATA_INVALID');}
 finally{if(acquired)await lock.query('SELECT pg_advisory_unlock(8148001)').catch(()=>{});lock.release();}
}
async function channelJob(pool:pg.Pool,runtime:Data,s:Data,job:any){
 const b=job.data.input,source=(await pool.query("SELECT data FROM business_records WHERE kind='order' AND key=$1",[b.sourceId])).rows[0]?.data;ensure(source&&(source.connectionId??'default')===s.connectionId,'Source connection mismatch');const remote=await graphql(s,orderQuery,{id:source.remoteSourceId??b.sourceId}),order=remote.order;ensure(order,'Shopify source order unavailable');
 const matching=order.fulfillments.filter((f:Data)=>f.status==='SUCCESS'&&f.trackingInfo.some((t:Data)=>t.number===b.tracking));
 const requested:Data[]=[];for(const l of b.lines){const mappings=(await pool.query("SELECT data FROM business_records WHERE kind='mapping' AND data->>'sku'=$1",[l.sku])).rows;const candidates=source.lines.filter((v:Data)=>mappings.some(m=>m.data.sourceVariantId===v.sourceVariantId));ensure(candidates.length===1,'Ambiguous source variant mapping');const original=candidates[0];ensure(original,'Source SKU mapping changed');const line=order.lineItems.nodes.find((v:Data)=>v.variant?.id===(original.remoteSourceVariantId??original.sourceVariantId)),fo=order.fulfillmentOrders.nodes.find((f:Data)=>f.lineItems.nodes.some((n:Data)=>n.lineItem.id===line?.id));const entry=fo?.lineItems.nodes.find((n:Data)=>n.lineItem.id===line?.id);ensure(entry&&l.quantity<=line.quantity,'Fulfillment quantity differs from source');requested.push({fulfillmentOrderId:fo.id,id:entry.id,lineItemId:line.id,quantity:l.quantity});}
 const existing=matching.find((f:Data)=>requested.every(l=>f.fulfillmentLineItems.nodes.some((n:Data)=>n.lineItem.id===l.lineItemId&&n.quantity===l.quantity)));
 const key='fulfill:'+job.key;let result;
 if(existing){result={fulfillmentCreate:{fulfillment:{id:existing.id,status:'SUCCESS'},userErrors:[]}};await reconciled(pool,key,result);}
 else{
  const groups=[...new Set(requested.map(l=>l.fulfillmentOrderId))].map(id=>({fulfillmentOrderId:id,fulfillmentOrderLineItems:requested.filter(l=>l.fulfillmentOrderId===id).map(l=>({id:l.id,quantity:l.quantity}))}));
  const input={fulfillment:{notifyCustomer:false,trackingInfo:{number:b.tracking},lineItemsByFulfillmentOrder:groups}};
  try{result=await issued(pool,key,input,()=>graphql(s,fulfillmentQuery,input));}catch{await updateJob(pool,runtime,job.key,{status:'uncertain',error:'EXTERNAL_OUTCOME_REQUIRES_RECONCILIATION'});return;}
 }
 ensure(result.fulfillmentCreate?.fulfillment&&!result.fulfillmentCreate.userErrors.length,'Shopify fulfillment rejected');await updateJob(pool,runtime,job.key,{status:'completed',error:null,sourceFulfillmentId:result.fulfillmentCreate.fulfillment.id});
}
async function updateJob(pool:pg.Pool,runtime:Data,key:string,patch:Data){await transaction(pool,async db=>{const ctx=context(db,runtime),r=(await find(ctx,'channel-job',key))!;await save(ctx,'channel-job',key,{...r.data,...patch},r);});}
