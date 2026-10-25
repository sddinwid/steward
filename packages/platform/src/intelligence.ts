// Presentation metadata derived exclusively from retained deterministic evidence.
// No model inference, currency conversion, or changes to historical records.
export function investigationSummary(row:any){
 const analyses=row.result?.analyses??[];
 const capability=analyses[0]?.calculation?.capabilityId;
 const category: string=({'steward.resource-sharing':'Resource sharing','steward.shared-procurement':'Shared procurement','steward.workforce-opportunity':'Workforce & training','steward.commerce-performance':'Commerce performance','steward.simulation-purchasing':'Synthetic ecosystem purchasing'} as Record<string,string>)[capability]??'Investigation';
 const impacts=analyses.flatMap((a:any)=>{
  const c=a.calculation;
  if(c?.capabilityId==='steward.resource-sharing'&&Number.isFinite(c.proposal?.ecosystemMonthlyBenefit)&&/^[A-Z]{3}$/.test(c.currency))return [{kind:'Projected ecosystem benefit',amount:c.proposal.ecosystemMonthlyBenefit,currency:c.currency,period:'month',horizonMonths:c.horizonMonths,horizonBenefit:c.proposal.ecosystemHorizonBenefit,assumptions:c.assumptions}];
  if(c?.capabilityId==='steward.shared-procurement'&&Number.isSafeInteger(c.proposal?.ecosystemSavingsCents)&&/^[A-Z]{3}$/.test(c.currency))return [{kind:'Projected purchasing savings',amount:c.proposal.ecosystemSavingsCents/100,currency:c.currency,period:'selected purchasing cycle',horizonMonths:null,horizonBenefit:null,assumptions:c.assumptions}];
  if(c?.capabilityId==='steward.simulation-purchasing'&&Number.isSafeInteger(c.ecosystemBenefitCents)&&/^[A-Z]{3}$/.test(c.currency))return [{kind:'Estimated synthetic purchasing benefit',amount:c.ecosystemBenefitCents/100,currency:c.currency,period:'counterfactual selected synthetic cohort',horizonMonths:null,horizonBenefit:null,assumptions:c.assumptions}];
  return [];
 });
 const question=String(row.prompt??'').split(/[\n.!?]/)[0]!.trim();
 const titles:Record<string,string>={'Resource sharing':'Capacity sharing opportunity','Shared procurement':'Shared purchasing opportunity','Workforce & training':'Workforce & training opportunity','Commerce performance':'Commerce performance review','Synthetic ecosystem purchasing':'Synthetic ecosystem purchasing review'};
 const observedDates=analyses.flatMap((a:any)=>[a.observed?.supplyAt,a.observed?.demandAt,...(a.observed?.sources??[]).map((s:any)=>s.observedAt)]).filter((v:any)=>typeof v==='string'&&Number.isFinite(Date.parse(v))).sort();
 return {title:titles[category]??(['failed','interrupted'].includes(row.status)?'Incomplete investigation':row.status==='running'?'Investigation in progress':(question.length>85?question.slice(0,82)+'…':question)||'Investigation'),category,
  summary:row.status==='completed'?String(row.result?.narrative??'Completed; open the retained evidence for details.').slice(0,300):row.status==='running'?'Investigation in progress.':`No final recommendation. ${row.error_code??'Execution did not complete.'}`,
  affectedEntities:[...new Set(analyses.flatMap((a:any)=>a.affectedEntities??[]))],impacts,
  evidenceCount:analyses.reduce((n:number,a:any)=>n+(a.supportingReferences?.length??0),0),oldestObservation:observedDates[0]??null,newestObservation:observedDates.at(-1)??null,findingCount:row.finding_id?1:0,
  limitations:analyses.length?'Conditional estimates; review source freshness, assumptions and alternatives.':'No completed deterministic calculation available.'};
}
