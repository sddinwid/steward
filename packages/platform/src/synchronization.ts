import {monitorCommerce,commerceExceptionSchema} from './commerce-monitor.js';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { DataEvent, InstallationConfig, SyncExchange, SyncReceipt } from '@steward/contracts';
import { canonical, digest } from '@steward/module-sdk';
import type { SecureApp, Authentication } from './security/auth.js';
import type { SecurityConfig } from './security/config.js';
import { fail, signAssertion, verifyAssertion, validUuid } from './security/crypto.js';
import { transaction, audit, type Sql } from './security/store.js';
import { masterRequest } from './security/worker.js';
import { createModuleBroker } from './module-broker.js';
import {commerceWireSchema,commerceProjectionSchema,calculateCommerce} from './commerce-analysis.js';
import {canonicalBusinessPayload,sourceReference} from './business-analysis.js';

export function validateEvent(e: DataEvent) {
  if (!e || e.envelopeVersion !== 1 || e.payloadVersion !== 1 || !validUuid(e.eventId) || !validUuid(e.recordId) || !validUuid(e.source?.installationId) || !validUuid(e.source?.entity?.entityId) || !validUuid(e.destinationInstallationId) ||
      !['record.upsert','finding.issued','finding.status'].includes(e.eventType) || !Number.isSafeInteger(e.recordRevision) || e.recordRevision < 1 || e.sequence !== String(e.recordRevision) || !Number.isFinite(Date.parse(e.occurredAt)) ||
      typeof e.moduleId !== 'string' || !/^[a-z][a-z0-9.-]{0,79}$/.test(e.moduleId) || typeof e.streamId !== 'string' || !/^[a-z][a-z0-9_]{0,49}$/.test(e.streamId) || !e.payload || Array.isArray(e.payload) || typeof e.payload !== 'object' || Buffer.byteLength(JSON.stringify(e)) > 12000) fail(400, 'Invalid synchronization event');
  if(e.eventType==='record.upsert'&&e.streamId==='commerce_orders'){
    if(Object.keys(e.payload).some(k=>!['id','revision','projection'].includes(k))||e.payload.id!==e.recordId||Number(e.payload.revision)!==e.recordRevision||!commerceWireSchema.safeParse(e.payload.projection).success)fail(400,'Invalid or non-private commerce projection');
  }
  if(e.eventType==='record.upsert'&&e.streamId==='commerce_exceptions'){
    if(Object.keys(e.payload).some(k=>!['id','revision','projection'].includes(k))||e.payload.id!==e.recordId||Number(e.payload.revision)!==e.recordRevision||!commerceExceptionSchema.safeParse(e.payload.projection).success)fail(400,'Invalid or non-private commerce exception');
  }
}
export async function inbox(sql: Sql, e: DataEvent): Promise<boolean> {
  const fingerprint = digest(canonical(e));
  const inserted = await sql.query('INSERT INTO sync_inbox(event_id,source_installation,digest,envelope) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [e.eventId,e.source.installationId,fingerprint,e]);
  if (inserted.rowCount) return true;
  if ((await sql.query('SELECT digest FROM sync_inbox WHERE event_id=$1', [e.eventId])).rows[0]?.digest !== fingerprint) fail(409, 'Event identity was reused with different content');
  return false;
}
export function dataEvent(installation: InstallationConfig, destination: string, type: DataEvent['eventType'], recordId: string, revision: number, payload: Record<string,unknown>): DataEvent {
  return { envelopeVersion: 1, payloadVersion: 1, eventId: randomUUID(), source: installation, destinationInstallationId: destination as any, sequence: String(revision), occurredAt: new Date().toISOString(), eventType: type, moduleId: 'steward.findings', streamId: 'findings', recordId, recordRevision: revision, payload };
}
async function queue(sql: Sql, event: DataEvent) { await sql.query('INSERT INTO sync_outbox(event_id,envelope) VALUES($1,$2)', [event.eventId,event]); }
export function batchEvents(events:DataEvent[]):DataEvent[]{const result:DataEvent[]=[];let size=0;for(const event of events){const n=Buffer.byteLength(JSON.stringify(event));if(result.length===10||size+n>12000)break;result.push(event);size+=n;}return result;}

export async function synchronizationRoutes(app: SecureApp, pool: pg.Pool, auth: Authentication, installation: InstallationConfig, key: string, security: SecurityConfig) {
  if (installation.role === 'master') {
    // Organization identity is configuration-owned, never a hardcoded company.
    await pool.query(`INSERT INTO legal_entities(entity_id,name,classification,enrollment_eligible) VALUES($1,$2,'platform_operator',false) ON CONFLICT(entity_id) DO NOTHING`, [installation.entity.entityId,installation.entity.displayName]);
    async function scope(req: any, mutate = false) {
      const actor = await auth.session(req, mutate);
      if (!['registry_admin','enrollment_admin'].includes(actor.role)) fail(403, 'Analytical access requires an authorized administrator');
      const entities = (await pool.query('SELECT entity_id FROM entity_authorizations WHERE account_id=$1', [actor.account_id])).rows.map(r => r.entity_id);
      return { actor, all: actor.role === 'registry_admin', entities };
    }
    async function registry(req: any) { const s = await scope(req,true); if (!s.all) fail(403,'Registry administrator required'); return s.actor; }
    app.get<{Querystring:{entityId?:string}}>('/api/v4/analytics', async req => {
      const s = await scope(req); const entity = req.query.entityId;
      if (entity && (!validUuid(entity) || !s.all && !s.entities.includes(entity))) fail(403,'Entity scope denied');
      const args = [s.all,s.entities,entity ?? null];
      const predicate = '($1::boolean OR entity_id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR entity_id=$3)';
      return { authoritative: false, operatingEntityId: installation.entity.entityId,
        entities: (await pool.query('SELECT * FROM legal_entities WHERE '+predicate+' ORDER BY name', args)).rows,
        records: (await pool.query('SELECT * FROM analytical_records WHERE '+predicate+' ORDER BY entity_id,module_id,stream_id,record_id',args)).rows,
        peers: (await pool.query('SELECT * FROM sync_peers WHERE '+predicate,args)).rows,
        relationships: (await pool.query('SELECT * FROM entity_relationships WHERE ($1::boolean OR from_entity=ANY($2::uuid[]) AND to_entity=ANY($2::uuid[])) AND ($3::uuid IS NULL OR from_entity=$3 OR to_entity=$3)',args)).rows };
    });
    app.get('/api/v4/commerce-monitor',async req=>{const s=await scope(req);return{policies:(await pool.query('SELECT entity_id,enabled,updated_at FROM commerce_monitor_policies WHERE $1::boolean OR entity_id=ANY($2::uuid[])',[s.all,s.entities])).rows,conditions:(await pool.query("SELECT c.*,r.entity_id FROM commerce_monitor_conditions c JOIN analytical_records r ON r.installation_id=c.installation_id AND r.module_id=c.module_id AND r.record_id=c.record_id AND r.stream_id=c.stream_id WHERE $1::boolean OR r.entity_id=ANY($2::uuid[])",[s.all,s.entities])).rows};});
    app.put<{Body:{entityId:string;enabled:boolean}}>('/api/v4/commerce-monitor',async req=>{const actor=await registry(req);const b=req.body;if(!validUuid(b?.entityId)||typeof b.enabled!=='boolean')fail(400,'Invalid monitoring policy');return transaction(pool,async sql=>{if(!(await sql.query('SELECT 1 FROM legal_entities WHERE entity_id=$1',[b.entityId])).rowCount)fail(404,'Unknown entity');await sql.query('INSERT INTO commerce_monitor_policies VALUES($1,$2,$3,now()) ON CONFLICT(entity_id) DO UPDATE SET enabled=excluded.enabled,approved_by=excluded.approved_by,updated_at=now()',[b.entityId,b.enabled,actor.account_id]);if(b.enabled){const rows=(await sql.query("SELECT * FROM analytical_records WHERE entity_id=$1 AND stream_id IN ('commerce_orders','commerce_exceptions')",[b.entityId])).rows;for(const row of rows)await monitorCommerce(sql,row);await materializeFindings(sql);}await audit(sql,actor.account_id,'commerce.monitor.policy',b.entityId,{enabled:b.enabled});return{saved:true};});});
    app.get('/api/v4/financial-report',async req=>{
      const s=await scope(req);
      const rows=(await pool.query("SELECT * FROM analytical_records WHERE stream_id='commerce_orders' AND ($1::boolean OR entity_id=ANY($2::uuid[])) ORDER BY entity_id,source_at DESC,record_id",[s.all,s.entities])).rows;
      const groups=new Map<string,{entityId:string;currency:string;rows:any[]}>();let excluded=0;
      for(const r of rows){const p=commerceProjectionSchema.safeParse(canonicalBusinessPayload(r));if(!p.success){excluded++;continue;}const k=r.entity_id+':'+p.data.currency;const g:{entityId:string;currency:string;rows:any[]}=groups.get(k)??{entityId:r.entity_id,currency:p.data.currency,rows:[]};g.rows.push({row:r,payload:p.data});groups.set(k,g);}
      return{authoritative:false,excludedRecords:excluded,reports:[...groups.values()].map(g=>{const selected=g.rows.slice(0,20);return{entityId:g.entityId,currency:g.currency,totalAvailable:g.rows.length,selectedCount:selected.length,selection:'Most recent 20 approved synchronized source orders per entity and currency; not a complete-period census',calculation:calculateCommerce(selected.map(v=>v.payload)),sources:selected.map(v=>({reference:sourceReference(v.row),observedAt:v.row.source_at,ingestedAt:v.row.ingested_at}))};})};
    });
    app.put<{Body:{relationshipId:string;fromEntity:string;toEntity:string;kind:string;description:string}}>('/api/v4/relationships', async req => {
      const actor=await registry(req);const b=req.body;
      if (!validUuid(b?.relationshipId)||!validUuid(b.fromEntity)||!validUuid(b.toEntity)||b.fromEntity===b.toEntity||typeof b.kind!=='string'||!/^[a-z][a-z0-9_]{0,49}$/.test(b.kind)||typeof b.description!=='string'||b.description.length>2000) fail(400,'Invalid relationship');
      return transaction(pool,async sql=>{await sql.query('INSERT INTO entity_relationships VALUES($1,$2,$3,$4,$5) ON CONFLICT(relationship_id) DO UPDATE SET kind=excluded.kind,description=excluded.description',[b.relationshipId,b.fromEntity,b.toEntity,b.kind,b.description]);await audit(sql,actor.account_id,'relationship.saved',b.relationshipId);return{saved:true};});
    });
    app.get('/api/v4/findings', async req => {
      const s=await scope(req);
      return { findings:(await pool.query(`SELECT f.*,array_agg(e.entity_id ORDER BY e.entity_id) affected_entities FROM analytical_findings f JOIN finding_entities e USING(finding_id) WHERE $1::boolean OR e.entity_id=ANY($2::uuid[]) GROUP BY f.finding_id ORDER BY f.created_at DESC`,[s.all,s.entities])).rows.map(f=>({...f,supporting_references:s.all?f.supporting_references:f.supporting_references.filter((r:any)=>s.entities.includes(r.entityId))})), receipts:(await pool.query('SELECT * FROM finding_receipts WHERE $1::boolean OR entity_id=ANY($2::uuid[])',[s.all,s.entities])).rows };
    });
    app.post<{Body:{findingId:string;severity:string;explanation:string;affectedEntities:string[];supportingReferences:any[]}}>('/api/v4/findings', async req => {
      const actor=await registry(req);const b=req.body;
      if (!validUuid(b?.findingId)||!['info','warning','critical'].includes(b.severity)||typeof b.explanation!=='string'||!b.explanation.trim()||b.explanation.length>4000||!Array.isArray(b.affectedEntities)||!b.affectedEntities.length||b.affectedEntities.length>20||b.affectedEntities.some(e=>!validUuid(e))||!Array.isArray(b.supportingReferences)||b.supportingReferences.length>20) fail(400,'Invalid finding');
      return transaction(pool,async sql=>{
        for(const entity of new Set(b.affectedEntities)) if(!(await sql.query('SELECT 1 FROM legal_entities WHERE entity_id=$1',[entity])).rowCount) fail(404,'Unknown affected entity');
        for(const r of b.supportingReferences) if(!b.affectedEntities.includes(r.entityId)||!(await sql.query('SELECT 1 FROM analytical_records WHERE entity_id=$1 AND module_id=$2 AND stream_id=$3 AND record_id=$4 AND revision=$5',[r.entityId,r.moduleId,r.streamId,r.recordId,r.revision])).rowCount) fail(400,'Supporting reference is unavailable or outside affected entities');
        const old=(await sql.query('SELECT * FROM analytical_findings WHERE finding_id=$1',[b.findingId])).rows[0];
        if(old){if(old.severity!==b.severity||old.explanation!==b.explanation||canonical(old.supporting_references)!==canonical(b.supportingReferences)||canonical((await sql.query('SELECT entity_id FROM finding_entities WHERE finding_id=$1 ORDER BY entity_id',[b.findingId])).rows.map(r=>r.entity_id))!==canonical([...new Set(b.affectedEntities)].sort())) fail(409,'Finding ID already belongs to another request');return{findingId:b.findingId};}
        await sql.query("INSERT INTO analytical_findings(finding_id,severity,explanation,status,supporting_references) VALUES($1,$2,$3,'open',$4)",[b.findingId,b.severity,b.explanation,JSON.stringify(b.supportingReferences)]);
        for(const entity of new Set(b.affectedEntities))await sql.query('INSERT INTO finding_entities VALUES($1,$2)',[b.findingId,entity]);
        await materializeFindings(sql);await audit(sql,actor.account_id,'finding.created',b.findingId);return{findingId:b.findingId};
      });
    });
    app.put<{Params:{id:string};Body:{revision:number;status:string}}>('/api/v4/findings/:id',async req=>{
      const actor=await registry(req);if(!validUuid(req.params.id)||!Number.isSafeInteger(req.body?.revision)||!['open','closed'].includes(req.body.status))fail(400,'Invalid finding update');
      return transaction(pool,async sql=>{if(!(await sql.query('UPDATE analytical_findings SET status=$1,revision=revision+1 WHERE finding_id=$2 AND revision=$3',[req.body.status,req.params.id,req.body.revision])).rowCount)fail(409,'Finding changed; refresh');await materializeFindings(sql);await audit(sql,actor.account_id,'finding.updated',req.params.id);return{saved:true};});
    });
    async function materializeFindings(sql:Sql, worker?:string) {
      const rows=(await sql.query(`SELECT f.*,e.entity_id,w.installation_id FROM analytical_findings f JOIN finding_entities e USING(finding_id) JOIN enrolled_workers w ON w.entity_id=e.entity_id WHERE ($1::uuid IS NULL OR w.installation_id=$1) AND NOT EXISTS(SELECT 1 FROM finding_deliveries d WHERE d.finding_id=f.finding_id AND d.installation_id=w.installation_id AND d.master_revision=f.revision)`,[worker??null])).rows;
      for(const f of rows){const event=dataEvent(installation,f.installation_id,'finding.issued',f.finding_id,f.revision,{findingId:f.finding_id,severity:f.severity,explanation:f.explanation,status:f.status,affectedEntities:[f.entity_id],supportingReferences:f.supporting_references.filter((r:any)=>r.entityId===f.entity_id)});
        const result=await sql.query('INSERT INTO finding_deliveries VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[f.finding_id,f.installation_id,f.revision,event.eventId]);if(result.rowCount)await queue(sql,event);}
    }
    app.post<{Body:{payload:SyncExchange;signature:string}}>('/api/v4/sync/exchange',async req=>{
      const proof=req.body;const p=proof?.payload;
      if(!p||p.protocol!=='steward-sync-v1'||!validUuid(p.installationId)||!validUuid(p.entityId)||!validUuid(p.nonce)||!Number.isSafeInteger(p.issuedAt)||Math.abs(Date.now()-p.issuedAt)>60000||!Array.isArray(p.events)||p.events.length>10||!Array.isArray(p.acknowledgments)||p.acknowledgments.length>20||p.acknowledgments.some(e=>!validUuid(e)))fail(400,'Invalid synchronization proof');
      const worker=(await pool.query('SELECT w.entity_id,c.public_key FROM enrolled_workers w JOIN worker_candidates c USING(installation_id) WHERE w.installation_id=$1',[p.installationId])).rows[0];
      if(!worker||worker.entity_id!==p.entityId)fail(403,'Enrolled entity identity required');verifyAssertion(proof,worker.public_key);
      const value=await transaction(pool,async sql=>{
        await sql.query('DELETE FROM sync_nonces WHERE expires_at<now()');
        if(!(await sql.query("INSERT INTO sync_nonces VALUES($1,$2,now()+interval '5 minutes') ON CONFLICT DO NOTHING",[p.installationId,p.nonce])).rowCount)fail(409,'Synchronization proof replayed');
        await sql.query('SELECT pg_advisory_xact_lock(hashtext($1))',['sync:'+p.installationId]);
        const acknowledged=[];
        for(const e of p.events){validateEvent(e);if(e.source.installationId!==p.installationId||e.source.entity.entityId!==worker.entity_id||e.source.role!=='worker'||e.destinationInstallationId!==installation.installationId||e.eventType==='finding.issued')fail(403,'Cross-entity synchronization denied');
          if(await inbox(sql,e)){
            if(e.eventType==='record.upsert'){
              const old=(await sql.query('SELECT revision,payload FROM analytical_records WHERE installation_id=$1 AND module_id=$2 AND stream_id=$3 AND record_id=$4',[p.installationId,e.moduleId,e.streamId,e.recordId])).rows[0];
              if(old&&Number(old.revision)===e.recordRevision&&canonical(old.payload)!==canonical(e.payload))fail(409,'Conflicting source revision');
              await sql.query(`INSERT INTO analytical_records VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT(installation_id,module_id,stream_id,record_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,event_id=excluded.event_id,source_at=excluded.source_at,ingested_at=now() WHERE analytical_records.revision<excluded.revision`,[worker.entity_id,p.installationId,e.moduleId,e.streamId,e.recordId,e.recordRevision,e.payload,e.eventId,e.occurredAt]);
              if(['commerce_orders','commerce_exceptions'].includes(e.streamId)){const current=(await sql.query('SELECT * FROM analytical_records WHERE installation_id=$1 AND module_id=$2 AND stream_id=$3 AND record_id=$4',[p.installationId,e.moduleId,e.streamId,e.recordId])).rows[0];await monitorCommerce(sql,current);}
            }else{
              if(e.moduleId!=='steward.findings'||!['acknowledged','resolved','dismissed'].includes(String(e.payload.status))||!(await sql.query('SELECT 1 FROM finding_entities WHERE finding_id=$1 AND entity_id=$2',[e.recordId,worker.entity_id])).rowCount)fail(403,'Finding does not affect this entity');
              const old=(await sql.query('SELECT revision,status FROM finding_receipts WHERE finding_id=$1 AND installation_id=$2',[e.recordId,p.installationId])).rows[0];
              if(old&&old.revision===e.recordRevision&&old.status!==e.payload.status)fail(409,'Conflicting finding revision');
              await sql.query(`INSERT INTO finding_receipts VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT(finding_id,installation_id) DO UPDATE SET status=excluded.status,revision=excluded.revision,event_id=excluded.event_id,updated_at=now() WHERE finding_receipts.revision<excluded.revision`,[e.recordId,p.installationId,worker.entity_id,e.payload.status,e.recordRevision,e.eventId]);
            }
          }acknowledged.push(e.eventId);
        }
        await sql.query("UPDATE sync_outbox SET acknowledged_at=now(),error_code=NULL WHERE event_id=ANY($1::uuid[]) AND envelope->>'destinationInstallationId'=$2",[p.acknowledgments,p.installationId]);
        await materializeFindings(sql,p.installationId);
        await sql.query('INSERT INTO sync_peers VALUES($1,$2,now()) ON CONFLICT(installation_id) DO UPDATE SET last_contact_at=now()',[p.installationId,worker.entity_id]);
        const events=batchEvents((await sql.query("SELECT envelope FROM sync_outbox WHERE acknowledged_at IS NULL AND envelope->>'destinationInstallationId'=$1 ORDER BY created_at,event_id LIMIT 10",[p.installationId])).rows.map(r=>r.envelope));
        await sql.query("UPDATE sync_outbox SET attempts=attempts+1 WHERE event_id=ANY($1::uuid[])",[events.map(e=>e.eventId)]);
        return{protocol:'steward-sync-v1',issuer:installation.installationId,installationId:p.installationId,nonce:p.nonce,acknowledged,events} satisfies SyncReceipt;
      });return signAssertion(value,key);
    });
  } else {
    async function local(req:any,mutate=false){const actor=await auth.session(req,mutate);if(actor.role!=='local_admin')fail(403,'Worker-local administrator required');return actor;}
    app.get('/api/v4/sync/status',async req=>{await local(req);return{...(await pool.query('SELECT * FROM sync_status WHERE singleton')).rows[0],outbox:(await pool.query('SELECT count(*)::int pending FROM sync_outbox WHERE acknowledged_at IS NULL')).rows[0],modules:(await pool.query("SELECT module_id,state FROM module_installations WHERE descriptor->'payload'->'manifest' ? 'replication'")).rows};});
    app.get('/api/v4/findings',async req=>{const actor=await auth.session(req);if(!['local_admin','module_user'].includes(actor.role))fail(403,'Local business account required');return{findings:(await pool.query('SELECT * FROM local_findings ORDER BY received_at DESC')).rows};});
    app.put<{Params:{id:string};Body:{revision:number;status:string}}>('/api/v4/findings/:id',async req=>{
      const actor=await local(req,true);const b=req.body;if(!validUuid(req.params.id)||!Number.isSafeInteger(b?.revision)||!['acknowledged','resolved','dismissed'].includes(b.status))fail(400,'Invalid finding status');
      return transaction(pool,async sql=>{const row=(await sql.query("SELECT * FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];if(!row)fail(409,'Enrollment required');const changed=(await sql.query('UPDATE local_findings SET status=$1,revision=revision+1 WHERE finding_id=$2 AND revision=$3 RETURNING revision',[b.status,req.params.id,b.revision])).rows[0];if(!changed)fail(409,'Finding changed; refresh');const source={...installation,entity:{entityId:row.entity_id,displayName:row.entity_name}};await queue(sql,dataEvent(source,row.certificate.payload.issuer,'finding.status',req.params.id,changed.revision,{status:b.status}));await audit(sql,actor.account_id,'finding.local_status',req.params.id,{status:b.status});return{saved:true};});
    });
    const broker=process.env.STEWARD_MODULES_FILE?await createModuleBroker(process.env.STEWARD_MODULES_FILE,installation,key):undefined;
    let busy=false;
    async function pump(){if(busy)return;busy=true;let client:pg.PoolClient|undefined;let locked=false;let selected:any[]=[];let module:any;let moduleEvents:DataEvent[]=[];
      try{
        client=await pool.connect();locked=(await client.query("SELECT pg_try_advisory_lock(14444001) acquired")).rows[0].acquired;if(!locked)return;
        const status=(await client.query('SELECT * FROM sync_status WHERE singleton')).rows[0];if(new Date(status.next_attempt_at).getTime()>Date.now())return;
        const enrollment=(await client.query("SELECT * FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];if(!enrollment)return;
        const profile=security.trustedMasters.find(p=>p.profileId===enrollment.profile_id);if(!profile)throw new Error('TRUST_UNAVAILABLE');
        await client.query('UPDATE sync_status SET last_attempt_at=now() WHERE singleton');
        selected=(await client.query('SELECT envelope FROM sync_outbox WHERE acknowledged_at IS NULL AND next_attempt_at<=now() ORDER BY created_at,event_id LIMIT 10')).rows;
        const modules=(await client.query("SELECT m.* FROM module_installations m LEFT JOIN sync_module_progress p USING(module_id) WHERE state IN ('active','disabled','installed') AND descriptor->'payload'->'manifest' ? 'replication' ORDER BY coalesce(p.last_poll,'epoch'::timestamptz),module_id")).rows;
        // Round-robin by oldest successful attempt prevents a busy module starving another.
        for(const candidate of modules){const result=await broker?.('outbox.read',candidate.descriptor,candidate.configuration);await client.query('INSERT INTO sync_module_progress VALUES($1,now()) ON CONFLICT(module_id) DO UPDATE SET last_poll=now()',[candidate.module_id]);if(result?.status!==200)throw new Error('MODULE_OUTBOX_UNAVAILABLE');if(result.value.events.length){module=candidate;moduleEvents=result.value.events;break;}}
        const outgoing=batchEvents([...selected.map(r=>r.envelope),...moduleEvents]);
        moduleEvents=moduleEvents.filter(e=>outgoing.some(v=>v.eventId===e.eventId));
        for(const e of outgoing){validateEvent(e);if(e.source.entity.entityId!==enrollment.entity_id||e.source.installationId!==installation.installationId)throw new Error('SOURCE_BINDING_MISMATCH');}
        const acknowledgments=(await client.query('SELECT event_id FROM sync_inbox WHERE NOT acknowledged_to_source ORDER BY ingested_at LIMIT 20')).rows.map(r=>r.event_id);
        const exchange:SyncExchange={protocol:'steward-sync-v1',installationId:installation.installationId,entityId:enrollment.entity_id,nonce:randomUUID(),issuedAt:Date.now(),events:outgoing,acknowledgments};
        const transport:SyncTransport={exchange:async value=>verifyAssertion(await masterRequest(profile,'/api/v4/sync/exchange',signAssertion(value,key)) as any,profile.publicKey) as SyncReceipt};
        const receipt=await transport.exchange(exchange);
        if(receipt.protocol!=='steward-sync-v1'||receipt.issuer!==profile.installationId||receipt.installationId!==installation.installationId||receipt.nonce!==exchange.nonce||!Array.isArray(receipt.acknowledged)||receipt.acknowledged.some(id=>!outgoing.some(e=>e.eventId===id))||!Array.isArray(receipt.events)||receipt.events.length>10)throw new Error('RECEIPT_REJECTED');
        await client.query('BEGIN');try{
          await client.query('UPDATE sync_inbox SET acknowledged_to_source=true WHERE event_id=ANY($1::uuid[])',[acknowledgments]);
          for(const e of receipt.events){validateEvent(e);if(e.source.installationId!==profile.installationId||e.eventType!=='finding.issued'||e.destinationInstallationId!==installation.installationId||e.moduleId!=='steward.findings'||!Array.isArray(e.payload.affectedEntities)||!e.payload.affectedEntities.includes(enrollment.entity_id))throw new Error('FINDING_SCOPE_REJECTED');if(await inbox(client,e))await client.query('INSERT INTO local_findings(finding_id,master_revision,payload) VALUES($1,$2,$3) ON CONFLICT(finding_id) DO UPDATE SET master_revision=excluded.master_revision,payload=excluded.payload,received_at=now() WHERE local_findings.master_revision<excluded.master_revision',[e.recordId,e.recordRevision,e.payload]);}
          await client.query('UPDATE sync_inbox SET acknowledged_to_source=false WHERE event_id=ANY($1::uuid[])',[receipt.events.map(e=>e.eventId)]);
          await client.query('UPDATE sync_outbox SET acknowledged_at=now(),error_code=NULL WHERE event_id=ANY($1::uuid[])',[receipt.acknowledged]);
          await client.query('UPDATE sync_status SET last_success_at=now(),attempts=0,next_attempt_at=now(),error_code=NULL WHERE singleton');await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e;}
        if(module&&moduleEvents.length)await broker?.('outbox.complete',module.descriptor,module.configuration,{acknowledged:moduleEvents.filter(e=>receipt.acknowledged.includes(e.eventId)).map(e=>e.eventId),failed:[]});
      }catch{
        if(client)await client.query("UPDATE sync_status SET attempts=attempts+1,error_code='DELIVERY_UNAVAILABLE',next_attempt_at=now()+least(30,power(2,least(attempts,5)))*interval '1 second' WHERE singleton").catch(()=>{});
        if(client&&selected.length)await client.query("UPDATE sync_outbox SET attempts=attempts+1,error_code='DELIVERY_UNAVAILABLE',next_attempt_at=now()+interval '2 seconds' WHERE event_id=ANY($1::uuid[]) AND acknowledged_at IS NULL",[selected.map(r=>r.envelope.eventId)]).catch(()=>{});
        if(module&&moduleEvents.length)await broker?.('outbox.complete',module.descriptor,module.configuration,{acknowledged:[],failed:moduleEvents.map(e=>e.eventId)}).catch(()=>{});
      }finally{if(client){if(locked)await client.query('SELECT pg_advisory_unlock(14444001)').catch(()=>{});client.release();}busy=false;}
    }
    const timer=setInterval(()=>void pump(),2000).unref();void pump();app.addHook('onClose',async()=>{clearInterval(timer);});
  }
}
export interface SyncTransport { exchange(value: SyncExchange): Promise<SyncReceipt> }
