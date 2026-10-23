import {ensure,find,get,save,records,enqueue,publicRecord,object,text,amount,lines,uniqueLines,centsTotal,type Definition,type Context,type RecordValue,type Data} from '@steward/business-kit';
import type {ModulePackageManifest} from '@steward/module-sdk';
export function sales(manifest:ModulePackageManifest):Definition{return{manifest,resources:[
 {kind:'customer',path:'/customers',key:'code',schema:object({code:text(60),name:text(),reference:text(120)})},
 {kind:'order',path:'/orders',key:'number',schema:object({number:text(80),customerCode:text(60),currency:text(3),lines:lines()}),prepare:async(b,p,ctx)=>{
  ensure(!p||p.data.status==='draft','Only draft sales orders can be edited');ensure(await find(ctx,'customer',b.customerCode),'Unknown customer');ensure(b.currency===ctx.config.currency,'Currency differs from configured currency');uniqueLines(b.lines);centsTotal(b.lines);return{...b,status:'draft',stockStatus:'not_requested',reserved:{},fulfilled:{},reservationFailure:null};
 }},
 {kind:'fulfillment',path:'/fulfillments',key:'number',schema:object({number:text(80),orderNumber:text(80),lines:lines(false)}),prepare:async(b,p,ctx)=>{
  ensure(!p,'Fulfillment records are immutable');uniqueLines(b.lines);const order=await find(ctx,'order',b.orderNumber);ensure(order&&['confirmed','partially_fulfilled'].includes(order.data.status),'Order must be confirmed before fulfillment');
  ensure(order.data.stockStatus!=='pending'&&order.data.stockStatus!=='rejected','Inventory reservation is not ready');
  const pending=(await records(ctx,'fulfillment')).filter(v=>v.data.orderNumber===order.key&&v.data.status==='pending');ensure(pending.length===0,'An earlier fulfillment is awaiting Inventory acknowledgment',409);
  for(const line of b.lines){const original=order.data.lines.find((v:Data)=>v.sku===line.sku);ensure(original&&line.quantity<=original.quantity-(Object.hasOwn(order.data.fulfilled,line.sku)?order.data.fulfilled[line.sku]:0),'Fulfillment exceeds outstanding order quantity');if(ctx.config.integrationsEnabled)ensure(line.quantity<=(Object.hasOwn(order.data.reserved,line.sku)?order.data.reserved[line.sku]:0),'Insufficient reserved stock');}
  return{...b,status:ctx.config.integrationsEnabled?'pending':'completed'};
 },after:async(r,_p,ctx)=>{const order=(await find(ctx,'order',r.data.orderNumber))!;if(ctx.config.integrationsEnabled)await enqueue(ctx,'cee.inventory','stock.consume',order.id,{orderId:order.id,fulfillmentId:r.id,lines:r.data.lines});else await complete(ctx,order,r.data.lines);}}
],actions:[
 {path:'/confirm/:id',permission:'cee.sales.write',kind:'order',run:async(r,ctx)=>{
  ensure(r.data.status==='draft','Only a draft order can be confirmed');const active=ctx.config.integrationsEnabled===true;const updated=await save(ctx,'order',r.key,{...r.data,status:'confirmed',stockStatus:active?'pending':'not_requested'},r);if(active)await enqueue(ctx,'cee.inventory','stock.reserve',r.id,{orderId:r.id,lines:r.data.lines.map((v:Data)=>({sku:v.sku,quantity:v.quantity}))});return{record:publicRecord(updated)};
 }},
 {path:'/cancel/:id',permission:'cee.sales.write',kind:'order',run:async(r,ctx)=>{
  ensure(['draft','confirmed','partially_fulfilled'].includes(r.data.status),'Order cannot be canceled');ensure(!(await records(ctx,'fulfillment')).some(v=>v.data.orderNumber===r.key&&v.data.status==='pending'),'Cannot cancel while a fulfillment is pending',409);
  const release=ctx.config.integrationsEnabled&&r.data.stockStatus!=='not_requested';if(release)await enqueue(ctx,'cee.inventory','stock.release',r.id,{orderId:r.id});return{record:publicRecord(await save(ctx,'order',r.key,{...r.data,status:'canceled',stockStatus:release?'release_pending':r.data.stockStatus},r))};
 }}
],acknowledge:async(command,status,result,ctx)=>{
 const order=await get(ctx,'order',command.aggregateId);
 if(command.command==='stock.reserve'){
  const reserved=Object.create(null);if(status==='delivered'){ensure(Array.isArray(result.lines),'Invalid reservation acknowledgment');for(const line of result.lines){ensure(typeof line.sku==='string'&&Number.isSafeInteger(line.reserved)&&line.reserved>=0,'Invalid reservation result');reserved[line.sku]=line.reserved;}}
  await save(ctx,'order',order.key,{...order.data,reserved,stockStatus:order.data.status==='canceled'?'release_pending':status==='delivered'?'reserved':'rejected',reservationFailure:status==='rejected'?'Inventory rejected reservation':null},order);
 }else if(command.command==='stock.release')await save(ctx,'order',order.key,{...order.data,reserved:status==='delivered'?{}:order.data.reserved,stockStatus:status==='delivered'?'released':'release_rejected'},order);
 else if(command.command==='stock.consume'){
  const fulfillment=await get(ctx,'fulfillment',String(command.payload.fulfillmentId));await save(ctx,'fulfillment',fulfillment.key,{...fulfillment.data,status:status==='delivered'?'completed':'rejected'},fulfillment);
  if(status==='delivered')await complete(ctx,order,fulfillment.data.lines);
 }
},report:async ctx=>{
 const orders=await records(ctx,'order');let revenueCents=0;for(const order of orders)for(const line of order.data.lines)revenueCents+=(Object.hasOwn(order.data.fulfilled,line.sku)?order.data.fulfilled[line.sku]:0)*line.unitPriceCents;
 ensure(Number.isSafeInteger(revenueCents),'Revenue exceeds supported bounds');return{currency:ctx.config.currency,revenueCents,orderCount:orders.length,outstandingOrders:orders.filter(v=>['confirmed','partially_fulfilled'].includes(v.data.status)).slice(0,20).map(v=>({number:v.key,status:v.data.status,stockStatus:v.data.stockStatus})),records:[],source:'Completed fulfillment quantities multiplied by actual order prices; pending or rejected deliveries are excluded'};
}};}
async function complete(ctx:Context,order:RecordValue,lines:Data[]){
 const fulfilled=Object.assign(Object.create(null),order.data.fulfilled),reserved=Object.assign(Object.create(null),order.data.reserved);
 for(const line of lines){fulfilled[line.sku]=(fulfilled[line.sku]??0)+line.quantity;if(ctx.config.integrationsEnabled)reserved[line.sku]=(reserved[line.sku]??0)-line.quantity;}
 const all=order.data.lines.every((v:Data)=>fulfilled[v.sku]===v.quantity);await save(ctx,'order',order.key,{...order.data,fulfilled,reserved,status:all?'fulfilled':'partially_fulfilled'},order);
}
