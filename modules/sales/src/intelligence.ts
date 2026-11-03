import {attachAccepted,knownLines} from './accepted-price.js';
import {ensure,find,records,save,object,text,choice,type Context,type Data,type RecordValue} from '@steward/business-kit';
import {commerceIntelligence,commerceExceptions,cents,type CommerceFacts} from '@steward/commerce-kit';
export const financialAssessment = {
  kind:'financial-assessment',path:'/financial-assessments',key:'orderNumber',
  schema:object({orderNumber:text(80),currency:text(3),productionAmount:{type:'string',maxLength:18,pattern:'^(?:[0-9]+(?:\\.[0-9]{1,2})?)?$'},shippingAmount:{type:'string',maxLength:18,pattern:'^(?:[0-9]+(?:\\.[0-9]{1,2})?)?$'},transactionFeeAmount:{type:'string',maxLength:18,pattern:'^(?:[0-9]+(?:\\.[0-9]{1,2})?)?$'},channelFeeAmount:{type:'string',maxLength:18,pattern:'^(?:[0-9]+(?:\\.[0-9]{1,2})?)?$'},basis:choice(['known','estimated']),reference:text(300)}),
  prepare:async(b:Data,_p:RecordValue|null,ctx:Context)=>{const order=await find(ctx,'order',b.orderNumber);ensure(order?.data.channel,'A source-attributed commerce order is required');ensure(order.data.currency===b.currency,'Assessment currency differs from the order');return b;},
  after:async(r:RecordValue,_p:RecordValue|null,ctx:Context)=>{
    const order=(await find(ctx,'order',r.data.orderNumber))!;
    const value=(key:string)=>r.data[key]===''?null:cents(r.data[key]);
    await save(ctx,'order',order.key,{...order.data,financials:{productionCostCents:value('productionAmount'),shippingCostCents:value('shippingAmount'),transactionFeeCents:value('transactionFeeAmount'),channelFeeCents:value('channelFeeAmount'),basis:r.data.basis,reference:r.data.reference}},order);
  }
};
export function facts(r:RecordValue):CommerceFacts {
  const d=r.data;
  const accepted=knownLines(d);ensure(accepted,'Original accepted revenue requires reconciliation',409);
  const products=accepted.map((line:Data)=>{const fulfilledQuantity=d.fulfilled?.[line.sku]??0;return{sku:line.sku,quantity:line.quantity,unitPriceCents:line.unitPriceCents,lineRevenueCents:line.lineRevenueCents,fulfilledQuantity,recognizedRevenueCents:Number(BigInt(line.lineRevenueCents)*BigInt(fulfilledQuantity)/BigInt(line.quantity))};});
  return{sourceId:d.sourceModuleId+':'+d.sourceId,channel:d.channel,currency:d.currency,orderCreatedAt:d.createdAt,fulfilledAt:d.completedAt??null,status:d.status,productionStatus:d.productionStatus??null,recognizedRevenueCents:products.reduce((n:number,l:Data)=>n+l.recognizedRevenueCents,0),refundCents:d.refundCents??0,productionCostCents:d.productionCostCents??null,shippingCostCents:d.shippingCostCents??null,costBasis:d.costBasis??'incomplete',products,...(d.financials?{financials:d.financials}:{})};
}
export async function intelligence(ctx:Context,q:Record<string,string>={}) {
  const from=q.from??'1970-01-01T00:00:00.000Z',to=q.to??'9999-12-31T23:59:59.999Z';
  ensure(Number.isFinite(Date.parse(from))&&Number.isFinite(Date.parse(to))&&Date.parse(from)<Date.parse(to),'Invalid reporting period');
  const observed=(await ctx.db.query("SELECT * FROM business_records WHERE kind='order' AND data ? 'channel' AND (data->>'createdAt')::timestamptz >= $1::timestamptz AND (data->>'createdAt')::timestamptz < $2::timestamptz ORDER BY key LIMIT 10001",[from,to])).rows;
  const attached=await attachAccepted(ctx,observed),unknown=attached.filter(r=>!knownLines(r.data)),rows=attached.filter(r=>knownLines(r.data));
  ensure(attached.length<=10000,'Narrow the reporting period; more than 10000 source orders',413);
  const groups=commerceIntelligence(rows.map(facts));
  const limit=Number(q.limit??20),offset=Number(q.offset??0);ensure(Number.isInteger(limit)&&limit>=1&&limit<=20&&Number.isInteger(offset)&&offset>=0&&offset<=100000,'Invalid pagination',400);
  const sourceIndex=new Map(rows.map(r=>[facts(r).sourceId,r]));
  const result=groups.flatMap(g=>g.orders.map(o=>{const source=sourceIndex.get(o.sourceId)!;return{id:source.id,number:source.key,...o,exceptions:commerceExceptions(facts(source)),sourceReference:{moduleId:ctx.moduleId,streamId:'commerce_orders',recordId:source.id,revision:source.revision},products:g.products.filter(p=>source.data.sourceLines.some((l:Data)=>l.sku===p.sku))};}));
  return{unknownAcceptanceCount:unknown.length,coverage:unknown.length?'Known subtotal only; original accepted revenue requires reconciliation':'complete',records:result.slice(offset,offset+limit),summary:'Sales-owned source orders created in the selected UTC period. Monitored Shopify/Printify observations are separate; an empty Sales report does not mean the store has no orders. Costs and fees require evidence; blank amounts mean unknown. AOV uses non-canceled booked merchandise revenue. Contribution excludes overhead, tax and shipping income.',report:{version:2,period:{from,to,basis:'Order creation; from inclusive, to exclusive'},groups:groups.map(({orders,products,...summary})=>({...summary,title:summary.currency+' · Commerce overview',metrics:[['Gross sales',summary.grossSalesCents],['Booked merchandise revenue',summary.bookedRevenueCents],['Recognized revenue',summary.recognizedRevenueCents],['Average order value',summary.averageOrderValueCents],['Refunds',summary.refundCents],['Production expenses',summary.productionCostCents],['Shipping expenses',summary.shippingCostCents],['Contribution margin · '+summary.marginBasis,summary.contributionMarginCents]].map(([label,value])=>({label,value,format:'money',currency:summary.currency})),description:`${summary.orderVolume} orders · ${summary.canceledOrders} canceled · ${summary.refundedOrders} with refunds · ${summary.completeMarginOrders} with complete margin evidence`,sections:[{title:'Product and SKU performance',value:products.slice(0,20)}],productCount:products.length,products:products.slice(0,20),productSelection:'First 20 SKUs alphabetically; per-order rows are paginated separately'}))},total:result.length,nextOffset:offset+limit<result.length?offset+limit:null};
}
export async function exceptions(ctx:Context){
  const observed=(await attachAccepted(ctx,await records(ctx,'order'))).filter(r=>r.data.channel),unknown=observed.filter(r=>!knownLines(r.data)),rows=observed.filter(r=>knownLines(r.data));
  return{unknownAcceptanceCount:unknown.length,records:[...unknown.map(r=>({id:r.id+':unknown-acceptance',number:r.key,code:'unknown-acceptance',status:'reconciliation_required',message:'Original accepted revenue is unknown'})),...rows.flatMap(r=>commerceExceptions(facts(r)).map(issue=>({id:r.id+':'+issue.code,number:r.key,...issue,status:r.data.productionStatus??r.data.status})))],summary:'Read-only conditions. Reconcile uncertain submissions with their original provider; no automatic retry or production authorization is performed.'};
}
