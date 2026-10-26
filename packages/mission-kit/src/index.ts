import {Ajv} from 'ajv';
import {randomBytes} from 'node:crypto';
import {canonical,digest} from '@steward/module-sdk';
import {BusinessError} from '@steward/business-kit';
import {MISSION_PARTICIPANT_METRICS,MISSION_CAPACITY_METRICS,type MissionAggregateRelease,type MissionAggregateReleaseInput,type MissionResourceAllocation,type MissionParticipantVector,type MissionCapacityVector,type MissionModuleId,type SyntheticParticipantId,type ScopedSyntheticAlias} from '@steward/contracts';
export {MISSION_PARTICIPANT_METRICS,MISSION_CAPACITY_METRICS} from '@steward/contracts';
export class MissionContractError extends BusinessError {constructor(public statusCode:number,message='Mission contract or disclosure policy rejected'){super(statusCode,message);}}
function requireValue(value:unknown,message='Mission contract or disclosure policy rejected',status=422):asserts value{if(!value)throw new MissionContractError(status,message);}
const uuid={type:'string',pattern:'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-8][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$'};
const instant={type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$'};
const count={type:'integer',minimum:0,maximum:10000},nullableCount={type:['integer','null'],minimum:0,maximum:100000000},money={type:'integer',minimum:0,maximum:1000000000000},nullableMoney={type:['integer','null'],minimum:0,maximum:1000000000000};
const closed=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
export const missionParticipantSchema={type:'string',pattern:'^SYN-PART-[A-F0-9]{32}$'};
export const missionScopedAliasSchema={type:'string',pattern:'^SYNREF-[A-F0-9]{32}$'};
export const missionMemberSchema={type:'string',pattern:'^(?:SYN-PART-|SYNREF-)[A-F0-9]{32}$'};
export const missionModuleDomains:Readonly<Record<MissionModuleId,MissionAggregateRelease['domain']>>=Object.freeze({'steward.housing.management':'housing','steward.housing.services':'participant-services','steward.employment.pathways':'employment','steward.services.food':'food'});
const participantVector=closed(Object.fromEntries(MISSION_PARTICIPANT_METRICS.map(k=>[k,nullableCount])),MISSION_PARTICIPANT_METRICS.filter(k=>k!=='unresolvedAuthorizedReferralParticipants')),capacityVector=closed(Object.fromEntries(MISSION_CAPACITY_METRICS.map(k=>[k,nullableCount])),MISSION_CAPACITY_METRICS.filter(k=>!['employmentOpportunities','localSupplyShortages'].includes(k)));
const aggregateProperties={contractVersion:{const:1},synthetic:{const:true},releaseId:uuid,programId:uuid,cohortId:uuid,sourceEntityId:uuid,sourceInstallationId:uuid,sourceModuleId:{type:'string',pattern:'^[a-z][a-z0-9.-]{1,79}$'},domain:{enum:Object.values(missionModuleDomains)},policyId:uuid,periodStart:instant,periodEnd:instant,releasedAt:instant,
 review:closed({reviewed:{const:true},actorId:uuid,reviewedAt:instant,purpose:{const:'aggregate-program-reporting'}}),participantCounts:participantVector,capacity:capacityVector,financials:closed({currency:{type:'string',pattern:'^[A-Z]{3}$'},actualOperatingCostCents:nullableMoney,estimatedUnitCostCents:nullableMoney,approvedAvailableCents:nullableMoney})};
export const missionAggregateSchema=closed({...aggregateProperties,approved:{const:true},sealed:{const:true},minimumGroupSize:{const:5},suppressed:{type:'boolean'},participantCount:{...count,type:['integer','null']}});
export const missionAggregateInputSchema=closed({...aggregateProperties,participantCount:count});
export const missionResourceSchema=closed({contractVersion:{const:1},synthetic:{const:true},approved:{const:true},allocationId:uuid,transferId:{anyOf:[uuid,{type:'null'}]},authorityId:uuid,sourceEntityId:uuid,sourceInstallationId:uuid,sourceProgramId:uuid,destinationEntityId:uuid,destinationProgramId:uuid,observation:{enum:['origin','recipient']},periodStart:instant,periodEnd:instant,validUntil:instant,currency:{type:'string',pattern:'^[A-Z]{3}$'},restriction:{enum:['housing','food','training','employment','program']},authorizedCents:money,availableCents:money,committedCents:money,transferredCents:money,spentCents:money,approvedBy:uuid,approvedAt:instant});
const ajv=new Ajv({allErrors:false,strict:false,coerceTypes:false,removeAdditional:false}),aggregateValidator=ajv.compile(missionAggregateSchema),inputValidator=ajv.compile(missionAggregateInputSchema),resourceValidator=ajv.compile(missionResourceSchema),memberValidator=ajv.compile(missionMemberSchema);
function time(value:string){const n=Date.parse(value);requireValue(Number.isFinite(n));const normalized=new Date(n).toISOString();requireValue(value===normalized||value===normalized.replace('.000Z','Z'));return n;}
function period(value:{periodStart:string;periodEnd:string}){const start=time(value.periodStart),end=time(value.periodEnd);requireValue(start<end&&end-start<=366*86400000);return{start,end};}
function vectors<T extends string>(keys:readonly T[],values:Partial<Record<T,number|null>>):Record<T,number|null>{requireValue(Object.keys(values).every(k=>keys.includes(k as T)));return Object.fromEntries(keys.map(k=>[k,values[k]??null])) as Record<T,number|null>;}
/** Absent/nonapplicable measures stay unknown, never silently zero. */
export const missionParticipantVector=(values:Partial<MissionParticipantVector>={}):MissionParticipantVector=>vectors(MISSION_PARTICIPANT_METRICS,values);
export const missionCapacityVector=(values:Partial<MissionCapacityVector>={}):MissionCapacityVector=>vectors(MISSION_CAPACITY_METRICS,values);
export const createSyntheticParticipantId=():SyntheticParticipantId=>('SYN-PART-'+randomBytes(16).toString('hex').toUpperCase()) as SyntheticParticipantId;
/** Persist one alias per authorized receiving Worker/module; never rotate it per referral/programme. */
export const createScopedSyntheticAlias=():ScopedSyntheticAlias=>('SYNREF-'+randomBytes(16).toString('hex').toUpperCase()) as ScopedSyntheticAlias;
function sensitiveValues(value:Pick<MissionAggregateRelease,'capacity'|'participantCounts'>){
 const c=value.capacity,values=Object.values(value.participantCounts).filter((n):n is number=>n!==null);
 if(c.housingUnits!==null&&c.availableHousingUnits!==null&&c.maintenanceRestrictedUnits!==null){const occupied=c.housingUnits-c.availableHousingUnits-c.maintenanceRestrictedUnits;requireValue(occupied>=0);if(c.occupiedHousingUnits!==null)requireValue(c.occupiedHousingUnits===occupied);values.push(occupied);}
 else if(c.occupiedHousingUnits!==null)values.push(c.occupiedHousingUnits);
 if(c.trainingSeats!==null&&c.availableTrainingSeats!==null){requireValue(c.availableTrainingSeats<=c.trainingSeats);values.push(c.trainingSeats-c.availableTrainingSeats);}
 if(c.plannedMeals!==null&&c.deliveredMeals!==null)requireValue(c.deliveredMeals<=c.plannedMeals);
 if(c.essentialSupplyUnits!==null&&c.consumedSupplyUnits!==null)requireValue(c.consumedSupplyUnits<=c.essentialSupplyUnits);
 return values;
}
function validateCommon(value:MissionAggregateReleaseInput|MissionAggregateRelease,now:Date,source?:MissionSourceIdentity){const p=period(value),builtin=missionModuleDomains[value.sourceModuleId];if(builtin)requireValue(builtin===value.domain);else requireValue(source?.moduleId===value.sourceModuleId&&source.domain===value.domain,'Verified provider domain declaration required',403);if(source)requireValue(source.entityId===value.sourceEntityId&&source.installationId===value.sourceInstallationId&&(!source.moduleId||source.moduleId===value.sourceModuleId)&&(!source.domain||source.domain===value.domain),'Mission source identity or domain mismatch',403);requireValue(time(value.releasedAt)>=p.end&&time(value.review.reviewedAt)>=p.end&&time(value.review.reviewedAt)<=time(value.releasedAt)&&time(value.releasedAt)<=now.getTime()+300000);}
function mustSuppress(value:Pick<MissionAggregateReleaseInput,'participantCount'|'participantCounts'|'capacity'>){requireValue(Object.values(value.participantCounts).every(n=>n===null||n<=value.participantCount));const counts=sensitiveValues(value);requireValue(counts.every(n=>n<=value.participantCount),'Reported outcomes must belong to the reviewed cohort');const correlated=[value.participantCount,...counts];return value.participantCount<5||counts.some(n=>n>0&&n<5)||correlated.some((n,i)=>correlated.slice(i+1).some(m=>Math.abs(n-m)>0&&Math.abs(n-m)<5));}
/** No member aliases, dimensions, case text, arbitrary periods or private counts leave this helper. */
export function prepareMissionAggregateRelease(raw:unknown,now=new Date(),source?:MissionSourceIdentity):MissionAggregateRelease{
 requireValue(inputValidator(raw));const input=structuredClone(raw) as MissionAggregateReleaseInput;validateCommon(input,now,source);const suppressed=mustSuppress(input);
 const result={...input,approved:true,sealed:true,minimumGroupSize:5,suppressed,participantCount:suppressed?null:input.participantCount,
  participantCounts:suppressed?missionParticipantVector():input.participantCounts,capacity:suppressed?missionCapacityVector():input.capacity,
  financials:suppressed?{currency:input.financials.currency,actualOperatingCostCents:null,estimatedUnitCostCents:null,approvedAvailableCents:null}:input.financials} as MissionAggregateRelease;
 return validateMissionAggregateRelease(result,source,now);
}
/** Reuse the sealed-cohort suppression rules for scoped derived cost evidence. */
export function assertProtectedMissionCounts(value:{participantCount:number|null;participantCounts:MissionParticipantVector;capacity:MissionCapacityVector;suppressed:boolean}){if(value.suppressed)requireValue(value.participantCount===null&&Object.values(value.participantCounts).every(v=>v===null)&&Object.values(value.capacity).every(v=>v===null));else{requireValue(value.participantCount!==null);requireValue(!mustSuppress({...value,participantCount:value.participantCount!}));}}
export interface MissionSourceIdentity {entityId:string;installationId:string;moduleId?:string;domain?:MissionAggregateRelease['domain']}
export function validateMissionAggregateRelease(raw:unknown,source?:MissionSourceIdentity,now=new Date()):MissionAggregateRelease{
 requireValue(aggregateValidator(raw));const value=raw as unknown as MissionAggregateRelease;validateCommon(value,now,source);
 if(value.suppressed){requireValue(value.participantCount===null&&Object.values(value.participantCounts).every(v=>v===null)&&Object.values(value.capacity).every(v=>v===null)&&Object.entries(value.financials).every(([k,v])=>k==='currency'||v===null));}
 else{requireValue(value.participantCount!==null);requireValue(!mustSuppress(value as MissionAggregateReleaseInput));}
 return structuredClone(value);
}
export function validateMissionResourceAllocation(raw:unknown,source?:MissionSourceIdentity):MissionResourceAllocation{
 requireValue(resourceValidator(raw));const value=raw as unknown as MissionResourceAllocation;period(value);requireValue(time(value.validUntil)>=time(value.periodStart)&&time(value.approvedAt)<=time(value.validUntil));
 requireValue(value.spentCents<=value.transferredCents&&value.transferredCents<=value.committedCents&&value.committedCents<=value.authorizedCents&&value.availableCents<=value.authorizedCents-value.committedCents,'Approved resource amounts do not reconcile');
 requireValue(value.transferredCents===0||value.transferId!==null,'Transferred resources require their stable transfer identity');
 if(source){if(value.observation==='origin')requireValue(source.entityId===value.sourceEntityId&&source.installationId===value.sourceInstallationId,'Resource origin identity mismatch',403);else requireValue(source.entityId===value.destinationEntityId,'Resource recipient identity mismatch',403);}
 return structuredClone(value);
}
export const missionAllocationKey=(allocation:MissionResourceAllocation)=>allocation.sourceEntityId+':'+allocation.allocationId;
/** Only an origin-authorized record contributes availability; recipient mirrors are not extra money. */
export function deduplicateMissionAllocations(raw:MissionResourceAllocation[]):MissionResourceAllocation[]{const result=new Map<string,MissionResourceAllocation>(),allocations=new Map<string,string>(),transfers=new Map<string,string>(),authorities=new Map<string,string>();for(const row of raw){const value=validateMissionResourceAllocation(row),key=missionAllocationKey(value),old=result.get(key);if(value.observation!=='origin')continue;const authority=value.sourceEntityId+':'+value.authorityId;requireValue(!authorities.has(authority)||authorities.get(authority)===key,'One source financial authority cannot fund multiple allocation claims',409);requireValue(!allocations.has(value.allocationId)||allocations.get(value.allocationId)===key,'Conflicting allocation authority',409);if(value.transferId)requireValue(!transfers.has(value.transferId)||transfers.get(value.transferId)===key,'A transferred resource cannot fund multiple allocation claims',409);authorities.set(authority,key);allocations.set(value.allocationId,key);if(value.transferId)transfers.set(value.transferId,key);if(old)requireValue(canonical(old)===canonical(value),'Conflicting original resource allocations',409);else result.set(key,value);}return [...result.values()];}
export const missionReleaseSql=`
CREATE TABLE mission_aggregate_releases(
 id uuid PRIMARY KEY, revision integer NOT NULL DEFAULT 1 CHECK(revision=1),
 program_id uuid NOT NULL,cohort_id uuid NOT NULL,period_start timestamptz NOT NULL,period_end timestamptz NOT NULL,
 input_digest text NOT NULL,projection jsonb NOT NULL,reviewed_by uuid NOT NULL,reviewed_at timestamptz NOT NULL,
 UNIQUE(program_id,cohort_id),CHECK(period_start<period_end)
);
CREATE TABLE mission_release_members(
 participant_ref text PRIMARY KEY CHECK(participant_ref ~ '^(SYN-PART-|SYNREF-)[A-F0-9]{32}$'),
 program_id uuid NOT NULL,cohort_id uuid NOT NULL,release_id uuid NOT NULL REFERENCES mission_aggregate_releases(id)
);
CREATE INDEX mission_release_program_period ON mission_aggregate_releases(program_id,period_start,period_end);
CREATE INDEX mission_release_members_program ON mission_release_members(program_id,cohort_id);
CREATE FUNCTION mission_release_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'A sealed mission disclosure cannot be changed' USING ERRCODE='55000'; END; $$;
CREATE TRIGGER mission_release_immutable BEFORE UPDATE OR DELETE ON mission_aggregate_releases FOR EACH ROW EXECUTE FUNCTION mission_release_immutable();
CREATE TRIGGER mission_members_immutable BEFORE UPDATE OR DELETE ON mission_release_members FOR EACH ROW EXECUTE FUNCTION mission_release_immutable();
`;
export interface MissionSql {query:(text:string,values?:any[])=>Promise<{rows:any[];rowCount:number|null}>}
/** Caller must use its module-owned transaction. A SAVEPOINT fails before writes outside a transaction. */
export async function sealMissionAggregateRelease(db:MissionSql,raw:MissionAggregateReleaseInput,members:readonly string[],now=new Date(),source?:MissionSourceIdentity):Promise<MissionAggregateRelease>{
 const projection=prepareMissionAggregateRelease(raw,now,source);requireValue(members.length===raw.participantCount&&new Set(members).size===members.length&&members.every(m=>memberValidator(m)),'Invalid synthetic cohort membership');
 const fingerprint=digest(canonical({input:raw,members:[...members].sort()}));await db.query('SAVEPOINT mission_release_seal');
 try{
  await db.query('SELECT pg_advisory_xact_lock(713001)');
  const previous=(await db.query('SELECT input_digest,projection FROM mission_aggregate_releases WHERE program_id=$1 AND cohort_id=$2',[raw.programId,raw.cohortId])).rows[0];
  if(previous){requireValue(previous.input_digest===fingerprint,'Sealed cohorts cannot be revised or republished',409);await db.query('RELEASE SAVEPOINT mission_release_seal');return validateMissionAggregateRelease(previous.projection,source,now);}
  requireValue(!(await db.query('SELECT 1 FROM mission_aggregate_releases WHERE program_id=$1 AND period_start<$3::timestamptz AND period_end>$2::timestamptz LIMIT 1',[raw.programId,raw.periodStart,raw.periodEnd])).rowCount,'Cohort release conflicts with the disclosure policy',409);
  requireValue(!(await db.query('SELECT 1 FROM mission_release_members WHERE participant_ref=ANY($1::text[]) LIMIT 1',[members])).rowCount,'Cohort release conflicts with the disclosure policy',409);
  await db.query('INSERT INTO mission_aggregate_releases(id,program_id,cohort_id,period_start,period_end,input_digest,projection,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[raw.releaseId,raw.programId,raw.cohortId,raw.periodStart,raw.periodEnd,fingerprint,projection,raw.review.actorId,raw.review.reviewedAt]);
  if(members.length)await db.query('INSERT INTO mission_release_members(participant_ref,program_id,cohort_id,release_id) SELECT m.ref,$2::uuid,$3::uuid,$4::uuid FROM unnest($1::text[]) AS m(ref)',[members,raw.programId,raw.cohortId,raw.releaseId]);
  await db.query('RELEASE SAVEPOINT mission_release_seal');return projection;
 }catch(error){await db.query('ROLLBACK TO SAVEPOINT mission_release_seal');await db.query('RELEASE SAVEPOINT mission_release_seal');throw error;}
}

export * from './access.js';

export * from './programs.js';


export * from './finance.js';

export * from './cost-evidence.js';
