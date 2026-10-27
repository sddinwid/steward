import {withExternalCatalog} from './external-catalog.js';
import {synchronizePrintifyCatalog} from './catalog-sync.js';
import {recordCatalogSync,catalogSyncUnavailable,catalogConnectionsConfigured} from './catalog-provenance.js';
import {connectorConnections,connectionSource,nextPoll,deferPoll,bindConnectionIdentity,unavailableConnections} from '@steward/commerce-kit';
import {connectorConditions,publishConnectorConditions} from '@steward/commerce-kit';
import {ensure,find,save,records,publicRecord,enqueueCapability,object,text,transaction,type Definition,type Data,type Context} from '@steward/business-kit';
import {canonical,digest,validateCapabilityValue,type ModulePackageManifest} from '@steward/module-sdk';
import {connectorSecret,verifyPrintify,remote,ConnectorError,context,connectorState,issued,reconciled,page,contracts} from '@steward/commerce-kit';
import type pg from 'pg';
export function printify(manifest:ModulePackageManifest,secretFile?:string):Definition{return withExternalCatalog({manifest,resources:[{kind:'mapping',path:'/mappings',key:'sku',schema:object({sku:text(80),productId:text(),variantId:{type:'integer',minimum:1}}),prepare:async(b,old,ctx)=>{
 const p=await find(ctx,'product',b.productId);ensure(p?.data.variants.some((v:Data)=>v.id===b.variantId&&v.isEnabled),'Unknown or unavailable Printify variant');ensure(!old||canonical(old.data)===canonical(b)||!(await records(ctx,'job')).some(j=>j.data.lines.some((l:Data)=>l.sku===b.sku)),'Used variant mapping is immutable; reconcile existing jobs before replacement',409);return b;
}}],actions:[{path:'/authorize/:id',kind:'job',permission:manifest.moduleId+'.production.authorize',run:async(r,ctx)=>{
 ensure(ctx.config.productionEnabled===true,'Production is disabled in module configuration',403);ensure(r.data.status==='awaiting_authorization','Job is not awaiting authorization',409);
 const mapped=await mapLines(ctx,r.data.lines);return{record:publicRecord(await save(ctx,'job',r.key,{...r.data,status:'authorized',authorizedBy:ctx.actor,authorizedAt:new Date().toISOString(),maximumCostCents:ctx.config.maximumOrderCostCents,productionLines:mapped},r))};
}},{path:'/reconcile/:id',kind:'job',permission:manifest.moduleId+'.write',run:async(r,ctx)=>{const receipt=(await ctx.db.query('SELECT state FROM connector_issuance WHERE request_key=$1',['create:'+r.key])).rows[0];const safe=!receipt&&!r.data.remoteId&&r.data.authorizedAt&&['issuing','uncertain'].includes(r.data.status);return{record:publicRecord(await save(ctx,'job',r.key,{...r.data,...(safe?{status:'authorized',error:null}:{}),reconcileRequestedAt:new Date().toISOString(),reconciledBy:ctx.actor},r))};}},{path:'/synchronize/:id',kind:'connector',permission:manifest.moduleId+'.write',run:async(r,ctx)=>({record:publicRecord(await save(ctx,'connector',r.key,{...r.data,requestedAt:new Date().toISOString()},r))})}],
 tick:ctx=>publishConnectorConditions(ctx,'printify'),queries:[{path:'/commerce-exceptions',run:async ctx=>({records:(await connectorConditions(ctx,'printify')).map(i=>({id:i.sourceId+':'+i.code,...i})),summary:'Read-only operational conditions. No uncertain production is automatically retried.'})},{path:'/external-orders',run:(ctx,q)=>page(ctx,'external-order',q,['sourceId','externalId','ownership','status','tracking','currency'])},{path:'/shops',run:(ctx,q)=>page(ctx,'shop',q,['sourceId','title','salesChannel'])},{path:'/connections',run:(ctx,q)=>page(ctx,'connector',q,['name','mode','status','error'])},{path:'/catalog',run:(ctx,q)=>page(ctx,'product',q,['sourceId','title','printProviderId','variants'])},{path:'/jobs',run:(ctx,q)=>page(ctx,'job',q,['orderId','remoteId','status','productionCostCents','shippingCostCents','tracking','error'])}],
 receive:async(command,ctx)=>{
 const op=contracts.production!.operations.find(o=>o.name===command.command);ensure(op,'Unsupported fulfillment operation',403);validateCapabilityValue(command.payload,op.input);const b=command.payload as Data;
 ensure(b.orderId===command.aggregateId,'Fulfillment aggregate identity mismatch',403);
 if(command.command==='fulfillment.cancel'){const j=await find(ctx,'job',b.orderId);if(!j)return{canceled:true};ensure(j.data.sourceModuleId===command.sourceModuleId,'Wrong production intent owner',403);if(['awaiting_authorization','authorized','canceled'].includes(j.data.status)&&!j.data.remoteId){await save(ctx,'job',j.key,{...j.data,status:'canceled'},j);return{canceled:true};}await save(ctx,'job',j.key,{...j.data,error:'CANCELLATION_REQUIRES_EXTERNAL_RECONCILIATION'},j);return{canceled:false};}
 ensure(b.currency===ctx.config.currency,'Production currency mismatch');await mapLines(ctx,b.lines);const old=await find(ctx,'job',b.orderId);if(old){ensure(canonical(old.data.lines)===canonical(b.lines)&&old.data.currency===b.currency&&old.data.sourceModuleId===command.sourceModuleId,'Production intent identity conflict',409);return{jobId:old.id,status:'awaiting_authorization'};}
 const mapping=(await find(ctx,'mapping',b.lines[0].sku))!,product=(await find(ctx,'product',mapping.data.productId))!;const job=await save(ctx,'job',b.orderId,{connectionId:product.data.connectionId??'default',orderId:b.orderId,lines:b.lines,currency:b.currency,sourceModuleId:command.sourceModuleId,externalId:ctx.installationId+':'+b.orderId,status:'awaiting_authorization',remoteId:null,productionCostCents:null,shippingCostCents:null,costBasis:'incomplete',tracking:'-',error:null,progressDigest:null});return{jobId:job.id,status:'awaiting_authorization'};
 },webhook:async(b,ctx)=>{
 const raw=Buffer.from(String(b.bodyBase64??''),'base64');ensure(raw.length<=131072&&raw.toString('base64')===b.bodyBase64,'Invalid Printify webhook signature',403);
 const body=JSON.parse(raw.toString());const s=(await connectorConnections('printify',ctx.config.mode,secretFile)).find(s=>s.shopId===String(body.resource?.shop_id));ensure(s&&verifyPrintify(raw,s.webhookSecret,b.headers?.['x-pfy-signature']),'Invalid Printify webhook identity or signature',403);body.id=connectionSource(s.connectionId,body.id);ensure(manifest.connector!.webhookTopics.includes(body.type)&&String(body.resource?.shop_id)===s.shopId&&typeof body.id==='string'&&body.id.length<=120,'Printify webhook scope mismatch',403);
 const hash=digest(raw.toString()),old=(await ctx.db.query('SELECT digest FROM connector_events WHERE event_id=$1',[body.id])).rows[0];if(old){ensure(old.digest===hash,'Webhook identity conflict',409);return{accepted:true,replay:true};}await ctx.db.query('INSERT INTO connector_events(event_id,digest) VALUES($1,$2)',[body.id,hash]);return{accepted:true,replay:false};
 }});}
async function mapLines(ctx:Context,lines:Data[]){const result=[];let connection:string|undefined;for(const l of lines){const m=await find(ctx,'mapping',l.sku);ensure(m,'Explicit Printify SKU/variant mapping required');const p=await find(ctx,'product',m.data.productId),v=p?.data.variants.find((v:Data)=>v.id===m.data.variantId&&v.isEnabled);ensure(v,'Mapped Printify variant unavailable');ensure(connection===undefined||connection===(p!.data.connectionId??'default'),'Production lines must belong to one supplier connection');connection=p!.data.connectionId??'default';result.push({product_id:p!.data.remoteSourceId??m.data.productId,variant_id:m.data.variantId,quantity:l.quantity});}return result;}
export function validatePrintifyCurrency(secret:Data,currency:string){if(secret.mode==='live'&&secret.costCurrency!==currency)throw new ConnectorError('CONNECTOR_COST_CURRENCY_CONFIRMATION_REQUIRED');}

async function pages(s:Data,kind:string){const all=[];for(let p=1;p<=50;p++){const r=await remote(s,`/v1/shops/${encodeURIComponent(s.shopId)}/${kind}.json?page=${p}&limit=2`);ensure(Array.isArray(r.data),'Invalid Printify page');all.push(...r.data);if(p>=r.last_page)return all;}throw new ConnectorError('CONNECTOR_PAGE_BUDGET_REACHED');}
export async function printifyBackground(pool:pg.Pool,runtime:Data,secretFile?:string){
 let connections:Data[];try{connections=await connectorConnections('printify',runtime.configuration.mode,secretFile);}catch(e){const error=e instanceof ConnectorError?e.code:'CONNECTOR_CONFIGURATION_OR_DATA_INVALID';await catalogSyncUnavailable(pool,undefined,error);await unavailableConnections(pool,runtime,[],error);await connectorState(pool,runtime,'connection_unavailable',error);return;}
 await catalogConnectionsConfigured(pool,connections.map(s=>s.connectionId));await unavailableConnections(pool,runtime,connections.map(s=>s.connectionId));
 for(const secret of connections)await pollConnection(pool,{...runtime,connectionId:secret.connectionId},secretFile,secret);
}
async function pollConnection(pool:pg.Pool,runtime:Data,secretFile:string|undefined,s:Data){
 if(nextPoll(pool,runtime)>Date.now())return;deferPoll(pool,runtime,2000);const lock=await pool.connect();let acquired=false,catalogSynced=false;
 try{
  acquired=(await lock.query('SELECT pg_try_advisory_lock(8148001) acquired')).rows[0].acquired;if(!acquired)return;await bindConnectionIdentity(pool,runtime,s);
  validatePrintifyCurrency(s,runtime.configuration.currency);await synchronizePrintifyCatalog(pool,runtime,s);catalogSynced=true;
  const jobs=(await pool.query("SELECT * FROM business_records WHERE kind='job' AND data->>'status' NOT IN ('awaiting_authorization','canceled') AND coalesce(data->>'connectionId','default')=$1 ORDER BY key LIMIT 20",[s.connectionId])).rows;
  // Full bounded reconciliation also handles a lost create response; external_id alone is not an idempotency guarantee.
  const external=await pages(s,'orders');
  await transaction(pool,async db=>{const ctx=context(db,runtime);for(const o of external){const data={sourceId:connectionSource(s.connectionId,String(o.id)),remoteSourceId:String(o.id),connectionId:s.connectionId,externalId:String(o.external_id??o.metadata?.shop_order_id??'Unknown'),ownership:String(o.external_id??'').startsWith(runtime.installationId+':')?'Steward authorized':'Native/external · monitor only',status:String(o.status),tracking:(o.shipments??[]).map((s:Data)=>String(s.number??'Unknown')),currency:o.currency??null};const old=await find(ctx,'external-order',data.sourceId);if(!old||canonical(old.data)!==canonical(data))await save(ctx,'external-order',data.sourceId,data,old);}});
  for(const job of jobs){try{await reconcileJob(pool,runtime,s,job,external);}catch(e){await jobPatch(pool,runtime,job.key,{error:e instanceof ConnectorError?e.code:'EXTERNAL_OUTCOME_REQUIRES_RECONCILIATION'});}}
  await connectorState(pool,runtime,'available');
 }catch(e){if(!catalogSynced)await catalogSyncUnavailable(pool,s.connectionId,'PRINTIFY_CATALOG_READ_UNAVAILABLE');deferPoll(pool,runtime,(e instanceof ConnectorError&&e.retryable)?5000:30000);await connectorState(pool,runtime,'connection_unavailable',e instanceof ConnectorError?e.code:'CONNECTOR_CONFIGURATION_OR_DATA_INVALID');}
 finally{if(acquired)await lock.query('SELECT pg_advisory_unlock(8148001)').catch(()=>{});lock.release();}
}
async function reconcileJob(pool:pg.Pool,runtime:Data,s:Data,job:any,external:Data[]){
 let data=job.data;const matches=external.filter(o=>String(o.external_id??o.metadata?.shop_order_id)===data.externalId);ensure(matches.length<=1,'Ambiguous external production identity',409);let current:Data=matches[0] as Data;
 if(current){ensure(canonical(current.line_items.map((l:Data)=>({product_id:l.product_id,variant_id:l.variant_id,quantity:l.quantity})))===canonical(data.productionLines),'External production identity changed',409);await reconciled(pool,'create:'+job.key,current);}
 if(!current&&!data.remoteId){
  if(data.status!=='authorized'){await jobPatch(pool,runtime,job.key,{status:'uncertain',error:'EXTERNAL_ORDER_NOT_YET_RECONCILED'});return;}
  ensure(runtime.configuration.productionEnabled===true&&s.productionEnabled===true,'Operator has not enabled production',403);
  if(s.mode==='live'){const grant=s.productionApprovals?.[data.orderId];ensure(grant&&grant.currency===data.currency&&Date.parse(grant.expiresAt)>Date.now()&&grant.maximumCostCents<=data.maximumCostCents,'Live production requires a private, time-limited per-order operator grant',403);}
  const address=s.mode==='simulator'?s.syntheticAddress:s.deliveryByReference?.[data.orderId];ensure(address&&address.country,'Private delivery configuration required');
  const shipping=await remote(s,`/v1/shops/${encodeURIComponent(s.shopId)}/orders/shipping.json`,'POST',{line_items:data.productionLines,address_to:address});
  let production=0;await transaction(pool,async db=>{const ctx=context(db,runtime);for(const l of data.productionLines){const p=await find(ctx,'product',connectionSource(s.connectionId,l.product_id)),v=p?.data.variants.find((v:Data)=>v.id===l.variant_id);ensure(v&&Number.isSafeInteger(v.unitCostCents),'Production cost is unknown; authorization cannot proceed');production+=v.unitCostCents*l.quantity;}});
  ensure(Number.isSafeInteger(production)&&Number.isSafeInteger(shipping.standard)&&shipping.standard>=0&&production+shipping.standard<=data.maximumCostCents,'Production estimate exceeds authorized cost ceiling',403);
  const prepared=await transaction(pool,async db=>{const ctx=context(db,runtime),r=(await find(ctx,'job',job.key))!;if(r.data.status!=='authorized')return false;await save(ctx,'job',r.key,{...r.data,status:'issuing',productionCostCents:production,shippingCostCents:shipping.standard,costBasis:'estimated'},r);return true;});if(!prepared)return;
  const payload={external_id:data.externalId,line_items:data.productionLines,shipping_method:1,send_shipping_notification:false,address_to:address};
  try{current=await issued(pool,'create:'+job.key,payload,()=>remote(s,`/v1/shops/${encodeURIComponent(s.shopId)}/orders.json`,'POST',payload));}catch{await jobPatch(pool,runtime,job.key,{status:'uncertain',error:'EXTERNAL_CREATE_OUTCOME_UNCERTAIN'});return;}
  data=(await jobPatch(pool,runtime,job.key,{remoteId:current.id,status:'pending',error:null})).data;
 }
 if(!current&&data.remoteId)current=await remote(s,`/v1/shops/${encodeURIComponent(s.shopId)}/orders/${encodeURIComponent(data.remoteId)}.json`);
 if(!current)return;
 if(current.currency)ensure(String(current.currency).toUpperCase()===data.currency,'External production currency mismatch',409);
 if(!data.remoteId)data=(await jobPatch(pool,runtime,job.key,{remoteId:current.id,status:'pending'})).data;
 const externalStatus=String(current.status);
 if(['pending','on-hold'].includes(externalStatus)){
  const previous=(await pool.query('SELECT state FROM connector_issuance WHERE request_key=$1',['produce:'+job.key])).rows[0];
  if(previous?.state==='issued'){await jobPatch(pool,runtime,job.key,{status:'uncertain',error:'PRODUCTION_OUTCOME_UNCERTAIN'});return;}
  ensure(runtime.configuration.productionEnabled===true&&s.productionEnabled===true,'Production authorization revoked',403);
  if(s.mode==='live'){const grant=s.productionApprovals?.[data.orderId];ensure(grant&&grant.currency===data.currency&&Date.parse(grant.expiresAt)>Date.now()&&data.productionCostCents+data.shippingCostCents<=grant.maximumCostCents,'Production grant expired or insufficient',403);}
  try{await issued(pool,'produce:'+job.key,{remoteId:current.id},()=>remote(s,`/v1/shops/${encodeURIComponent(s.shopId)}/orders/${encodeURIComponent(current.id)}/send_to_production.json`,'POST',{}));}catch{await jobPatch(pool,runtime,job.key,{status:'uncertain',error:'PRODUCTION_OUTCOME_UNCERTAIN'});return;}
  current=await remote(s,`/v1/shops/${encodeURIComponent(s.shopId)}/orders/${encodeURIComponent(current.id)}.json`);
 }else if(['in-production','sending-to-production','fulfilled','partially-fulfilled'].includes(externalStatus))await reconciled(pool,'produce:'+job.key,{});
 const status=['fulfilled'].includes(current.status)?'shipped':['in-production','sending-to-production','partially-fulfilled'].includes(current.status)?'in_production':['canceled','has-issues'].includes(current.status)?'failed':'pending';
 const tracking=status==='shipped'?current.shipments?.[0]?.number??'-':'-';ensure(status!=='shipped'||tracking!=='-','Shipment has no authoritative tracking reference');
 await transaction(pool,async db=>{const ctx=context(db,runtime),r=(await find(ctx,'job',job.key))!;if(r.data.status==='shipped'&&status!=='shipped')return;
  const progress={orderId:r.data.orderId,sourceId:current.id,status,productionCostCents:r.data.productionCostCents,shippingCostCents:r.data.shippingCostCents,costBasis:r.data.costBasis,currency:r.data.currency,tracking};const hash=digest(canonical(progress));
  if(hash!==r.data.progressDigest){await enqueueCapability(ctx,contracts.status!.id,'fulfillment.progress',r.id,{...progress,updatedAt:new Date().toISOString()});await save(ctx,'job',r.key,{...r.data,status,remoteId:current.id,tracking,progressDigest:hash,error:null},r);}
 });
}
async function jobPatch(pool:pg.Pool,runtime:Data,key:string,patch:Data){return transaction(pool,async db=>{const ctx=context(db,runtime),r=(await find(ctx,'job',key))!;const next={...r.data,...patch};return canonical(next)===canonical(r.data)?r:save(ctx,'job',key,next,r);});}
