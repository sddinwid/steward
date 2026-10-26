import type {CapabilityContract} from '@steward/module-sdk';
const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-8][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$'};
const instant={type:'string',minLength:20,maxLength:40},count={type:'integer',minimum:0,maximum:100000};
const closed=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
export const programmeCapacityInput=closed({programId:uuid,sourceProgramId:uuid,synthetic:{const:true}});
const evidence={programId:uuid,sourceProgramId:uuid,allocationId:uuid,revision:{type:'integer',minimum:1},observedAt:instant,validUntil:instant,synthetic:{const:true}};
export const programmeTrainingCapacityOutput=closed({...evidence,trainingSeats:count,availableTrainingSeats:count});
export const programmeEmploymentCapacityOutput=closed({...evidence,approvedEmploymentSlots:count,employmentOpportunities:count});
export const workforceCapacityCapability:CapabilityContract={capabilityId:'workforce.program-capacity',contract:'steward.workforce-program-capacity',version:'1.0.0',sensitivity:'restricted',scope:'entity',ownership:'provider',configuration:{syntheticOnly:true,missionSensitive:true,integrationsEnabled:true},operations:[{name:'training.read',command:'workforce.capacity.training',output:programmeTrainingCapacityOutput},{name:'employment.read',command:'workforce.capacity.employment',output:programmeEmploymentCapacityOutput}].map(op=>({...op,input:programmeCapacityInput,permission:'cee.workforce.mission.exchange',mode:'durable' as const,idempotency:'required' as const,retry:'safe' as const})),events:[]};
