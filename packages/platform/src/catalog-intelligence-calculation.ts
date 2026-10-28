import {canonical,digest} from '@steward/module-sdk';
import {calculateContribution,type BoundCostEvidence,type ContributionInput,type NotApplicableCost} from '@steward/catalog-kit/contribution';
import {intelligenceReference,intelligenceEvidenceSetDigest,validateIntelligenceProjection,type PricingEvidence,type PricingPublication,type ContributionObservation,type IntelligenceReference} from '@steward/catalog-kit/intelligence';
import {fail} from './security/crypto.js';
import type {ScientificResult,ScientificRequest} from '@steward/contracts';

/** Pydantic's existing request digest normalizes UTC datetimes to microseconds. */
export function publishedScientificRequestDigest(input:ScientificRequest){
 const iso=new Date(input.provenance.asOf).toISOString(),asOf=iso.endsWith('.000Z')?iso.slice(0,-5)+'Z':iso.replace(/\.(\d{3})Z$/,'.$1000Z');
 return digest(canonical({...input,provenance:{...input.provenance,asOf,derivedFrom:input.provenance.derivedFrom??[]}}));
}

export function validatePublishedStatistics(values:(number|null)[],result:ScientificResult){
 const observed=values.filter((v):v is number=>v!==null),c=result.calculation,sum=observed.reduce((n,v)=>n+BigInt(v),0n),expected=observed.length?Number(sum)/observed.length:null;
 if(c.count!==observed.length||c.missing!==values.length-observed.length||(observed.length?(c.status!=='completed'||typeof c.mean!=='number'||!Number.isFinite(c.mean)||Math.abs(c.mean-expected!)>Math.max(0.0001,Math.abs(expected!)*1e-14)||c.minimum!==Math.min(...observed)||c.maximum!==Math.max(...observed)):(c.status!=='insufficient_data'||c.mean!==null)))fail(503,'SCIENTIFIC_OUTPUT_INVALID');
 const close=(actual:unknown,expected:number|null)=>expected===null?actual===null:typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<=Math.max(0.0001,Math.abs(expected)*1e-12);
 if(observed.length){const ordered=[...observed].sort((a,b)=>a-b),n=observed.length,median=n%2?ordered[Math.floor(n/2)]!:Number(BigInt(ordered[n/2-1]!)+BigInt(ordered[n/2]!))/2,squares=observed.reduce((v,x)=>v+BigInt(x)*BigInt(x),0n),variance=n>1?Number(BigInt(n)*squares-sum*sum)/Number(BigInt(n)*BigInt(n-1)):null;if(!close(c.median,median)||!close(c.variance,variance))fail(503,'SCIENTIFIC_OUTPUT_INVALID');}else if(c.variance!==null)fail(503,'SCIENTIFIC_OUTPUT_INVALID');
 return observed.length?{numeratorCents:sum.toString(),denominator:observed.length}:null;
}

/** The legacy scientific wire cannot distinguish otherwise-identical Worker sources. */
export function scientificPublicationReferences(references:IntelligenceReference[]){const wire=references.map(({installationId,...r})=>r);if(new Set(wire.map(r=>canonical(r))).size!==wire.length)fail(409,'Scientific provenance cannot distinguish these Worker sources; use exact-source deterministic comparison');return wire;}

/** Recompute the disclosed arithmetic; this never authorizes a transaction. */
export function recomputePublishedContribution(publication:PricingPublication,evidence:PricingEvidence[]){
 try{validateIntelligenceProjection(publication,{entityId:publication.entityId,installationId:publication.installationId,moduleId:publication.moduleId,streamId:'pricing_publications_v1'});for(const e of evidence)validateIntelligenceProjection(e,{entityId:publication.entityId,installationId:publication.installationId,moduleId:publication.moduleId,streamId:'pricing_evidence_v1'});}catch{fail(409,'Original closed pricing publication or evidence is invalid');}
 const b=publication.body,price=evidence.filter(e=>e.body.role==='price-source');
 if(evidence.length!==b.evidenceCount||evidence.length>64||new Set(evidence.map(e=>e.id)).size!==evidence.length||intelligenceEvidenceSetDigest(evidence)!==b.evidenceSetDigest||evidence.some(e=>e.publicationId!==publication.id||e.entityId!==publication.entityId||e.installationId!==publication.installationId||e.moduleId!==publication.moduleId||canonical(e.provider)!==canonical(publication.provider)))fail(409,'Complete exact publisher evidence count, identities and root are required');
 const lists=price.filter(e=>e.body.role==='price-source'&&e.body.sourceRole==='list');if(lists.length!==1||b.pricingContext.priceListId===null||lists[0]!.source.recordId!==b.pricingContext.priceListId)fail(409,'Resolved price list context differs from original list evidence');
 const promotionSources=price.filter(e=>e.source.streamId==='pricing_promotions_v1'),customerSources=price.filter(e=>e.source.streamId==='pricing_eligibility_v1');if(b.pricingContext.promotionId===null?promotionSources.length!==0:promotionSources.length!==1||!b.promotion||promotionSources[0]!.source.recordId!==b.pricingContext.promotionId||promotionSources[0]!.source.revision!==b.promotion.revision)fail(409,'Selected promotion context differs from original promotion evidence');if(b.pricingContext.customerReference===null?customerSources.length!==0:customerSources.length===0)fail(409,'Selected customer scope lacks matching original eligibility evidence');
 const priceTerms=new Set(price.map(e=>e.body.role==='price-source'?canonical({termsDigest:e.body.termsDigest,listed:e.body.listedUnitPriceCents,resolved:e.body.resolvedUnitPriceCents,discount:e.body.discountCents}):''));if(priceTerms.size!==1)fail(409,'Original price sources describe inconsistent decisions');
 if(!['rule','list','policy'].every(role=>price.some(e=>e.body.role==='price-source'&&e.body.sourceRole===role)))fail(409,'Complete original pricing source evidence is required');
 const priceKeys=price.map(e=>canonical({source:e.source,role:e.body.role==='price-source'?e.body.sourceRole:null}));if(new Set(priceKeys).size!==priceKeys.length)fail(409,'Duplicate original pricing source evidence');
 const policies=price.filter(e=>e.body.role==='price-source'&&e.body.sourceRole==='policy');if(policies.length!==1||policies[0]!.body.role!=='price-source'||!policies[0]!.body.policy)fail(409,'One original pricing policy summary is required');
 const policy=policies[0]!.body.policy,evaluatedAt=Date.parse(b.evaluatedAt);
 if(policy.reviewRequired&&price.filter(e=>e.body.role==='price-source'&&e.body.sourceRole==='approval').length<policy.quorum)fail(409,'Original approval evidence is incomplete');
 const costs:BoundCostEvidence[]=[],notApplicable:NotApplicableCost[]=[],fences:number[]=[];
 for(const e of evidence){
  const body=e.body;
  if(Date.parse(e.source.observedAt)>evaluatedAt)fail(409,'Original source evidence is newer than the reviewed calculation');
  if(body.role==='cost'){
   if(canonical(body.subject)!==canonical(b.subject))fail(409,'Cost evidence belongs to another subject');const o=body.observation;
   costs.push({contractVersion:1,component:{contractVersion:1,id:body.componentId,subject:body.subject,category:o.category,description:o.name,amount:o.amount,basis:o.basis,source:o.source,observedAt:o.observedAt},observation:o});fences.push(Date.parse(o.expiresAt));
  }else if(body.role==='not-applicable'){
   notApplicable.push({contractVersion:1,category:body.category,actorId:body.actorId,reason:body.reason,source:e.source,observedAt:body.observedAt,expiresAt:body.expiresAt});fences.push(Date.parse(body.expiresAt));
  }else{
   const streams:Record<string,string[]>={rule:['pricing_rules_v1'],list:['pricing_lists_v1'],policy:['pricing_policies_v1'],approval:['pricing_approvals_v1'],catalog:['pricing_catalog_subjects_v1'],eligibility:['pricing_eligibility_v1','pricing_promotions_v1']};const{contractVersion,...sourceProvider}=e.source.provider;if(!streams[body.sourceRole]?.includes(e.source.streamId)||e.source.moduleId!==publication.moduleId||canonical(sourceProvider)!==canonical(publication.provider))fail(409,'Pricing role does not match its original publisher stream and provider');
   if(body.currency!==b.currency||body.quantity!==b.quantity||body.resolvedUnitPriceCents!==b.baseline.unitPriceCents)fail(409,'Pricing source money or quantity differs from the reviewed publication');
   if(Date.parse(body.validFrom)>evaluatedAt||body.validTo!==null&&Date.parse(body.validTo)<=evaluatedAt||Date.parse(body.authorizationExpiresAt)<=evaluatedAt||Date.parse(body.authorizationExpiresAt)>evaluatedAt+policy.maximumAuthorizationSeconds*1000)fail(409,'Original pricing authorization window differs from the declared policy');
   fences.push(Date.parse(body.authorizationExpiresAt));if(body.validTo)fences.push(Date.parse(body.validTo));
  }
 }
 if(b.promotion)fences.push(Date.parse(b.promotion.endsAt));
 if(!fences.length||Date.parse(publication.validUntil)>Math.min(...fences))fail(409,'Publication exceeds an original source lease');
 const input:ContributionInput={contractVersion:1,ownerEntityId:publication.entityId,subject:b.subject,quantity:b.quantity,unitDefinition:b.unitDefinition,unitPrice:{contractVersion:1,amountCents:b.baseline.unitPriceCents,currency:b.currency,scale:2},acquisitionMode:b.acquisitionMode,requiredCategories:b.requiredCategories,evidence:costs,notApplicable,shipmentCount:b.shipmentCount,evaluatedAt:b.evaluatedAt};
 const calculate=(observation:ContributionObservation)=>{let result;try{result=calculateContribution({...input,unitPrice:{...input.unitPrice,amountCents:observation.unitPriceCents}});}catch{fail(409,'Original contribution evidence cannot be recomputed');}
  for(const[k,v]of Object.entries(observation))if(canonical((result as any)[k])!==canonical(v))fail(409,'Disclosed contribution differs from deterministic source arithmetic');return result;};
 const baseline=calculate(b.baseline),scenarios=b.scenarios.map(calculate),containsSimulator=costs.some(c=>c.observation.origin.mode==='simulator');
 if(containsSimulator!==publication.containsSimulator||containsSimulator&&publication.purpose!=='simulation')fail(409,'Simulator cost evidence cannot be reclassified as business evidence');
 return{input,baseline,scenarios,containsSimulator,method:'prospective-contribution-v1',decisionExecuted:false as const,actualContribution:null};
}

/** Compatibility is an explicit analytical cohort, never product identity. */
export function publishedPricingScope(p:PricingPublication){const c=p.body.pricingContext,local={entityId:p.entityId,installationId:p.installationId,provider:p.provider};return{priceListKind:c.priceListKind,channel:c.channel,customer:c.customerReference===null?null:{...local,reference:c.customerReference},promotion:c.promotionId===null?null:{...local,id:c.promotionId,revision:p.body.promotion?.revision??null}};}
/** List IDs/names stay local descriptive provenance; they are not a cross-company cohort key. */
export function contributionCohortKey(p:PricingPublication){const b=p.body;return canonical({currency:b.currency,scale:b.scale,purpose:p.purpose,originCoverage:p.originCoverage,quantity:b.quantity,unit:b.unitDefinition,shipmentCount:b.shipmentCount,acquisitionMode:b.acquisitionMode,requiredCategories:[...b.requiredCategories].sort(),scopeReason:b.scopeReason,costBasis:b.baseline.costBasis,pricingScope:publishedPricingScope(p)});}
export function comparePublishedContributions(rows:{publication:PricingPublication;calculation:ReturnType<typeof recomputePublishedContribution>}[]){
 const groups=new Map<string,typeof rows>(),incomplete:typeof rows=[];
 for(const r of rows){if(r.calculation.baseline.status!=='complete'||r.publication.originCoverage!=='complete'){incomplete.push(r);continue;}const key=contributionCohortKey(r.publication);groups.set(key,[...(groups.get(key)??[]),r]);}
 return{method:'compatible-reviewed-contribution-comparison-v1',groups:[...groups.entries()].map(([key,values])=>({cohort:key,currency:values[0]!.publication.body.currency,quantity:values[0]!.publication.body.quantity,pricingScope:publishedPricingScope(values[0]!.publication),scopeReason:values[0]!.publication.body.scopeReason,comparable:values.length>1,ranked:values.slice().sort((a,b)=>b.calculation.baseline.contributionCents!-a.calculation.baseline.contributionCents!).map(r=>({reference:intelligenceReference(r.publication),publicationId:r.publication.id,entityId:r.publication.entityId,name:r.publication.body.name,pricingContext:r.publication.body.pricingContext,promotion:r.publication.body.promotion,contributionCents:r.calculation.baseline.contributionCents,contributionBasisPoints:r.calculation.baseline.contributionBasisPoints,knownCostSubtotalCents:r.calculation.baseline.knownCostSubtotalCents})),sameProduct:false})),incomplete:incomplete.map(r=>({publicationId:r.publication.id,entityId:r.publication.entityId,status:r.calculation.baseline.status,originCoverage:r.publication.originCoverage,missingRequiredCosts:r.calculation.baseline.missingRequiredCosts,contributionCents:null})),actualContribution:null,decisionExecuted:false,requiresHumanReview:true,limitations:['Only identical declared currency, quantity, units, allocation, acquisition, cost basis, cost scope and list-kind/channel/customer/promotion scope form a comparison group. Entity-local list UUIDs and labels do not establish or prevent comparability.','Equal names, SKUs or analytical cohorts do not establish product or supplier identity.','Estimates do not establish realized profit, demand or purchasing authority.']};
}
