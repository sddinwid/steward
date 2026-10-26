import { z } from 'zod';
import {compactScientificCalculation,compactScientificConstraints} from './scientific-context.js';
import {formatMoneyCents} from './business-analysis.js';

const missionAmount=(value:any,currency:unknown)=>Number.isSafeInteger(value)&&typeof currency==='string'&&/^[A-Z]{3}$/.test(currency)?formatMoneyCents(value,currency):'UNKNOWN';
export const missionAggregateFields=['domain','period','participantCounts','capacity','financials','review'] as const;
export const missionAggregateQuerySchema=z.object({limit:z.number().int().min(1).max(6).default(6),offset:z.number().int().min(0).max(1000).default(0),fields:z.array(z.enum(missionAggregateFields)).min(1).max(missionAggregateFields.length).optional()}).strict();
export function compactMissionAggregates(data:any){return{...data,records:data.records.map((row:any)=>{const r=row.release,fields=data.fields??missionAggregateFields,selected:any={};for(const field of fields){if(field==='period')selected.period={from:r.periodStart,to:r.periodEnd};else if(field==='financials')selected.financials=Object.fromEntries(Object.entries(r.financials).map(([k,v])=>k.endsWith('Cents')?['display'+k[0]!.toUpperCase()+k.slice(1,-5),missionAmount(v,r.financials.currency)]:[k,v]));else selected[field]=r[field];}return{reference:row.reference,programId:r.programId,suppressed:r.suppressed,synthetic:r.synthetic,...selected};}),evidenceRule:'Reviewed fixed releases only. Unknown/suppressed counts and capacities stay unknown; never reconstruct differences or sum people across modules. Full immutable source evidence is retained internally.'};}
/** Model-only transport views. Original immutable evidence/ACL references remain unchanged. */
export function compactMissionScenario(s:any){const{incrementalUnitCostCents,...rest}=s;return{...rest,displayIncrementalUnitCost:missionAmount(incrementalUnitCostCents,s.currency)};}
export function compactMissionCalculation(c:any):any{
 if(c.capabilityId==='steward.mission.scenario-comparison')return{capabilityId:c.capabilityId,version:c.version,status:c.status,synthetic:c.synthetic,comparisons:c.comparisons.map((r:any)=>({scenarioId:r.scenarioId,missionCalculationId:r.missionCalculationId,calculation:compactMissionCalculation(r.calculation)})),limitations:c.limitations,decisionExecuted:false};
 const currency=c.financial?.currency;
 const financial=Object.fromEntries(Object.entries(c.financial??{}).map(([key,value])=>key.endsWith('Cents')?['display'+key[0]!.toUpperCase()+key.slice(1,-5),missionAmount(value,currency)]:[key,value]));
 const{additionalCostCents,incrementalUnitCostCents,...planning}=c.planning??{};
 return{capabilityId:c.capabilityId,version:c.version,status:c.status,synthetic:c.synthetic,programId:c.programId,financial,planning,
  displayAmounts:{...c.displayAmounts,incrementalUnitCost:missionAmount(incrementalUnitCostCents,currency),additionalCost:missionAmount(additionalCostCents,currency)},limitations:c.limitations,
  scientific:c.scientific?{engine:c.scientific.engine,elapsedMillis:c.scientific.elapsedMillis,inputDigest:c.scientific.inputDigest}:null,decisionExecuted:false};
}

export const resourceFields = ['name','site','availableCapacity','requiredCapacity','externalMonthlyCost','operatingMonthlyCost','currency'] as const;
export const resourceQuerySchema = z.object({
  entityId:z.string().uuid().optional(), category:z.enum(['all','supply','demand']).default('all'),
  site:z.string().min(1).max(200).optional(), fields:z.array(z.enum(resourceFields)).min(1).max(resourceFields.length).optional(),
  limit:z.number().int().min(1).max(20).default(4), offset:z.number().int().min(0).max(100000).default(0)
}).strict();
export function resourcePage(records:any[], raw:unknown) {
  const q=resourceQuerySchema.parse(raw);
  const rows=records.filter(r=>['capacities','warehouse_assets','storage_requirements'].includes(r.stream_id))
    .filter(r=>!r.payload.valid_until||Date.parse(r.payload.valid_until)>Date.now())
    .filter(r=>!q.entityId||r.entity_id===q.entityId)
    .filter(r=>q.category==='all'||(q.category==='demand')===(r.stream_id==='storage_requirements'))
    .filter(r=>!q.site||String(r.payload.site).toLocaleLowerCase()===q.site.toLocaleLowerCase())
    .sort((a,b)=>Number(b.payload.monthly_external_cost??b.payload.available_m3??0)-Number(a.payload.monthly_external_cost??a.payload.available_m3??0)||a.record_id.localeCompare(b.record_id));
  const resources=rows.slice(q.offset,q.offset+q.limit).map(r=>{
    const p=r.payload, values:Record<string,unknown>={name:p.name,site:p.site,availableCapacity:p.available_m3,requiredCapacity:p.required_m3,externalMonthlyCost:p.monthly_external_cost,operatingMonthlyCost:p.monthly_operating_cost,currency:p.currency};
    const resource:Record<string,unknown>={recordId:r.record_id,entityId:r.entity_id,moduleId:r.module_id,streamId:r.stream_id,revision:Number(r.revision),sourceWorker:r.installation_id,observedAt:r.source_at,
      ...Object.fromEntries((q.fields??resourceFields).filter(k=>values[k]!==undefined).map(k=>[k,values[k]]))};
    return resource;
  });
  return {resources,total:rows.length,nextOffset:q.offset+q.limit<rows.length?q.offset+q.limit:null,ordering:'cost or available capacity descending, then record ID; live pages may change as records synchronize',authoritative:false};
}

// The original response (including complete observed records) is persisted in
// activity. Only this transport view goes to the model; never duplicate its JSON.
export function modelToolResult(name:string,result:any,compact=false) {
  if(!result.structuredContent)return result;
  let data=result.structuredContent.data;
  if(name==='query_mission_aggregates'&&Array.isArray(data?.records))return{structuredContent:{...result.structuredContent,data:compactMissionAggregates(data)}};
  if(name==='query_mission_scenarios'&&Array.isArray(data?.records))return{structuredContent:{...result.structuredContent,data:{...data,records:data.records.map((r:any)=>({...r,scenario:compactMissionScenario(r.scenario)})),financialRule:'All money is already formatted in major currency units. Copy the currency prefix and decimals exactly; do not convert, rescale or replace with dollar signs.'}}};
  if(data?.missionCalculationId)return{structuredContent:{...result.structuredContent,data:{missionCalculationId:data.missionCalculationId,calculation:compactMissionCalculation(data.calculation),supportingReferences:data.supportingReferences,affectedEntities:data.affectedEntities,decisionExecuted:false,evidenceRule:'Complete fixed-cohort evidence retained in missionCalculationId, current programme leases required on every read. UNKNOWN is never zero; units are conditional services, never unique people. All money is already formatted in major currency units: copy the currency prefix/decimals exactly; never rescale or replace with dollar signs.'}}};
  if(name==='query_scientific_constraints')return{structuredContent:{...result.structuredContent,data:{...data,purchasingTerms:compactScientificConstraints(data.purchasingTerms)}}};
  if(data?.scientificReference)return{structuredContent:{...result.structuredContent,data:{...data,calculation:compactScientificCalculation(data.calculation),observed:{provenance:data.observed?.provenance,engine:data.observed?.engine},evidenceRule:'Complete inputs/results retained at scientificReference.jobId. Synthetic history is not a real commercial prediction. No business action authorized.'}}};
  if(compact&&name==='list_entities')data={entities:data.entities.map((e:any)=>({entity_id:e.entity_id,name:e.name,classification:e.classification})),authoritative:false};
  if(compact&&data?.calculation)data={calculation:data.calculation,supportingReferences:data.supportingReferences,affectedEntities:data.affectedEntities,observed:{supplyWorker:data.observed.supplyWorker,demandWorker:data.observed.demandWorker,supplyAt:data.observed.supplyAt,demandAt:data.observed.demandAt,...(data.observed.sources?{sources:data.observed.sources.map((s:any)=>({reference:s.reference,sourceWorker:s.sourceWorker,observedAt:s.observedAt}))}:{})},decisionExecuted:false};
  if(data?.calculation?.capabilityId==='steward.commerce-performance'){
    const c=data.calculation,summary=c.contributionSummary??{marginBasis:'incomplete',displayAmounts:{contributionMargin:'UNKNOWN'},reason:'Fee-aware contribution evidence is unavailable'};
    data={...data,calculation:{capabilityId:c.capabilityId,schemaVersion:c.schemaVersion,currency:c.currency,orderVolume:c.orderVolume,
      displayAmounts:{recognizedRevenue:c.displayAmounts?.recognizedRevenue??'UNKNOWN',refunds:c.displayAmounts?.refunds??'UNKNOWN',contributionMargin:summary.displayAmounts.contributionMargin},
      contributionSummary:summary,contributionAnalysis:(c.contributionAnalysis??[]).map((order:any)=>({sourceId:order.sourceId,status:order.status,marginBasis:order.marginBasis,displayAmounts:order.displayAmounts,missingCosts:order.missingCosts,recognitionComplete:order.recognitionComplete,costReference:order.costReference})),
      financialRule:'Selected combined contribution is '+summary.displayAmounts.contributionMargin+' ('+summary.marginBasis+'). '+(summary.marginBasis==='incomplete'?'At least one selected order lacks complete contribution evidence; inspect its actual missingCosts and recognitionComplete. UNKNOWN is not numeric.':'Every selected order has all four cost components recorded and fully recognized merchandise. No selected cost component is missing; recorded estimates are not missing values.')+' Per-source calculated contribution: '+(c.contributionAnalysis??[]).map((order:any)=>order.sourceId+' = '+order.displayAmounts.contributionMargin+' ('+order.marginBasis+')').join('; ')+'. Copy these service amounts exactly. Estimated contribution is not verified net profit. Pre-fee gross margins are omitted and must never be relabeled.',assumptions:c.assumptions,period:c.period,decisionExecuted:false}};
  }
  if(compact&&data?.calculation?.capabilityId==='steward.simulation-purchasing'){const c=data.calculation;data={...data,calculation:{capabilityId:c.capabilityId,schemaVersion:c.schemaVersion,currency:c.currency,quantity:c.quantity,logicalProduct:c.logicalProduct,variant:c.variant,basis:c.basis,displayAmounts:c.displayAmounts,impacts:c.impacts,internalTransferCents:0,assumptions:c.assumptions,decisionExecuted:false}};}
  if(compact&&data?.calculation?.capabilityId==='steward.shared-procurement'){
    const c=data.calculation;data={...data,calculation:{capabilityId:c.capabilityId,schemaVersion:c.schemaVersion,currency:c.currency,sku:c.sku,unit:c.unit,totalQuantity:c.totalQuantity,displayAmounts:c.displayAmounts,assumptions:{internalTransfersCancel:true,baseline:c.assumptions.baseline,proposal:c.assumptions.proposal},uncertainties:c.uncertainties,decisionExecuted:false}};
  }
  return {...(result.isError?{isError:true}:{}),structuredContent:{...result.structuredContent,data}};
}
export const matchQuerySchema=z.object({entityId:z.string().uuid().optional(),limit:z.number().int().min(1).max(10).default(2),offset:z.number().int().min(0).max(100000).default(0)}).strict();
export function resourceMatches(records:any[],raw:unknown){
  const q=matchQuerySchema.parse(raw);
  // Build from every authorized row, not a truncated first page. Source data
  // remains in the existing projection/event store; only selected fields travel.
  const supply=records.filter(r=>['capacities','warehouse_assets'].includes(r.stream_id)&&Number(r.payload.available_m3)>0&&(!r.payload.valid_until||Date.parse(r.payload.valid_until)>Date.now()));
  const demand=records.filter(r=>r.stream_id==='storage_requirements'&&Number(r.payload.required_m3)>0&&Number(r.payload.monthly_external_cost)>0);
  if(records.length>10000||supply.length*demand.length>1000000)throw Object.assign(new Error('Narrow the entity scope before matching resources'),{statusCode:413});
  const candidates=demand.flatMap(d=>supply.filter(s=>s.entity_id!==d.entity_id&&s.payload.currency===d.payload.currency&&String(s.payload.site).trim().toLocaleLowerCase()===String(d.payload.site).trim().toLocaleLowerCase()&&(!q.entityId||q.entityId===s.entity_id||q.entityId===d.entity_id)).map(s=>({s,d})))
    .sort((a,b)=>Number(b.d.payload.monthly_external_cost)-Number(a.d.payload.monthly_external_cost)||a.d.record_id.localeCompare(b.d.record_id)||a.s.record_id.localeCompare(b.s.record_id));
  const project=(row:any)=>resourcePage([row],{limit:1}).resources[0];
  return {matches:candidates.slice(q.offset,q.offset+q.limit).map(({s,d})=>({supply:project(s),demand:project(d),locationEvidence:'Matching site text only; operational suitability requires human confirmation'})),total:candidates.length,nextOffset:q.offset+q.limit<candidates.length?q.offset+q.limit:null,authoritative:false};
}
export const compactToolNames=['list_entities','query_resource_matches','query_business_relationships','analyze_resource_sharing_by_id'];
