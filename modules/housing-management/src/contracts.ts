import type {CapabilityContract,CapabilityRequirement} from '@steward/module-sdk';
export const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-8][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$'};
export const iso={type:'string',minLength:20,maxLength:40};
export const alias={type:'string',pattern:'^SYNREF-[A-F0-9]{32}$'};
export const closed=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const basis={type:'string',enum:['owned','leased','shared','custody']};
// Same pure JSON contract as the independently packaged property authority.
// No Assets implementation or operational database is imported into Housing.
export const assetVerifyInput=closed({programId:uuid,sourceProgramId:uuid,assetId:uuid});
export const assetVerifyOutput=closed({authorized:{type:'boolean',const:true},assetId:uuid,assetRevision:{type:'integer',minimum:1},ownerEntityId:uuid,custodianEntityId:uuid,userEntityId:uuid,managerEntityId:uuid,managerProgramId:uuid,managementAuthorityId:uuid,managementAccessBasis:basis,classification:{type:'string',const:'residential'},available:{type:'boolean',const:true},validUntil:iso,synthetic:{type:'boolean',const:true}});
export const assetCatalogInput=closed({programId:uuid,sourceProgramId:uuid,offset:{type:'integer',minimum:0,maximum:10000}},['programId','sourceProgramId']);
export const assetCatalogOutput=closed({records:{type:'array',maxItems:20,items:closed({assetId:uuid,name:{type:'string',maxLength:200},site:{type:'string',maxLength:200},ownerEntityId:uuid,classification:{type:'string',const:'residential'},assetRevision:{type:'integer',minimum:1},available:{type:'boolean'}})},nextOffset:{anyOf:[{type:'integer',minimum:0,maximum:10000},{type:'null'}]},synthetic:{type:'boolean',const:true}});
export const housingPropertyRequirement:CapabilityRequirement={capabilityId:'property.authority',contract:'steward.property-authority',minimumVersion:'1.0.0',maximumMajor:1,operations:[{name:'catalog',input:assetCatalogInput,output:assetCatalogOutput},{name:'verify',input:assetVerifyInput,output:assetVerifyOutput}],events:[],maximumSensitivity:'business',optional:true};

export const housingRequestInput=closed({programId:uuid,sourceProgramId:uuid,referralId:uuid,participantAlias:alias,authorityId:uuid,authority:{type:'string',enum:['consented','documented-authority']},expiresAt:iso,requestedStartsAt:iso,requestedEndsAt:iso,classification:{type:'string',enum:['standard','accessible','family']},synthetic:{type:'boolean',const:true}});
export const housingStatusInput=closed({programId:uuid,sourceProgramId:uuid,referralId:uuid,participantAlias:alias});
export const housingStatusOutput=closed({programId:uuid,sourceProgramId:uuid,referralId:uuid,placementId:uuid,status:{type:'string',enum:['requested','reviewed','approved','reserved','confirmed','departed','withdrawn','rejected']},approved:{type:'boolean'},reserved:{type:'boolean'},confirmed:{type:'boolean'},followUpMaintained:{type:'boolean'},synthetic:{type:'boolean',const:true}});
export const housingCapacityInput=closed({programId:uuid,sourceProgramId:uuid});
export const housingCapacityOutput=closed({programId:uuid,housingUnits:{type:'integer',minimum:0,maximum:10000},availableUnits:{type:'integer',minimum:0,maximum:10000},synthetic:{type:'boolean',const:true}});
export const housingPlacementCapability:CapabilityContract={capabilityId:'housing.placement',contract:'steward.housing-placement',version:'1.0.0',sensitivity:'restricted',scope:'entity',ownership:'provider',configuration:{syntheticOnly:true,integrationsEnabled:true},operations:[
 {name:'housing.placement.request',command:'housing.placement.request',input:housingRequestInput,output:housingStatusOutput,permission:'steward.housing.management.referral',mode:'durable',idempotency:'required',retry:'safe'},
 {name:'housing.placement.status',command:'housing.placement.status',input:housingStatusInput,output:housingStatusOutput,permission:'steward.housing.management.referral',mode:'durable',idempotency:'required',retry:'safe'},
 {name:'housing.placement.withdraw',command:'housing.placement.withdraw',input:housingStatusInput,output:housingStatusOutput,permission:'steward.housing.management.referral',mode:'durable',idempotency:'required',retry:'safe'},
 {name:'housing.capacity.observe',command:'housing.capacity.observe',input:housingCapacityInput,output:housingCapacityOutput,permission:'steward.housing.management.referral',mode:'durable',idempotency:'required',retry:'safe'}
],events:[]};
