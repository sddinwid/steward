import {z} from 'zod';
import {SIMULATION_SCENARIOS} from '@steward/module-sdk';
import {canonicalBusinessPayload,sourceReference,formatMoneyCents} from './business-analysis.js';
import {commerceProjectionSchema} from './commerce-analysis.js';

const money=z.number().int().nonnegative().max(1e12);
const quote=z.object({sku:z.string().min(1).max(80),logicalProduct:z.string().min(1).max(80),variant:z.enum(['standard','premium']),sourceVariantId:z.string().max(120),name:z.string().max(120),quantity:money,unitQuoteCents:money,currency:z.literal('USD'),supplier:z.string().max(120),minimumUnits:money,pooledThresholdUnits:money,pooledDiscountBasisPoints:z.number().int().min(0).max(10000),standaloneShippingCents:money,pooledShippingCents:money,transitionCostCents:money}).strict();
export const simulationRunSchema=z.object({contractVersion:z.literal(1),approved:z.boolean(),datasetId:z.string().uuid(),runId:z.string().uuid().nullable(),ecosystemId:z.string().uuid(),label:z.string().min(1).max(80),scenario:z.enum(SIMULATION_SCENARIOS),seed:z.number().int().min(0).max(0xffffffff),state:z.enum(['stopped','starting','running','paused','resetting','error']),speed:z.number().int().min(1).max(600),eventsPerMinute:z.number().int().min(1).max(120),generatedIntents:money,currency:z.literal('USD'),updatedAt:z.string().datetime({offset:true}),lastObservedAt:z.string().datetime().nullable(),catalog:z.array(quote).max(12)}).strict();
const exact=(value:bigint)=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('SIMULATION_CALCULATION_EXCEEDS_EXACT_BOUNDS');return n;};
type Row=Record<string,any>;
export function simulationEvidence(records:Row[]){
 const runs=records.filter(r=>r.stream_id==='simulation_runs').flatMap(row=>{const p=simulationRunSchema.safeParse(canonicalBusinessPayload(row));return p.success&&p.data.approved&&p.data.runId?[{row,p:p.data}]:[];});
 // Both owner publications must remain approved. Reset/withdrawal removes the
 // current cohort; retained sync envelopes remain historical evidence.
 const orders=records.filter(r=>r.stream_id==='commerce_orders').flatMap(row=>{const p=commerceProjectionSchema.safeParse(canonicalBusinessPayload(row));if(!p.success||!p.data.simulation||p.data.currency!=='USD')return[];const s=p.data.simulation;const owner=runs.find(r=>r.row.installation_id===row.installation_id&&r.row.entity_id===row.entity_id&&r.p.datasetId===s.datasetId&&r.p.runId===s.runId&&r.p.ecosystemId===s.ecosystemId);return owner?[{row,p:p.data,owner}]:[];});
 return{runs,orders};
}

/** No engine counters enter financial totals. All amounts come from owner Sales projections. */
export function simulationDashboard(records:Row[],now=Date.now()){
 const {runs,orders}=simulationEvidence(records);
 const companies=runs.map(run=>{
  const cohort=orders.filter(o=>o.owner===run),completed=cohort.filter(o=>o.p.status==='fulfilled');
  const sum=(rows:typeof orders,key:string)=>exact(rows.reduce((n,o)=>n+BigInt((o.p as any)[key]??0),0n));
  const revenueCents=sum(completed,'recognizedRevenueCents'),refundCents=sum(cohort,'refundCents');
  const costsComplete=completed.every(o=>o.p.productionCostCents!==null&&o.p.shippingCostCents!==null&&o.p.financials?.transactionFeeCents!==null&&o.p.financials?.transactionFeeCents!==undefined&&o.p.financials?.channelFeeCents!==null&&o.p.financials?.channelFeeCents!==undefined);
  const productionCostCents=costsComplete?sum(completed,'productionCostCents'):null,shippingCostCents=costsComplete?sum(completed,'shippingCostCents'):null;
  const fees=costsComplete?exact(completed.reduce((n,o)=>n+BigInt(o.p.financials!.transactionFeeCents!)+BigInt(o.p.financials!.channelFeeCents!),0n)):null;
  const contributionCents=costsComplete?exact(BigInt(revenueCents)-BigInt(sum(completed,'refundCents'))-BigInt(productionCostCents!)-BigInt(shippingCostCents!)-BigInt(fees!)):null;
  const buckets=new Map<string,{at:string;orders:number;revenueCents:number}>();
  for(const o of cohort){const at=new Date(Math.floor(Date.parse(o.p.orderCreatedAt)/60000)*60000).toISOString(),b=buckets.get(at)??{at,orders:0,revenueCents:0};b.orders++;b.revenueCents=exact(BigInt(b.revenueCents)+BigInt(o.p.recognizedRevenueCents));buckets.set(at,b);}
  return{entityId:run.row.entity_id,installationId:run.row.installation_id,datasetId:run.p.datasetId,runId:run.p.runId,ecosystemId:run.p.ecosystemId,label:run.p.label,scenario:run.p.scenario,state:run.p.state,speed:run.p.speed,currency:'USD',generatedIntents:run.p.generatedIntents,orders:cohort.length,completedOrders:completed.length,awaitingFulfillment:cohort.filter(o=>!['fulfilled','canceled'].includes(o.p.status)).length,exceptions:cohort.filter(o=>o.p.stockout||o.p.simulationState?.reservationFailure||o.p.productionStatus==='failed').length,revenueCents,refundCents,productionCostCents,shippingCostCents,contributionCents,costBasis:costsComplete?'estimated':'incomplete',series:[...buckets.values()].sort((a,b)=>a.at.localeCompare(b.at)).slice(-120),freshness:{sourceAt:run.row.source_at,ingestedAt:run.row.ingested_at,ageSeconds:Math.max(0,Math.floor((now-Date.parse(run.row.ingested_at))/1000)),lastSalesReceiptAt:run.p.lastObservedAt},reference:sourceReference(run.row),orderReferences:cohort.slice(-20).map(o=>sourceReference(o.row))};
 });
 const sum=(key:string)=>exact(companies.reduce((n,c)=>n+BigInt((c as any)[key]??0),0n)),complete=companies.every(c=>c.costBasis!=='incomplete');
 const combined={entities:new Set(companies.map(c=>c.entityId)).size,datasets:companies.length,orders:sum('orders'),completedOrders:sum('completedOrders'),awaitingFulfillment:sum('awaitingFulfillment'),exceptions:sum('exceptions'),revenueCents:sum('revenueCents'),refundCents:sum('refundCents'),productionCostCents:complete?sum('productionCostCents'):null,shippingCostCents:complete?sum('shippingCostCents'):null,contributionCents:complete?sum('contributionCents'):null,currency:'USD'};
 return{currency:'USD',authoritative:false,decisionExecuted:false,combined,companies,opportunities:purchasingOpportunities(records),updatedAt:new Date(now).toISOString(),assumptions:['Synthetic business activity only; no commercial purchase or intercompany agreement executed.','Financial totals use completed source orders; all-order refunds are shown separately. Incomplete costs remain unknown.','Costs and quotes are simulated estimates; historical currencies are never converted or combined.']};
}

/** Exact external-cost comparison. Internal transfers are zero and never counted as ecosystem savings. */
export function purchasingOpportunities(records:Row[]){
 const {orders}=simulationEvidence(records),groups=new Map<string,{entityId:string;run:any;quote:z.infer<typeof quote>;quantity:bigint;sources:Row[]}[]>();
 for(const o of orders.filter(o=>o.p.status!=='canceled').sort((a,b)=>b.p.orderCreatedAt.localeCompare(a.p.orderCreatedAt)||a.row.record_id.localeCompare(b.row.record_id)))for(const line of o.p.products){
  const q=o.owner.p.catalog.find(q=>q.sku===line.sku&&q.sourceVariantId===line.sourceVariantId);if(!q)continue;
  const key=[o.owner.p.ecosystemId,q.supplier,q.logicalProduct,q.variant].join(':');const list=groups.get(key)??[];
  let contribution=list.find(v=>v.entityId===o.row.entity_id&&v.run.p.runId===o.owner.p.runId);if(!contribution){contribution={entityId:o.row.entity_id,run:o.owner,quote:q,quantity:0n,sources:[]};list.push(contribution);}if(contribution.sources.length>=4)continue;contribution.quantity+=BigInt(line.quantity);contribution.sources.push(o.row);groups.set(key,list);
 }
 const opportunities=[];
 for(const [key,cohort]of groups){
  // One independently authorized dataset per entity, no accidental cross-run blending.
  if(cohort.length<2||cohort.length>4||new Set(cohort.map(v=>v.entityId)).size!==cohort.length)continue;
  const q=cohort[0]!.quote,terms=['supplier','logicalProduct','variant','minimumUnits','pooledThresholdUnits','pooledDiscountBasisPoints','standaloneShippingCents','pooledShippingCents','transitionCostCents'] as const;
  if(cohort.some(v=>terms.some(k=>v.quote[k]!==q[k])||v.quantity<BigInt(q.minimumUnits)))continue;
  const total=cohort.reduce((n,v)=>n+v.quantity,0n);if(total<BigInt(q.pooledThresholdUnits))continue;
  const pooledUnit=BigInt(Math.max(...cohort.map(v=>v.quote.unitQuoteCents)))*BigInt(10000-q.pooledDiscountBasisPoints)/10000n;
  const shipping=BigInt(q.pooledShippingCents);let allocatedShipping=0n;
  const sorted=cohort.slice().sort((a,b)=>a.entityId.localeCompare(b.entityId));
  const impacts=sorted.map((v,i)=>{const share=i===sorted.length-1?shipping-allocatedShipping:shipping*v.quantity/total;allocatedShipping+=share;
   const baseline=v.quantity*BigInt(v.quote.unitQuoteCents)+BigInt(v.quote.standaloneShippingCents),proposed=v.quantity*pooledUnit+share+BigInt(v.quote.transitionCostCents);
   return{entityId:v.entityId,quantity:exact(v.quantity),baselineExternalCents:exact(baseline),pooledMerchandiseCents:exact(v.quantity*pooledUnit),allocatedShippingCents:exact(share),transitionCostCents:v.quote.transitionCostCents,proposedCostCents:exact(proposed),benefitCents:exact(baseline-proposed)};
  });
  const baseline=impacts.reduce((n,v)=>n+BigInt(v.baselineExternalCents),0n),proposed=impacts.reduce((n,v)=>n+BigInt(v.proposedCostCents),0n),benefit=baseline-proposed;
  opportunities.push({key,runIds:sorted.map(v=>v.run.p.runId),ecosystemId:cohort[0]!.run.p.ecosystemId,logicalProduct:q.logicalProduct,variant:q.variant,supplier:q.supplier,currency:'USD',quantity:exact(total),pooledUnitQuoteCents:exact(pooledUnit),baselineExternalCents:exact(baseline),proposedCostCents:exact(proposed),ecosystemBenefitCents:exact(benefit),internalTransferCents:0,impacts,displayAmounts:{baseline:formatMoneyCents(exact(baseline),'USD'),proposed:formatMoneyCents(exact(proposed),'USD'),benefit:formatMoneyCents(exact(benefit),'USD')},supportingReferences:[...cohort.map(v=>sourceReference(v.run.row)),...cohort.flatMap(v=>v.sources.map(sourceReference))],affectedEntities:sorted.map(v=>v.entityId),basis:'estimated',assumptions:['Cohort is the most recent four eligible source orders per entity/product/variant, for two to four distinct entities; not a complete census or demand forecast.','Counterfactual repeat purchase of the observed noncanceled demand cohort, not a new commitment or a second recognition of historical profit.','Synthetic catalog terms are estimates. Specifications, timing, taxes, supplier approval and separate entity consent require human review.','Pooled unit quote uses the highest observed eligible quote before the declared discount. Shipping is quantity-allocated with exact remainder assigned to the last entity.','Only external supplier costs, shipping and transition expense enter ecosystem benefit; no intercompany revenue or transfer is counted.'],decisionExecuted:false});
 }
 return opportunities;
}
