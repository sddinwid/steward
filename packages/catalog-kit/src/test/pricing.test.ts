import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,digest,resolveCapability,validateCapabilityValue,type CapabilityProvider} from '@steward/module-sdk';
import type {ProviderReference,CatalogSourceReference} from '../catalog.js';
import {priceSubjectCovers} from '../pricing.js';
import {SUPPORTED_PRICING_CURRENCIES,MAX_PRICE_CENTS,validateMoney,validatePriceSubject,validatePriceList,validatePricingApprovalPolicy,validatePriceRuleRevision,validateNewPriceRuleRevision,validatePriceRuleRevisionTransition,priceRuleTermsDigest,validatePriceApproval,validateNewPriceApproval,validatePriceApprovals,validatePriceResolutionRequest,validatePricePreviewRequest,validateResolvedPriceDecision,validatePriceResolutionPreview,validateAcceptedPriceSnapshot,validateAcceptedPriceSnapshotUnchanged,validatePricingCostComponent,pricingCapability,pricingRequirement,pricingOperations,type Money,type PriceList,type PricingApprovalPolicy,type PriceRuleRevision,type PriceApproval,type PriceResolutionRequest,type ResolvedPriceDecision,type PriceResolutionPreview,type AcceptedPriceSnapshot,type PricingCostComponent,type CatalogPriceSubject,type PriceDecisionValidationContext} from '../pricing.js';

const id=(n:number)=>`00000000-0000-4000-8000-${n.toString().padStart(12,'0')}`;
const now='2026-10-27T12:00:00.000Z',from='2026-10-27T00:00:00.000Z',to='2026-10-27T13:00:00.000Z';
const provider:ProviderReference={contractVersion:1,workerInstallationId:id(1),entityId:id(2),moduleId:'steward.pricing.management',moduleInstallationId:id(3),packageDigest:'a'.repeat(64)};
const catalogProvider:ProviderReference={...provider,moduleId:'steward.catalog.universal',moduleInstallationId:id(4),packageDigest:'b'.repeat(64)};
const money=(amountCents:number):Money=>({contractVersion:1,amountCents,currency:'USD',scale:2});
const ref=(recordId:string,revision:number,streamId:string,p=provider):CatalogSourceReference=>({contractVersion:1,entityId:p.entityId,moduleId:p.moduleId,streamId,recordId,revision,provider:structuredClone(p),observedAt:now});
function fixture(){
 const subject:CatalogPriceSubject={kind:'catalog',offeringId:id(10),variantId:id(11),offeringRevision:1,variantRevision:2,provider:structuredClone(catalogProvider)};
 const list:PriceList={contractVersion:1,id:id(20),ownerEntityId:provider.entityId,provider:structuredClone(provider),name:'Retail USD',kind:'retail',currency:'USD',scale:2,status:'active',revision:1};
 const policy:PricingApprovalPolicy={contractVersion:1,id:id(21),ownerEntityId:provider.entityId,provider:structuredClone(provider),revision:1,reviewRequired:true,reviewerPermission:provider.moduleId+'.review',quorum:1,separationOfDuties:true,maximumAuthorizationSeconds:300};
 const rule:PriceRuleRevision={contractVersion:1,id:id(22),ownerEntityId:provider.entityId,provider:structuredClone(provider),revision:1,subject:structuredClone(subject),priceListId:list.id,priceListRevision:list.revision,policyId:policy.id,policyRevision:policy.revision,currency:'USD',scale:2,validFrom:from,validTo:to,priority:10,selectors:{channel:null,customerCategory:null,promotion:null},adjustment:{kind:'fixed',price:money(2999)},proposedBy:id(30),proposedAt:from};
 const approval:PriceApproval={contractVersion:1,id:id(23),ruleId:rule.id,ruleRevision:rule.revision,termsDigest:priceRuleTermsDigest(rule),decision:'approve',reviewer:{accountId:id(31),workerInstallationId:provider.workerInstallationId,entityId:provider.entityId},reviewedAt:now};
 const request:PriceResolutionRequest={contractVersion:1,requestId:id(24),subject:structuredClone(subject),priceListId:list.id,currency:'USD',scale:2,channel:null,customerReference:null,promotionReference:null,quantity:2};
 const context:PriceDecisionValidationContext={ownerEntityId:provider.entityId,provider:structuredClone(provider),now,catalogSubjects:[structuredClone(subject)],reviewerPermission:policy.reviewerPermission,reviewerSnapshot:{issuedAt:Date.parse(now),reviewerPermission:policy.reviewerPermission,actors:[approval.reviewer.accountId]},request,priceList:list,rules:[rule],policy,approvals:[approval]};
 const decision:ResolvedPriceDecision={contractVersion:1,id:id(25),ownerEntityId:provider.entityId,provider:structuredClone(provider),requestId:request.requestId,subject:structuredClone(subject),currency:'USD',scale:2,quantity:2,listedPrice:money(2999),resolvedPrice:money(2999),discount:money(0),priceListSource:ref(list.id,list.revision,'pricing_lists_v1'),ruleSources:[ref(rule.id,rule.revision,'pricing_rules_v1')],policySource:ref(policy.id,policy.revision,'pricing_policies_v1'),approvalSources:[ref(approval.id,1,'pricing_approvals_v1')],eligibilitySources:[],termsDigest:digest(canonical([priceRuleTermsDigest(rule)])),evaluatedAt:now,authorizationExpiresAt:'2026-10-27T12:05:00.000Z',validFrom:from,validTo:to,previewOnly:false};
 return{subject,list,policy,rule,approval,request,context,decision};
}
function refresh(f:ReturnType<typeof fixture>){f.approval.termsDigest=priceRuleTermsDigest(f.rule);f.decision.termsDigest=digest(canonical(f.context.rules.map(priceRuleTermsDigest)));}
test('v1 money accepts only declared scale-two integer cents and preserves zero',()=>{
 for(const currency of SUPPORTED_PRICING_CURRENCIES)assert.doesNotThrow(()=>validateMoney({...money(0),currency}));
 for(const patch of [{amountCents:1.01},{amountCents:-1},{amountCents:MAX_PRICE_CENTS+1},{amountCents:Number.MAX_SAFE_INTEGER+1},{amountCents:NaN},{amountCents:Infinity},{amountCents:'100'},{scale:0},{scale:3},{currency:'JPY'},{currency:'KWD'},{currency:'usd'},{currency:'XXX'},{contractVersion:2},{exchangeRate:1.1}])assert.throws(()=>validateMoney({...money(1),...patch}));
 assert.throws(()=>validateMoney(money(1),'EUR'),/CURRENCY_MISMATCH/);
});
test('catalog subjects require exact currently verified offering, variant and provider pin',()=>{
 const f=fixture();validatePriceSubject(f.subject,f.context);
 for(const patch of [{offeringRevision:2},{variantRevision:1},{variantId:null},{offeringId:id(99)},{provider:{...catalogProvider,moduleInstallationId:id(99)}},{provider:{...catalogProvider,packageDigest:'c'.repeat(64)}},{provider:{...catalogProvider,entityId:id(99)}}])assert.throws(()=>validatePriceSubject({...f.subject,...patch},f.context));
 assert.throws(()=>validatePriceSubject(f.subject,{...f.context,catalogSubjects:[]}));
 assert.throws(()=>validatePriceSubject({...f.subject,providerVerified:true},f.context));
});
test('offering-wide price fallback covers only the exact verified offering and selected variant',()=>{
 const f=fixture(),wide={...f.subject,variantId:null,variantRevision:null};assert.equal(priceSubjectCovers(wide,f.subject),true);assert.equal(priceSubjectCovers(f.subject,wide),false);
 for(const patch of [{offeringRevision:2},{offeringId:id(99)},{provider:{...f.subject.provider,moduleInstallationId:id(99)}},{provider:{...f.subject.provider,packageDigest:'d'.repeat(64)}}])assert.equal(priceSubjectCovers({...wide,...patch},f.subject),false);
 assert.equal(priceSubjectCovers(f.subject,{...f.subject,variantRevision:99}),false);assert.equal(priceSubjectCovers(f.subject,{...f.subject,variantId:id(99)}),false);assert.equal(priceSubjectCovers({kind:'sku',sku:'ONE'},{kind:'sku',sku:'TWO'}),false);assert.equal(priceSubjectCovers({kind:'sku',sku:'ONE'},f.subject),false);assert.equal(priceSubjectCovers({kind:'sku',sku:'ONE'},{kind:'sku',sku:'ONE'}),true);
 f.rule.subject=wide;f.context.catalogSubjects=[wide,f.subject];refresh(f);validateResolvedPriceDecision(f.decision,f.context);
 const unknown={...f.subject,variantId:id(99)};assert.throws(()=>validateResolvedPriceDecision({...f.decision,subject:unknown},{...f.context,request:{...f.request,subject:unknown}}),/CATALOG_SOURCE_CHANGED/);
});
test('an offering-wide fixed base can support one approved variant-specific discount',()=>{
 const f=fixture(),wide={...f.subject,variantId:null,variantRevision:null};f.rule.subject=wide;f.context.catalogSubjects=[wide,f.subject];refresh(f);
 const discount:PriceRuleRevision={...structuredClone(f.rule),id:id(50),subject:f.subject,priority:20,adjustment:{kind:'basis-point-discount',discountBasisPoints:1000,baseRuleId:f.rule.id,baseRuleRevision:1}},review={...structuredClone(f.approval),id:id(51),ruleId:discount.id,termsDigest:priceRuleTermsDigest(discount)};f.context.rules.push(discount);f.context.approvals.push(review);f.decision.ruleSources.push(ref(discount.id,1,'pricing_rules_v1'));f.decision.approvalSources.push(ref(review.id,1,'pricing_approvals_v1'));f.decision.discount=money(299);f.decision.resolvedPrice=money(2700);refresh(f);validateResolvedPriceDecision(f.decision,f.context);
});
test('Pricing alone supports legacy SKU without Catalog and rejects caller authority fields',()=>{
 const f=fixture();const request={...f.request,subject:{kind:'sku',sku:'SERVICE-HOURLY'}};assert.doesNotThrow(()=>validatePriceResolutionRequest(request,{...f.context,catalogSubjects:[]}));
 for(const patch of [{ownerEntityId:provider.entityId},{actorId:id(31)},{role:'local_admin'},{customerCategory:'wholesale'},{eligible:true},{transactionAt:from},{evaluatedAt:from},{providerIdentity:provider}])assert.throws(()=>validatePriceResolutionRequest({...request,...patch},f.context));
});
test('lists and policies are owned by trusted runtime and declared review permission',()=>{
 const f=fixture();validatePriceList(f.list,f.context);validatePricingApprovalPolicy(f.policy,f.context);
 for(const kind of ['retail','wholesale','customer','channel','promotion'])assert.doesNotThrow(()=>validatePriceList({...f.list,kind},f.context));
 assert.throws(()=>validatePriceList({...f.list,ownerEntityId:id(99)},f.context));assert.throws(()=>validatePriceList({...f.list,provider:{...provider,moduleInstallationId:id(99)}},f.context));
 for(const patch of [{reviewRequired:true,quorum:0},{reviewRequired:false,quorum:1},{reviewRequired:false,quorum:0,separationOfDuties:true},{reviewerPermission:'other.module.admin'},{reviewerPermission:provider.moduleId+'.admin'},{maximumAuthorizationSeconds:0},{quorum:17},{granted:true}])assert.throws(()=>validatePricingApprovalPolicy({...f.policy,...patch},f.context));
 assert.doesNotThrow(()=>validatePricingApprovalPolicy({...f.policy,reviewRequired:false,quorum:0,separationOfDuties:false},f.context));
});
test('rules bind exact list/policy revisions, currency and valid canonical half-open periods',()=>{
 const f=fixture();validatePriceRuleRevision(f.rule,f.context,f.list,f.policy);
 for(const patch of [{priceListRevision:2},{policyRevision:2},{currency:'EUR'},{adjustment:{kind:'fixed',price:{...money(10),currency:'EUR'}}},{validTo:from},{validTo:'2026-10-26T00:00:00Z'},{validFrom:'2026-02-30T12:00:00Z'},{validFrom:'2026-10-27T00:00:00+00:00'},{priority:-1},{active:true},{permissions:['activate']}])assert.throws(()=>validatePriceRuleRevision({...f.rule,...patch},f.context,f.list,f.policy));
 assert.doesNotThrow(()=>validatePriceRuleRevision({...f.rule,validTo:null},f.context,f.list,f.policy));
});
test('promotions cannot extend outside their own interval or forge eligibility',()=>{
 const f=fixture();const promotion={id:id(40),revision:1,campaignReference:'campaign-preview',startsAt:from,endsAt:to};f.rule.selectors.promotion=promotion;assert.doesNotThrow(()=>validatePriceRuleRevision(f.rule,f.context,f.list,f.policy));
 assert.throws(()=>validatePriceRuleRevision({...f.rule,validTo:null},f.context,f.list,f.policy),/PROMOTION_PERIOD/);
 assert.throws(()=>validatePriceRuleRevision({...f.rule,selectors:{...f.rule.selectors,promotion:{...promotion,approved:true}}},f.context,f.list,f.policy));
});
test('rule revision terms have stable key-order independent digests and invalidate old approvals',()=>{
 const f=fixture();assert.equal(priceRuleTermsDigest(f.rule),priceRuleTermsDigest(Object.fromEntries(Object.entries(f.rule).reverse()) as unknown as PriceRuleRevision));
 const next={...f.rule,revision:2,priority:11,proposedAt:now};validatePriceRuleRevisionTransition(f.rule,next,f.context,f.list,f.policy);assert.notEqual(priceRuleTermsDigest(next),f.approval.termsDigest);assert.throws(()=>validatePriceApproval(f.approval,next,f.policy,f.context),/TERMS_CHANGED/);
 for(const patch of [{revision:1},{revision:3},{id:id(99)},{proposedAt:'2026-10-26T00:00:00Z'}])assert.throws(()=>validatePriceRuleRevisionTransition(f.rule,{...next,...patch},f.context,f.list,f.policy));
});
test('approval validates exact terms, current identity, separation and no role-forgery fields',()=>{
 const f=fixture();validatePriceApproval(f.approval,f.rule,f.policy,f.context);validatePriceApprovals(f.rule,f.policy,[f.approval],f.context);
 for(const patch of [{termsDigest:'b'.repeat(64)},{ruleRevision:2},{reviewer:{...f.approval.reviewer,entityId:id(99)}},{reviewer:{...f.approval.reviewer,workerInstallationId:id(99)}},{reviewer:{...f.approval.reviewer,role:'local_admin'}},{approved:true},{reviewedAt:to}])assert.throws(()=>validatePriceApproval({...f.approval,...patch},f.rule,f.policy,f.context));
 assert.throws(()=>validatePriceApproval(f.approval,f.rule,f.policy,{...f.context,reviewerSnapshot:undefined} as unknown as PriceDecisionValidationContext),/CURRENT_REVIEWER/);
 assert.throws(()=>validatePriceApproval(f.approval,f.rule,f.policy,{...f.context,reviewerSnapshot:{...f.context.reviewerSnapshot!,actors:[]}}),/CURRENT_REVIEWER/);
 assert.throws(()=>validatePriceApproval(f.approval,f.rule,f.policy,{...f.context,reviewerSnapshot:{...f.context.reviewerSnapshot!,issuedAt:Date.parse(now)-61000}}),/CURRENT_REVIEWER/);
 assert.throws(()=>validatePriceApproval({...f.approval,termsDigest:priceRuleTermsDigest({...f.rule,ownerEntityId:id(99)})},{...f.rule,ownerEntityId:id(99)},f.policy,f.context),/OWNER_OR_PROVIDER/);
 f.rule.proposedBy=f.approval.reviewer.accountId;refresh(f);assert.throws(()=>validatePriceApproval(f.approval,f.rule,f.policy,f.context),/SEPARATION/);
});
test('quorum cannot be met by duplicate identities or rejected decisions',()=>{
 const f=fixture();assert.throws(()=>validatePriceApprovals(f.rule,f.policy,[],f.context),/QUORUM/);assert.throws(()=>validatePriceApprovals(f.rule,f.policy,[f.approval,{...f.approval,id:id(99)}],f.context),/REVIEWER_DUPLICATE/);assert.throws(()=>validatePriceApprovals(f.rule,f.policy,[{...f.approval,decision:'reject'}],f.context),/REJECTED/);
});
test('new proposals bind the authenticated proposer and server time, preserving historical validation',()=>{
 const f=fixture(),actor=f.rule.proposedBy;validatePriceRuleRevision(f.rule,f.context,f.list,f.policy);assert.throws(()=>validateNewPriceRuleRevision(f.rule,f.context,f.list,f.policy,actor),/SERVER_PROPOSAL_TIME/);
 const current={...f.rule,proposedAt:now};validateNewPriceRuleRevision(current,f.context,f.list,f.policy,actor);
 assert.throws(()=>validateNewPriceRuleRevision({...current,proposedBy:id(99)},f.context,f.list,f.policy,actor),/PROPOSER_ACTOR/);
 assert.throws(()=>validateNewPriceRuleRevision(current,f.context,f.list,f.policy,'module-runtime'),/PROPOSER_ACTOR/);
 assert.throws(()=>validateNewPriceRuleRevision({...current,actingActorId:actor},f.context,f.list,f.policy,actor));
});
test('new approvals cannot impersonate another eligible reviewer to manufacture quorum',()=>{
 const f=fixture(),actor=f.approval.reviewer.accountId,other=id(98);f.context.reviewerSnapshot!.actors=[actor,other];validateNewPriceApproval(f.approval,f.rule,f.policy,f.context,actor);
 const forged={...f.approval,id:id(99),reviewer:{...f.approval.reviewer,accountId:other}};validatePriceApproval(forged,f.rule,f.policy,f.context);assert.throws(()=>validateNewPriceApproval(forged,f.rule,f.policy,f.context,actor),/REVIEWER_ACTOR/);
 assert.throws(()=>validateNewPriceApproval({...f.approval,actingActorId:other},f.rule,f.policy,f.context,actor));
 assert.throws(()=>validateNewPriceApproval(f.approval,f.rule,f.policy,f.context,'module-runtime'),/REVIEWER_ACTOR/);
 const historical={...f.approval,reviewedAt:'2026-10-27T11:59:00.000Z'};validatePriceApproval(historical,f.rule,f.policy,f.context);assert.throws(()=>validateNewPriceApproval(historical,f.rule,f.policy,f.context,actor),/SERVER_REVIEW_TIME/);
});
test('customer and promotion eligibility comes from server-owned evidence, never caller claims',()=>{
 const f=fixture();const request={...f.request,customerReference:'customer-1',promotionReference:id(40)};assert.throws(()=>validatePriceResolutionRequest(request,f.context),/SERVER_ELIGIBILITY/);
 const eligibility={customerReference:'customer-1',customerCategory:'wholesale',promotionReference:id(40),sources:[ref(id(80),1,'customer_eligibility_v1')]};assert.doesNotThrow(()=>validatePriceResolutionRequest(request,{...f.context,eligibility}));
 assert.throws(()=>validatePriceResolutionRequest(request,{...f.context,eligibility:{...eligibility,sources:[]}}),/SOURCE_REQUIRED/);
 assert.throws(()=>validatePriceResolutionRequest({...request,customerCategory:'wholesale',promotionEligible:true},{...f.context,eligibility}));
 assert.throws(()=>validatePriceResolutionRequest(request,{...f.context,eligibility:{...eligibility,customerReference:'customer-2'}}));
});
test('transaction evaluation uses server time while preview explicitly permits hypothetical time',()=>{
 const f=fixture();validatePriceResolutionRequest(f.request,f.context);validatePricePreviewRequest({...f.request,hypotheticalAt:from},f.context);assert.throws(()=>validatePriceResolutionRequest({...f.request,hypotheticalAt:from},f.context));
 validateResolvedPriceDecision(f.decision,f.context);assert.throws(()=>validateResolvedPriceDecision({...f.decision,evaluatedAt:from},f.context),/SERVER_TIME/);assert.throws(()=>validateResolvedPriceDecision({...f.decision,previewOnly:true},f.context),/SERVER_TIME/);
 const hypothetical='2026-10-27T12:01:00.000Z';assert.doesNotThrow(()=>validateResolvedPriceDecision({...f.decision,previewOnly:true,evaluatedAt:hypothetical},{...f.context,previewAt:hypothetical}));
});
test('resolved decisions enforce exact cents, list price, discount, transaction bound and source revisions',()=>{
 const f=fixture();validateResolvedPriceDecision(f.decision,f.context);
 for(const patch of [{resolvedPrice:money(2998)},{listedPrice:money(3000),resolvedPrice:money(3000)},{discount:money(1),resolvedPrice:money(2998)},{resolvedPrice:{...money(2999),currency:'EUR'}},{priceListSource:ref(f.list.id,2,'pricing_lists_v1')},{ruleSources:[ref(f.rule.id,1,'other_stream')]},{ruleSources:[ref(f.rule.id,1,'pricing_rules_v1',{...provider,moduleInstallationId:id(99)})]},{termsDigest:'b'.repeat(64)},{authorized:true}])assert.throws(()=>validateResolvedPriceDecision({...f.decision,...patch},f.context));
 const huge=structuredClone(f.decision);huge.quantity=100000000;huge.listedPrice=money(MAX_PRICE_CENTS);huge.resolvedPrice=money(MAX_PRICE_CENTS);assert.throws(()=>validateResolvedPriceDecision(huge,{...f.context,request:{...f.request,quantity:huge.quantity}}),/OVERFLOW/);
});
test('authorization expires no later than policy duration or earliest rule half-open boundary',()=>{
 const f=fixture();for(const authorizationExpiresAt of [now,'2026-10-27T12:05:00.001Z',to,'2026-10-27T13:00:00.001Z'])assert.throws(()=>validateResolvedPriceDecision({...f.decision,authorizationExpiresAt},f.context),/EXPIRY/);
 const boundary='2026-10-27T12:03:00.000Z';f.rule.validTo=boundary;f.decision.validTo=boundary;f.decision.authorizationExpiresAt=boundary;refresh(f);assert.doesNotThrow(()=>validateResolvedPriceDecision(f.decision,f.context));assert.throws(()=>validateResolvedPriceDecision({...f.decision,authorizationExpiresAt:'2026-10-27T12:03:00.001Z'},f.context),/EXPIRY/);
});
test('basis-point discounts bind an approved base rule and floor fractional discount cents exactly',()=>{
 const f=fixture();const discount:PriceRuleRevision={...structuredClone(f.rule),id:id(50),priority:20,adjustment:{kind:'basis-point-discount',discountBasisPoints:1250,baseRuleId:f.rule.id,baseRuleRevision:f.rule.revision}};
 const approval={...structuredClone(f.approval),id:id(51),ruleId:discount.id,termsDigest:priceRuleTermsDigest(discount)};f.context.rules.push(discount);f.context.approvals.push(approval);f.decision.ruleSources.push(ref(discount.id,1,'pricing_rules_v1'));f.decision.approvalSources.push(ref(approval.id,1,'pricing_approvals_v1'));f.decision.discount=money(374);f.decision.resolvedPrice=money(2625);refresh(f);validateResolvedPriceDecision(f.decision,f.context);
 assert.throws(()=>validateResolvedPriceDecision({...f.decision,discount:money(375),resolvedPrice:money(2624)},f.context),/DISCOUNT_AMOUNT/);
 for(const discountBasisPoints of [0,-1,1.5,10001])assert.throws(()=>validatePriceRuleRevision({...discount,adjustment:{...discount.adjustment,discountBasisPoints}},f.context,f.list,f.policy));
 assert.throws(()=>validatePriceRuleRevision({...discount,adjustment:{...discount.adjustment,baseRuleId:discount.id}},f.context,f.list,f.policy),/SELF_REFERENCE/);
});
test('decision selectors cannot bypass channel or private customer/promotion eligibility',()=>{
 const f=fixture();for(const selectors of [{...f.rule.selectors,channel:'retail'},{...f.rule.selectors,customerCategory:'wholesale'},{...f.rule.selectors,promotion:{id:id(40),revision:1,campaignReference:null,startsAt:from,endsAt:to}}]){f.rule.selectors=selectors;refresh(f);assert.throws(()=>validateResolvedPriceDecision(f.decision,f.context),/INELIGIBLE/);}
});
test('all resolution statuses are explicit and only resolved results contain decisions',()=>{
 const f=fixture();for(const status of ['resolved','not_found','conflict','expired','source_changed'] as const){const result:PriceResolutionPreview={contractVersion:1,requestId:f.request.requestId,status,evaluatedAt:now,decision:status==='resolved'?f.decision:null,candidates:[],reason:'Explicit bounded result'};validatePriceResolutionPreview(result,f.context);assert.throws(()=>validatePriceResolutionPreview({...result,decision:status==='resolved'?null:f.decision},f.context),/STATUS/);}
});
test('Sales acceptance freezes exact authorized quote once and rejects expired or hypothetical decisions',()=>{
 const f=fixture();const snapshot:AcceptedPriceSnapshot={contractVersion:1,decision:f.decision,orderId:id(60),acceptedAt:now,acceptedBy:id(61)},context={...f.context,decision:f.decision,orderId:snapshot.orderId,actorId:snapshot.acceptedBy};validateAcceptedPriceSnapshot(snapshot,context);validateAcceptedPriceSnapshotUnchanged(snapshot,structuredClone(snapshot));
 for(const patch of [{orderId:id(99)},{acceptedBy:id(99)},{acceptedAt:from},{decision:{...f.decision,resolvedPrice:money(1)}},{decision:{...f.decision,previewOnly:true}},{accepted:true}])assert.throws(()=>validateAcceptedPriceSnapshot({...snapshot,...patch},context));
 const expired={...context,now:f.decision.authorizationExpiresAt};assert.throws(()=>validateAcceptedPriceSnapshot({...snapshot,acceptedAt:expired.now},expired),/EXPIRED/);assert.throws(()=>validateAcceptedPriceSnapshotUnchanged(snapshot,{...snapshot,acceptedBy:id(99)}),/IMMUTABLE/);
});
test('cost references preserve missing versus zero, estimate versus recorded, currency and source provider',()=>{
 const f=fixture();const cost:PricingCostComponent={contractVersion:1,id:id(70),subject:f.subject,category:'production',description:'Provider estimate',amount:money(0),basis:'estimate',source:ref(id(71),1,'catalog_costs_v1',catalogProvider),observedAt:now};validatePricingCostComponent(cost,f.context,'USD');validatePricingCostComponent({...cost,basis:'recorded'},f.context,'USD');validatePricingCostComponent({...cost,basis:'unknown',amount:null,source:null},f.context,'USD');
 for(const patch of [{basis:'estimate',amount:null},{basis:'recorded',source:null},{basis:'unknown',amount:money(0)},{amount:{...money(0),currency:'EUR'}},{source:{...cost.source!,entityId:id(99)}},{source:{...cost.source!,moduleId:'other.module'}},{profitCents:1},{amount:{...money(1),currency:'JPY'}}])assert.throws(()=>validatePricingCostComponent({...cost,...patch},f.context,'USD'));
});
test('pricing SSMA schemas fit closed bounded durable read workflows and never expose price activation',()=>{
 const f=fixture(),inputs=[f.request,{contractVersion:1,requestId:f.request.requestId,jobId:id(80)}],outputs=[{contractVersion:1,requestId:f.request.requestId,jobId:id(80),status:'pending'},{contractVersion:1,requestId:f.request.requestId,jobId:id(80),status:'completed',resolution:{contractVersion:1,requestId:f.request.requestId,status:'resolved',evaluatedAt:now,decision:f.decision,candidates:[],reason:'Exact approved price'}}];
 for(const [i,op] of pricingOperations.entries()){validateCapabilityValue(inputs[i],op.input);validateCapabilityValue(outputs[i],op.output);assert(Buffer.byteLength(canonical(op.input))<=16384);assert(Buffer.byteLength(canonical(op.output))<=16384);assert.throws(()=>validateCapabilityValue({...inputs[i],ownerEntityId:provider.entityId},op.input));}
 const complete=outputs[1]!;assert.throws(()=>validateCapabilityValue({...complete,status:'pending'},pricingOperations[1]!.output));assert.throws(()=>validateCapabilityValue({...complete,resolution:null},pricingOperations[1]!.output));
 const capability=pricingCapability();assert(capability.operations.every(o=>o.mode==='durable'&&o.retry==='safe'&&o.idempotency==='required'&&o.permission===provider.moduleId+'.read'));assert.equal(capability.operations.some(o=>o.name.includes('activate')),false);
 const p:CapabilityProvider={moduleId:provider.moduleId,moduleVersion:'1.0.0',installationId:provider.moduleInstallationId,entityId:provider.entityId,packageDigest:provider.packageDigest,state:'active',configured:true,capability};const ctx={entityId:provider.entityId,permissions:[provider.moduleId+'.read']};assert.equal(resolveCapability(pricingRequirement(),[p],ctx).state,'resolved');assert.equal(resolveCapability(pricingRequirement(),[p],{...ctx,permissions:[]}).state,'unavailable');assert.equal(resolveCapability(pricingRequirement(),[p],{...ctx,entityId:id(99)}).state,'unavailable');
});
