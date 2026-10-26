import type {CapabilityContract} from '@steward/module-sdk';
// Pure versioned contracts. Housing consumers may use the same JSON declarations
// without importing any Asset operational implementation or database code.
export const authorityUuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-8][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$'};
const closed=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
const iso={type:'string',minLength:20,maxLength:40};
const basis={type:'string',enum:['owned','leased','shared','custody']};
export const propertyAuthorityVerifyInput=closed({programId:authorityUuid,sourceProgramId:authorityUuid,assetId:authorityUuid});
export const propertyAuthorityVerifyOutput=closed({authorized:{type:'boolean',const:true},assetId:authorityUuid,assetRevision:{type:'integer',minimum:1},ownerEntityId:authorityUuid,custodianEntityId:authorityUuid,userEntityId:authorityUuid,managerEntityId:authorityUuid,managerProgramId:authorityUuid,managementAuthorityId:authorityUuid,managementAccessBasis:basis,classification:{type:'string',const:'residential'},available:{type:'boolean',const:true},validUntil:iso,synthetic:{type:'boolean',const:true}});
export const propertyAuthorityCatalogInput=closed({programId:authorityUuid,sourceProgramId:authorityUuid,offset:{type:'integer',minimum:0,maximum:10000}},['programId','sourceProgramId']);
export const propertyAuthorityCatalogOutput=closed({records:{type:'array',maxItems:20,items:closed({assetId:authorityUuid,name:{type:'string',maxLength:200},site:{type:'string',maxLength:200},ownerEntityId:authorityUuid,classification:{type:'string',const:'residential'},assetRevision:{type:'integer',minimum:1},available:{type:'boolean'}})},nextOffset:{anyOf:[{type:'integer',minimum:0,maximum:10000},{type:'null'}]},synthetic:{type:'boolean',const:true}});
export const propertyAuthorityCapability:CapabilityContract={capabilityId:'property.authority',contract:'steward.property-authority',version:'1.0.0',sensitivity:'business',scope:'entity',ownership:'provider',configuration:{integrationsEnabled:true,syntheticServiceAuthority:true},operations:[
 {name:'catalog',command:'property.authority.catalog',input:propertyAuthorityCatalogInput,output:propertyAuthorityCatalogOutput,permission:'cee.assets.authority.read',mode:'durable',idempotency:'required',retry:'safe'},
 {name:'verify',command:'property.authority.verify',input:propertyAuthorityVerifyInput,output:propertyAuthorityVerifyOutput,permission:'cee.assets.authority.read',mode:'durable',idempotency:'required',retry:'safe'}
],events:[]};
