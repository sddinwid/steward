import type {ApiContribution,ModuleFormField,ModulePackageManifest,ScreenContribution} from '@steward/module-sdk';
import {OFFERING_TYPES,SUPPORTED_PRICING_CURRENCIES,pricingCapability,catalogRequirement,catalogPricingRequirement} from '@steward/catalog-kit';
import {COST_CATEGORIES,costEvidenceRequirement} from '@steward/catalog-kit/cost-evidence';

export const pricingModuleId='steward.pricing.management';
const permission=(name:string)=>pricingModuleId+'.'+name;
const text=(name:string,label:string,required=true,extra:Partial<ModuleFormField>={}):ModuleFormField=>({name,label,type:'string',required,...extra});
const numeric=(name:string,label:string,required=true,minimum?:number,maximum?:number):ModuleFormField=>({name,label,type:'number',required,...(minimum===undefined?{}:{minimum}),...(maximum===undefined?{}:{maximum})});
const bool=(name:string,label:string,defaultValue=false):ModuleFormField=>({name,label,type:'boolean',required:true,default:defaultValue});
const choices=(name:string,label:string,values:readonly string[],defaultValue?:string,required=true):ModuleFormField=>text(name,label,required,{enum:[...values],...(defaultValue===undefined?{}:{default:defaultValue})});
const readonly=(name:string,label:string,type:ModuleFormField['type']='string'):ModuleFormField=>({name,label,type,required:false,readOnly:true});
const ref=(name:string,label:string,operationId:string,required=true,currencyField?:string):ModuleFormField=>text(name,label,required,{reference:{operationId,valueField:'id',labelField:'name',...(currencyField?{currencyField}:{})}});
const conditional=(field:ModuleFormField,key:string,equals:string):ModuleFormField=>({...field,visibleWhen:{field:key,equals}});
const recordKey=()=>text('recordKey','Creation request reference',true,{generate:'uuid'});
const time=(name:string,label:string,required=true)=>text(name,label,required,{format:'date-time'});
const currency=()=>choices('currency','Currency',SUPPORTED_PRICING_CURRENCIES,'USD');
const query:NonNullable<ApiContribution['query']>=['limit','offset','fields','status','q'];
const customQuery:NonNullable<ApiContribution['query']>=['limit','offset','status','q'];
const resourceQuery=(name:string):NonNullable<ApiContribution['query']>=>query.filter(key=>key!=='q'||!['DefaultPriceList','Review','CatalogJob','CatalogSubject'].includes(name)).filter(key=>key!=='status'||!['ApprovalPolicy','DefaultPriceList','Review','CatalogSubject'].includes(name));
const configResources=[['PriceList','/price-lists'],['ApprovalPolicy','/approval-policies'],['Promotion','/promotions'],['CustomerEligibility','/customer-eligibility'],['DefaultPriceList','/default-price-lists']] as const;
export const pricingApi:ApiContribution[]=[
 {operationId:'listAnalyticalPublication',method:'GET',path:'/analytical-overview',permission:permission('read'),query:customQuery},
 {operationId:'createAnalyticalPublication',method:'POST',path:'/analytical-publications',permission:permission('configure')},
 {operationId:'publishAnalytical',method:'POST',path:'/publish-analytical/:id',permission:permission('review')},
 {operationId:'withdrawAnalytical',method:'POST',path:'/withdraw-analytical/:id',permission:permission('configure')},
 ...configResources.flatMap(([name,path])=>[{operationId:'list'+name,method:'GET' as const,path,permission:permission('read'),query:resourceQuery(name)},{operationId:'create'+name,method:'POST' as const,path,permission:permission('configure')},{operationId:'update'+name,method:'PUT' as const,path:path+'/:id',permission:permission('configure')}]),
 {operationId:'listPriceRule',method:'GET',path:'/price-rules',permission:permission('read'),query},
 {operationId:'createPriceRule',method:'POST',path:'/price-rules',permission:permission('propose')},
 {operationId:'listReview',method:'GET',path:'/reviews',permission:permission('read'),query:resourceQuery('Review')},
 {operationId:'createReview',method:'POST',path:'/reviews',permission:permission('review')},
 {operationId:'listCatalogJob',method:'GET',path:'/catalog-jobs',permission:permission('read'),query:resourceQuery('CatalogJob')},
 {operationId:'createCatalogJob',method:'POST',path:'/catalog-jobs',permission:permission('catalog')},
 {operationId:'updateCatalogJob',method:'PUT',path:'/catalog-jobs/:id',permission:permission('catalog')},
 {operationId:'priceRuleChoices',method:'GET',path:'/price-rule-choices',permission:permission('read'),query:customQuery},
 {operationId:'verifiedSubjects',method:'GET',path:'/verified-subjects',permission:permission('read'),query:customQuery},
 {operationId:'catalogSubjects',method:'GET',path:'/catalog-subjects',permission:permission('read'),query:resourceQuery('CatalogSubject')},
 {operationId:'listQuoteJob',method:'GET',path:'/quote-jobs',permission:permission('read'),query},
 {operationId:'createQuoteJob',method:'POST',path:'/quote-jobs',permission:permission('read')},
 {operationId:'pricingOverview',method:'GET',path:'/pricing-overview',permission:permission('read')},
 {operationId:'priceDirectory',method:'GET',path:'/price-directory',permission:permission('read'),query:customQuery},
 {operationId:'channelPrices',method:'GET',path:'/channel-prices',permission:permission('read'),query:customQuery},
 {operationId:'promotionalPrices',method:'GET',path:'/promotional-prices',permission:permission('read'),query:customQuery},
 {operationId:'scheduledChanges',method:'GET',path:'/scheduled-changes',permission:permission('read'),query:customQuery},
 {operationId:'approvalHistory',method:'GET',path:'/approval-history',permission:permission('read'),query:customQuery},
 {operationId:'quoteOverview',method:'GET',path:'/quote-overview',permission:permission('read'),query:customQuery},
 {operationId:'resolutionHistory',method:'GET',path:'/resolution-history',permission:permission('read'),query:customQuery},
 {operationId:'resolutionPreview',method:'POST',path:'/resolution-preview',permission:permission('read')},
 {operationId:'activate',method:'POST',path:'/activate/:id',permission:permission('activate')},
 {operationId:'deactivate',method:'POST',path:'/deactivate/:id',permission:permission('activate')},
 {operationId:'requestCatalog',method:'POST',path:'/request-catalog/:id',permission:permission('catalog')},
 {operationId:'refreshSubject',method:'POST',path:'/refresh-subject/:id',permission:permission('catalog')},
 {operationId:'resolve',method:'POST',path:'/resolve/:id',permission:permission('read')}
];
pricingApi.push(
 {operationId:'listCostModel',method:'GET',path:'/cost-models',permission:permission('cost.read'),query},
 {operationId:'createCostModel',method:'POST',path:'/cost-models',permission:permission('configure')},
 {operationId:'updateCostModel',method:'PUT',path:'/cost-models/:id',permission:permission('configure')},
 {operationId:'listCostInput',method:'GET',path:'/cost-inputs',permission:permission('cost.read'),query},
 {operationId:'createCostInput',method:'POST',path:'/cost-inputs',permission:permission('configure')},
 {operationId:'costObservationChoices',method:'GET',path:'/cost-observation-choices',permission:permission('cost.read'),query:customQuery},
 {operationId:'requestCostInput',method:'POST',path:'/request-cost-input/:id',permission:permission('configure')},
 {operationId:'nextCostPage',method:'POST',path:'/next-cost-page/:id',permission:permission('configure')},
 {operationId:'deactivateCostInput',method:'POST',path:'/deactivate-cost-input/:id',permission:permission('configure')},
 {operationId:'costInputOverview',method:'GET',path:'/cost-input-overview',permission:permission('cost.read'),query:customQuery},
 {operationId:'contributionPreview',method:'POST',path:'/contribution-preview',permission:permission('cost.read')}
);
const screen=(screenId:string,title:string,listOperation:string,fields:ModuleFormField[],columns:string[],resource?:string,mutable=true):ScreenContribution=>({screenId,title,navigationLabel:title,navigationGroup:'Pricing Management',workspace:'business',formVersion:1,listOperation,fields,columns,...(resource?{createOperation:'create'+resource,...(mutable?{updateOperation:'update'+resource}:{})}:{})});
const subjectFields=():ModuleFormField[]=>[choices('subjectKind','Price subject',['sku','catalog'],'sku'),conditional(text('sku','Standalone SKU',true,{maxLength:80}),'subjectKind','sku'),conditional(ref('catalogSubjectId','Verified Catalog offering or variant','verifiedSubjects'),'subjectKind','catalog')];
const priceList=()=>ref('priceListId','Price list','listPriceList',true,'currency');
const ruleFields=():ModuleFormField[]=>[recordKey(),text('name','Price proposal name',true,{maxLength:160}),...subjectFields(),priceList(),ref('policyId','Approval policy','listApprovalPolicy'),{...ref('supersedesRuleRecordId','Earlier rule being revised','priceRuleChoices',false),reference:{operationId:'priceRuleChoices',valueField:'id',labelField:'choiceLabel'}},choices('adjustmentKind','Price adjustment',['fixed','basis-point-discount'],'fixed'),conditional({...numeric('amountCents','Listed amount',true,0,1000000000000),format:'money'},'adjustmentKind','fixed'),conditional(numeric('discountBasisPoints','Discount in basis points (100 = 1%)',true,1,10000),'adjustmentKind','basis-point-discount'),conditional({...ref('baseRuleRecordId','Exact approved base price rule','priceRuleChoices'),reference:{operationId:'priceRuleChoices',valueField:'id',labelField:'choiceLabel'}},'adjustmentKind','basis-point-discount'),{...numeric('priority','Priority (higher wins)',true,0,1000000),default:0},time('validFrom','Effective from'),time('validTo','Expires at',false),text('channel','Sales channel',false,{maxLength:120}),text('customerCategory','Authorized customer category',false,{maxLength:120}),ref('promotionId','Promotion','listPromotion',false),readonly('status','Approval and lifecycle status'),readonly('effectiveStatus','Effective price status'),readonly('currency','Transaction currency'),readonly('channelLabel','Sales channel')];
const ruleColumns=['name','subjectLabel','priceListName','currency','amountCents','channelLabel','status','effectiveStatus','validFrom'];
const ruleDisplay=():ModuleFormField[]=>[readonly('name','Price proposal'),readonly('subjectLabel','Offering or SKU'),readonly('priceListName','Price list'),readonly('currency','Currency'),readonly('amountCents','Listed amount','number'),readonly('channelLabel','Sales channel'),readonly('status','Approval and lifecycle status'),readonly('effectiveStatus','Effective price status'),readonly('validFrom','Effective from'),readonly('validTo','Expires at'),readonly('approvalCount','Current approvals','number')];
const lifecycle:NonNullable<ScreenContribution['actions']>=[{label:'Activate approved price',operationId:'activate',confirmation:'Activate this exact price revision only if its current approval policy and independent reviews remain valid? Existing accepted transaction prices remain unchanged.'},{label:'Deactivate price',operationId:'deactivate',confirmation:'Deactivate this price for new resolutions? Existing accepted transaction snapshots remain unchanged.'}];
const quoteFields=(preview=false):ModuleFormField[]=>[...(preview?[]:[recordKey()]),...subjectFields(),ref('priceListId','Price list (optional configured default)','listPriceList',false),currency(),text('channel','Sales channel',false,{maxLength:120}),text('customerReference','Customer reference (eligibility checked privately)',false,{maxLength:120}),ref('promotionId','Promotion','listPromotion',false),{...numeric('quantity','Quantity',true,1,100000000),default:1},...(preview?[time('hypotheticalAt','Hypothetical time (preview only)',false)]:[])];
export const pricingScreens:ScreenContribution[]=[
 {...screen('overview','Pricing Overview','listAnalyticalPublication',[
  recordKey(),text('name','Analytical publication name',true,{maxLength:160}),ref('modelId','Reviewed cost model','listCostModel',true,'currency'),
  {...numeric('quantity','Prospective evaluated quantity',true,1,100000000),default:1},numeric('shipmentCount','Explicit planned shipment count',false,1,100000000),
  choices('currency','Scenario currency (derived from selected model)',SUPPORTED_PRICING_CURRENCIES),
  {...numeric('scenarioUnitPriceCents','Optional prospective scenario unit price',false,0,1000000000000),format:'money'},
  ref('promotionId','Promotion context (approved rules only)','listPromotion',false),choices('purpose','Intended analytical audience',['business','simulation']),
  time('validUntil','Requested validity end (before current price and cost leases)'),text('reason','Human analytical disclosure reason',true,{format:'multiline',maxLength:1000}),
  readonly('reviewCount','Recorded distinct reviews','number'),readonly('requiredReviews','Required distinct reviews','number'),readonly('currentStatus','Current publication availability'),readonly('classification','Retained source classification'),readonly('status','Publication lifecycle')
 ],['name','currentStatus','reviewCount','requiredReviews','classification','validUntil','reason'],'AnalyticalPublication',false),currencyReference:'modelId',actions:[
  {label:'Record analytical review and publish at quorum',operationId:'publishAnalytical',confirmation:'Record your review of this exact prospective price and cost evidence? Publication waits for the required distinct current reviewers and separation of duties. This publishes a bounded immutable snapshot only and grants no price, financial, purchasing or production authority. Source and current reviewer permissions are checked again.'},
  {label:'Withdraw analytical snapshot',operationId:'withdrawAnalytical',confirmation:'Withdraw this analytical disclosure for future current views? Retained source facts, historical publication evidence and accepted transaction prices remain unchanged.'}
 ]},
 screen('price-lists','Price Lists','listPriceList',[recordKey(),text('name','Price list name',true,{maxLength:160}),choices('kind','Price list purpose',['retail','wholesale','customer','channel','promotion'],'retail'),currency(),choices('status','Price list status',['draft','active','inactive','archived'],'draft')],['name','kind','currency','status'],'PriceList'),
 {...screen('offering-prices','Offering Prices','priceDirectory',[...ruleFields(),readonly('subjectLabel','Offering or SKU'),readonly('priceListName','Price list')],ruleColumns,'PriceRule',false),currencyReference:'priceListId',actions:lifecycle},
 {...screen('channel-pricing','Channel Pricing','channelPrices',[...ruleFields().map(f=>f.name==='channel'?{...f,required:true}:f),readonly('subjectLabel','Offering or SKU'),readonly('priceListName','Price list')],ruleColumns,'PriceRule',false),currencyReference:'priceListId',actions:lifecycle},
 screen('promotional-pricing','Promotional Pricing','listPromotion',[recordKey(),text('name','Promotion name',true,{maxLength:160}),text('campaignReference','Campaign reference',false,{maxLength:200}),ref('priceListId','Planned price list (metadata only)','listPriceList',false),time('startsAt','Promotion starts'),time('endsAt','Promotion ends'),choices('status','Promotion status',['draft','active','inactive'],'draft')],['name','campaignReference','priceListId','startsAt','endsAt','status'],'Promotion'),
 {...screen('scheduled-changes','Scheduled Changes','scheduledChanges',ruleDisplay(),ruleColumns),actions:lifecycle},
 screen('approval-history','Approval History','approvalHistory',[readonly('ruleName','Price proposal'),readonly('decision','Decision'),readonly('reviewer','Reviewer'),readonly('reviewedAt','Reviewed at'),readonly('reason','Review reason'),readonly('termsDigest','Exact reviewed terms')],['ruleName','decision','reviewer','reviewedAt','reason','termsDigest']),
 {screenId:'resolution-preview',title:'Price Resolution Preview',navigationLabel:'Price Resolution Preview',navigationGroup:'Pricing Management',workspace:'business',formVersion:1,preview:{version:1,operationId:'resolutionPreview',submitLabel:'Preview resolved price'},fields:quoteFields(true),columns:[]},
 screen('approval-policies','Pricing Approval Policies','listApprovalPolicy',[recordKey(),text('name','Policy name',true,{maxLength:160}),bool('reviewRequired','Human review required',true),{...numeric('quorum','Distinct reviewer quorum',true,0,16),default:1},bool('separationOfDuties','Separate authors and reviewers',true),{...numeric('maximumAuthorizationSeconds','Resolution authorization lifetime (seconds)',true,1,86400),default:300}],['name','reviewRequired','quorum','separationOfDuties','maximumAuthorizationSeconds'],'ApprovalPolicy'),
 screen('review-proposals','Review Price Proposals','listReview',[recordKey(),{...ref('ruleRecordId','Exact price proposal','priceRuleChoices'),reference:{operationId:'priceRuleChoices',valueField:'id',labelField:'choiceLabel'}},choices('decision','Review decision',['approve','reject'],'approve'),text('reason','Human review reason',true,{format:'multiline',maxLength:500}),readonly('reviewer','Actual reviewer'),readonly('reviewedAt','Reviewed at')],['ruleRecordId','decision','reason','reviewer','reviewedAt'],'Review',false),
 {...screen('default-price-lists','Default Price Lists','listDefaultPriceList',[recordKey(),currency(),ref('priceListId','Default price list','listPriceList',true,'currency')],['currency','priceListId'],'DefaultPriceList'),currencyReference:'priceListId'},
 screen('customer-eligibility','Authorized Customer Eligibility','listCustomerEligibility',[recordKey(),text('customerReference','Customer reference',true,{maxLength:120}),text('category','Authorized category',true,{maxLength:120}),time('validFrom','Eligibility starts'),time('validTo','Eligibility expires'),choices('status','Eligibility status',['active','inactive'],'active')],['customerReference','category','validFrom','validTo','status'],'CustomerEligibility'),
 {...screen('catalog-requests','Catalog Read Requests','listCatalogJob',[recordKey(),choices('kind','Catalog request',['discover'],'discover'),text('query','Offering search',false,{maxLength:160}),choices('offeringType','Offering type',['any',...OFFERING_TYPES],'any'),readonly('status','Request status'),readonly('error','Availability')],['query','offeringType','status','error'],'CatalogJob'),actions:[{label:'Request governed Catalog read',operationId:'requestCatalog',confirmation:'Read from the explicitly approved Catalog provider? Missing or changed bindings remain unavailable; no provider identity is selected by this form.'}]},
 {...screen('catalog-subjects','Catalog Price Subjects','catalogSubjects',[readonly('name','Offering and variant'),readonly('offeringStatus','Offering lifecycle'),readonly('variantStatus','Variant lifecycle'),readonly('verified','Verified read','boolean'),readonly('observedAt','Observed at'),readonly('expiresAt','Evidence expires'),readonly('subject','Pinned Catalog subject and original provider'),readonly('promotionEligibility','Promotion eligibility','boolean')],['name','offeringStatus','verified','observedAt','expiresAt','promotionEligibility','subject']),actions:[{label:'Verify current Catalog subject',operationId:'refreshSubject',confirmation:'Read this exact offering and variant from its approved original Catalog provider? This verifies read evidence only and changes no price.'}]},
 {...screen('quote-jobs','Governed Price Resolutions','quoteOverview',[...quoteFields(),readonly('name','Subject'),readonly('status','Resolution status'),readonly('originalResolution','Historical decision (not current authorization)'),readonly('authorizationStatus','Current authorization'),readonly('authorizationReason','Current authorization reason'),readonly('decisionAvailable','Current decision available','boolean')],['name','currency','quantity','status','authorizationStatus','authorizationReason','decisionAvailable','originalResolution'],'QuoteJob',false),actions:[{label:'Resolve current authorized price',operationId:'resolve',confirmation:'Resolve using current approved prices, eligibility and original Catalog source evidence? This creates no order and changes no active price.'}]},
 screen('resolution-history','Resolution History','resolutionHistory',[readonly('name','Subject'),readonly('status','Resolution status'),readonly('currency','Currency'),readonly('evaluatedAt','Evaluated at'),readonly('resolution','Historical resolution evidence')],['name','status','currency','evaluatedAt','resolution']),
 {...screen('promotional-prices','Promotional Price Proposals','promotionalPrices',[...ruleFields().map(f=>f.name==='promotionId'?{...f,required:true}:f),readonly('subjectLabel','Offering or SKU'),readonly('priceListName','Price list')],ruleColumns,'PriceRule',false),currencyReference:'priceListId',actions:lifecycle}
];
pricingScreens.push(
 {...screen('cost-models','Estimated Cost Models','listCostModel',[
  recordKey(),text('name','Cost model name',true,{maxLength:160}),...subjectFields(),currency(),
  ref('priceListId','Price list (optional configured default)','listPriceList',false,'currency'),text('unitOfMeasure','Explicit model quantity unit',true,{maxLength:40}),
  choices('acquisitionMode','Required acquisition cost source',['supplier','production']),
  {name:'requiredCategories',label:'Required variable cost categories (acquisition is always required)',type:'array',required:true,minItems:1,maxItems:7,items:choices('category','Required category',COST_CATEGORIES)},
  text('scopeReason','Human cost scope and coverage reason',true,{format:'multiline',maxLength:1000}),choices('status','Cost model status (analysis only)',['active','inactive'],'active')
 ],['name','subjectKind','currency','unitOfMeasure','acquisitionMode','requiredCategories','status'],'CostModel')},
 {...screen('cost-inputs','Cost Evidence and Human Assumptions','costInputOverview',[
  recordKey(),choices('kind','Evidence or explicit human assumption',['discover','provider','assessment','not-applicable'],'discover'),
  conditional(choices('provider','Original cost provider',['procurement','printify']),'kind','discover'),
  conditional(text('query','Source quote, SKU or product search',false,{maxLength:160}),'kind','discover'),
  ref('modelId','Cost model (required except discovery)','listCostModel',false,'currency'),
  conditional({...ref('observationId','Observed original cost evidence','costObservationChoices'),reference:{operationId:'costObservationChoices',valueField:'id',labelField:'choiceLabel'}},'kind','provider'),
  conditional(text('name','Cost input name',true,{maxLength:160}),'kind','assessment'),
  choices('category','Human category (supplier/production need provider evidence or explicit N/A)',COST_CATEGORIES,undefined,false),
  conditional(choices('assessmentBasis','Human assessment basis',['estimate','unknown']),'kind','assessment'),
  conditional(choices('currency','Assessment currency (derived from selected model)',SUPPORTED_PRICING_CURRENCIES),'kind','assessment'),
  conditional({...numeric('amountCents','Human estimate amount (leave blank for unknown)',false,0,1000000000000),format:'money'},'kind','assessment'),
  conditional(choices('chargeBasis','Explicit assessment charge basis',['per-unit','per-order','per-shipment']),'kind','assessment'),
  conditional(text('unitOfMeasure','Explicit assessment quantity unit',true,{maxLength:40}),'kind','assessment'),
  conditional({...numeric('minimumQuantity','Minimum assessment quantity',true,1,100000000),default:1},'kind','assessment'),
  conditional(numeric('maximumQuantity','Maximum assessment quantity',false,1,100000000),'kind','assessment'),
  conditional(numeric('exactQuantity','Exact assessment quantity (optional)',false,1,100000000),'kind','assessment'),
  time('validUntil','Human assessment or N/A validity end',false),
  text('reason','Human reason (evidence binding, assessment or explicit N/A)',false,{format:'multiline',maxLength:1000}),
  readonly('status','Analysis evidence lifecycle'),readonly('currentStatus','Current evidence availability'),readonly('error','Unavailable evidence reason'),readonly('nextOffset','Next source page','number')
 ],['kind','name','modelId','observationId','category','currentStatus','reason','nextOffset'],'CostInput',false),currencyReference:'modelId',actions:[
  {label:'Request governed cost evidence',operationId:'requestCostInput',confirmation:'Read source estimates from the approved original provider? A discovered observation is not an activated analysis binding; an exact constrained read is required. This creates no financial or production obligation.'},
  {label:'Read next cost source page',operationId:'nextCostPage',confirmation:'Read the next bounded page from this same source? No quote, cost or price is changed.'},
  {label:'Deactivate analysis input',operationId:'deactivateCostInput',confirmation:'Stop this input being used for new prospective analyses? Original supplier quotes, provider observations and historical evidence remain unchanged.'}
 ]},
 {screenId:'contribution-preview',title:'Estimated Contribution and Scenario Preview',navigationLabel:'Estimated Contribution Preview',navigationGroup:'Pricing Management',workspace:'business',formVersion:1,currencyReference:'modelId',preview:{version:1,operationId:'contributionPreview',submitLabel:'Preview estimated contribution'},fields:[
  ref('modelId','Cost model','listCostModel',true,'currency'),choices('currency','Scenario currency (derived from selected model)',SUPPORTED_PRICING_CURRENCIES),ref('promotionId','Promotion context (approved rules only)','listPromotion',false),{...numeric('quantity','Evaluated quantity',true,1,100000000),default:1},numeric('shipmentCount','Explicit planned shipment count',false,1,100000000),
  {...numeric('scenarioUnitPriceCents','Prospective scenario unit price (not an approved price)',false,0,1000000000000),format:'money'}
 ],columns:[]}
);
export const pricingConfigurationSchema={type:'object',additionalProperties:false,required:['integrationsEnabled'],properties:{costReadEnabled:{type:'boolean',default:true,description:'Permit governed read-only cost evidence and prospective contribution analysis. This does not activate prices or create financial records.'},costMaxAgeSeconds:{type:'integer',minimum:10,maximum:86400,default:300,description:'Maximum accepted cost observation age; original source leases and human assumption validity are never extended.'},integrationsEnabled:{type:'boolean',default:false,description:'Enable explicitly approved Catalog read capabilities. Standalone SKU pricing remains available without Catalog.'},catalogMaxAgeSeconds:{type:'integer',minimum:10,maximum:3600,default:300,description:'Maximum age of a cached Catalog observation. Cached evidence does not prove current external state.'}}};
/** Signed optional metadata requests current local reviewer facts; it grants no permission. */
export function pricingManifest(migrations:{version:number;sha256:string}[]):ModulePackageManifest{return{manifestVersion:1,sdkVersion:1,moduleId:pricingModuleId,version:'1.3.0',name:'Pricing Management',description:'Independent entity-owned price lists, immutable proposals, separate human reviews and activation, deterministic resolution and historical evidence. No external publishing or payment execution.',minimumPlatformVersion:'0.15.0',dependencies:[],requiredPermissions:['storage.own-database'],approvalServices:{contractVersion:1,reviewerPermission:permission('review')},api:pricingApi,ui:pricingScreens,configurationSchema:pricingConfigurationSchema,persistence:{isolation:'dedicated-database',schemaVersion:migrations.length,migrations,destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[{name:'catalog-pricing-intelligence',version:1}],replication:{contractVersion:1,streams:[{streamId:'pricing_publications_v1',table:'pricing_analytical_publications',idColumn:'id',revisionColumn:'revision',columns:['id','revision','projection']},{streamId:'pricing_evidence_v1',table:'pricing_analytical_evidence',idColumn:'id',revisionColumn:'revision',columns:['id','revision','projection']}]},integration:{version:1,outboxPath:'/integration-outbox',inboxPath:'/integration-inbox',acknowledgmentPath:'/integration-ack',peers:[]},smart:{version:1,provides:[{...pricingCapability(pricingModuleId),configuration:{}}],consumes:[{...catalogRequirement(true),configuration:{integrationsEnabled:true}},{...catalogPricingRequirement(true),configuration:{integrationsEnabled:true}},costEvidenceRequirement('procurement',true),costEvidenceRequirement('printify',true)],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}}};}
