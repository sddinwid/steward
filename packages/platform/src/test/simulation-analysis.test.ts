import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {simulationDashboard,purchasingOpportunities,simulationRunSchema} from '../simulation-analysis.js';
import {simulationOriginSchema} from '../simulation-schema.js';
import {simulationConditions,simulationPolicySchema} from '../simulation-monitor.js';
import {commerceWireSchema} from '../commerce-analysis.js';
import {validateEvent,dataEvent} from '../synchronization.js';
import {parseConfig} from '../config.js';
const now=Date.parse('2026-10-25T12:00:00.000Z'),iso=new Date(now).toISOString();
function fixture(){
 const ecosystemId=randomUUID(),entities=[randomUUID(),randomUUID()];const rows:any[]=[];
 for(const entityId of entities){
  const installationId=randomUUID(),datasetId=randomUUID(),runId=randomUUID(),sku='SIM-'+datasetId.slice(0,8)+'-TEE',sourceVariantId='sim:'+runId+':tee';
  const row=(stream:string,id:string,p:any)=>({stream_id:stream,record_id:id,revision:1,entity_id:entityId,installation_id:installationId,module_id:stream==='simulation_runs'?'steward.simulation.commerce':'cee.sales',source_at:iso,ingested_at:iso,payload:{projection:p}});
  rows.push(row('simulation_runs',datasetId,{contractVersion:1,approved:true,datasetId,runId,ecosystemId,label:'Synthetic business',scenario:'purchasing-opportunity',seed:7,state:'paused',speed:60,eventsPerMinute:6,generatedIntents:4,currency:'USD',updatedAt:iso,lastObservedAt:iso,catalog:[{sku,logicalProduct:'synthetic-tee',variant:'standard',sourceVariantId,name:'Synthetic tee',quantity:500,unitQuoteCents:700,currency:'USD',supplier:'synthetic-supplier',minimumUnits:20,pooledThresholdUnits:40,pooledDiscountBasisPoints:1000,standaloneShippingCents:1500,pooledShippingCents:1800,transitionCostCents:200}]}));
  for(let n=0;n<4;n++)rows.push(row('commerce_orders',randomUUID(),{contractVersion:1,approved:true,channel:'simulation',sourceId:'sim:'+runId+':'+n,sourceUpdatedAt:iso,orderCreatedAt:new Date(now-n*1000).toISOString(),fulfilledAt:iso,status:'fulfilled',productionStatus:'shipped',currency:'USD',units:'items',quantity:15,recognizedRevenueCents:36000,refundCents:0,productionCostCents:10500,shippingCostCents:200,costBasis:'estimated',products:[{sku,sourceVariantId,quantity:15,unitPriceCents:2400,lineRevenueCents:36000,fulfilledQuantity:15,recognizedRevenueCents:36000}],revenueBasis:'Completed merchandise',refundBasis:'Source refunds',costSource:'Synthetic estimates',financials:{productionCostCents:10500,shippingCostCents:200,transactionFeeCents:1110,channelFeeCents:0,basis:'estimated',reference:'simulation:'+runId},simulation:{version:1,datasetId,runId,ecosystemId,seed:7,eventIndex:n,scenario:'purchasing-opportunity',simulatedAt:iso,speed:60},simulationState:{stockStatus:'reserved',reservationFailure:null,productionRequested:true,productionRequestedAt:new Date(now-1000).toISOString(),productionObservedAt:iso}}));
 }
 return{rows,entities};
}
test('simulation schema rejects unknown private fields and retains exact stream-scoped provenance',()=>{
 const {rows}=fixture(),run=rows[0].payload.projection,order=rows[1].payload.projection;assert(simulationRunSchema.safeParse(run).success);assert(commerceWireSchema.safeParse(order).success);assert(!simulationOriginSchema.safeParse({...order.simulation,token:'private'}).success);assert(!simulationRunSchema.safeParse({...run,credential:'private'}).success);
 const identity=parseConfig({configVersion:1,role:'worker',installationId:randomUUID(),entity:{entityId:randomUUID(),displayName:'Synthetic projection fixture'}},'worker'),event={...dataEvent(identity,randomUUID(),'record.upsert',rows[0].record_id,1,{id:rows[0].record_id,revision:1,projection:run}),moduleId:'steward.simulation.commerce',streamId:'simulation_runs'};validateEvent(event);assert.throws(()=>validateEvent({...event,recordId:randomUUID()}));
});
test('pooled purchasing counts external costs once and reconciles separate entity benefits exactly',()=>{
 const {rows}=fixture(),opportunity=purchasingOpportunities(rows)[0]!;assert(opportunity);assert.equal(opportunity.quantity,120);assert.equal(opportunity.pooledUnitQuoteCents,630);assert.equal(opportunity.baselineExternalCents,87000);assert.equal(opportunity.proposedCostCents,77800);assert.equal(opportunity.ecosystemBenefitCents,9200);assert.equal(opportunity.internalTransferCents,0);assert.deepEqual(opportunity.impacts.map(v=>v.benefitCents),[4600,4600]);assert.equal(opportunity.supportingReferences.length,10);assert(opportunity.supportingReferences.every(r=>['simulation_runs','commerce_orders'].includes(r.streamId)));assert.equal(opportunity.impacts.reduce((n,v)=>n+v.allocatedShippingCents,0),1800);
});
test('authorization withdrawal, wrong run, supplier terms, mappings and historical currencies cannot form a purchasing cohort',()=>{
 for(const mutate of [(r:any[])=>r[0].payload.projection.approved=false,(r:any[])=>r[0].payload.projection.runId=randomUUID(),(r:any[])=>r[0].payload.projection.catalog[0].supplier='other',(r:any[])=>r[0].payload.projection.catalog[0].sku='UNMAPPED',(r:any[])=>r.filter(r=>r.stream_id==='commerce_orders').forEach(r=>r.payload.projection.currency='EUR')]){const{rows}=fixture();mutate(rows);assert.equal(purchasingOpportunities(rows).length,0);}
 const{rows}=fixture();assert.equal(purchasingOpportunities(rows.filter(r=>r.entity_id===rows[0].entity_id)).length,0);
});
test('Master financials derive from genuine owner publications and keep missing costs unknown',()=>{
 const{rows}=fixture();rows[0].payload.projection.generatedIntents=999;const d=simulationDashboard(rows,now);assert.equal(d.companies[0]!.orders,4);assert.equal(d.companies[0]!.revenueCents,144000);assert.equal(d.companies[0]!.contributionCents,96760);rows[1].payload.projection.productionCostCents=null;assert.equal(simulationDashboard(rows,now).companies[0]!.contributionCents,null);assert.equal(simulationDashboard(rows,now).companies[0]!.costBasis,'incomplete');
});
test('source-evidenced monitors identify delayed, costly, shortage and repeated failure conditions; scenario names grant no findings',()=>{
 const{rows}=fixture();const order=rows[1].payload.projection;order.simulationState.productionRequestedAt=new Date(now-60000).toISOString();order.productionCostCents=35000;order.financials.productionCostCents=35000;order.stockout=true;
 for(const r of rows.filter(r=>r.entity_id===rows[0].entity_id&&r.stream_id==='commerce_orders'))r.payload.projection.simulationState.reservationFailure='Missing synthetic mapping';
 const conditions=simulationConditions(rows,{},now),codes=conditions.map(c=>c.code);for(const c of ['fulfillment_delay','declining_contribution_margin','inventory_shortage','repeated_fulfillment_exceptions','cross_company_purchasing'])assert(codes.includes(c),c);assert(conditions.every(c=>c.references.length<=20));assert(!conditions.some(c=>c.code==='demand_surge'));assert(conditions.every(c=>c.explanation.includes('SYNTHETIC COMMERCE')));
 const clean=fixture();for(const r of clean.rows.filter(r=>r.stream_id==='simulation_runs'))r.payload.projection.scenario='production-delay';assert(!simulationConditions(clean.rows,{},now).some(c=>c.code==='fulfillment_delay'));
});
test('monitor settings are closed and bounded; purchasing condition identity survives source revision updates',()=>{
 assert.throws(()=>simulationPolicySchema.parse({enabled:true,entityIds:[],intervalSeconds:1,thresholds:{}}));assert.throws(()=>simulationPolicySchema.parse({enabled:true,entityIds:[],thresholds:{execute:true}}));const{rows}=fixture(),a=simulationConditions(rows,{},now).find(c=>c.code==='cross_company_purchasing')!;rows.forEach(r=>r.revision++);const b=simulationConditions(rows,{},now).find(c=>c.code==='cross_company_purchasing')!;assert.equal(a.key,b.key);assert.notDeepEqual(a.references,b.references);assert.equal(a.detail.ecosystemBenefitCents,b.detail.ecosystemBenefitCents);
});
