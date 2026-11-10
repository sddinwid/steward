import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { ensure, find, get, save, publicRecord, transaction, enqueueCapability, type Context, type Data, type Definition, type RecordValue } from '@steward/business-kit';
import type { ModulePackageManifest } from '@steward/module-sdk';
import { hash, scopeKey, registrationKey, ingest, reconcile, fresh, retryAt, uuid, limits, type Scope, type CarrierEvent, type Observation, type Status } from '@steward/carrier-kit';

export const MODULE = 'steward.carrier.simulator';
const closed = (properties: Data) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
export const registrationSchema = closed({ reference: { type:'string', pattern:'^[A-Za-z0-9-]{1,60}$' }, trackingNumber: { type:'string', pattern:'^SIM-[A-Z0-9-]{1,40}$' } });
export const syncSchema = closed({ registrationId: { type:'string', format:'uuid' } });
const nowIso = (now: number) => new Date(now).toISOString();
function authorize(c: Context) {
  ensure(c.config.mode === 'simulator' && c.entityId && c.providerIdentity && !c.peerScope, 'Synthetic Worker-local provider authority required', 403);
  ensure(c.providerIdentity.entityId === c.entityId && c.providerIdentity.workerInstallationId === c.installationId && c.providerIdentity.moduleId === MODULE, 'Provider scope mismatch', 403);
}
async function connection(c: Context) { const r = await find(c,'connection','simulator'); ensure(r,'Simulator initialization required',503); return r; }
async function scope(c: Context): Promise<Scope> {
  authorize(c); const r = await connection(c), p = c.providerIdentity!;
  return { entityId:c.entityId!,workerInstallationId:c.installationId,providerInstallationId:p.moduleInstallationId,moduleId:MODULE,authorityPackageDigest:p.packageDigest,connectionId:r.id,accountScopeId:r.data.accountScopeId,mode:'simulator' };
}
async function owned(c: Context, id: string) {
  ensure(uuid(id),'Invalid registration reference',400); const r = await get(c,'shipment',id);
  ensure(r.data.scopeKey === scopeKey(await scope(c)),'Carrier registration scope mismatch',403); return r;
}
function event(status: Status, at: string, supersedes: string | null = null): CarrierEvent {
  return { eventId:randomUUID(),providerEventId:randomUUID(),occurredAt:at,originalTime:at,rawStatus:status.toUpperCase(),status,mappingVersion:1,supersedes,correctionBasis:supersedes?'documented_semantics':null };
}
async function prepareRegistration(b: Data, previous: RecordValue | null, c: Context, now = Date.now()) {
  authorize(c); ensure(/^[A-Za-z0-9-]{1,60}$/.test(b.reference) && /^SIM-[A-Z0-9-]{1,40}$/.test(b.trackingNumber) && Object.keys(b).sort().join() === 'reference,trackingNumber','Invalid synthetic registration',400);
  if (previous) { ensure(previous.data.reference === b.reference && previous.data.trackingNumber === b.trackingNumber && previous.data.scopeKey === scopeKey(await scope(c)),'Registration identity reused with different input',409); return previous.data; }
  const count = Number((await c.db.query("SELECT count(*) FROM business_records WHERE kind='shipment'")).rows[0].count); ensure(count < limits.registrations,'Synthetic registration limit reached',409);
  const s = await scope(c), cycle = randomUUID();
  return { ...b, scope:s,scopeKey:scopeKey(s),identity:registrationKey(s,b.trackingNumber,cycle),shipmentId:cycle,packageId:randomUUID(),mode:'simulator',registeredAt:nowIso(now),status:'unknown',reconciliation:'insufficient_evidence',qualifications:['no_observations'],evidence:[],coverage:'unknown',expectedPackages:null,shipmentDelivered:null,lastSuccessfulSyncAt:null,freshUntil:null,steps:0,synthetic:true };
}
async function initializeProvider(r: RecordValue,c:Context) {
  await c.db.query('INSERT INTO carrier_provider(registration_id,events) VALUES($1,$2) ON CONFLICT DO NOTHING',[r.id,JSON.stringify([event('announced',r.data.registeredAt)])]);
}
async function enqueue(c: Context,r: RecordValue,now=Date.now()) {
  const conn=await connection(c);
  const existing=(await c.db.query("SELECT id FROM carrier_jobs WHERE registration_id=$1 AND state IN ('pending','running','retry')",[r.id])).rows[0];
  if(existing)return {jobId:existing.id};
  const id=randomUUID();await c.db.query('INSERT INTO carrier_jobs(id,registration_id,generation,next_at) VALUES($1,$2,$3,$4)',[id,r.id,conn.data.generation,nowIso(now)]);
  return {jobId:id};
}
export function carrierSimulator(manifest: ModulePackageManifest): Definition {
  const def: Definition = {
    manifest, resources:[],actions:[],authorize:async c=>authorize(c),
    afterMigrate:async c=>{ authorize(c);if(!await find(c,'connection','simulator'))await save(c,'connection','simulator',{name:'Local carrier simulator',mode:'simulator',status:'synthetic_ready',accountScopeId:randomUUID(),generation:1,synthetic:true}); },
  };
  def.resources.push({kind:'shipment',path:'/registrations',key:'reference',schema:registrationSchema,prepare:prepareRegistration,after:(r,_previous,c)=>initializeProvider(r,c)});
  const action=(path:string,permission:string,run:(r:RecordValue,c:Context)=>Promise<Data>,kind='shipment')=>def.actions.push({kind,path,permission:MODULE+'.'+permission,run});
  action('/sync-tracking/:id','tracking.sync',async(r,c)=>{await owned(c,r.id);return enqueue(c,r);});
  action('/governed-sync/:id','tracking.sync',async(r,c)=>{await owned(c,r.id);return {commandId:await enqueueCapability(c,'shipping.tracking.sync','tracking.sync',r.id,{registrationId:r.id},{expectedProvider:c.providerIdentity!})};});
  for(const change of ['advance','duplicate','late','correct','conflict','unknown-time','outage','recover','partial','throttle']) {
    action('/'+change+'/:id','simulate',async(r,c)=>{
      await owned(c,r.id);const row=(await c.db.query('SELECT * FROM carrier_provider WHERE registration_id=$1 FOR UPDATE',[r.id])).rows[0];ensure(row,'Synthetic provider not initialized',503);
      const events: CarrierEvent[] = row.events;ensure(events.length<limits.events,'Synthetic event limit reached',409);
      const last = events.at(-1)!;const max = Math.max(...events.map(e=>Date.parse(e.occurredAt??r.data.registeredAt)));
      const at=nowIso(Math.max(Date.now(),max+1));let failure=row.failure;
      if(change==='advance'){const sequence:Status[]=['announced','in_transit','out_for_delivery','delivered'];const next=sequence.indexOf(last.status)+1;ensure(next>0&&next<sequence.length,'Synthetic lifecycle is terminal or needs explicit correction',409);events.push(event(sequence[next]!,at));}
      if(change==='duplicate')events.push({...last});
      if(change==='late')events.push(event('in_transit',nowIso(Date.parse(r.data.registeredAt)-1)));
      if(change==='correct')events.push(event('exception',at,last.eventId));
      if(change==='conflict')events.push({...last,status:last.status==='delivered'?'exception':'delivered',rawStatus:'CONFLICT'});
      if(change==='unknown-time')events.push({...event('exception',at),occurredAt:null,originalTime:'unknown timezone'});
      if(['outage','throttle','partial'].includes(change))failure=change;
      if(change==='recover')failure=null;
      await c.db.query('UPDATE carrier_provider SET events=$2,failure=$3 WHERE registration_id=$1',[r.id,JSON.stringify(events),failure]);
      return {record:publicRecord(await save(c,r.kind,r.key,{...r.data,steps:r.data.steps+1},r)),providerState:'synthetic '+change,requiresSynchronization:true};
    });
  }
  action('/verify-connection/:id','configure',async(r)=>({record:publicRecord(r),mode:'simulator',state:'synthetic_ready',carrierAuthenticated:false}),'connection');
  action('/advance-generation/:id','configure',async(r,c)=>({record:publicRecord(await save(c,r.kind,r.key,{...r.data,generation:r.data.generation+1},r))}),'connection');
  const page = async(c:Context,q:Record<string,string>={},kind:string)=>{
    const offset=Number(q.offset??0),limit=Number(q.limit??20);ensure(Number.isInteger(offset)&&offset>=0&&offset<=100000&&Number.isInteger(limit)&&limit>=1&&limit<=20,'Invalid pagination',400);
    if(q.q)await owned(c,q.q);const sk=scopeKey(await scope(c));
    if(kind==='shipments'||kind==='exceptions'){
      const rows=(await c.db.query("SELECT * FROM business_records WHERE kind='shipment' AND data->>'scopeKey'=$1 AND ($2='' OR id::text=$2) AND ($3='' OR data->>'status'=$3)"+(kind==='exceptions'?" AND (data->>'status'='exception' OR data->>'reconciliation'='ambiguous' OR data->>'syncError' IS NOT NULL)":'')+' ORDER BY created_at,id LIMIT $4 OFFSET $5',[sk,q.q??'',q.status??'',limit+1,offset])).rows;
      return {records:rows.slice(0,limit).map(r=>({...publicRecord(r),fresh:fresh(r.data.freshUntil,Date.now()),evidence:undefined})),nextOffset:rows.length>limit?offset+limit:null,summary:'SIMULATOR ONLY. Local retained observations; reads perform no carrier requests. Package delivery is not whole-shipment completion.'};
    }
    const table=kind==='events'?'carrier_observations':'carrier_attempts';
    const rows=(await c.db.query(`SELECT t.* FROM ${table} t JOIN business_records r ON r.id=t.registration_id WHERE r.data->>'scopeKey'=$1 AND ($2='' OR r.id::text=$2) ORDER BY t.created_at DESC,t.id LIMIT $3 OFFSET $4`,[sk,q.q??'',limit+1,offset])).rows;
    return {records:rows.slice(0,limit).map(r=>({id:r.id,revision:1,registrationId:r.registration_id,...r.data})),nextOffset:rows.length>limit?offset+limit:null,summary:'Synthetic retained evidence. Event time and receipt time have distinct meanings.'};
  };
  def.queries=[{path:'/connections',run:async c=>({records:[publicRecord(await connection(c))]})},{path:'/capability-summary',run:async c=>{const p=await page(c,{},'shipments');return {synthetic:true,records:p.records.map((r:Data)=>({registrationId:r.id,status:r.status,fresh:r.fresh})),nextOffset:p.nextOffset};}},...(['shipments','exceptions','events','attempts'] as const).map(kind=>({path:'/'+kind,run:(c:Context,q?:Record<string,string>)=>page(c,q,kind)}))];
  def.receive=async(command,c)=>{
    if(command.command==='tracking.register'){
      const b=command.payload;ensure(typeof b.reference==='string','Invalid registration reference',400);const old=await find(c,'shipment',b.reference);const data=await prepareRegistration(b,old,c);
      const r=old??await save(c,'shipment',b.reference,data);await initializeProvider(r,c);return {registrationId:r.id};
    }
    ensure(command.command==='tracking.sync' && Object.keys(command.payload).join()==='registrationId','Unsupported carrier command');
    ensure(typeof command.payload.registrationId==='string','Invalid registration reference',400);return enqueue(c,await owned(c,command.payload.registrationId));
  };
  return def;
}

export interface SyntheticReply { events: CarrierEvent[]; partial: boolean }
export type SyntheticTransport = (registrationId:string,pool:pg.Pool)=>Promise<SyntheticReply>;
export const syntheticTransport:SyntheticTransport=async(id,pool)=>{
  const r=(await pool.query('SELECT events,failure FROM carrier_provider WHERE registration_id=$1',[id])).rows[0];
  ensure(r,'Synthetic shipment missing',404);
  if(r.failure==='outage'||r.failure==='throttle')throw Error(r.failure==='throttle'?'SIMULATED_RATE_LIMIT':'SIMULATED_OUTAGE');
  return {events:r.failure==='partial'?r.events.slice(0,1):r.events,partial:r.failure==='partial'};
};
/** Persisted lease, bounded retry and generation check; transport runs outside transaction. */
export function carrierBackgroundWith(transport:SyntheticTransport=syntheticTransport,clock=Date.now) {
  return async(pool:pg.Pool,runtime:Data)=>{
    const context=(db:pg.PoolClient):Context=>({db,config:runtime.configuration,installationId:runtime.installationId,entityId:runtime.entityId,providerIdentity:runtime.providerIdentity,moduleId:MODULE,actor:'module-runtime',permissions:[]});
    const now=clock();const job=await transaction(pool,async db=>{
      const c=context(db);authorize(c);
      const j=(await db.query("SELECT * FROM carrier_jobs WHERE (state IN ('pending','retry') AND next_at <= $1) OR (state='running' AND lease_until <= $1) ORDER BY next_at,id LIMIT 1 FOR UPDATE",[nowIso(now)])).rows[0];if(!j)return null;
      if(j.state==='running')await db.query("UPDATE carrier_attempts SET data=data||'{\"outcome\":\"interrupted\"}'::jsonb WHERE id=$1",[j.attempt_id]);
      if(j.attempts>=limits.attempts){await db.query("UPDATE carrier_jobs SET state='failed' WHERE id=$1",[j.id]);return null;}
      const r=await owned(c,j.registration_id),conn=await connection(c);
      if(conn.data.generation!==j.generation){await db.query("UPDATE carrier_jobs SET state='superseded' WHERE id=$1",[j.id]);return null;}
      const attempt=randomUUID();await db.query("UPDATE carrier_jobs SET state='running',attempts=attempts+1,attempt_id=$2,lease_until=$3 WHERE id=$1",[j.id,attempt,nowIso(now+limits.leaseMs)]);
      await db.query('INSERT INTO carrier_attempts(id,registration_id,data) VALUES($1,$2,$3)',[attempt,r.id,{jobId:j.id,outcome:'running',startedAt:nowIso(now),mode:'simulator',generation:j.generation,scope:r.data.scope,transport:'simulator',requestCount:1}]);
      return {...j,attempts:j.attempts+1,attempt_id:attempt};
    });if(!job)return;
    let reply:SyntheticReply|undefined,error:string|null=null;
    try{reply=await Promise.race([transport(job.registration_id,pool),new Promise<never>((_,reject)=>{const timer=setTimeout(()=>reject(Error('SIMULATED_TIMEOUT')),5000);timer.unref();})]);}catch(e){error=e instanceof Error&&['SIMULATED_RATE_LIMIT','SIMULATED_OUTAGE','SIMULATED_TIMEOUT'].includes(e.message)?e.message:'INVALID_PROVIDER_RESPONSE';}
    await transaction(pool,async db=>{
      const c=context(db),j=(await db.query('SELECT * FROM carrier_jobs WHERE id=$1 FOR UPDATE',[job.id])).rows[0];if(j.state!=='running'||j.attempt_id!==job.attempt_id)return;
      const r=await owned(c,j.registration_id),conn=await connection(c),at=nowIso(clock());
      const finish=async(state:string,data:Data,next:string|null=null)=>{await db.query('UPDATE carrier_jobs SET state=$2,next_at=coalesce($3::timestamptz,next_at),lease_until=NULL WHERE id=$1',[j.id,state,next]);await db.query('UPDATE carrier_attempts SET data=data||$2::jsonb WHERE id=$1',[job.attempt_id,{...data,completedAt:at}]);};
      if(conn.data.generation!==j.generation){await finish('superseded',{outcome:'superseded'});return;}
      let observations:Observation[]=[];
      if(reply&&!error){
        try{
          ensure(typeof reply.partial==='boolean'&&Array.isArray(reply.events),'Invalid provider response');
          const previous=(await db.query('SELECT data FROM carrier_observations WHERE registration_id=$1 ORDER BY created_at,id',[r.id])).rows.map(v=>v.data as Observation);
          observations=ingest(previous,reply.events,r.data.scopeKey,at);
        }catch{error='INVALID_PROVIDER_RESPONSE';}
      }
      if(error){const next=retryAt(job.attempts,clock(),0.5);await finish(next?'retry':'failed',{outcome:'failed',safeErrorCode:error},next);await save(c,r.kind,r.key,{...r.data,syncError:error,lastAttemptAt:at},r);return;}
      for(const o of observations){
        const row=(await db.query('INSERT INTO carrier_observations(id,registration_id,digest,data) VALUES($1,$2,$3,$4) ON CONFLICT(registration_id,digest) DO UPDATE SET digest=excluded.digest RETURNING id',[randomUUID(),r.id,o.digest,o])).rows[0];
        if(reply!.events.some(e=>hash(e)===o.digest))await db.query('INSERT INTO carrier_receipts(attempt_id,observation_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[job.attempt_id,row.id]);
      }
      const result=reconcile(observations),partial=reply!.partial,next=partial?retryAt(job.attempts,clock(),0.5):null;
      await finish(partial?(next?'retry':'failed'):'completed',{outcome:partial?'partial':'success',coverage:partial?'partial_response':'complete_response',eventCount:reply!.events.length},next);
      await save(c,r.kind,r.key,{...r.data,...result,coverage:partial?'partial_response':'complete_response',qualifications:[...result.qualifications,...(partial?['partial_response']:[])],lastSuccessfulSyncAt:partial?r.data.lastSuccessfulSyncAt:at,freshUntil:partial?null:nowIso(clock()+limits.freshMs),syncError:partial?'PARTIAL_RESPONSE':null,lastAttemptAt:at},r);
    });
  };
}
export const carrierBackground=carrierBackgroundWith();
