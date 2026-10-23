import { z } from 'zod';

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
  if(compact&&name==='list_entities')data={entities:data.entities.map((e:any)=>({entity_id:e.entity_id,name:e.name,classification:e.classification})),authoritative:false};
  if(compact&&data?.calculation)data={calculation:data.calculation,supportingReferences:data.supportingReferences,affectedEntities:data.affectedEntities,observed:{supplyWorker:data.observed.supplyWorker,demandWorker:data.observed.demandWorker,supplyAt:data.observed.supplyAt,demandAt:data.observed.demandAt,...(data.observed.sources?{sources:data.observed.sources.map((s:any)=>({reference:s.reference,sourceWorker:s.sourceWorker,observedAt:s.observedAt}))}:{})},decisionExecuted:false};
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
