import {Ajv} from 'ajv';

export type Schema = Record<string, unknown>;
export const CATALOG_CONTRACT_VERSION = 1 as const;
export const uuidSchema: Schema = {type:'string',pattern:'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'};
export const textSchema=(maxLength=160):Schema=>({type:'string',minLength:1,maxLength,pattern:'\\S'});
export const closedSchema=(properties:Record<string,unknown>,required=Object.keys(properties)):Schema=>({type:'object',additionalProperties:false,properties,required});
export const arraySchema=(items:Schema,maxItems=40,minItems=0):Schema=>({type:'array',items,minItems,maxItems});
export const revisionSchema:Schema={type:'integer',minimum:1,maximum:2147483647};
export const timestampSchema:Schema={type:'string',minLength:20,maxLength:35,pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$'};
export const moduleIdSchema:Schema={type:'string',minLength:3,maxLength:120,pattern:'^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$'};
export const keySchema:Schema={type:'string',minLength:1,maxLength:80,pattern:'^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'};
export const digestSchema:Schema={type:'string',pattern:'^[a-f0-9]{64}$'};
export const choiceSchema=(values:readonly string[]):Schema=>({type:'string',enum:[...values]});
const version={contractVersion:{const:1}};
const finiteQuantity:Schema={type:'number',minimum:0.001,maximum:100000000};
const optionalTimestamp:Schema={anyOf:[timestampSchema,{type:'null'}]};

/** Worker identity and module installation identity are deliberately distinct. */
export interface ProviderReference {contractVersion:1;workerInstallationId:string;entityId:string;moduleId:string;moduleInstallationId:string;packageDigest:string}
export const providerRefSchema=closedSchema({...version,workerInstallationId:uuidSchema,entityId:uuidSchema,moduleId:moduleIdSchema,moduleInstallationId:uuidSchema,packageDigest:digestSchema});
/** Retains the existing analytical stream + ID + revision convention. */
export interface CatalogSourceReference {contractVersion:1;entityId:string;moduleId:string;streamId:string;recordId:string;revision:number;provider:ProviderReference;observedAt:string}
export const sourceReferenceSchema=closedSchema({...version,entityId:uuidSchema,moduleId:moduleIdSchema,streamId:textSchema(120),recordId:textSchema(200),revision:revisionSchema,provider:providerRefSchema,observedAt:timestampSchema});
export interface CapabilityReference {contractVersion:1;provider:ProviderReference;capabilityId:string;contract:string;version:string;recordId:string;purpose:'inventory'|'production'|'fulfillment'|'availability'|'supplier'|'service'|'resource'}
export const capabilityReferenceSchema=closedSchema({...version,provider:providerRefSchema,capabilityId:moduleIdSchema,contract:moduleIdSchema,version:{type:'string',pattern:'^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$'},recordId:textSchema(200),purpose:choiceSchema(['inventory','production','fulfillment','availability','supplier','service','resource'])});

export type AttributeValue={key:string;type:'text';value:string}|{key:string;type:'number';value:number}|{key:string;type:'boolean';value:boolean}|{key:string;type:'choice';value:string};
export interface AttributeDefinition {contractVersion:1;key:string;name:string;type:'text'|'number'|'boolean'|'choice';required:boolean;choices?:string[];min?:number;max?:number;maxLength?:number}
export const attributeDefinitionSchema=closedSchema({...version,key:keySchema,name:textSchema(),type:choiceSchema(['text','number','boolean','choice']),required:{type:'boolean'},choices:arraySchema(textSchema(160),40,1),min:{type:'number',minimum:-1e12,maximum:1e12},max:{type:'number',minimum:-1e12,maximum:1e12},maxLength:{type:'integer',minimum:1,maximum:2000}},['contractVersion','key','name','type','required']);
export const attributeValueSchema:Schema={oneOf:[['text',textSchema(2000)],['number',{type:'number',minimum:-1e12,maximum:1e12}],['boolean',{type:'boolean'}],['choice',textSchema()]].map(([type,value])=>closedSchema({key:keySchema,type:{const:type},value}))};
export interface ExtensionDefinition {contractVersion:1;moduleId:string;provider:ProviderReference;key:string;revision:number;attributes:AttributeDefinition[]}
export interface ExtensionValue {contractVersion:1;moduleId:string;provider:ProviderReference;key:string;definitionRevision:number;values:AttributeValue[]}
export const extensionDefinitionSchema=closedSchema({...version,moduleId:moduleIdSchema,provider:providerRefSchema,key:keySchema,revision:revisionSchema,attributes:arraySchema(attributeDefinitionSchema,24)});
export const extensionValueSchema=closedSchema({...version,moduleId:moduleIdSchema,provider:providerRefSchema,key:keySchema,definitionRevision:revisionSchema,values:arraySchema(attributeValueSchema,24)});
export interface Category {contractVersion:1;id:string;ownerEntityId:string;name:string;parentId:string|null;revision:number}
export const categorySchema=closedSchema({...version,id:uuidSchema,ownerEntityId:uuidSchema,name:textSchema(),parentId:{anyOf:[uuidSchema,{type:'null'}]},revision:revisionSchema});

export interface MediaReference {contractVersion:1;id:string;kind:'image'|'video'|'document';uri:string;altText:string;source:CatalogSourceReference|null}
export const mediaReferenceSchema=closedSchema({...version,id:uuidSchema,kind:choiceSchema(['image','video','document']),uri:{type:'string',maxLength:2048,pattern:'^(https://[^\\s]+|steward-media:[A-Za-z0-9/_-]+)$'},altText:textSchema(500),source:{anyOf:[sourceReferenceSchema,{type:'null'}]}});
export interface AvailabilityRule {contractVersion:1;kind:'always'|'window'|'capability';startsAt:string|null;endsAt:string|null;reference:CapabilityReference|null}
export const availabilityRuleSchema=closedSchema({...version,kind:choiceSchema(['always','window','capability']),startsAt:optionalTimestamp,endsAt:optionalTimestamp,reference:{anyOf:[capabilityReferenceSchema,{type:'null'}]}});
export interface ExternalMapping {contractVersion:1;id:string;offeringId:string;variantId:string|null;provider:ProviderReference;externalProvider:string;accountId:string;productId:string;externalVariantId:string|null;status:'proposed'|'verified'|'conflict'|'inactive';origin:'manual'|'import';lastVerifiedAt:string|null;source:CatalogSourceReference;supportedCapabilities:string[];fieldAuthority:{field:'name'|'description'|'sku'|'variants'|'media'|'availability'|'pricing'|'fulfillment';authority:'provider'|'steward'|'local-display';localOverride:string|null}[]}
export const externalMappingSchema=closedSchema({...version,id:uuidSchema,offeringId:uuidSchema,variantId:{anyOf:[uuidSchema,{type:'null'}]},provider:providerRefSchema,externalProvider:moduleIdSchema,accountId:textSchema(200),productId:textSchema(200),externalVariantId:{anyOf:[textSchema(200),{type:'null'}]},status:choiceSchema(['proposed','verified','conflict','inactive']),origin:choiceSchema(['manual','import']),lastVerifiedAt:optionalTimestamp,source:sourceReferenceSchema,supportedCapabilities:arraySchema(moduleIdSchema,12),fieldAuthority:arraySchema(closedSchema({field:choiceSchema(['name','description','sku','variants','media','availability','pricing','fulfillment']),authority:choiceSchema(['provider','steward','local-display']),localOverride:{anyOf:[textSchema(2000),{type:'null'}]}}),8)});
export interface Variant {contractVersion:1;id:string;code:string;name:string;status:'draft'|'active'|'inactive'|'archived';attributes:AttributeValue[];unitOfMeasure:string;capabilityReferences:CapabilityReference[];revision:number}
export const variantSchema=closedSchema({...version,id:uuidSchema,code:textSchema(80),name:textSchema(),status:choiceSchema(['draft','active','inactive','archived']),attributes:arraySchema(attributeValueSchema,24),unitOfMeasure:textSchema(40),capabilityReferences:arraySchema(capabilityReferenceSchema,12),revision:revisionSchema});
export interface BundleComponent {contractVersion:1;offeringId:string;variantId:string|null;quantity:number;unitOfMeasure:string;required:boolean}
export const bundleComponentSchema=closedSchema({...version,offeringId:uuidSchema,variantId:{anyOf:[uuidSchema,{type:'null'}]},quantity:finiteQuantity,unitOfMeasure:textSchema(40),required:{type:'boolean'}});
export const OFFERING_TYPES=['physical','digital','service','subscription','rental','bundle'] as const;
export type OfferingType=typeof OFFERING_TYPES[number];
export interface OfferingBase {contractVersion:1;id:string;ownerEntityId:string;name:string;description:string;code:string;categoryIds:string[];attributes:AttributeValue[];tags:string[];status:'draft'|'active'|'inactive'|'archived';media:MediaReference[];availability:AvailabilityRule[];capabilityReferences:CapabilityReference[];externalMappings:ExternalMapping[];extensions:ExtensionValue[];sources:CatalogSourceReference[];revision:number;createdAt:string;updatedAt:string;createdBy:string;updatedBy:string;promotionEligibility:boolean;promotionGroups:string[];campaignReferences:string[]}
export interface PhysicalProperties {unitOfMeasure:string;dimensions:{length:number;width:number;height:number;unit:'mm'|'cm'|'m'|'in'}|null;supplierReferences:CapabilityReference[]}
export interface ServiceProperties {duration:number|null;capacityUnit:string;deliveryMethod:'onsite'|'remote'|'hybrid'|'other';requiredResources:CapabilityReference[];recurring:boolean}
export type Offering = OfferingBase & (
 {type:'physical';physical:PhysicalProperties;variants:Variant[]}|
 {type:'digital';digital:{deliveryMethod:'download'|'access'|'other';licenseDescription:string};variants:Variant[]}|
 {type:'service';service:ServiceProperties}|
 {type:'subscription';subscription:{interval:'day'|'week'|'month'|'year';intervalCount:number;delivery:'physical'|'digital'|'service'}}|
 {type:'rental';rental:{rentalUnit:'hour'|'day'|'week'|'month';availabilityReference:CapabilityReference|null}}|
 {type:'bundle';bundle:{components:BundleComponent[];lifecycleRule:'all-components-active'|'review-required'}});
const baseProperties={...version,id:uuidSchema,ownerEntityId:uuidSchema,name:textSchema(),description:{type:'string',maxLength:4000},code:textSchema(80),categoryIds:arraySchema(uuidSchema,20),attributes:arraySchema(attributeValueSchema,40),tags:arraySchema(textSchema(80),30),status:choiceSchema(['draft','active','inactive','archived']),media:arraySchema(mediaReferenceSchema,20),availability:arraySchema(availabilityRuleSchema,12),capabilityReferences:arraySchema(capabilityReferenceSchema,20),externalMappings:arraySchema(externalMappingSchema,40),extensions:arraySchema(extensionValueSchema,12),sources:arraySchema(sourceReferenceSchema,30),revision:revisionSchema,createdAt:timestampSchema,updatedAt:timestampSchema,createdBy:uuidSchema,updatedBy:uuidSchema,promotionEligibility:{type:'boolean'},promotionGroups:arraySchema(textSchema(80),20),campaignReferences:arraySchema(textSchema(200),20)};
const definitions:Record<OfferingType,Record<string,Schema>>={
 physical:{physical:closedSchema({unitOfMeasure:textSchema(40),dimensions:{anyOf:[closedSchema({length:finiteQuantity,width:finiteQuantity,height:finiteQuantity,unit:choiceSchema(['mm','cm','m','in'])}),{type:'null'}]},supplierReferences:arraySchema(capabilityReferenceSchema,20)}),variants:arraySchema(variantSchema,100)},
 digital:{digital:closedSchema({deliveryMethod:choiceSchema(['download','access','other']),licenseDescription:{type:'string',maxLength:2000}}),variants:arraySchema(variantSchema,100)},
 service:{service:closedSchema({duration:{anyOf:[finiteQuantity,{type:'null'}]},capacityUnit:textSchema(40),deliveryMethod:choiceSchema(['onsite','remote','hybrid','other']),requiredResources:arraySchema(capabilityReferenceSchema,20),recurring:{type:'boolean'}})},
 subscription:{subscription:closedSchema({interval:choiceSchema(['day','week','month','year']),intervalCount:{type:'integer',minimum:1,maximum:366},delivery:choiceSchema(['physical','digital','service'])})},
 rental:{rental:closedSchema({rentalUnit:choiceSchema(['hour','day','week','month']),availabilityReference:{anyOf:[capabilityReferenceSchema,{type:'null'}]}})},
 bundle:{bundle:closedSchema({components:arraySchema(bundleComponentSchema,40,1),lifecycleRule:choiceSchema(['all-components-active','review-required'])})}
};
export const offeringSchema:Schema={oneOf:OFFERING_TYPES.map(type=>closedSchema({...baseProperties,type:{const:type},...definitions[type]}))};
const ajv=new Ajv({strict:true,allErrors:false});
const validateShape=ajv.compile(offeringSchema),validateAttributeShape=ajv.compile(attributeDefinitionSchema),validateValueShape=ajv.compile(attributeValueSchema),validateExtensionShape=ajv.compile(extensionDefinitionSchema),validateCategoryShape=ajv.compile(categorySchema),validateMappingShape=ajv.compile(externalMappingSchema);
function check(value:unknown,code:string):asserts value {if(!value)throw new Error(code);}
function unique(values:readonly string[],code:string){check(new Set(values).size===values.length,code);}
function stamp(value:string){check(Number.isFinite(Date.parse(value)),'CATALOG_TIMESTAMP_INVALID');const parts=/^(.*?)(?:\.(\d{1,3}))?Z$/.exec(value);check(parts&&new Date(value).toISOString()===parts[1]+'.'+(parts[2]??'').padEnd(3,'0')+'Z','CATALOG_TIMESTAMP_INVALID');}
export function validateAttributeDefinition(value:unknown):asserts value is AttributeDefinition {
 check(validateAttributeShape(value),'CATALOG_ATTRIBUTE_DEFINITION_INVALID');const d=value as AttributeDefinition;
 if(d.type==='choice'){check(d.choices?.length,'CATALOG_ATTRIBUTE_CHOICES_REQUIRED');unique(d.choices,'CATALOG_ATTRIBUTE_CHOICE_DUPLICATE');}else check(d.choices===undefined,'CATALOG_ATTRIBUTE_CHOICES_FORBIDDEN');
 check(d.type==='number'||d.min===undefined&&d.max===undefined,'CATALOG_ATTRIBUTE_NUMBER_CONSTRAINT_INVALID');check(d.type==='text'||d.maxLength===undefined,'CATALOG_ATTRIBUTE_TEXT_CONSTRAINT_INVALID');check(d.min===undefined||d.max===undefined||d.min<=d.max,'CATALOG_ATTRIBUTE_RANGE_INVALID');
}
export function validateExtensionDefinition(value:unknown):asserts value is ExtensionDefinition {check(validateExtensionShape(value),'CATALOG_EXTENSION_DEFINITION_INVALID');const d=value as ExtensionDefinition;check(d.provider.moduleId===d.moduleId,'CATALOG_EXTENSION_PROVIDER_MISMATCH');unique(d.attributes.map(a=>a.key),'CATALOG_ATTRIBUTE_KEY_DUPLICATE');d.attributes.forEach(validateAttributeDefinition);}
export function validateAttributes(values:AttributeValue[],definitions:AttributeDefinition[]){
 unique(values.map(v=>v.key),'CATALOG_ATTRIBUTE_KEY_DUPLICATE');definitions.forEach(validateAttributeDefinition);unique(definitions.map(d=>d.key),'CATALOG_ATTRIBUTE_KEY_DUPLICATE');
 for(const d of definitions)check(!d.required||values.some(v=>v.key===d.key),'CATALOG_REQUIRED_ATTRIBUTE_MISSING');
 for(const v of values){check(validateValueShape(v),'CATALOG_ATTRIBUTE_VALUE_INVALID');const d=definitions.find(d=>d.key===v.key);check(d&&d.type===v.type,'CATALOG_ATTRIBUTE_UNDECLARED_OR_TYPE_MISMATCH');if(v.type==='text')check(v.value.length<=(d.maxLength??2000),'CATALOG_ATTRIBUTE_TEXT_TOO_LONG');if(v.type==='number')check(Number.isFinite(v.value)&&(d.min===undefined||v.value>=d.min)&&(d.max===undefined||v.value<=d.max),'CATALOG_ATTRIBUTE_OUT_OF_RANGE');if(v.type==='choice')check(d.choices?.includes(v.value),'CATALOG_ATTRIBUTE_CHOICE_INVALID');}
}
function sameProvider(a:ProviderReference,b:ProviderReference){return a.contractVersion===b.contractVersion&&a.workerInstallationId===b.workerInstallationId&&a.entityId===b.entityId&&a.moduleId===b.moduleId&&a.moduleInstallationId===b.moduleInstallationId&&a.packageDigest===b.packageDigest;}
function source(source:CatalogSourceReference){check(source.entityId===source.provider.entityId&&source.moduleId===source.provider.moduleId,'CATALOG_SOURCE_PROVIDER_MISMATCH');stamp(source.observedAt);}
/** Syntax/provenance validation only: never dereference or fetch remote media. */
function mediaUri(uri:string){
 if(uri.startsWith('steward-media:')){check(/^steward-media:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(uri),'CATALOG_MEDIA_URI_INVALID');return;}
 let parsed:URL;try{parsed=new URL(uri);}catch{throw new Error('CATALOG_MEDIA_URI_INVALID');}
 // Queries/fragments commonly carry temporary credentials and must never enter
 // catalog projections, logs or source control. Empty delimiters are rejected too.
 check(parsed.protocol==='https:'&&parsed.hostname.length>0&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash&&!/[?#\\\s]/.test(uri),'CATALOG_MEDIA_URI_INVALID');
 check(!uri.slice('https://'.length).split('/')[0]?.includes('@'),'CATALOG_MEDIA_URI_INVALID');
}
export function externalMappingIdentity(m:ExternalMapping){return JSON.stringify([m.provider.workerInstallationId,m.provider.entityId,m.provider.moduleId,m.provider.moduleInstallationId,m.provider.packageDigest,m.externalProvider,m.accountId,m.productId,m.externalVariantId]);}
export function validateExternalMapping(value:unknown):asserts value is ExternalMapping {check(validateMappingShape(value),'CATALOG_MAPPING_INVALID');const m=value as ExternalMapping;source(m.source);check(sameProvider(m.provider,m.source.provider),'CATALOG_MAPPING_SOURCE_MISMATCH');if(m.lastVerifiedAt)stamp(m.lastVerifiedAt);check(m.status!=='verified'||m.lastVerifiedAt!==null,'CATALOG_MAPPING_VERIFICATION_REQUIRED');unique(m.fieldAuthority.map(f=>f.field),'CATALOG_FIELD_AUTHORITY_DUPLICATE');unique(m.supportedCapabilities,'CATALOG_CAPABILITY_DUPLICATE');for(const f of m.fieldAuthority){check(f.authority==='local-display'?f.localOverride!==null&&['name','description','media'].includes(f.field):f.localOverride===null,'CATALOG_LOCAL_OVERRIDE_INVALID');if(f.field==='media'&&f.localOverride!==null)mediaUri(f.localOverride);}}
export interface CatalogValidationContext {ownerEntityId:string;attributeDefinitions?:AttributeDefinition[];extensionDefinitions?:ExtensionDefinition[];variantAttributeDefinitions?:AttributeDefinition[];/** Runtime-governed references only; never populated from the offering payload. */authorizedForeignProviders?:readonly ProviderReference[]}
function referenceOwner(provider:ProviderReference,context:CatalogValidationContext){check(provider.entityId===context.ownerEntityId||context.authorizedForeignProviders?.some(p=>sameProvider(p,provider)),'CATALOG_FOREIGN_PROVIDER_UNAUTHORIZED');}
/** The caller supplies the authenticated runtime owner; payload ownership never grants authority. */
export function validateOffering(value:unknown,context:CatalogValidationContext):asserts value is Offering {
 check(validateShape(value),'CATALOG_OFFERING_INVALID');const o=value as Offering;
 check(o.ownerEntityId===context.ownerEntityId,'CATALOG_OWNER_MISMATCH');stamp(o.createdAt);stamp(o.updatedAt);check(Date.parse(o.updatedAt)>=Date.parse(o.createdAt),'CATALOG_HISTORY_TIME_REGRESSED');
 unique(o.categoryIds,'CATALOG_CATEGORY_DUPLICATE');unique(o.tags,'CATALOG_TAG_DUPLICATE');unique(o.media.map(m=>m.id),'CATALOG_MEDIA_DUPLICATE');unique(o.promotionGroups,'CATALOG_PROMOTION_GROUP_DUPLICATE');unique(o.campaignReferences,'CATALOG_CAMPAIGN_REFERENCE_DUPLICATE');
 validateAttributes(o.attributes,context.attributeDefinitions??[]);o.sources.forEach(s=>{source(s);referenceOwner(s.provider,context);});o.media.forEach(m=>{mediaUri(m.uri);if(m.source){source(m.source);referenceOwner(m.source.provider,context);}});
 o.capabilityReferences.forEach(r=>referenceOwner(r.provider,context));
 unique(o.extensions.map(e=>e.moduleId+':'+e.key),'CATALOG_EXTENSION_DUPLICATE');for(const e of o.extensions){referenceOwner(e.provider,context);const d=context.extensionDefinitions?.find(d=>d.moduleId===e.moduleId&&d.key===e.key&&d.revision===e.definitionRevision&&sameProvider(e.provider,d.provider));check(d,'CATALOG_EXTENSION_DEFINITION_UNAVAILABLE');validateExtensionDefinition(d);validateAttributes(e.values,d.attributes);}
 for(const rule of o.availability){if(rule.startsAt)stamp(rule.startsAt);if(rule.endsAt)stamp(rule.endsAt);if(rule.reference)referenceOwner(rule.reference.provider,context);check(rule.kind==='always'?rule.startsAt===null&&rule.endsAt===null&&rule.reference===null:rule.kind==='window'?rule.startsAt!==null&&rule.endsAt!==null&&Date.parse(rule.startsAt)<Date.parse(rule.endsAt)&&rule.reference===null:rule.reference?.purpose==='availability'&&rule.startsAt===null&&rule.endsAt===null,'CATALOG_AVAILABILITY_INVALID');}
 const variants='variants' in o?o.variants:[];unique(variants.map(v=>v.id),'CATALOG_VARIANT_ID_DUPLICATE');unique(variants.map(v=>v.code),'CATALOG_VARIANT_CODE_DUPLICATE');variants.forEach(v=>{validateAttributes(v.attributes,context.variantAttributeDefinitions??[]);v.capabilityReferences.forEach(r=>referenceOwner(r.provider,context));});
 unique(o.externalMappings.map(m=>m.id),'CATALOG_MAPPING_ID_DUPLICATE');unique(o.externalMappings.filter(m=>m.status!=='inactive').map(externalMappingIdentity),'CATALOG_MAPPING_DUPLICATE');for(const m of o.externalMappings){validateExternalMapping(m);referenceOwner(m.provider,context);check(m.offeringId===o.id&&(m.variantId===null||variants.some(v=>v.id===m.variantId)),'CATALOG_MAPPING_TARGET_MISMATCH');}
 if(o.type==='physical'){check(o.physical.supplierReferences.every(r=>r.purpose==='supplier'),'CATALOG_SUPPLIER_REFERENCE_INVALID');o.physical.supplierReferences.forEach(r=>referenceOwner(r.provider,context));}
 if(o.type==='service')o.service.requiredResources.forEach(r=>referenceOwner(r.provider,context));
 if(o.type==='rental'){check(o.rental.availabilityReference===null||o.rental.availabilityReference.purpose==='availability','CATALOG_RENTAL_AVAILABILITY_INVALID');if(o.rental.availabilityReference)referenceOwner(o.rental.availabilityReference.provider,context);}
 if(o.type==='bundle'){unique(o.bundle.components.map(c=>c.offeringId+':'+(c.variantId??'')),'CATALOG_BUNDLE_COMPONENT_DUPLICATE');check(o.bundle.components.every(c=>c.offeringId!==o.id),'CATALOG_BUNDLE_SELF_REFERENCE');}
}
export function validateOfferingTransition(previous:Offering,next:unknown,context:CatalogValidationContext):asserts next is Offering {validateOffering(next,context);check(next.id===previous.id&&next.ownerEntityId===previous.ownerEntityId&&next.createdAt===previous.createdAt&&next.createdBy===previous.createdBy&&next.type===previous.type,'CATALOG_IMMUTABLE_IDENTITY_CHANGED');check(next.revision===previous.revision+1,'CATALOG_REVISION_CONFLICT');check(Date.parse(next.updatedAt)>=Date.parse(previous.updatedAt),'CATALOG_HISTORY_TIME_REGRESSED');}
export function validateCategory(value:unknown,ownerEntityId:string):asserts value is Category {check(validateCategoryShape(value),'CATALOG_CATEGORY_INVALID');const c=value as Category;check(c.ownerEntityId===ownerEntityId,'CATALOG_OWNER_MISMATCH');check(c.parentId!==c.id,'CATALOG_CATEGORY_SELF_REFERENCE');}
