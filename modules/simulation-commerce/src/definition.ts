import type pg from 'pg';
import {randomUUID} from 'node:crypto';
import {ensure,find,get,save,records,publicRecord,transaction,enqueueCapability,setSimulationContext,simulationEpoch,type Context,type Data,type Definition,type RecordValue} from '@steward/business-kit';
import {SIMULATION_SCENARIOS,type ModulePackageManifest,type SimulationOrigin,type IntegrationCommand} from '@steward/module-sdk';
import {stableId,random,sampleOrder,catalog,simulationContracts,object,text} from '@steward/simulation-kit';

const control=(ctx:Context):Context=>{const{simulation,...base}=ctx;return base;};
const origin=(r:RecordValue,index=0):SimulationOrigin=>({version:1,datasetId:r.id,runId:r.data.runId,ecosystemId:r.data.ecosystemId,seed:r.data.seed,eventIndex:index,scenario:r.data.scenario,simulatedAt:new Date(Date.parse(r.data.simulatedBaseAt??new Date().toISOString())+(r.data.elapsedSimulatedMs??0)).toISOString(),speed:r.data.speed});
const scoped=(ctx:Context,s:SimulationOrigin):Context=>{const c=control(ctx);setSimulationContext(c,s);return c;};
async function updateRun(ctx:Context,r:RecordValue,data:Data){return save(control(ctx),'run',r.key,{...r.data,...data,updatedAt:new Date().toISOString()},r);}
async function recent(ctx:Context,kind:string,limit=20){return (await ctx.db.query("SELECT * FROM business_records WHERE kind=$1 ORDER BY created_at DESC,COALESCE((data->>'index')::integer,0) DESC,id DESC LIMIT $2",[kind,limit])).rows.map(r=>publicRecord({id:r.id,kind:r.kind,key:r.key,data:r.data,revision:r.revision}));}
async function history(ctx:Context,r:RecordValue,event:string,detail:Data={}){
 await save(control(ctx),'history',randomUUID(),{datasetId:r.id,runId:r.data.runId??null,event,detail,occurredAt:new Date().toISOString(),simulationId:r.data.ecosystemId});
 await ctx.db.query("DELETE FROM business_records WHERE kind='history' AND id IN (SELECT id FROM business_records WHERE kind='history' ORDER BY created_at DESC,id OFFSET $1)",[ctx.config.maximumHistory??1000]);
}
async function command(ctx:Context,r:RecordValue,key:keyof typeof simulationContracts,operation:string,payload:Data,aggregate=r.data.runId,s=r.data.initialOrigin??origin(r)){
 return enqueueCapability(scoped(ctx,s),simulationContracts[key].id,operation,aggregate,payload);
}
const controlRecord=(r:RecordValue)=>({...publicRecord(r),revision:r.data.configurationRevision??1});
const dataset=(r:RecordValue)=>({datasetId:r.id,runId:r.data.runId});
async function setup(ctx:Context,r:RecordValue){
 const body=dataset(r),items=catalog(r.id,r.data.runId);const pending=[];
 for(const key of ['sales','stock','production'] as const)pending.push(await command(ctx,r,key,'simulation.dataset.begin',body));
 pending.push(await command(ctx,r,'sales','simulation.sales.set-publication',{...body,approved:r.data.shareWithMaster==='yes'}));
 pending.push(await command(ctx,r,'stock','simulation.stock.seed',{...body,items:items.map(({sku,name,quantity})=>({sku,name,quantity}))}));
 pending.push(await command(ctx,r,'production','simulation.production.configure',{...body,catalog:items.map(p=>({sku:p.sku,unitCostCents:p.unitQuoteCents}))}));
 return pending;
}
const configuration=object({name:text(80),ecosystem:text(80),scenario:{type:'string',enum:[...SIMULATION_SCENARIOS]},seed:{type:'integer',minimum:0,maximum:0xffffffff},eventsPerMinute:{type:'integer',minimum:1,maximum:120},speed:{type:'integer',minimum:1,maximum:600},shareWithMaster:{type:'string',enum:['yes','no']}},['name']);
export function simulationCommerce(manifest:ModulePackageManifest):Definition {
 const permission=manifest.moduleId+'.admin';
 return{manifest,resources:[{kind:'run',revisionField:'configurationRevision',path:'/runs',key:'name',schema:configuration,prepare:async(b,p,ctx)=>{
  if(!p)ensure((await records(ctx,'run')).length<(ctx.config.maximumDatasets??10),'Maximum simulation dataset count reached',409);
  ensure(!p||p.data.state!=='resetting','Dataset reset is still in progress',409);
  const values={ecosystem:'Commerce demonstration',scenario:'normal',seed:7,eventsPerMinute:6,speed:60,shareWithMaster:'no',...p?.data,...b};
  if(p&&p.data.eventIndex>0)ensure(values.seed===p.data.seed&&values.ecosystem===p.data.ecosystem,'Reset this synthetic dataset before changing its seed or ecosystem',409);
  return{...values,configurationRevision:(p?.data.configurationRevision??(p?1:0))+1,ecosystemId:stableId('ecosystem:'+values.ecosystem.trim().toLowerCase()),state:p?.data.state??'stopped',runId:p?.data.runId??null,eventIndex:p?.data.eventIndex??0,lastSummary:p?.data.lastSummary??null,error:null,warning:p?.data.warning??null,updatedAt:new Date().toISOString()};
 },after:async(r,p,ctx)=>{if(p&&['scenario','speed','eventsPerMinute','shareWithMaster'].some(k=>r.data[k]!==p.data[k]))await history(ctx,r,'configuration_changed',{scenario:r.data.scenario,speed:r.data.speed,eventsPerMinute:r.data.eventsPerMinute,publication:r.data.shareWithMaster});if(p&&r.data.runId&&p.data.shareWithMaster!==r.data.shareWithMaster){const id=await command(ctx,r,'sales','simulation.sales.set-publication',{...dataset(r),approved:r.data.shareWithMaster==='yes'});Object.assign(r,await updateRun(ctx,r,{publicationPending:id,warning:'Awaiting Sales owner publication receipt.'}));}}}],actions:[
 {path:'/start/:id',kind:'run',permission,concurrency:'current-state' as const,run:async(r,ctx)=>{
  ensure((ctx.config.teePopularityBasisPoints??5500)+(ctx.config.mugPopularityBasisPoints??3000)<=10000,'Product popularity probabilities must not exceed 100 percent');ensure((ctx.config.minimumQuantity??1)<=(ctx.config.maximumQuantity??5),'Minimum quantity must not exceed maximum');
  ensure(ctx.config.integrationsEnabled===true,'Approve simulation module integration configuration and SSMA bindings before starting',409);
  ensure(['stopped','paused','error'].includes(r.data.state),'Simulation is already active or resetting',409);ensure(!r.data.resetFailed,'Complete reset recovery before starting this dataset',409);
  let current=r;
  if(!r.data.runId){current=await updateRun(ctx,r,{runId:randomUUID(),simulatedBaseAt:new Date().toISOString(),elapsedSimulatedMs:0,eventIndex:0});current=await updateRun(ctx,current,{catalog:catalog(current.id,current.data.runId)});const s=origin(current);current=await updateRun(ctx,current,{initialOrigin:s});await simulationEpoch(scoped(ctx,s),true);const pending=await setup(ctx,current);current=await updateRun(ctx,current,{setupPending:pending,state:'starting',nextAt:new Date().toISOString(),error:null,warning:null,observationAttempts:0});}
  else if(current.data.setupFailed){ensure(!current.data.setupPending?.length,'Await outstanding setup receipts before retrying',409);const pending=await setup(ctx,current);current=await updateRun(ctx,current,{setupPending:pending,setupFailed:false,setupError:null,state:'starting',error:null,observationAttempts:0});}
  else current=await updateRun(ctx,current,{state:current.data.setupPending?.length?'starting':'running',nextAt:new Date().toISOString(),error:null,warning:null,observationAttempts:0});
  await history(ctx,current,'started',{seed:current.data.seed});return{record:controlRecord(current)};
 }},
 ...(['pause','resume','stop'] as const).map(action=>({path:'/'+action+'/:id',kind:'run',permission,concurrency:'current-state' as const,run:async(r:RecordValue,ctx:Context)=>{
  ensure(r.data.state!=='resetting','Dataset reset is still in progress',409);if(action==='resume')ensure(!r.data.resetFailed&&!r.data.setupFailed,'Recover the failed setup or reset before resuming',409);if(action==='resume')ensure(r.data.runId&&['paused','stopped'].includes(r.data.state),'Only a paused or stopped run can resume',409);if(action==='pause')ensure(['running','starting'].includes(r.data.state),'Only active simulation can pause',409);
  const current=await updateRun(ctx,r,{state:action==='pause'?'paused':action==='stop'?'stopped':r.data.setupPending?.length?'starting':'running',observationAttempts:0,...(action==='resume'?{}:{needsFinalObservation:true,finalObservationGeneration:(r.data.finalObservationGeneration??0)+1})});await history(ctx,current,action);return{record:controlRecord(current)};
 }})),
 {path:'/reset/:id',kind:'run',permission,concurrency:'current-state' as const,run:async(r,ctx)=>{
  ensure(['paused','stopped','error'].includes(r.data.state),'Pause or stop before resetting this synthetic dataset',409);if(!r.data.runId)return{record:controlRecord(await updateRun(ctx,r,{state:'stopped',warning:null,error:null,resetFailed:false,setupFailed:false,setupError:null}))};
  const pending=[];for(const key of ['sales','stock','production'] as const)pending.push(await command(ctx,r,key,'simulation.dataset.reset',dataset(r)));
  const current=await updateRun(ctx,r,{state:'resetting',resetPending:pending,resetFailed:false,error:null,warning:'Awaiting module-owned reset receipts; ordinary records are preserved.'});await history(ctx,current,'reset_requested');return{record:controlRecord(current)};
 }}],
 queries:[{path:'/history',run:async ctx=>({records:await recent(ctx,'history')})},{path:'/activity',run:async ctx=>({records:await recent(ctx,'event')})},{path:'/dashboard',run:report}],report,
 receive:async(c,ctx)=>{
  ensure(c.command==='channel.fulfillment'&&ctx.simulation,'Synthetic fulfillment callback required',403);const b=c.payload as Data;
  const row=(await ctx.db.query("SELECT key FROM business_records WHERE kind='event' AND data->>'orderId'=$1 AND data->'simulation'->>'datasetId'=$2 AND data->'simulation'->>'runId'=$3",[b.orderId,ctx.simulation.datasetId,ctx.simulation.runId])).rows[0];ensure(row,'Unknown synthetic Sales receipt',403);const e=(await find(ctx,'event',row.key))!;ensure(e.data.order.sourceId===b.sourceId&&typeof b.tracking==='string'&&b.tracking.startsWith('SIM-'),'Synthetic channel identity mismatch',403);await save(ctx,'event',e.key,{...e.data,deliveryObservedAt:new Date().toISOString(),tracking:b.tracking},e);return{queued:true};
 },acknowledge:acknowledge};
}
async function acknowledge(c:IntegrationCommand,status:'delivered'|'rejected',result:Data,ctx:Context){
 if(!c.simulation)return;const base=control(ctx);let r=await get(base,'run',c.simulation.datasetId);if(r.data.runId!==c.simulation.runId)return;
 if(r.data.setupPending?.includes(c.commandId)){const remaining=r.data.setupPending.filter((id:string)=>id!==c.commandId),failed=r.data.setupFailed||status==='rejected',error=status==='rejected'?String(result.error??'Simulation setup rejected'):r.data.setupError??null;r=await updateRun(base,r,{setupPending:remaining,setupFailed:failed,setupError:error,state:failed?'error':remaining.length?r.data.state:r.data.state==='starting'?'running':r.data.state,error});await history(base,r,'setup_receipt',{operation:c.command,status});return;}
 if(r.data.resetPending?.includes(c.commandId)){
  const remaining=r.data.resetPending.filter((id:string)=>id!==c.commandId);r=await updateRun(base,r,{resetPending:remaining,resetFailed:r.data.resetFailed||status==='rejected',state:status==='rejected'?'error':r.data.state,error:status==='rejected'?String(result.error??'Dataset reset rejected'):r.data.error??null});
  if(!remaining.length&&!r.data.resetFailed&&status==='delivered'){
   await ctx.db.query("DELETE FROM business_records WHERE kind='event' AND data->'simulation'->>'datasetId'=$1 AND data->'simulation'->>'runId'=$2",[r.id,r.data.runId]);await ctx.db.query("UPDATE simulation_dataset_epochs SET state='closed',updated_at=now() WHERE dataset_id=$1 AND run_id=$2",[r.id,r.data.runId]);
   r=await updateRun(base,r,{state:'stopped',lastRunId:r.data.runId,runId:null,eventIndex:0,lastSummary:null,lastStockSummary:null,stockObservationPending:null,observationPending:null,initialOrigin:null,resetFailed:false,setupFailed:false,setupError:null,error:null,warning:null});await history(base,r,'reset_completed');
  }return;
 }
 if(r.data.publicationPending===c.commandId){await updateRun(base,r,{publicationPending:null,warning:status==='rejected'?'Publication change rejected by Sales; review its simulation publication permission.':null,error:status==='rejected'?String(result.error??'Publication change rejected'):null});await history(base,r,'publication_receipt',{status,approved:r.data.shareWithMaster==='yes'});return;}
 if(r.data.stockObservationPending===c.commandId){const{_steward,...summary}=result;await updateRun(base,r,{stockObservationPending:null,lastStockSummary:status==='delivered'?summary:r.data.lastStockSummary,nextStockObservationAt:new Date(Date.now()+5000).toISOString()});return;}
 if(r.data.observationPending===c.commandId){const{_steward,...summary}=result;const final=status==='delivered'&&(r.data.observationGeneration??0)===(r.data.finalObservationGeneration??0);await updateRun(base,r,{observationPending:null,lastSummary:status==='delivered'?summary:r.data.lastSummary,lastSourceReceipt:status==='delivered'?{commandId:c.commandId,..._steward}:r.data.lastSourceReceipt,financialSnapshotVersion:status==='delivered'?1:r.data.financialSnapshotVersion,needsFinalObservation:final?false:r.data.needsFinalObservation,nextObservationAt:new Date(Date.now()+5000).toISOString()});return;}
 const e=await find(ctx,'event',c.aggregateId);if(!e||e.data.pendingCommand!==c.commandId)return;
 const body:Data={...e.data,pendingCommand:null};
 if(status==='rejected'&&e.data.stage==='publishing'&&r.data.shareWithMaster!=='yes'){await save(ctx,'event',e.key,{...body,stage:e.data.sample.cancellation?'cancel-needed':'confirm-needed'},e);return;}
 if(status==='rejected'){await save(ctx,'event',e.key,{...body,stage:'exception',error:String(result.error??'Business service rejected the operation')},e);await history(base,r,'business_exception',{eventIndex:e.data.index,error:String(result.error??'rejected')});return;}
 if(e.data.stage==='seeding-shortage')body.stage='import-needed';
 else if(e.data.stage==='importing'){body.orderId=result.orderId;body.stage=r.data.shareWithMaster==='yes'?'publish-needed':e.data.sample.cancellation?'cancel-needed':'confirm-needed';}
 else if(e.data.stage==='publishing')body.stage=e.data.sample.cancellation?'cancel-needed':'confirm-needed';
 else if(e.data.stage==='confirming'||e.data.stage==='requesting-production'){body.stage='inspect-needed';body.nextCheckAt=new Date(Date.now()+1500).toISOString();}
 else if(e.data.stage==='canceling')body.stage='canceled';
 else if(e.data.stage==='refunding')body.stage='fulfilled';
 else if(e.data.stage==='inspecting'){
  body.lastSalesObservation={...result,observedAt:new Date().toISOString()};
  if(result.status==='fulfilled')body.stage=e.data.sample.refund?'refund-needed':'fulfilled';
  else if(result.status==='canceled')body.stage='canceled';
  else if(result.error||result.stockStatus==='rejected'){body.stage='exception';body.error=result.error??'Stock reservation rejected';}
  else if(result.stockStatus==='reserved'&&!result.productionStatus)body.stage='production-needed';
  else {body.stage='inspect-needed';body.nextCheckAt=new Date(Date.now()+2000).toISOString();body.inspections=(body.inspections??0)+1;if(body.inspections>=45){body.stage='exception';body.error='SIMULATION_OBSERVATION_BUDGET_EXHAUSTED';}}
 }
 await save(ctx,'event',e.key,body,e);
}
function orderBody(r:RecordValue,index:number,sample:ReturnType<typeof sampleOrder>,sku:string){const p=catalog(r.id,r.data.runId).find(p=>p.logicalProduct==='synthetic-'+sample.family&&p.variant===sample.variant)!;return{sourceId:`sim:${r.id}:${r.data.runId}:${index}`,sourceCreatedAt:new Date().toISOString(),sourceUpdatedAt:new Date().toISOString(),channel:'simulation',currency:'USD',financialStatus:'paid',fulfillmentStatus:'unfulfilled',canceled:false,refundCents:0,lines:[{sourceVariantId:p.sourceVariantId,sku,quantity:sample.quantity,unitPriceCents:sample.unitPriceCents,lineRevenueCents:sample.quantity*sample.unitPriceCents}]};}
async function emitEvent(ctx:Context,r:RecordValue){
 const index=r.data.eventIndex,sample=sampleOrder(r.data.seed,index,r.data.scenario,ctx.config),s=origin(r,index);const p=catalog(r.id,r.data.runId).find(p=>p.logicalProduct==='synthetic-'+sample.family&&p.variant===sample.variant)!;
 const shortage=r.data.scenario==='inventory-shortage';if(shortage){sample.family='tee';sample.variant='standard';sample.unitPriceCents=2400;sample.quantity=Math.max(2,sample.quantity);}
 const sku=shortage?catalog(r.id,r.data.runId)[0]!.sku+'-SHORT':p.sku+(sample.missingMapping?'-UNMAPPED':'');const key=stableId(r.data.runId+':event:'+index),eventCtx=scoped(ctx,s);
 const event=await save(eventCtx,'event',key,{index,stage:shortage?'seeding-shortage':'importing',sample,order:orderBody(r,index,sample,sku),orderId:null,createdAt:new Date().toISOString(),simulatedAt:s.simulatedAt,error:null});
 const id=shortage?await command(ctx,r,'stock','simulation.stock.seed',{...dataset(r),items:[{sku,name:'Synthetic shortage stock',quantity:1}]},key,s):await command(ctx,r,'orders','commerce.order.import',event.data.order,key,s);
 await save(eventCtx,'event',key,{...event.data,pendingCommand:id},event);
 const rate=Math.min(ctx.config.maximumEventsPerMinute??120,r.data.eventsPerMinute*sample.arrivalMultiplier),delay=Math.max(250,Math.round(-Math.log(Math.max(1e-9,1-random(r.data.seed,index,'arrival')))*60000/rate));
 return updateRun(ctx,r,{eventIndex:index+1,elapsedSimulatedMs:(r.data.elapsedSimulatedMs??0)+delay*r.data.speed,nextAt:new Date(Math.max(Date.now()-2000,Date.parse(r.data.nextAt??new Date().toISOString()))+delay).toISOString(),warning:null});
}
async function advance(ctx:Context,r:RecordValue,e:RecordValue){
 const s=e.data.simulation as SimulationOrigin;let key:keyof typeof simulationContracts='sales',operation='simulation.sales.advance',payload:Data={orderId:e.data.orderId},stage=e.data.stage;
 if(stage==='import-needed'){key='orders';operation='commerce.order.import';payload=e.data.order;stage='importing';}
 else if(stage==='publish-needed'){payload.action='publish';stage='publishing';}
 else if(stage==='confirm-needed'){payload.action='confirm';stage='confirming';}
 else if(stage==='production-needed'){payload.action='request-production';stage='requesting-production';}
 else if(stage==='inspect-needed'){operation='simulation.sales.inspect';stage='inspecting';}
 else if(stage==='cancel-needed'||stage==='refund-needed'){key='orders';operation='commerce.order.import';payload={...e.data.order,sourceUpdatedAt:new Date().toISOString(),financialStatus:stage==='cancel-needed'?'voided':'partially_refunded',canceled:stage==='cancel-needed',refundCents:stage==='refund-needed'?Math.floor(e.data.order.lines[0].lineRevenueCents*e.data.sample.refundBasisPoints/10000):0};stage=stage==='cancel-needed'?'canceling':'refunding';}
 else return;
 const id=await command(ctx,r,key,operation,payload,e.key,s);await save(scoped(ctx,s),'event',e.key,{...e.data,stage,pendingCommand:id},e);
}
export async function simulationCommerceBackground(pool:pg.Pool,runtime:Data){
 if(runtime.configuration.integrationsEnabled!==true)return;
 await transaction(pool,async db=>{
  const ctx:Context={db,config:runtime.configuration,installationId:runtime.installationId,moduleId:runtime.moduleId,actor:'simulation-runtime',permissions:[]};
  const runs=(await db.query("SELECT key FROM business_records WHERE kind='run' AND data->>'runId' IS NOT NULL ORDER BY created_at LIMIT 10")).rows;
  for(const entry of runs){let r=(await find(ctx,'run',entry.key))!;const cfg=ctx.config;
   const refresh=r.data.needsFinalObservation===true||r.data.financialSnapshotVersion!==1||(r.data.lastSummary?.awaitingFulfillment??1)>0;
   if(!r.data.observationPending&&(!r.data.nextObservationAt||Date.parse(r.data.nextObservationAt)<=Date.now())&&r.data.state!=='resetting'&&(r.data.state==='running'||refresh&&(r.data.observationAttempts??0)<30)){const id=await command(ctx,r,'sales','simulation.sales.observe-financials',dataset(r),stableId(r.data.runId+':summary'));r=await updateRun(ctx,r,{observationPending:id,observationGeneration:r.data.finalObservationGeneration??0,observationAttempts:(r.data.observationAttempts??0)+(r.data.state==='running'?0:1)});}
   if(!r.data.stockObservationPending&&r.data.state==='running'&&(!r.data.nextStockObservationAt||Date.parse(r.data.nextStockObservationAt)<=Date.now())){const id=await command(ctx,r,'stock','simulation.stock.observe',dataset(r),stableId(r.data.runId+':stock-summary'));r=await updateRun(ctx,r,{stockObservationPending:id});}
   if(r.data.state!=='running')continue;
   const pending=Number((await db.query("SELECT count(*) n FROM integration_outbox WHERE status='pending'")).rows[0].n);if(pending>=(cfg.maximumConcurrentOperations??8)){await updateRun(ctx,r,{warning:'Backpressure: awaiting authorized business service receipts.'});continue;}
   const events=(await db.query("SELECT key FROM business_records WHERE kind='event' AND data->'simulation'->>'runId'=$1 AND data->>'stage' NOT IN ('fulfilled','canceled','exception') ORDER BY created_at LIMIT 20",[r.data.runId])).rows;
   let budget=(cfg.maximumConcurrentOperations??8)-pending;
   for(const row of events){if(budget<=0)break;const e=(await find(scoped(ctx,(await db.query('SELECT data->\'simulation\' simulation FROM business_records WHERE kind=\'event\' AND key=$1',[row.key])).rows[0].simulation),'event',row.key))!;if(e.data.pendingCommand||e.data.nextCheckAt&&Date.parse(e.data.nextCheckAt)>Date.now())continue;await advance(ctx,r,e);budget--;}
   if(r.data.eventIndex>=(cfg.maximumOrders??500)){await updateRun(ctx,r,{state:events.length?'running':'paused',...(!events.length?{needsFinalObservation:true,finalObservationGeneration:(r.data.finalObservationGeneration??0)+1,observationAttempts:0}:{}),warning:events.length?'Generation limit reached; finishing already accepted work.':'Maximum synthetic dataset size reached. Reset only this dataset to begin another run.'});if(!events.length)await history(ctx,r,'size_limit_reached');continue;}
   if(process.memoryUsage().rss>(cfg.maximumMemoryBytes??134217728)||Number((await db.query('SELECT pg_database_size(current_database()) n')).rows[0].n)>(cfg.maximumDatabaseBytes??134217728)){await updateRun(ctx,r,{state:'paused',warning:'Simulation resource budget reached; retained business data is unchanged.'});continue;}
   const outstanding=Number((await db.query("SELECT count(*) n FROM business_records WHERE kind='event' AND data->'simulation'->>'runId'=$1 AND data->>'stage' NOT IN ('fulfilled','canceled','exception')",[r.data.runId])).rows[0].n);
   let n=0;while(budget>0&&n<4&&r.data.eventIndex<(cfg.maximumOrders??500)&&outstanding+n<(cfg.maximumOutstandingOrders??20)&&Date.parse(r.data.nextAt??'1970-01-01')<=Date.now()){r=await emitEvent(ctx,r);budget--;n++;}
  }
 });
}
async function report(ctx:Context){
 const runs=(await records(ctx,'run')).map(publicRecord).sort((a,b)=>String(b.updatedAt??'').localeCompare(String(a.updatedAt??''))||String(a.id).localeCompare(String(b.id))),active=runs.find(r=>r.state==='running')??runs[0],s=active?.lastSummary;
 const financialComplete=s?.reconciliationComplete===true&&active?.needsFinalObservation!==true;
 const limit=ctx.config.maximumOrders??500,atLimit=(active?.eventIndex??0)>=limit;
 const state=atLimit&&active?.state==='paused'&&s?.awaitingFulfillment===0?'Completed bounded dataset':active?.state??'Not started';
 const financial=(label:string,key:string)=>({label,value:s?.[key]??null,format:'money'});
 const series=(label:string,key:string,money=false)=>({label,...(money?{format:'money'}:{}),points:(s?.series??[]).map((p:Data)=>({at:p.at,value:p[key]??null}))});
 return{version:2,groups:[{
  title:active?.name??'Commerce simulation',currency:'USD',status:state,navigation:['control-center','activity'],
  description:active?`Running or most recently updated dataset; other retained datasets remain in Control Center. Scenario: ${active.scenario}. Speed: ${active.speed} simulated seconds per real second. Generation limit ${limit} order intents; reaching it pauses generation after accepted work settles. Last Sales receipt: ${s?.observedAt??'not received'}. ${active.warning??''}`:'Create a dedicated synthetic dataset in Simulation Control Center. No live provider is used.',
  metrics:[{label:'Generated order intents',value:active?.eventIndex??0},{label:'Persisted Sales orders',value:s?.orderCount??null},{label:'Completed orders',value:s?.completedOrders??null},{label:'Awaiting fulfillment',value:s?.awaitingFulfillment??null},{label:'Canceled orders',value:s?.canceledOrders??null},{label:'Fulfillment exceptions',value:s?.exceptions??null}],
  series:[series('Persisted orders per real source minute','orders'),series('Completed orders per real source minute','completedOrders')],
  sections:[{title:'Recent actual simulation order activity',value:await recent(ctx,'event',10)}]
 },{
  title:'Completed-order financial reconciliation',currency:'USD',
  description:'Synthetic USD estimates from owner Sales records. Recognized completed merchandise revenue − completed-order refunds − production − shipping − transaction fees − channel fees = estimated contribution. All-order refunds are separate; they are not deducted twice. Unknown components prevent a complete contribution estimate.',
  status:financialComplete?'All declared cost components available':active?.needsFinalObservation?(active.observationAttempts>=30?'Final owner observation unavailable — retry limit reached':'Refreshing final owner observation'):'Incomplete cost evidence',
  metrics:[financial('Recognized revenue (completed)','revenueCents'),financial('Refunds (completed orders)','completedRefundCents'),financial('Estimated production (completed)','productionCostCents'),financial('Estimated shipping (completed)','shippingCostCents'),financial('Transaction fees (completed)','transactionFeeCents'),financial('Channel fees (completed)','channelFeeCents'),{label:'Estimated contribution (completed)',value:financialComplete?s.contributionCents:null,format:'money'},financial('Refunds (all orders; informational)','refundCents'),financial('Average gross order value','averageOrderValueCents')],
  series:[series('Recognized revenue per source order minute','revenueCents',true),series('Completed-order refunds per source minute','refundCents',true),series('Estimated production per source minute','productionCostCents',true),series('Estimated shipping per source minute','shippingCostCents',true),series('Fees per source minute','feesCents',true),series('Estimated contribution per source minute','contributionCents',true)],
  sections:[{title:'Product performance from owner Sales',value:s?.products??null},{title:'Owner Sales source receipt and full summary',value:{receipt:active?.lastSourceReceipt??null,summary:s??null}}]
 },{title:'Inventory & dataset evidence',currency:'USD',description:'Authoritative module observations remain in independent module databases. Synthetic resets affect only the selected simulation dataset and epoch.',metrics:[],sections:[{title:'Stock Ledger availability',value:active?.lastStockSummary??null},{title:'Bounded dataset state',value:{datasetId:active?.id??null,runId:active?.runId??null,scenario:active?.scenario??null,state:active?.state??null,maximumOrders:limit,generatedIntents:active?.eventIndex??0}}]}],records:[],updatedAt:new Date().toISOString()};
}
