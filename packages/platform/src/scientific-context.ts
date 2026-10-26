import {formatMoneyCents} from './business-analysis.js';
const amount=(v:any,currency:string)=>Number.isSafeInteger(v)?formatMoneyCents(v,currency):'UNKNOWN';
const impact=(i:any,currency:string)=>({entityId:i.entityId,quantity:i.quantity,displayBaseline:amount(i.baselineExternalCents,currency),displayMerchandise:amount(i.pooledMerchandiseCents,currency),displayShipping:amount(i.allocatedShippingCents,currency),displayTransition:amount(i.transitionCostCents,currency),displayProposed:amount(i.proposedCostCents,currency),displayBenefit:amount(i.benefitCents,currency),disadvantaged:i.disadvantaged});
const suppliers=(rows:any[],currency:string)=>(rows??[]).map(s=>({id:s.id,allocatedUnits:s.quantity,declaredCapacityUnits:s.capacity,unusedCapacityUnits:s.unusedCapacity,fullyUtilized:s.unusedCapacity===0,displayFixedShipping:amount(s.shippingCents,currency),selectedTierIndex:s.tier}));
export function compactScientificConstraints(terms:any){
 if(!terms)return null;const currency=terms.currency;
 return{currency,product:terms.product,displayBaselineUnitPrice:amount(terms.baselineUnitCents,currency),displayStandaloneShippingPerEntity:amount(terms.baselineShippingCents,currency),displayTransitionPerEntity:amount(terms.transitionCents,currency),
  suppliers:terms.suppliers.map((s:any)=>({id:s.id,products:s.products,declaredCapacityUnits:s.capacity,minimumOrderUnits:s.minimumUnits,displayFixedShipping:amount(s.shippingCents,currency),allUnitsPriceTiers:s.tiers.map((t:any)=>({minimumCombinedUnits:t.minimumUnits,unitPrices:Object.fromEntries(Object.entries(t.unitCosts).map(([key,v])=>[key,amount(v,currency)]))}))})),
  financialRule:'Currency strings are already correctly scaled major-unit amounts. Preserve the literal currency prefix and decimal string; never replace USD with a dollar sign or reinterpret counts as money.'};
}
/** Compact provider-independent views; complete inputs/results stay in run history. */
export function compactScientificCalculation(c:any):any{
 if(c.method==='chronological-demand-forecast')return{capabilityId:'steward.scientific.demand-forecast',status:c.status,method:c.method,methodVersion:c.methodVersion,horizon:c.horizon,interval:c.interval,decisionExecuted:false,
  series:c.series.map((s:any)=>({entityId:s.entityId,key:s.key,status:s.status,observedRange:s.observedRange,dataQuality:s.dataQuality,model:s.model,planning:s.planning,backtesting:s.backtesting?{metrics:s.backtesting.metrics,baselineComparisons:s.backtesting.baselineComparisons,testPredictionIntervalCoverage:s.backtesting.testPredictionIntervalCoverage}:null,uncertainty:s.uncertainty,warnings:s.warnings,limitations:s.limitations?.slice(-3),temporalRule:s.planning?'Following historical intervals '+s.planning.from+' through '+s.planning.to+'; do not relabel this as the current calendar month.':null})),limitations:c.limitations};
 if(c.method==='fixed-charge-all-units-milp'){
  const money=(v:any)=>amount(v,c.currency);
  return{capabilityId:'steward.scientific.procurement-optimization',status:c.status,method:c.method,methodVersion:c.methodVersion,currency:c.currency,
   displayAmounts:{baseline:money(c.baselineExternalCents),proposed:money(c.proposedCostCents),benefit:money(c.ecosystemBenefitCents)},
   impacts:c.impacts.map((i:any)=>impact(i,c.currency)),suppliers:suppliers(c.suppliers,c.currency),
   displayFixedShippingTotal:money(c.shippingCents),displayTransitionTotal:money(c.transitionCostCents),internalTransfers:'Zero; internal transfers never count as external savings',
   requiresEntityReview:c.requiresEntityReview,solver:c.solver?{name:c.solver.name,version:c.solver.version,statusCode:c.solver.statusCode,mipGap:c.solver.mipGap,threads:c.solver.threads,randomSeed:c.solver.randomSeed}:null,
   financialRule:'Copy displayAmounts.baseline, proposed, benefit and each impact.displayBenefit VERBATIM including the currency prefix (for example USD). Do not substitute a dollar sign or add separators. Fixed shipping total = '+money(c.shippingCents)+'; transitions total = '+money(c.transitionCostCents)+'. Counts/capacity are units, never money. Unused capacity is explicitly reported; do not claim full utilization when it is positive. Estimates are conditional, not realized benefits.',
   assumptions:c.assumptions,limitations:c.limitations,decisionExecuted:false};
 }
 if(c.method==='deterministic-procurement-sensitivity')return{capabilityId:'steward.scientific.scenario-comparison',status:c.status,method:c.method,methodVersion:c.methodVersion,currency:c.currency,existingArrangements:{displayCost:amount(c.existingArrangements.costCents,c.currency),status:c.existingArrangements.status},
  coordinatedBaseline:compactScientificCalculation(c.coordinatedBaseline),scenarios:c.scenarios.map((s:any)=>({name:s.name,kind:s.kind,assumptions:s.assumptions,requiredUnits:s.requiredQuantity,status:s.status,feasible:s.feasible,displayExpectedCost:amount(s.expectedCostCents,c.currency),displaySameDemandBenefit:amount(s.benefitVersusSameDemandBaselineCents,c.currency),displayCostChangeFromCoordinatedBaseline:amount(s.costChangeFromCoordinatedBaselineCents,c.currency),entityImplications:s.entityImplications.map((i:any)=>impact(i,c.currency)),suppliers:suppliers(s.calculation?.suppliers,c.currency)})),limitations:c.limitations,decisionExecuted:false};
 return c;
}
export function scientificToolEvidence(run:any){
 if(run.state!=='completed'||!run.result)throw Object.assign(Error(run.error_code??'Scientific result incomplete'),{statusCode:503});
 return{calculation:{...run.result.calculation,capabilityId:'steward.scientific.'+run.capability,schemaVersion:1},scientificReference:{schemaVersion:1,jobId:run.job_id,datasetId:run.dataset_id,inputDigest:run.result.inputDigest},
  affectedEntities:run.entity_ids,supportingReferences:run.result.provenance.references,
  observed:{supplyAt:run.result.provenance.asOf,sources:[],provenance:run.result.provenance,engine:run.result.engine},
  synthetic:run.result.provenance.synthetic,decisionExecuted:false};
}
