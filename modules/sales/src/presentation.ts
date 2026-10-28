import {catalogPublicationRequirement} from '@steward/catalog-kit/intelligence';
import type {ApiContribution,ModuleFormField,ModulePackageManifest,ScreenContribution} from '@steward/module-sdk';
import {catalogRequirement,catalogOperationalRequirement,pricingRequirement,verifiedStockRequirement} from '@steward/catalog-kit';
const field=(name:string,label:string,required=true):ModuleFormField=>({name,label,type:'string',required,maxLength:80});
const read=(name:string,label:string):ModuleFormField=>({...field(name,label,false),readOnly:true});
const baseScreen=(screenId:string,title:string,listOperation:string,fields:ModuleFormField[],columns:string[]):ScreenContribution=>({screenId,title,navigationLabel:title,navigationGroup:'Sales & Orders',workspace:'business',formVersion:1,listOperation,fields,columns});
/** Legacy forms/contracts stay intact; new workflows contribute module-local data-only UI. */
export function salesManifest(base:ModulePackageManifest,migrations:ModulePackageManifest['persistence']['migrations']):ModulePackageManifest{
 if(base.moduleId!=='cee.sales')throw Error('Unexpected Sales identity');
 const manifest=structuredClone(base);manifest.version='1.5.0';manifest.minimumPlatformVersion='0.15.0';
 manifest.persistence={...manifest.persistence,schemaVersion:migrations.length,migrations};
 const screens:ScreenContribution[]=[];
 const recordKey=():ModuleFormField=>({...field('recordKey','Creation request reference'),generate:'uuid'});
 const acceptedLine=():ModuleFormField=>({...field('lineChoiceId','Original immutable accepted merchandise line'),reference:{operationId:'analyticalSaleLines',valueField:'id',labelField:'choiceLabel'}});
 screens.push(
  {...baseScreen('analytical-attributions','Reviewed Analytical Sales Attribution','listAnalyticalAttribution',[
   recordKey(),acceptedLine(),{...field('catalogSubjectId','Verified reviewed Catalog offering or variant'),reference:{operationId:'analyticalCatalogSubjects',valueField:'id',labelField:'name'}},
   {...field('reason','Human attribution reason'),format:'multiline',maxLength:1000},read('status','Attribution review status')
  ],['lineChoiceId','catalogSubjectId','status','reason']),createOperation:'createAnalyticalAttribution',updateOperation:'updateAnalyticalAttribution',actions:[
   {label:'Review analytical attribution',operationId:'reviewAttribution',confirmation:'Review this exact immutable accepted line and verified original Catalog definition for analytical attribution only? This cannot change accepted prices, manufacture Pricing authority at acceptance, reserve stock or merge offerings by matching names or SKUs.'},
   {label:'Withdraw analytical attribution',operationId:'withdrawAttribution',confirmation:'Withdraw this attribution from future analytical publications? Original accepted line prices and retained publication evidence remain unchanged.'}
  ]},
  {...baseScreen('analytical-publications','Reviewed Sales Analytical Publications','listAnalyticalPublication',[
   recordKey(),acceptedLine(),{...field('purpose','Intended analytical audience'),enum:['business','simulation']},
   {...field('reviewReason','Human analytical disclosure reason'),format:'multiline',maxLength:1000},{...field('validUntil','Requested analytical disclosure validity end'),format:'date-time'},
   read('currentStatus','Current publication availability'),{name:'publicationRevision',label:'Publication revision',type:'number',required:false,readOnly:true},read('sourceSnapshot','Accepted line and analytical source snapshot')
  ],['lineChoiceId','purpose','currentStatus','validUntil','publicationRevision','reviewReason','sourceSnapshot']),createOperation:'createAnalyticalPublication',updateOperation:'updateAnalyticalPublication',actions:[
   {label:'Review and publish Sales snapshot',operationId:'publishAnalytical',confirmation:'Publish this exact accepted merchandise line and its reviewed Catalog attribution to authorized analytics? Fulfilled merchandise amounts are captured as of the snapshot; refunds and actual historical contribution remain unknown without allocation evidence. No accepted amount or operational obligation changes.'},
   {label:'Withdraw Sales snapshot',operationId:'withdrawAnalytical',confirmation:'Withdraw this analytical disclosure for future current views? Original accepted order prices, fulfillments and historical publication evidence remain retained.'}
  ]}
 );
 const api:ApiContribution[]=[
  {operationId:'listAnalyticalAttribution',method:'GET',path:'/analytical-attributions',permission:'cee.sales.read',query:['limit','offset','q','status']},
  {operationId:'createAnalyticalAttribution',method:'POST',path:'/analytical-attributions',permission:'cee.sales.publish'},
  {operationId:'updateAnalyticalAttribution',method:'PUT',path:'/analytical-attributions/:id',permission:'cee.sales.publish'},
  {operationId:'reviewAttribution',method:'POST',path:'/review-attribution/:id',permission:'cee.sales.publish'},
  {operationId:'withdrawAttribution',method:'POST',path:'/withdraw-attribution/:id',permission:'cee.sales.publish'},
  {operationId:'listAnalyticalPublication',method:'GET',path:'/analytical-overview',permission:'cee.sales.read',query:['limit','offset','q','status']},
  {operationId:'createAnalyticalPublication',method:'POST',path:'/analytical-publications',permission:'cee.sales.publish'},
  {operationId:'updateAnalyticalPublication',method:'PUT',path:'/analytical-publications/:id',permission:'cee.sales.publish'},
  {operationId:'publishAnalytical',method:'POST',path:'/publish-analytical/:id',permission:'cee.sales.publish'},
  {operationId:'withdrawAnalytical',method:'POST',path:'/withdraw-analytical/:id',permission:'cee.sales.publish'},
  {operationId:'analyticalSaleLines',method:'GET',path:'/analytical-sale-lines',permission:'cee.sales.read',query:['limit','offset','q']},
  {operationId:'analyticalCatalogSubjects',method:'GET',path:'/analytical-catalog-subjects',permission:'cee.sales.read',query:['limit','offset','q']},
  {operationId:'refreshAnalyticalCatalog',method:'POST',path:'/refresh-analytical-catalog/:id',permission:'cee.sales.catalog'},
  {operationId:'priceReconciliation',method:'GET',path:'/price-reconciliation',permission:'cee.sales.read'},
  {operationId:'listPriceReconciliation',method:'GET',path:'/price-reconciliations',permission:'cee.sales.reconcile',query:['limit','offset','fields','q']},
  {operationId:'createPriceReconciliation',method:'POST',path:'/price-reconciliations',permission:'cee.sales.reconcile'}
 ];
 api.push(
  {operationId:'listGovernedOrder',method:'GET',path:'/governed-orders',permission:'cee.sales.read',query:['limit','offset','fields','q','status']},
  {operationId:'createGovernedOrder',method:'POST',path:'/governed-orders',permission:'cee.sales.write'},
  {operationId:'updateGovernedOrder',method:'PUT',path:'/governed-orders/:id',permission:'cee.sales.write'},
  ...([['requestPrices','/request-prices/:id'],['pollPrices','/poll-prices/:id'],['confirmGoverned','/confirm-governed/:id'],['cancelGoverned','/cancel-governed/:id']] as [string,string][]).map(([operationId,path])=>({operationId,path,method:'POST' as const,permission:'cee.sales.write'})),
  {operationId:'listSalesCatalogJob',method:'GET',path:'/sales-catalog-jobs',permission:'cee.sales.catalog',query:['limit','offset','fields','q','status']},
  {operationId:'createSalesCatalogJob',method:'POST',path:'/sales-catalog-jobs',permission:'cee.sales.catalog'},
  {operationId:'requestSalesCatalog',method:'POST',path:'/request-sales-catalog/:id',permission:'cee.sales.catalog'},
  {operationId:'salesCatalogSubjects',method:'GET',path:'/sales-catalog-subjects',permission:'cee.sales.read',query:['limit','offset']},
  {operationId:'verifiedSalesSubjects',method:'GET',path:'/verified-sales-subjects',permission:'cee.sales.read',query:['limit','offset']},
  {operationId:'refreshSalesSubject',method:'POST',path:'/refresh-sales-subject/:id',permission:'cee.sales.catalog'},
  {operationId:'governedOrderEvidence',method:'GET',path:'/governed-order-evidence',permission:'cee.sales.read',query:['limit','offset']},
  {operationId:'acceptedSalesPrices',method:'GET',path:'/accepted-sales-prices',permission:'cee.sales.read',query:['limit','offset']}
 );
 screens.push(
  {...baseScreen('governed-orders','Governed Order Drafts','listGovernedOrder',[
   field('number','Order number'),{...field('customerCode','Customer'),reference:{operationId:'listCustomer',valueField:'code',labelField:'name'}},
   {...field('currency','Order currency'),maxLength:3,enum:['USD','EUR','GBP','CAD','AUD','CHF']},
   {name:'lines',label:'Requested merchandise lines (no accepted price yet)',type:'array',required:true,minItems:1,maxItems:40,items:{name:'line',label:'Requested line',type:'object',required:true,fields:[field('lineKey','Line reference'),{name:'quantity',label:'Whole-unit quantity',type:'number',required:true,minimum:1,maximum:100000000},{...field('subjectKind','Price subject'),enum:['sku','catalog'],default:'sku'},{...field('sku','Standalone SKU'),visibleWhen:{field:'subjectKind',equals:'sku'}},{...field('catalogSubjectId','Verified Catalog offering or variant'),reference:{operationId:'verifiedSalesSubjects',valueField:'id',labelField:'name'},visibleWhen:{field:'subjectKind',equals:'catalog'}}]}},
   read('status','Draft lifecycle'),read('quoteStatus','Price request status'),read('confirmationStatus','Human confirmation status'),read('confirmationReason','Confirmation availability'),read('materializedOrderId','Accepted Sales order reference')
  ],['number','customerCode','currency','lines','status','quoteStatus','confirmationStatus','confirmationReason','materializedOrderId']),createOperation:'createGovernedOrder',updateOperation:'updateGovernedOrder',actions:[
   {label:'Request governed prices',operationId:'requestPrices',confirmation:'Request prices from the approved Pricing provider using configured currency defaults? This does not accept an order.'},
   {label:'Poll current price authorization',operationId:'pollPrices',confirmation:'Request fresh scoped price status from the original provider? This does not accept an order.'},
   {label:'Confirm with fresh price authorization',operationId:'confirmGoverned',confirmation:'Authorize this bounded order confirmation intent? Acceptance requires fresh scoped Pricing receipts, current writer membership and verified compatible stock references.'},
   {label:'Cancel staged draft',operationId:'cancelGoverned',confirmation:'Cancel this unaccepted draft? An accepted order must use its original Sales cancellation workflow.'}
  ]},
  {...baseScreen('sales-catalog-requests','Sales Catalog Read Requests','listSalesCatalogJob',[field('number','Read request reference'),{...field('query','Offering name search',false),maxLength:160},{...field('offeringType','Offering type'),enum:['any','physical','service','digital','subscription','rental','bundle'],default:'any'},read('status','Request status'),read('error','Availability')],['number','query','offeringType','status','error']),createOperation:'createSalesCatalogJob',actions:[{label:'Request governed Catalog discovery',operationId:'requestSalesCatalog',confirmation:'Read active offering metadata from the explicitly approved Catalog provider? This grants no price, stock or production authority.'}]},
  {...baseScreen('sales-catalog-subjects','Sales Catalog Choices','salesCatalogSubjects',[read('name','Offering or variant'),{name:'verified',label:'Exact governed read verified',type:'boolean',required:false,readOnly:true},read('observedAt','Observed at'),read('expiresAt','Observation expires at')],['name','verified','observedAt','expiresAt']),actions:[{label:'Refresh exact operational reference',operationId:'refreshSalesSubject',confirmation:'Request a fresh exact offering and operational-reference read from this observation\'s original provider? Unsupported or ambiguous stock routing remains blocked.'},{label:'Read reviewed Catalog classification',operationId:'refreshAnalyticalCatalog',confirmation:'Read the exact current human-reviewed Catalog publication from this original provider? This supports analytical classification only and grants no price, stock or programme authority.'}]},
  baseScreen('governed-order-evidence','Governed Request and Confirmation Evidence','governedOrderEvidence',[read('number','Draft number'),read('lines','Requested line context'),read('quotes','Latest Pricing observations (not continuing acceptance)'),read('quoteStatus','Request status'),read('confirmationStatus','Confirmation status'),read('confirmationReason','Confirmation availability'),read('evidenceBasis','Authority limitation')],['number','lines','quoteStatus','confirmationStatus','confirmationReason','quotes','evidenceBasis']),
  baseScreen('accepted-sales-prices','Immutable Accepted Sales Prices','acceptedSalesPrices',[read('orderNumber','Accepted order'),read('currency','Accepted currency'),read('mode','Evidence basis'),read('actor','Actual accepting actor'),read('recordedAt','Acceptance recorded at'),read('lines','Immutable accepted merchandise lines'),read('proof','Historical acceptance proof')],['orderNumber','currency','mode','actor','recordedAt','lines','proof'])
 );
 Object.assign(manifest.configurationSchema.properties as Record<string,unknown>,{
  analyticalCatalogMaxAgeSeconds:{type:'integer',minimum:10,maximum:3600,default:300,description:'Maximum accepted age of a reviewed Catalog classification read. Tightening applies to cached reads; increasing this setting never extends their captured source expiry.'},
  governedSalesEnabled:{type:'boolean',default:false,description:'Enable staged governed price requests and bounded human confirmation. Legacy manual orders remain independently available.'},
  governedCatalogEnabled:{type:'boolean',default:false,description:'Enable read-only governed Catalog discovery and exact operational-reference refresh for Sales.'},
  catalogMaxAgeSeconds:{type:'integer',minimum:10,maximum:3600,default:300,description:'Maximum age of exact Catalog observations, not continuing stock or price authority.'},
  confirmationIntentSeconds:{type:'integer',minimum:10,maximum:300,default:60,description:'Maximum lifetime of a human confirmation intent awaiting fresh scoped Pricing authorization.'}
 });
 manifest.approvalServices={contractVersion:1,reviewerPermission:'cee.sales.write'};
 manifest.smart??={version:1,provides:[],consumes:[],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}};
 const requirements=[{...catalogPublicationRequirement(true),configuration:{governedCatalogEnabled:true}},{...catalogRequirement(true),configuration:{governedCatalogEnabled:true}},{...catalogOperationalRequirement(true),configuration:{governedCatalogEnabled:true}},{...pricingRequirement(true),configuration:{governedSalesEnabled:true}},{...verifiedStockRequirement(true),configuration:{governedSalesEnabled:true,integrationsEnabled:true}}];
 manifest.smart.consumes=[...manifest.smart.consumes.filter(r=>!requirements.some(n=>n.capabilityId===r.capabilityId)),...requirements];
 screens.push(
  {screenId:'accepted-price-reconciliation',title:'Accepted Price Evidence',navigationLabel:'Accepted Price Evidence',navigationGroup:'Sales & Orders',workspace:'business',formVersion:1,listOperation:'priceReconciliation',fields:[{name:'number',label:'Order',type:'string',required:false,readOnly:true},{name:'currency',label:'Original currency',type:'string',required:false,readOnly:true},{name:'status',label:'Order status',type:'string',required:false,readOnly:true},{name:'priceKnown',label:'Accepted price evidence known',type:'boolean',required:false,readOnly:true},{name:'basis',label:'Evidence basis',type:'string',required:false,readOnly:true}],columns:['number','currency','status','priceKnown','basis']},
  {screenId:'price-reconciliation-review',title:'Review Unknown Accepted Prices',navigationLabel:'Review Unknown Accepted Prices',navigationGroup:'Sales & Orders',workspace:'business',formVersion:1,listOperation:'listPriceReconciliation',createOperation:'createPriceReconciliation',currencyReference:'orderNumber',fields:[
   {name:'number',label:'Reconciliation reference',type:'string',required:true,maxLength:80},
   {name:'orderNumber',label:'Original sales order',type:'string',required:true,reference:{operationId:'listOrder',valueField:'number',labelField:'number',currencyField:'currency'}},
   {name:'currency',label:'Original order currency',type:'string',required:true,maxLength:3},
   {name:'lines',label:'Reviewed original merchandise lines',type:'array',required:true,minItems:1,maxItems:40,items:{name:'line',label:'Reviewed line',type:'object',required:true,fields:[{name:'sku',label:'Original SKU',type:'string',required:true,maxLength:80},{name:'quantity',label:'Original whole-unit quantity',type:'number',required:true,minimum:1},{name:'unitPriceCents',label:'Original gross unit price',type:'number',format:'money',required:true,minimum:0},{name:'lineRevenueCents',label:'Reviewed merchandise line revenue',type:'number',format:'money',required:true,minimum:0}]}},
   {name:'evidenceReference',label:'Reviewed evidence reference',type:'string',required:true,maxLength:300},
   {name:'reason',label:'Human review reason (recorded now, not a recovered original receipt)',type:'string',format:'multiline',required:true,maxLength:1000},
   {name:'basis',label:'Recorded review basis',type:'string',required:false,readOnly:true},{name:'actor',label:'Actual reviewer',type:'string',required:false,readOnly:true},{name:'recordedAt',label:'Review recorded at',type:'string',required:false,readOnly:true}
  ],columns:['number','orderNumber','currency','lines','basis','actor','recordedAt']}
 );
 manifest.analyticalCapabilities=[...manifest.analyticalCapabilities.filter(c=>c.name!=='catalog-pricing-intelligence'),{name:'catalog-pricing-intelligence',version:1}];
 manifest.replication={contractVersion:1,streams:[...(manifest.replication?.streams??[]).filter(s=>s.streamId!=='sales_publications_v1'),{streamId:'sales_publications_v1',table:'sales_publications',idColumn:'id',revisionColumn:'revision',columns:['id','revision','projection']}]};
 manifest.api=[...manifest.api.filter(op=>!api.some(addition=>addition.operationId===op.operationId)),...api];
 manifest.ui=[...manifest.ui.filter(screen=>!screens.some(addition=>addition.screenId===screen.screenId)),...screens];
 return manifest;
}

