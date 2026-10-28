import {ModuleReportView} from './module-report.js';
import {ReadableValue} from './presentation.js';
export type CatalogDisclosurePurpose='business'|'simulation';
export function catalogInvestigationOptions(capability:string,purpose:CatalogDisclosurePurpose='business'){return capability==='catalog-pricing'?{catalogPurpose:purpose}:{};}
export function CatalogDisclosureAudience({value,onChange}:{value:CatalogDisclosurePurpose;onChange:(purpose:CatalogDisclosurePurpose)=>void}){return <label>Catalog disclosure audience<select aria-label="Catalog disclosure audience" value={value} onChange={e=>onChange(e.target.value as CatalogDisclosurePurpose)}><option value="business">Business disclosures</option><option value="simulation">Synthetic demonstration disclosures</option></select><small>Investigate the selected disclosure audience within your existing authorized company scope.</small></label>;}

/** Retained analytical results are disclosures, never operational commands. */
export function requiresAnalyticalReview(analyses:any[]=[]){return analyses.some(a=>a.scientificReference||a.economicCalculationId||a.catalogCalculationId);}
export function analyticalFindingReview(analyses:any[],reviewed:boolean){return analyses.some(a=>a.economicCalculationId||a.catalogCalculationId)?{reviewed}:{};}
export function supportsAnalyticalFinding(analyses:any[]=[]){return analyses.findLast(a=>a.catalogCalculationId)?.calculation?.capabilityId!=='steward.catalog.accepted-line-statistics';}
export function analystFailureExplanation(code:string){return code==='SOURCE_EVIDENCE_UNAVAILABLE'?'Source evidence is no longer available for this investigation. Review current authorized disclosures before starting again.':code==='INVESTIGATION_SCOPE_REVOKED'?'Your account no longer has access to this investigation scope. Request an authorized account review before starting again.':code;}

export function CatalogAnalystCalculation({analysis}:{analysis:any}){
 const c=analysis.calculation??{},currency=typeof c.currency==='string'?c.currency:'',missing=c.missingInformation??c.unknowns??c.uncertainties,quantityOnly=c.capabilityId==='steward.catalog.accepted-line-statistics';
 return <article data-testid="catalog-analyst-calculation"><h3>{quantityOnly?'Accepted-line quantity description':'Catalog and Pricing conditional analysis'}</h3>
  <p>{quantityOnly?'Observed accepted quantities and historical accepted amounts remain separate from prospective contribution estimates. These selected lines do not establish a complete demand rate or a forecast; no price, order or business decision has been executed.':'Retained analytical calculation. Contribution estimates are conditional on original price authority, cost coverage, source assumptions and leases. Unknown costs remain unknown; no price, order or business decision has been executed.'}</p>
  <p>Calculation status: {c.status??'Unavailable'}</p>
  {c.report?<ModuleReportView report={c.report} currency={currency}/>:null}
  {c.displayAmounts&&Object.keys(c.displayAmounts).length?<><h4>Estimated amounts from source evidence</h4><ReadableValue value={c.displayAmounts}/></>:null}
  {Array.isArray(c.observations)?<><h4>Disclosed observations</h4>{c.observations.map((o:any,i:number)=><section key={i}><h5>{o.name??'Reviewed source observation'}</h5><ReadableValue value={{quantity:o.quantity,status:o.status,[quantityOnly?'historicalAcceptedAmounts':'estimatedAmounts']:o.displayAmounts,...(!quantityOnly?{contributionPercentage:o.contributionPercentage}:{})}}/><details><summary>Original source classification, pricing scope and lease</summary><ReadableValue value={{purpose:o.purpose,containsSimulator:o.containsSimulator,originCoverage:o.originCoverage,pricingContext:o.pricingContext,sourceLease:o.sourceLease,current:o.current,historical:o.historical}}/></details></section>)}</>:null}
  <h4>Source assumptions and missing information</h4>{c.assumptions?.length?<div><h5>Declared assumptions</h5><ReadableValue value={c.assumptions}/></div>:null}{missing?.length?<div><h5>Missing information</h5><ReadableValue value={missing}/></div>:null}<ReadableValue value={c.limitations??analysis.limitations??[]}/>
  {c.statistics?<><h4>Descriptive statistics in their original units</h4><p>{quantityOnly?'Statistics retain accepted units per selected line. They do not establish a complete demand rate or a demand forecast.':'Means may contain fractional cents. These are descriptive observations, not rounded transaction amounts or a demand forecast.'}</p><ReadableValue value={c.statistics}/></>:null}
  <h4>Original company and Worker evidence</h4><p>Each reference identifies its original company, Worker installation, module, stream, record and revision. Receiving this analysis does not refresh that evidence.</p>
  {(analysis.supportingReferences??[]).map((r:any,i:number)=><details key={i}><summary>Source evidence {i+1} · Worker {r.installationId}</summary><ReadableValue value={r}/></details>)}
  <details><summary>Retained analytical calculation and exact source contract</summary><ReadableValue value={{catalogCalculationId:analysis.catalogCalculationId,calculation:c}} currency={currency}/></details>
 </article>;
}
