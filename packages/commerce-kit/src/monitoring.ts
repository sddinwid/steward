import {records,find,save,type Context,type Data} from '@steward/business-kit';
import {canonical,digest} from '@steward/module-sdk';
export async function connectorConditions(ctx:Context,provider:'shopify'|'printify'){
 const issues:Data[]=[];
 const add=(r:Data,code:string,explanation:string,severity='warning')=>issues.push({sourceId:r.id,order:r.key,code,explanation,severity});
 const mappings=await records(ctx,'mapping'),channelJobs=await records(ctx,'channel-job');
 if(provider==='shopify'){
  for(const r of await records(ctx,'order')){
   const d=r.data;if(d.canceled)continue;
   if(['paid','partially_refunded'].includes(d.financialStatus)&&!d.dispatchEnabled&&!d.nativeFulfillment)add(r,'fulfillment_owner_unknown','Paid order has no confirmed fulfillment owner. Explicit ownership review is required.');
   if(d.lines.some((l:Data)=>!mappings.some(m=>m.data.sourceVariantId===l.sourceVariantId)))add(r,'mapping_missing','One or more source variants lack an explicit local SKU mapping.');
   if(d.dispatchEnabled&&(d.fulfillments??[]).some((f:Data)=>f.status==='SUCCESS'&&!(f.trackingInfo??[]).some((t:Data)=>channelJobs.some(j=>j.data.input.sourceId===d.sourceId&&j.data.input.tracking===t.number))))add(r,'fulfillment_conflict','An external fulfillment is not matched to the authorized Steward tracking receipt. Reconcile ownership before another submission.','critical');
   if(d.dispatchStatus==='rejected')add(r,'order_import_rejected','The authorized Sales provider rejected this order; inspect its delivery receipt.');
   if(d.fulfillmentOrders?.length>1&&!d.dispatchEnabled)add(r,'fulfillment_ownership_review','Multiple fulfillment orders require ownership review before Steward dispatch.');
  }
  for(const r of await records(ctx,'channel-job'))if(r.data.status==='uncertain')add(r,'fulfillment_uncertain','Channel fulfillment outcome is uncertain. Reconcile tracking and provider receipts; do not resubmit.','critical');
 }else{
  for(const r of await records(ctx,'job')){
   const d=r.data;if(d.status==='canceled')continue;
   if(d.status==='awaiting_authorization')add(r,'production_authorization','Production requires explicit Worker-local administrator approval.');
   if(d.status==='uncertain'||d.error)add(r,'production_reconciliation','Production has an error or uncertain outcome. Reconcile with the original provider before any retry.','critical');
   if(['authorized','pending','in_production','issuing'].includes(d.status)&&Date.now()-Date.parse((r as Data).created_at)>48*3600000)add(r,'production_delayed','Production remains incomplete more than 48 hours after the local intent. Check the original provider before acting.');
   if(d.status==='failed')add(r,'production_failed','Production failed; inspect the provider status and original submission receipt.','critical');
   if(d.productionCostCents===null||d.shippingCostCents===null)add(r,'costs_incomplete','Supplier production or shipping cost is missing; profitability is incomplete.');
   if(d.lines.some((l:Data)=>!mappings.some(m=>m.key===l.sku)))add(r,'mapping_missing','A required SKU has no explicit supplier product/variant mapping.');
  }
 }
 return issues;
}
/** Persist stable, privacy-limited observations through existing signed replication streams. */
export async function publishConnectorConditions(ctx:Context,provider:'shopify'|'printify'){
 const issues=await connectorConditions(ctx,provider),keys=new Set<string>();
 for(const issue of issues){const key=digest(issue.sourceId+':'+issue.code),old=await find(ctx,'commerce-condition',key);keys.add(key);const data={contractVersion:1,approved:ctx.config.publishOperationalAlerts===true,active:true,...issue};if(!old||canonical(old.data)!==canonical(data))await save(ctx,'commerce-condition',key,data,old);}
 for(const old of await records(ctx,'commerce-condition'))if(!keys.has(old.key)){const data={...old.data,active:false,approved:ctx.config.publishOperationalAlerts===true};if(canonical(old.data)!==canonical(data))await save(ctx,'commerce-condition',old.key,data,old);}
}
