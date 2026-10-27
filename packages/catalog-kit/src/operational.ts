import {Ajv} from 'ajv';
import {canonical,digest,type CapabilityContract,type CapabilityRequirement} from '@steward/module-sdk';
import {arraySchema,closedSchema,choiceSchema,uuidSchema,textSchema,revisionSchema,timestampSchema,digestSchema,capabilityReferenceSchema,sourceReferenceSchema,type Schema,type CapabilityReference,type CatalogSourceReference} from './catalog.js';
import {operationalOfferingSchema,type OperationalOfferingView} from './capabilities.js';

export interface UnitDefinition {unitOfMeasure:string|null;quantityScale:number|null;configurationDigest:string|null}
export interface StockCapabilityIdentity {capabilityId:string;contract:string;version:string}
export interface InventoryItemDefinition {contractVersion:1;recordId:string;revision:number;code:string;name:string;status:'active'|'inactive';unitDefinition:UnitDefinition;definitionDigest:string;stockCapability:StockCapabilityIdentity|null;observedAt:string;expiresAt:string}
export interface SupplierReferenceDefinition {contractVersion:1;recordId:string;revision:number;code:string;name:string;status:'active'|'inactive';definitionDigest:string;observedAt:string;expiresAt:string}
export const unitDefinitionSchema=closedSchema({unitOfMeasure:{anyOf:[textSchema(40),{type:'null'}]},quantityScale:{anyOf:[{type:'integer',minimum:0,maximum:6},{type:'null'}]},configurationDigest:{anyOf:[digestSchema,{type:'null'}]}});
const stockCapabilitySchema=closedSchema({capabilityId:{const:'inventory.stock.verified'},contract:{const:'steward.verified-stock-reservations'},version:{const:'1.0.0'}});
const base={contractVersion:{const:1},recordId:uuidSchema,revision:revisionSchema,code:textSchema(80),name:textSchema(),status:choiceSchema(['active','inactive']),definitionDigest:digestSchema,observedAt:timestampSchema,expiresAt:timestampSchema};
export const inventoryItemDefinitionSchema=closedSchema({...base,unitDefinition:unitDefinitionSchema,stockCapability:{anyOf:[stockCapabilitySchema,{type:'null'}]}});
export const supplierReferenceDefinitionSchema=closedSchema(base);
const discoverInput=closedSchema({contractVersion:{const:1},query:{type:'string',maxLength:160},offset:{type:'integer',minimum:0,maximum:100000},limit:{type:'integer',minimum:1,maximum:20}});
const lookupInput=closedSchema({contractVersion:{const:1},recordId:uuidSchema});
const result=(definition:Schema):Schema=>({oneOf:[closedSchema({contractVersion:{const:1},status:{const:'found'},record:definition}),closedSchema({contractVersion:{const:1},status:{const:'not_found'},record:{type:'null'}})]});
const discovery=(definition:Schema)=>closedSchema({contractVersion:{const:1},records:arraySchema(definition,20),nextOffset:{anyOf:[{type:'integer',minimum:0,maximum:100000},{type:'null'}]}});
export const inventoryItemsOperations=[{name:'inventory.items.discover',input:discoverInput,output:discovery(inventoryItemDefinitionSchema)},{name:'inventory.items.lookup',input:lookupInput,output:result(inventoryItemDefinitionSchema)}] as const;
export const supplierReferencesOperations=[{name:'procurement.suppliers.discover',input:discoverInput,output:discovery(supplierReferenceDefinitionSchema)},{name:'procurement.suppliers.lookup',input:lookupInput,output:result(supplierReferenceDefinitionSchema)}] as const;
const inventoryIdentity={capabilityId:'inventory.items.read',contract:'steward.inventory-items',version:'1.0.0'};
const supplierIdentity={capabilityId:'procurement.suppliers.read',contract:'steward.supplier-references',version:'1.0.0'};
function capability(identity:typeof inventoryIdentity,moduleId:string,operations:readonly {name:string;input:Schema;output:Schema}[],permission='read'):CapabilityContract{return{...identity,operations:operations.map(o=>({...o,command:o.name,permission:moduleId+'.'+permission,mode:'durable',idempotency:'required',retry:'safe'})),events:[],sensitivity:'business',scope:'entity',ownership:'provider',configuration:{integrationsEnabled:true}};}
function requirement(identity:typeof inventoryIdentity,operations:readonly {name:string;input:Schema;output:Schema}[],optional:boolean):CapabilityRequirement{return{capabilityId:identity.capabilityId,contract:identity.contract,minimumVersion:identity.version,maximumMajor:1,operations:operations.map(o=>({...o})),events:[],maximumSensitivity:'business',optional};}
export const inventoryItemsCapability=(moduleId:string)=>capability(inventoryIdentity,moduleId,inventoryItemsOperations);
export const inventoryItemsRequirement=(optional=true)=>requirement(inventoryIdentity,inventoryItemsOperations,optional);
export const supplierReferencesCapability=(moduleId='cee.procurement')=>capability(supplierIdentity,moduleId,supplierReferencesOperations);
export const supplierReferencesRequirement=(optional=true)=>requirement(supplierIdentity,supplierReferencesOperations,optional);
export function makeUnitDefinition(unitOfMeasure:unknown,quantityScale:number):UnitDefinition {const unit=typeof unitOfMeasure==='string'&&unitOfMeasure.trim()?unitOfMeasure.trim():null;return{unitOfMeasure:unit,quantityScale,configurationDigest:digest(canonical({contractVersion:1,unitOfMeasure:unit,quantityScale}))};}
export function inventoryDefinitionDigest(value:Pick<InventoryItemDefinition,'recordId'|'code'|'name'|'status'|'unitDefinition'|'stockCapability'>){return digest(canonical({contractVersion:1,recordId:value.recordId,code:value.code,name:value.name,status:value.status,unitDefinition:value.unitDefinition,stockCapability:value.stockCapability}));}
export function supplierDefinitionDigest(value:Pick<SupplierReferenceDefinition,'recordId'|'code'|'name'|'status'>){return digest(canonical({contractVersion:1,recordId:value.recordId,code:value.code,name:value.name,status:value.status}));}
const ajv=new Ajv({strict:true,allErrors:false}),itemShape=ajv.compile(inventoryItemDefinitionSchema),supplierShape=ajv.compile(supplierReferenceDefinitionSchema),unitShape=ajv.compile(unitDefinitionSchema);
function check(ok:unknown,code:string):asserts ok {if(!ok)throw Error(code);}
function time(value:string){const n=Date.parse(value),parts=/^(.*?)(?:\.(\d{1,3}))?Z$/.exec(value);check(Number.isFinite(n)&&parts&&new Date(n).toISOString()===parts[1]+'.'+(parts[2]??'').padEnd(3,'0')+'Z','OPERATIONAL_TIMESTAMP_INVALID');return n;}
export function validateUnitDefinition(value:unknown):asserts value is UnitDefinition {check(unitShape(value),'OPERATIONAL_UNIT_INVALID');const u=value as UnitDefinition;if(u.configurationDigest!==null)check(u.quantityScale!==null&&u.configurationDigest===makeUnitDefinition(u.unitOfMeasure,u.quantityScale).configurationDigest,'OPERATIONAL_UNIT_PROOF_INVALID');else check(u.unitOfMeasure===null&&u.quantityScale===null,'OPERATIONAL_UNIT_PROOF_REQUIRED');}
export function validateInventoryItemDefinition(value:unknown):asserts value is InventoryItemDefinition {check(itemShape(value),'OPERATIONAL_ITEM_INVALID');const v=value as InventoryItemDefinition;validateUnitDefinition(v.unitDefinition);check(v.definitionDigest===inventoryDefinitionDigest(v),'OPERATIONAL_DEFINITION_PROOF_INVALID');check(time(v.observedAt)<time(v.expiresAt),'OPERATIONAL_LEASE_INVALID');}
export function validateSupplierReferenceDefinition(value:unknown):asserts value is SupplierReferenceDefinition {check(supplierShape(value),'OPERATIONAL_SUPPLIER_INVALID');const v=value as SupplierReferenceDefinition;check(v.definitionDigest===supplierDefinitionDigest(v),'OPERATIONAL_DEFINITION_PROOF_INVALID');check(time(v.observedAt)<time(v.expiresAt),'OPERATIONAL_LEASE_INVALID');}
export const VERIFIED_STOCK_CAPABILITY={capabilityId:'inventory.stock.verified',contract:'steward.verified-stock-reservations',version:'1.0.0'} as const;
export interface VerifiedStockDefinition {sku:string;recordId:string;definitionDigest:string;unitDefinition:UnitDefinition}
export const verifiedStockDefinitionSchema=closedSchema({sku:textSchema(80),recordId:uuidSchema,definitionDigest:digestSchema,unitDefinition:unitDefinitionSchema});
const count={type:'integer',minimum:0,maximum:1000000000000},positive={type:'integer',minimum:1,maximum:100000000},line=closedSchema({sku:textSchema(80),quantity:positive});
export const verifiedStockOperations=[
 {name:'stock.verified.reserve',input:closedSchema({orderId:uuidSchema,lines:arraySchema(line,40,1),definitions:arraySchema(verifiedStockDefinitionSchema,40,1)}),output:closedSchema({orderId:uuidSchema,lines:arraySchema(closedSchema({sku:textSchema(80),requested:count,availableBefore:count,reserved:count}),40,1)})},
 {name:'stock.verified.release',input:closedSchema({orderId:uuidSchema}),output:closedSchema({orderId:uuidSchema,released:{const:true}})},
 {name:'stock.verified.consume',input:closedSchema({orderId:uuidSchema,fulfillmentId:uuidSchema,lines:arraySchema(line,40,1)}),output:closedSchema({orderId:uuidSchema,fulfillmentId:uuidSchema,applied:{const:true}})}
] as const;
export const verifiedStockCapability=(moduleId:string)=>capability(VERIFIED_STOCK_CAPABILITY,moduleId,verifiedStockOperations,'write');
export const verifiedStockRequirement=(optional=true)=>requirement(VERIFIED_STOCK_CAPABILITY,verifiedStockOperations,optional);
export interface CatalogOperationalLink {linkId:string;variantId:string|null;purpose:'inventory'|'supplier'|'service'|'resource';availability:'unverified'|null;programmeAuthorization:'required'|null;capability:CapabilityReference;source:CatalogSourceReference;code:string;definitionDigest:string;unitDefinition:UnitDefinition|null;verifiedAt:string;expiresAt:string}
export interface CatalogOperationalLookupResult {contractVersion:1;offering:OperationalOfferingView;links:CatalogOperationalLink[];linksTruncated:boolean}
const linkProperties={linkId:uuidSchema,variantId:{anyOf:[uuidSchema,{type:'null'}]},capability:capabilityReferenceSchema,source:sourceReferenceSchema,code:textSchema(80),definitionDigest:digestSchema,unitDefinition:{anyOf:[unitDefinitionSchema,{type:'null'}]},verifiedAt:timestampSchema,expiresAt:timestampSchema};
export const catalogOperationalLinkSchema={oneOf:[closedSchema({...linkProperties,purpose:choiceSchema(['inventory','supplier']),availability:{type:'null'},programmeAuthorization:{type:'null'}}),closedSchema({...linkProperties,purpose:choiceSchema(['service','resource']),availability:{const:'unverified'},programmeAuthorization:{const:'required'},unitDefinition:{type:'null'}})]};
export const catalogOperationalOperations=[{name:'catalog.operational.lookup',input:closedSchema({contractVersion:{const:1},offeringId:uuidSchema,variantId:{anyOf:[uuidSchema,{type:'null'}]}}),output:closedSchema({contractVersion:{const:1},offering:operationalOfferingSchema,links:arraySchema(catalogOperationalLinkSchema,12),linksTruncated:{type:'boolean'}})}] as const;
const catalogIdentity={capabilityId:'catalog.operational.read',contract:'steward.catalog-operational',version:'1.0.0'};
export const catalogOperationalCapability=(moduleId='steward.catalog.universal')=>capability(catalogIdentity,moduleId,catalogOperationalOperations);
export const catalogOperationalRequirement=(optional=true)=>requirement(catalogIdentity,catalogOperationalOperations,optional);
