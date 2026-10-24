import {ensure,find,save,records,publicRecord,object,text,amount,type Definition,type Data} from '@steward/business-kit';
import {validateCapabilityValue,type ModulePackageManifest} from '@steward/module-sdk';
import {contracts} from '@steward/commerce-kit';
/** Independent record-ledger implementation of the same stock contract as Inventory. */
export function stockLedger(manifest:ModulePackageManifest):Definition{return{manifest,resources:[{kind:'item',path:'/items',key:'sku',schema:object({sku:text(80),name:text(),quantity:amount}),prepare:async(data,old,ctx)=>{
 const held=(await records(ctx,'reservation')).flatMap(r=>r.data.lines).filter(l=>l.sku===data.sku).reduce((n,l)=>n+l.quantity,0);ensure(data.quantity>=held,'Quantity cannot be below outstanding reservations');return data;
}}],actions:[],queries:[{path:'/reservations',run:async ctx=>({records:(await records(ctx,'reservation')).slice(0,20).map(publicRecord)})}],receive:async(command,ctx)=>{
 const op=contracts.stock!.operations.find(o=>o.name===command.command);ensure(op,'Unsupported stock operation',403);validateCapabilityValue(command.payload,op.input);
 const b=command.payload;ensure(b.orderId===command.aggregateId,'Reservation aggregate mismatch',403);const key=command.sourceModuleId+':'+b.orderId,previous=await find(ctx,'reservation',key);
 if(command.command==='stock.release'){if(previous)await save(ctx,'reservation',key,{...previous.data,lines:[],status:'released'},previous);return{orderId:b.orderId,released:true};}
 const lines=b.lines as Data[];ensure(new Set(lines.map(l=>l.sku)).size===lines.length,'Repeated SKU');
 if(command.command==='stock.reserve'){
  ensure(!previous,'Reservation already exists',409);const reservations=await records(ctx,'reservation'),result=[];
  for(const l of lines){const item=await find(ctx,'item',l.sku);ensure(item,'Unknown stock SKU');const held=reservations.flatMap(r=>r.data.lines).filter(v=>v.sku===l.sku).reduce((n,v)=>n+v.quantity,0),available=Math.floor(item.data.quantity-held),reserved=Math.min(available,l.quantity);ensure(reserved>=0,'Invalid stock balance');result.push({sku:l.sku,requested:l.quantity,availableBefore:available,reserved});}
  await save(ctx,'reservation',key,{orderId:b.orderId,lines:result.map(l=>({sku:l.sku,quantity:l.reserved})),status:'reserved'});return{orderId:b.orderId,lines:result};
 }
 ensure(command.command==='stock.consume'&&previous,'Reservation required',409);
 for(const l of lines){const held=previous.data.lines.find((v:Data)=>v.sku===l.sku);ensure(held&&held.quantity>=l.quantity,'Consumption exceeds reservation',409);}
 for(const l of lines){const item=(await find(ctx,'item',l.sku))!;await save(ctx,'item',item.key,{...item.data,quantity:item.data.quantity-l.quantity},item);previous.data.lines.find((v:Data)=>v.sku===l.sku).quantity-=l.quantity;}
 await save(ctx,'reservation',key,previous.data,previous);return{orderId:b.orderId,fulfillmentId:b.fulfillmentId,applied:true};
}};}
