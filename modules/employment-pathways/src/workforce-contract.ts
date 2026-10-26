import type {CapabilityContract} from '@steward/module-sdk';
const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-8][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$'};
const instant={type:'string',minLength:20,maxLength:40},alias={type:'string',pattern:'^SYNREF-[A-F0-9]{32}$'},code={type:'string',minLength:1,maxLength:60};
export const closed=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const ids={programId:uuid,sourceProgramId:uuid};
const consent={authorityId:uuid,authority:{enum:['consented','documented-authority']},expiresAt:instant,synthetic:{const:true}};
export const trainingCatalogueInput=closed({...ids,offset:{type:'integer',minimum:0,maximum:10000}},Object.keys(ids));
export const trainingCatalogueOutput=closed({records:{type:'array',maxItems:20,items:closed({trainingProgramId:uuid,revision:{type:'integer',minimum:1},code,name:{type:'string',maxLength:200},skillCode:code,site:{type:'string',maxLength:200},startsAt:instant,endsAt:instant,availableSeats:{type:'integer',minimum:0,maximum:100000}})},nextOffset:{anyOf:[{type:'integer',minimum:0,maximum:10000},{type:'null'}]},synthetic:{const:true}});
export const trainingReserveInput=closed({...ids,referralId:uuid,participantAlias:alias,trainingProgramId:uuid,trainingRevision:{type:'integer',minimum:1},...consent});
export const pathwayStatusInput=closed({...ids,referralId:uuid,participantAlias:alias});
export const trainingStatusOutput=closed({...ids,referralId:uuid,enrollmentId:uuid,trainingProgramId:uuid,status:{enum:['reserved','confirmed','participating','completed','cancelled']},completedSkills:{type:'array',maxItems:30,uniqueItems:true,items:code},confirmedAt:{anyOf:[instant,{type:'null'}]},participationAt:{anyOf:[instant,{type:'null'}]},completedAt:{anyOf:[instant,{type:'null'}]},synthetic:{const:true}});
export const employmentCatalogueOutput=closed({records:{type:'array',maxItems:20,items:closed({positionId:uuid,revision:{type:'integer',minimum:1},code,title:{type:'string',maxLength:200},requiredSkills:{type:'array',maxItems:30,uniqueItems:true,items:code},site:{type:'string',maxLength:200},openings:{type:'integer',minimum:0,maximum:100000}})},nextOffset:{anyOf:[{type:'integer',minimum:0,maximum:10000},{type:'null'}]},synthetic:{const:true}});
export const employmentRequestInput=closed({...ids,referralId:uuid,participantAlias:alias,positionId:uuid,positionRevision:{type:'integer',minimum:1},documentedSkills:{type:'array',maxItems:30,uniqueItems:true,items:code},...consent});
export const employmentStatusOutput=closed({...ids,referralId:uuid,employerReferralId:uuid,positionId:uuid,status:{enum:['requested','reviewed','accepted','rejected','withdrawn']},synthetic:{const:true}});
const permission='cee.workforce.mission.exchange';
export const workforcePathwaysCapability:CapabilityContract={capabilityId:'workforce.pathways',contract:'steward.workforce-pathways',version:'1.0.0',sensitivity:'restricted',scope:'entity',ownership:'provider',configuration:{syntheticOnly:true,missionSensitive:true,integrationsEnabled:true},operations:[
 {name:'training.catalog',command:'workforce.training.catalog',input:trainingCatalogueInput,output:trainingCatalogueOutput},
 {name:'training.reserve',command:'workforce.training.reserve',input:trainingReserveInput,output:trainingStatusOutput},
 {name:'training.confirm',command:'workforce.training.confirm',input:pathwayStatusInput,output:trainingStatusOutput},
 {name:'training.cancel',command:'workforce.training.cancel',input:pathwayStatusInput,output:trainingStatusOutput},
 {name:'training.status',command:'workforce.training.status',input:pathwayStatusInput,output:trainingStatusOutput},
 {name:'employment.catalog',command:'workforce.employment.catalog',input:trainingCatalogueInput,output:employmentCatalogueOutput},
 {name:'employment.request',command:'workforce.employment.request',input:employmentRequestInput,output:employmentStatusOutput},
 {name:'employment.status',command:'workforce.employment.status',input:pathwayStatusInput,output:employmentStatusOutput}
].map(op=>({...op,permission,mode:'durable' as const,idempotency:'required' as const,retry:'safe' as const})),events:[]};
