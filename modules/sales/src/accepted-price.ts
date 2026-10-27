import {ensure,find,save,object,text,amount,quantity,uniqueLines,centsTotal,type Context,type Data,type RecordValue,type Resource} from '@steward/business-kit';
import {canonical,digest,type IntegrationCommand} from '@steward/module-sdk';

/** Sales-owned acceptance proof. An observation is never an acceptance receipt. */
export interface SalesAcceptedPrice {
 contractVersion:1;
 mode:'manual'|'external'|'governed'|'legacy-receipt'|'reviewed-reconciliation';
 currency:string;
 lines:Data[];
 actor:string;
 recordedAt:string;
 proof:Data;
}
export function acceptanceLines(data:Data):Data[]{
 const lines=data.channel?data.sourceLines:data.lines.map((l:Data)=>({...l,lineRevenueCents:Number(BigInt(l.quantity)*BigInt(l.unitPriceCents))}));
 ensure(Array.isArray(lines)&&lines.length>0,'Accepted merchandise lines unavailable',409);
 for(const l of lines){ensure(Number.isSafeInteger(l.quantity)&&l.quantity>0&&Number.isSafeInteger(l.unitPriceCents)&&l.unitPriceCents>=0&&Number.isSafeInteger(l.lineRevenueCents)&&l.lineRevenueCents>=0&&BigInt(l.lineRevenueCents)<=BigInt(l.quantity)*BigInt(l.unitPriceCents),'Invalid accepted line money',422);}
 return lines;
}
export async function acceptPrice(ctx:Context,order:RecordValue):Promise<SalesAcceptedPrice>{
 const snapshot:SalesAcceptedPrice={contractVersion:1,mode:order.data.channel?'external':'manual',currency:order.data.currency,lines:acceptanceLines(order.data),actor:ctx.actor,recordedAt:new Date().toISOString(),proof:{kind:'authorized-confirmation',orderRevision:order.revision,ownProvider:ctx.providerIdentity??null,...(order.data.channel?{source:{moduleId:order.data.sourceModuleId,recordId:order.data.sourceId,revision:order.data.sourceUpdatedAt,provider:order.data.sourceProviderIdentity??null}}:{}),...(order.data.simulation?{simulation:order.data.simulation}:{})}};
 await ctx.db.query('INSERT INTO sales_accepted_prices(order_id,snapshot,digest) VALUES($1,$2,$3)',[order.id,snapshot,digest(canonical(snapshot))]);
 return snapshot;
}
export async function attachAccepted(ctx:Context,rows:RecordValue[]):Promise<RecordValue[]>{
 if(!rows.length)return rows;
 const snapshots=new Map((await ctx.db.query('SELECT order_id,snapshot FROM sales_accepted_prices WHERE order_id=ANY($1::uuid[])',[rows.map(r=>r.id)])).rows.map(r=>[r.order_id,r.snapshot]));
 return rows.map(r=>({...r,data:{...r.data,acceptedPrice:snapshots.get(r.id)??null}}));
}
export function knownLines(data:Data):Data[]|null{
 if(data.acceptedPrice)return data.acceptedPrice.lines;
 // Draft prices remain observations. Non-drafts require actual acceptance proof.
 return data.status==='draft'?acceptanceLines(data):null;
}
export async function recordSourceObservation(ctx:Context,command:IntegrationCommand){
 await ctx.db.query('INSERT INTO sales_source_observations(source_module,command_id,wire,digest,provider_identity) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_module,command_id) DO NOTHING',[command.sourceModuleId,command.commandId,command,digest(canonical(command)),(ctx as Context&{incomingProviderIdentity?:Data}).incomingProviderIdentity??null]);
}
export async function reconciliation(ctx:Context){
 const rows=await ctx.db.query("SELECT r.id,r.key AS number,r.data->>'currency' AS currency,r.data->>'status' AS status,a.snapshot IS NOT NULL AS \"priceKnown\",a.snapshot->>'mode' AS basis FROM business_records r LEFT JOIN sales_accepted_prices a ON a.order_id=r.id WHERE r.kind='order' AND r.data->>'status'<>'draft' ORDER BY r.key LIMIT 1001");
 ensure(rows.rows.length<=1000,'Narrow reconciliation scope',413);return{records:rows.rows,summary:'Unknown means no original confirmation receipt or reviewed acceptance proof. Current observations do not establish historical accepted revenue.'};
}
export const priceReconciliation:Resource={kind:'price-reconciliation',path:'/price-reconciliations',key:'number',schema:object({number:text(80),orderNumber:text(80),currency:text(3),lines:{type:'array',minItems:1,maxItems:40,items:object({sku:text(80),quantity,unitPriceCents:amount,lineRevenueCents:{type:'integer',minimum:0,maximum:100000000000000}})},evidenceReference:text(300),reason:text(1000)}),
 prepare:async(b,p,ctx)=>{ensure(!p,'Price reconciliation decisions are immutable',409);ensure(ctx.actor!=='module-runtime','Human reconciliation required',403);const order=await find(ctx,'order',b.orderNumber);ensure(order&&order.data.status!=='draft','Accepted order required',409);ensure(!(await ctx.db.query('SELECT 1 FROM sales_accepted_prices WHERE order_id=$1',[order.id])).rowCount,'Accepted price already established; original proof cannot be overwritten',409);ensure(order.data.currency===b.currency,'Reconciliation currency differs from original order',409);uniqueLines(b.lines);centsTotal(b.lines);acceptanceLines({channel:true,sourceLines:b.lines});ensure(canonical(b.lines.map((l:Data)=>({sku:l.sku,quantity:l.quantity,unitPriceCents:l.unitPriceCents})))===canonical(order.data.lines),'Reconciliation must preserve original merchandise quantities and gross unit prices',409);return{...b,actor:ctx.actor,recordedAt:new Date().toISOString(),basis:'Human-reviewed evidence recorded now; not a recovered original acceptance receipt'};},
 after:async(r,_p,ctx)=>{const order=(await find(ctx,'order',r.data.orderNumber))!;const snapshot:SalesAcceptedPrice={contractVersion:1,mode:'reviewed-reconciliation',currency:r.data.currency,lines:r.data.lines.map((l:Data)=>({...order.data.sourceLines?.find((s:Data)=>s.sku===l.sku),...l})),actor:ctx.actor,recordedAt:r.data.recordedAt,proof:{kind:'human-reviewed-evidence',reconciliationId:r.id,evidenceReference:r.data.evidenceReference,reason:r.data.reason}};await ctx.db.query('INSERT INTO sales_accepted_prices(order_id,snapshot,digest) VALUES($1,$2,$3)',[order.id,snapshot,digest(canonical(snapshot))]);await ctx.db.query('INSERT INTO sales_price_reconciliations(order_id,actor,decision) VALUES($1,$2,$3)',[order.id,ctx.actor,snapshot.proof]);await save(ctx,'order',order.key,{...order.data,priceReconciliationRequired:false},order);}
};
