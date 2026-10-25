import {formatMoneyCents} from './business-analysis.js';
/** Compact provider-independent views; complete inputs/results stay in run history. */
export function compactScientificCalculation(c:any):any{
 if(c.method==='chronological-demand-forecast')return{capabilityId:'steward.scientific.demand-forecast',status:c.status,method:c.method,methodVersion:c.methodVersion,horizon:c.horizon,interval:c.interval,decisionExecuted:false,
  series:c.series.map((s:any)=>({entityId:s.entityId,key:s.key,status:s.status,observedRange:s.observedRange,dataQuality:s.dataQuality,model:s.model,planning:s.planning,backtesting:s.backtesting?{metrics:s.backtesting.metrics,baselineComparisons:s.backtesting.baselineComparisons,testPredictionIntervalCoverage:s.backtesting.testPredictionIntervalCoverage}:null,uncertainty:s.uncertainty,warnings:s.warnings,limitations:s.limitations?.slice(-3)})),limitations:c.limitations};
 if(c.method==='fixed-charge-all-units-milp'){
  const amount=(v:any)=>Number.isSafeInteger(v)?formatMoneyCents(v,c.currency):'UNKNOWN';
  return{capabilityId:'steward.scientific.procurement-optimization',status:c.status,method:c.method,methodVersion:c.methodVersion,currency:c.currency,
   baselineExternalCents:c.baselineExternalCents,proposedCostCents:c.proposedCostCents,ecosystemBenefitCents:c.ecosystemBenefitCents,
   displayAmounts:{baseline:amount(c.baselineExternalCents),proposed:amount(c.proposedCostCents),benefit:amount(c.ecosystemBenefitCents)},
   impacts:c.impacts.map((i:any)=>({...i,displayBenefit:amount(i.benefitCents),displayProposed:amount(i.proposedCostCents)})),suppliers:c.suppliers,
   internalTransferCents:0,requiresEntityReview:c.requiresEntityReview,solver:c.solver,assumptions:c.assumptions,limitations:c.limitations,decisionExecuted:false};
 }
 if(c.method==='deterministic-procurement-sensitivity')return{capabilityId:'steward.scientific.scenario-comparison',status:c.status,method:c.method,methodVersion:c.methodVersion,currency:c.currency,existingArrangements:c.existingArrangements,
  coordinatedBaseline:compactScientificCalculation(c.coordinatedBaseline),scenarios:c.scenarios.map(({calculation,...s}:any)=>({...s,displayExpectedCost:Number.isSafeInteger(s.expectedCostCents)?formatMoneyCents(s.expectedCostCents,c.currency):'UNKNOWN',displaySameDemandBenefit:Number.isSafeInteger(s.benefitVersusSameDemandBaselineCents)?formatMoneyCents(s.benefitVersusSameDemandBaselineCents,c.currency):'UNKNOWN'})),limitations:c.limitations,decisionExecuted:false};
 return c;
}
export function scientificToolEvidence(run:any){
 if(run.state!=='completed'||!run.result)throw Object.assign(Error(run.error_code??'Scientific result incomplete'),{statusCode:503});
 return{calculation:{...run.result.calculation,capabilityId:'steward.scientific.'+run.capability,schemaVersion:1},scientificReference:{schemaVersion:1,jobId:run.job_id,datasetId:run.dataset_id,inputDigest:run.result.inputDigest},
  affectedEntities:run.entity_ids,supportingReferences:run.result.provenance.references,
  observed:{supplyAt:run.result.provenance.asOf,sources:[],provenance:run.result.provenance,engine:run.result.engine},
  synthetic:run.result.provenance.synthetic,decisionExecuted:false};
}
