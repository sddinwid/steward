import {ensure,get,records,save,resetSimulationDataset,type Definition,type Data,type Context} from '@steward/business-kit';

const number=(n:bigint)=>{const value=Number(n);ensure(Number.isSafeInteger(value),'Simulation calculation exceeds exact bounds');return value;};
function scope(ctx:Context,payload:Data){ensure(ctx.simulation&&ctx.config.simulationEnabled===true,'SIMULATION_SALES_NOT_ENABLED',403);ctx.config={...ctx.config,currency:'USD',integrationsEnabled:true};if(payload.datasetId)ensure(payload.datasetId===ctx.simulation.datasetId&&payload.runId===ctx.simulation.runId,'SIMULATION_DATASET_SCOPE_MISMATCH',403);}
/** These operations call the real Sales domain actions; they do not bypass them. */
export function simulationSales(definition:Definition):Definition {
 definition.queries=[...(definition.queries??[]),{path:'/simulation-datasets',run:async ctx=>({records:(await ctx.db.query("SELECT data->'simulation'->>'datasetId' id,count(*)::integer AS records FROM business_records WHERE data ? 'simulation' GROUP BY 1 ORDER BY 1 LIMIT 10")).rows})}];
 const actions=definition.actions.map(a=>({...a,run:a.run}));definition.actions=actions.map(a=>({...a,run:async(record,ctx)=>{if(record.data.simulation)scope(ctx,{});return a.run(record,ctx);}}));
 const ordinary=definition.receive!;
 definition.receive=async(command,ctx)=>{
  const b=command.payload as Record<string,any>;
  if(command.command.startsWith('simulation.')){
   scope(ctx,b);
   if(command.command==='simulation.dataset.begin')return{begun:true};
   if(command.command==='simulation.dataset.reset')return resetSimulationDataset(ctx,b);
   if(command.command==='simulation.sales.observe')return observeSimulationSales(ctx);
   const order=await get(ctx,'order',b.orderId);ensure(order.data.simulation,'SIMULATION_ORDER_REQUIRED',403);
   if(command.command==='simulation.sales.inspect')return{orderId:order.id,status:order.data.status,stockStatus:order.data.stockStatus,productionStatus:order.data.productionStatus??null,error:order.data.reservationFailure??null};
   ensure(command.command==='simulation.sales.advance','Unsupported simulation service operation',403);
   const paths:Record<string,string>={confirm:'/confirm/:id','request-production':'/production/:id',publish:'/publish-commerce/:id',cancel:'/cancel/:id'};
   if(b.action==='publish')ensure(ctx.config.simulationPublicationEnabled===true,'SIMULATION_PUBLICATION_NOT_APPROVED',403);
   const action=definition.actions.find(a=>a.path===paths[b.action]);ensure(action,'Unsupported simulation Sales action',403);
   await action.run(order,ctx);const current=await get(ctx,'order',order.id);return{orderId:current.id,status:current.data.status};
  }
  if(ctx.simulation)scope(ctx,b);
  const result=await ordinary(command,ctx);
  if(ctx.simulation){
   const id=command.command==='commerce.order.import'?result.orderId:command.command==='fulfillment.progress'?b.orderId:null;
   if(id){const order=await get(ctx,'order',id),gross=number(order.data.sourceLines.reduce((n:bigint,l:Data)=>n+BigInt(l.lineRevenueCents),0n));await save(ctx,'order',order.key,{...order.data,financials:{productionCostCents:order.data.productionCostCents??null,shippingCostCents:order.data.shippingCostCents??null,transactionFeeCents:number(BigInt(gross)*300n/10000n)+30,channelFeeCents:0,basis:'estimated',reference:'simulation:'+ctx.simulation.runId+':declared-fee-policy'}},order);}
  }
  return result;
 };
 return definition;
}
export async function observeSimulationSales(ctx:Context){
 const s=ctx.simulation!;const orders=(await records(ctx,'order')).filter(r=>r.data.simulation?.datasetId===s.datasetId&&r.data.simulation?.runId===s.runId);
 const completed=orders.filter(r=>r.data.status==='fulfilled'),gross=(r:Data)=>r.data.sourceLines.reduce((n:bigint,l:Data)=>n+BigInt(l.lineRevenueCents),0n),sum=(rows:Data[],f:(r:Data)=>bigint)=>number(rows.reduce((n,r)=>n+f(r),0n));
 const revenueCents=sum(completed,gross),refundCents=sum(orders,r=>BigInt(r.data.refundCents??0)),completeCosts=completed.every(r=>Number.isSafeInteger(r.data.productionCostCents)&&Number.isSafeInteger(r.data.shippingCostCents)&&Number.isSafeInteger(r.data.financials?.transactionFeeCents));
 const productionCostCents=completeCosts?sum(completed,r=>BigInt(r.data.productionCostCents)):null,shippingCostCents=completeCosts?sum(completed,r=>BigInt(r.data.shippingCostCents)):null;
 const completedRefunds=sum(completed,r=>BigInt(r.data.refundCents??0)),fees=completeCosts?sum(completed,r=>BigInt(r.data.financials.transactionFeeCents)):null;
 const products=[...new Set(orders.flatMap(r=>r.data.sourceLines.map((l:Data)=>l.sku)))].map(sku=>{let ordered=0n,fulfilled=0n,revenue=0n;for(const r of orders)for(const l of r.data.sourceLines.filter((l:Data)=>l.sku===sku)){const n=BigInt(r.data.fulfilled?.[sku as string]??0);ordered+=BigInt(l.quantity);fulfilled+=n;revenue+=BigInt(l.lineRevenueCents)*n/BigInt(l.quantity);}return{sku,orderedQuantity:number(ordered),fulfilledQuantity:number(fulfilled),revenueCents:number(revenue)};});
 const buckets=new Map<string,{at:string;orders:number;completedOrders:number;revenueCents:number}>();
 for(const r of orders){const at=new Date(Math.floor(Date.parse(String(r.data.createdAt))/60000)*60000).toISOString(),bucket=buckets.get(at)??{at,orders:0,completedOrders:0,revenueCents:0};bucket.orders++;if(r.data.status==='fulfilled'){bucket.completedOrders++;bucket.revenueCents=number(BigInt(bucket.revenueCents)+gross(r));}buckets.set(at,bucket);}
 return{datasetId:s.datasetId,runId:s.runId,orderCount:orders.length,awaitingFulfillment:orders.filter(r=>!['fulfilled','canceled'].includes(r.data.status)).length,completedOrders:completed.length,canceledOrders:orders.filter(r=>r.data.status==='canceled').length,revenueCents,refundCents,productionCostCents,shippingCostCents,contributionCents:completeCosts?number(BigInt(revenueCents)-BigInt(completedRefunds)-BigInt(productionCostCents!)-BigInt(shippingCostCents!)-BigInt(fees!)):null,exceptions:orders.filter(r=>r.data.stockStatus==='rejected'||r.data.reservationFailure||r.data.productionStatus==='failed'||r.data.reservationEvidence?.some((l:Data)=>l.reserved<l.requested)).length,averageOrderValueCents:orders.length?number(orders.reduce((n,r)=>n+gross(r),0n)/BigInt(orders.length)):0,sourceIds:orders.map(r=>r.id),products,series:[...buckets.values()].sort((a,b)=>a.at.localeCompare(b.at)).slice(-120),observedAt:new Date().toISOString()};
}

