import {z} from 'zod';
import {purchasingBaseline} from './simulation-analysis.js';
export const scienceEntity=z.string().uuid();
const cents=z.number().int().nonnegative().max(1e8),product=z.string().min(1).max(120);
export const procurementSchema=z.object({currency:z.string().regex(/^[A-Z]{3}$/),
 entities:z.array(z.object({entityId:scienceEntity,currency:z.string().regex(/^[A-Z]{3}$/),baselineShippingCents:cents,transitionCents:cents}).strict()).min(1).max(8),
 requirements:z.array(z.object({entityId:scienceEntity,product,quantity:z.number().int().min(1).max(100000),baselineUnitCents:cents.max(1e7)}).strict()).min(1).max(32),
 suppliers:z.array(z.object({id:product,currency:z.string().regex(/^[A-Z]{3}$/),products:z.array(product).min(1).max(4),capacity:z.number().int().min(0).max(100000),minimumUnits:z.number().int().min(0).max(100000),shippingCents:cents,tiers:z.array(z.object({minimumUnits:z.number().int().min(0).max(100000),unitCosts:z.record(product,cents.max(1e7))}).strict()).min(1).max(3)}).strict()).min(1).max(6),
 baselineExternalCents:z.number().int().min(0).max(1e12),maxSuppliersPerEntity:z.number().int().min(1).max(6).nullable().optional(),solverSeconds:z.number().min(.1).max(3).default(2)
}).strict().superRefine((p,ctx)=>{
 const bad=(message:string)=>ctx.addIssue({code:'custom',message});
 if(new Set(p.entities.map(e=>e.entityId)).size!==p.entities.length||new Set(p.suppliers.map(s=>s.id)).size!==p.suppliers.length||new Set(p.requirements.map(r=>r.entityId+':'+r.product)).size!==p.requirements.length)bad('Duplicate identity');
 if(p.entities.some(e=>e.currency!==p.currency)||p.suppliers.some(s=>s.currency!==p.currency))bad('Currency mismatch');
 if(p.requirements.reduce((n,r)=>n+r.quantity,0)>100000)bad('Quantity bound exceeded');
 if(p.entities.some(e=>!p.requirements.some(r=>r.entityId===e.entityId)))bad('Participant has no requirement');
 for(const s of p.suppliers)if(new Set(s.products).size!==s.products.length||s.tiers.some((t,i)=>i>0&&t.minimumUnits<=s.tiers[i-1]!.minimumUnits||Object.keys(t.unitCosts).sort().join('\0')!==s.products.slice().sort().join('\0')))bad('Invalid supplier tiers');
 try{if(purchasingBaseline(p.entities,p.requirements).baselineExternalCents!==p.baselineExternalCents)bad('Baseline does not reconcile');}catch{bad('Invalid baseline');}
});
const multiplier=z.number().int().min(0).max(30000).default(10000);
export const scenarioChanges=z.object({demandBasisPoints:z.number().int().min(100).max(30000).default(10000),supplierPriceBasisPoints:multiplier,shippingBasisPoints:multiplier,capacityBasisPoints:multiplier,transitionBasisPoints:multiplier,supplierIds:z.array(product).max(6).default([])}).strict();
export const scenarioOptions=z.object({scenarios:z.array(z.object({name:z.string().min(1).max(80),changes:scenarioChanges}).strict()).min(1).max(4),
 sensitivity:z.object({parameter:z.enum(['demandBasisPoints','supplierPriceBasisPoints','shippingBasisPoints','capacityBasisPoints','transitionBasisPoints']),startBasisPoints:z.number().int().min(0).max(30000),endBasisPoints:z.number().int().min(0).max(30000),steps:z.number().int().min(2).max(5)}).strict().optional()}).strict();
export const forecastOptions=z.object({horizon:z.number().int().min(1).max(56).default(30),method:z.enum(['auto','moving-average','level-regression','trend-regression','seasonal-regression']).default('auto'),seasonalPeriod:z.number().int().min(2).max(52).nullable().default(7),confidence:z.number().min(.8).max(.99).default(.9)}).strict();
export const forecastInput=forecastOptions.extend({interval:z.enum(['hour','day','week']),coverage:z.enum(['declared-complete','partial','unknown']),series:z.array(z.object({entityId:scienceEntity,key:product,measure:z.enum(['orders','units']),observations:z.array(z.object({at:z.string().datetime({offset:true}),value:z.number().int().min(0).max(1e6).nullable()}).strict()).max(2048)}).strict()).min(1).max(8)}).strict();
export const scienceRunSchema=z.object({jobId:scienceEntity,datasetId:scienceEntity,capability:z.enum(['demand-forecast','procurement-optimization','scenario-comparison']),options:z.record(z.string(),z.unknown()).default({})}).strict();
export function assertScientificScope(allowed:string[],required:string[]){
 if(!required.length||new Set(required).size!==required.length||required.some(id=>!allowed.includes(id)))throw Object.assign(Error('Scientific entity scope denied'),{statusCode:403});
}
export function forecastProcurement(dataset:any,forecast:any){
 if(dataset.basis!=='synthetic-analytical-history'||!dataset.content.purchasingTerms)throw Object.assign(Error('Declare approved supplier prices, capacities and requirements before optimization'),{statusCode:422});
 const terms=dataset.content.purchasingTerms,currency=terms.currency;
 if(forecast.status!=='completed'||!Array.isArray(forecast.series)||forecast.series.length!==dataset.entity_ids.length)throw Object.assign(Error('A completed forecast for every participant is required'),{statusCode:422});
 const requirements=forecast.series.map((s:any)=>{
  if(s.status!=='completed'||!s.forecast?.length||s.forecast.some((v:any)=>!Number.isFinite(v.value)||v.value<0))throw Object.assign(Error('Insufficient forecast data; no requirements fabricated'),{statusCode:422});
  return{entityId:s.entityId,product:terms.product,quantity:Math.ceil(s.forecast.reduce((n:number,v:any)=>n+v.value,0)),baselineUnitCents:terms.baselineUnitCents};
 });
 assertScientificScope(dataset.entity_ids,requirements.map((r:any)=>r.entityId));
 const entities=dataset.entity_ids.map((entityId:string)=>({entityId,currency,baselineShippingCents:terms.baselineShippingCents,transitionCents:terms.transitionCents}));
 return procurementSchema.parse({currency,entities,requirements,suppliers:terms.suppliers.map((s:any)=>({...s,currency})),baselineExternalCents:purchasingBaseline(entities,requirements).baselineExternalCents});
}
