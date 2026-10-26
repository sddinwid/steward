import {ensure, type AccessAuditEvent, type AccessRequest, type Context, type Data, type RecordValue, type Resource} from '@steward/business-kit';
import type {PoolClient} from 'pg';

/** These tables live only in an independently packaged module's own database. */
export const missionAccessSql=`
CREATE TABLE mission_program_access(
 program_id uuid NOT NULL REFERENCES business_records(id), actor_id text NOT NULL,
 role text NOT NULL, permissions text[] NOT NULL, granted_by text NOT NULL,
 granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(program_id,actor_id)
);
CREATE TABLE mission_case_access(
 program_id uuid NOT NULL REFERENCES business_records(id), participant_ref text NOT NULL,
 actor_id text NOT NULL, granted_by text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(program_id,participant_ref,actor_id),
 CHECK(participant_ref ~ '^(SYN-PART-|SYNREF-)[A-F0-9]{32}$')
);
CREATE TABLE mission_private_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id text,operation_id text NOT NULL,
 method text NOT NULL,path text NOT NULL,kind text,record_id uuid,record_ids uuid[],
 status_code integer NOT NULL,allowed boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_access_actor ON mission_program_access(actor_id,program_id) WHERE revoked_at IS NULL;
CREATE INDEX mission_case_actor ON mission_case_access(actor_id,program_id,participant_ref) WHERE revoked_at IS NULL;
CREATE INDEX mission_audit_actor_time ON mission_private_audit(actor_id,created_at DESC);
`;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const member=/^(SYN-PART-|SYNREF-)[A-F0-9]{32}$/;
const unavailable=()=>ensure(false,'Service record unavailable',404);
export function requireSyntheticMission(ctx:Context){ensure(ctx.config.syntheticOnly===true,'Only synthetic service records are supported',403);}
export function missionEntity(ctx:Context):string {const entity=(ctx as Context&{entityId?:string}).entityId;ensure(typeof entity==='string'&&uuid.test(entity),'Enrolled organization identity is required',409);return entity;}
export async function hasProgramAccess(ctx:Context,programId:string,permission:string,participantRef?:string):Promise<boolean>{
 if(!uuid.test(programId)||participantRef!==undefined&&!member.test(participantRef))return false;
 const access=(await ctx.db.query('SELECT permissions FROM mission_program_access WHERE program_id=$1 AND actor_id=$2 AND revoked_at IS NULL',[programId,ctx.actor])).rows[0];
 if(!access?.permissions.includes(permission))return false;
 if(!participantRef||access.permissions.includes('program.all-cases'))return true;
 return Boolean((await ctx.db.query('SELECT 1 FROM mission_case_access WHERE program_id=$1 AND participant_ref=$2 AND actor_id=$3 AND revoked_at IS NULL',[programId,participantRef,ctx.actor])).rowCount);
}
export async function requireProgramAccess(ctx:Context,programId:string,permission:string,participantRef?:string){requireSyntheticMission(ctx);if(!await hasProgramAccess(ctx,programId,permission,participantRef))unavailable();}
export async function grantProgramAccess(ctx:Context,programId:string,actorId:string,role:string,permissions:readonly string[],creator=false){
 requireSyntheticMission(ctx);ensure(uuid.test(programId)&&uuid.test(actorId)&&permissions.length>0&&permissions.length<=40&&permissions.every(p=>/^[a-z][a-z.-]{1,79}$/.test(p)),'Invalid service team grant',400);
 if(creator){ensure(actorId===ctx.actor,'Program creation grants only its actual creator',403);ensure((await ctx.db.query("SELECT 1 FROM business_records WHERE id=$1 AND kind='program'",[programId])).rowCount,'Service record unavailable',404);ensure(!(await ctx.db.query('SELECT 1 FROM mission_program_access WHERE program_id=$1',[programId])).rowCount,'Program authority already established',409);}
 else {await requireProgramAccess(ctx,programId,'program.manage');const own=(await ctx.db.query('SELECT permissions FROM mission_program_access WHERE program_id=$1 AND actor_id=$2 AND revoked_at IS NULL',[programId,ctx.actor])).rows[0];ensure(permissions.every(p=>own.permissions.includes(p)),'Cannot delegate an authority not held in this program',403);}
 await ctx.db.query('INSERT INTO mission_program_access(program_id,actor_id,role,permissions,granted_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(program_id,actor_id) DO UPDATE SET role=excluded.role,permissions=excluded.permissions,granted_by=excluded.granted_by,granted_at=now(),revoked_at=NULL',[programId,actorId,role,[...new Set(permissions)],ctx.actor]);
}
export async function assignCase(ctx:Context,programId:string,participantRef:string,actorId:string){
 await requireProgramAccess(ctx,programId,'program.manage');ensure(member.test(participantRef)&&uuid.test(actorId),'Invalid synthetic case assignment',400);
 ensure((await ctx.db.query('SELECT 1 FROM mission_program_access WHERE program_id=$1 AND actor_id=$2 AND revoked_at IS NULL',[programId,actorId])).rowCount,'Service record unavailable',404);
 await ctx.db.query('INSERT INTO mission_case_access(program_id,participant_ref,actor_id,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT(program_id,participant_ref,actor_id) DO UPDATE SET revoked_at=NULL,granted_by=excluded.granted_by,granted_at=now()',[programId,participantRef,actorId,ctx.actor]);
}
export async function revokeProgramAccess(ctx:Context,programId:string,actorId:string){await requireProgramAccess(ctx,programId,'program.manage');await ctx.db.query('UPDATE mission_program_access SET revoked_at=now() WHERE program_id=$1 AND actor_id=$2',[programId,actorId]);await ctx.db.query('UPDATE mission_case_access SET revoked_at=now() WHERE program_id=$1 AND actor_id=$2',[programId,actorId]);}
export async function revokeCaseAccess(ctx:Context,programId:string,participantRef:string,actorId:string){await requireProgramAccess(ctx,programId,'program.manage');ensure(member.test(participantRef)&&uuid.test(actorId),'Invalid synthetic case assignment',400);await ctx.db.query('UPDATE mission_case_access SET revoked_at=now() WHERE program_id=$1 AND participant_ref=$2 AND actor_id=$3',[programId,participantRef,actorId]);}
/** Intake creates an explicit relationship only to the just-created case. */
export async function assignNewCaseToCreator(ctx:Context,record:RecordValue,participantField='participantRef'){
 ensure(/^[a-zA-Z][a-zA-Z0-9]*$/.test(participantField),'Invalid private relationship field');const ref=record.data[participantField];ensure(member.test(ref)&&record.data.createdBy===ctx.actor,'Invalid synthetic case creator',403);await requireProgramAccess(ctx,record.data.programId,'case.write');
 ensure((await ctx.db.query("SELECT 1 FROM business_records WHERE id=$1 AND revision=1 AND xmin::text=(pg_current_xact_id()::text::numeric % 4294967296)::text AND data->>'createdBy'=$2 AND data->>'programId'=$3 AND data->>$4=$5",[record.id,ctx.actor,record.data.programId,participantField,ref])).rowCount,'Service record unavailable',404);
 await ctx.db.query('INSERT INTO mission_case_access(program_id,participant_ref,actor_id,granted_by) VALUES($1,$2,$3,$3) ON CONFLICT(program_id,participant_ref,actor_id) DO NOTHING',[record.data.programId,ref,ctx.actor]);
}
export async function missionAccessAudit(e:AccessAuditEvent,db:PoolClient){
 await db.query('INSERT INTO mission_private_audit(actor_id,operation_id,method,path,kind,record_id,record_ids,status_code,allowed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[e.actor,e.operationId,e.method,e.path,e.kind??null,e.recordId??null,e.recordIds??[],e.statusCode,e.allowed]);
}
export interface MissionRecordPolicy {read:string;write:string;participantField?:string;programRecord?:boolean;allowProgramCreation?:boolean;allowCaseCreation?:boolean}
function recordScope(record:RecordValue,p:MissionRecordPolicy){return{programId:p.programRecord?record.id:record.data.programId,participantRef:p.participantField?record.data[p.participantField]:undefined};}
export function scopedMissionResource(resource:Resource,policy:MissionRecordPolicy):Resource{
 if(policy.participantField)ensure(/^[a-zA-Z][a-zA-Z0-9]*$/.test(policy.participantField),'Invalid private relationship field');
 const existing=resource.authorize,existingScope=resource.listScope;
 return{...resource,authorize:async(ctx,access)=>{
   requireSyntheticMission(ctx);
   if(access.operation==='list'){await existing?.(ctx,access);return;}
   if(access.operation==='create'&&!access.record&&policy.allowProgramCreation){await existing?.(ctx,access);return;}
   if(access.record){const scope=recordScope(access.record,policy);await requireProgramAccess(ctx,scope.programId,access.operation==='update'?policy.write:policy.read,scope.participantRef);if(access.input&&!policy.programRecord&&access.operation==='update'){ensure(access.input.programId===scope.programId,'Service record unavailable',404);if(policy.participantField)ensure(access.input[policy.participantField]===scope.participantRef,'Service record unavailable',404);}}
   else {const b=access.input??{};await requireProgramAccess(ctx,b.programId,policy.write,policy.participantField&&!policy.allowCaseCreation?b[policy.participantField]:undefined);}
   await existing?.(ctx,access);
  },listScope:async ctx=>{
   requireSyntheticMission(ctx);const programExpression=policy.programRecord?'b.id':"CASE WHEN b.data->>'programId' ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[1-8][a-fA-F0-9]{3}-[89abAB][a-fA-F0-9]{3}-[a-fA-F0-9]{12}$' THEN (b.data->>'programId')::uuid ELSE NULL END";
   const participant=policy.participantField?`AND ('program.all-cases'=ANY(a.permissions) OR EXISTS(SELECT 1 FROM mission_case_access c WHERE c.program_id=a.program_id AND c.actor_id=$2 AND c.participant_ref=b.data->>'${policy.participantField}' AND c.revoked_at IS NULL))`:'';
   const rows=(await ctx.db.query(`SELECT b.id FROM business_records b JOIN mission_program_access a ON a.program_id=${programExpression} WHERE b.kind=$1 AND a.actor_id=$2 AND a.revoked_at IS NULL AND $3=ANY(a.permissions) ${participant} ORDER BY b.id LIMIT 10001`,[resource.kind,ctx.actor,policy.read])).rows;
   ensure(rows.length<=10000,'Narrow the authorized operational collection',413);let ids:string[]=rows.map(r=>r.id);if(existingScope){const allowed=new Set((await existingScope(ctx)).ids);ids=ids.filter(id=>allowed.has(id));}return{ids};
  }};
}
/** Action permission is additional to both gateway permission and scoped row read. */
export function missionActionAuthorization(permissions:Readonly<Record<string,string>>,participantFields:Readonly<Record<string,string>>={}){
 return async(ctx:Context,access:AccessRequest)=>{requireSyntheticMission(ctx);if(access.operation==='action'){const permission=permissions[access.path];ensure(permission,'Undeclared program action authority',403);const r=access.record;if(!r)unavailable();await requireProgramAccess(ctx,r!.kind==='program'?r!.id:r!.data.programId,permission,participantFields[r!.kind]?r!.data[participantFields[r!.kind]!]:undefined);}};
}
export function immutableProgram(input:Data,previous:RecordValue|null){if(previous)ensure(input.programId===previous.data.programId,'Service record unavailable',404);return input;}
