import {marketingStream,marketingProjection,marketingPage} from './marketing-analysis.js';
import {monitoredSchema,monitoredStream,monitoredPage} from './monitored-commerce.js';
import {authorizeCatalogFinding,verifyCatalogCalculation,catalogFindingText,catalogFindingSynthetic,catalogFindingScopes,authorizeLocalCatalogFinding} from './catalog-intelligence-findings.js';
import {workerFindingReferences} from './mission-evidence.js';
import {isIntelligenceStream} from '@steward/catalog-kit/intelligence';
import {validateIntelligenceEvent} from './catalog-intelligence-wire.js';
import {economicFindingScopes,economicWorkerFindingText} from './economic-calculation-access.js';
import {ECONOMIC_PLANNING} from './economic-planning.js';
import {isEconomicEvent,validateEconomicEvent} from './economic-wire.js';
import {isMissionEvent,validateMissionEvent} from './mission-wire.js';
import {MISSION_DISCLOSURE_STREAM,acceptMissionDisclosure} from './mission-disclosures.js';
import {missionAuthorization} from './mission-routes.js';
import {readFile} from 'node:fs/promises';
import {verifyPackage,operationFor} from '@steward/module-sdk';
import {simulationDashboard,simulationRunSchema} from './simulation-analysis.js';
import {monitorSimulation,simulationPolicySchema} from './simulation-monitor.js';
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
  if(isEconomicEvent(e))validateEconomicEvent(e);else if(isMissionEvent(e))validateMissionEvent(e);
  if(isIntelligenceStream(e.streamId))validateIntelligenceEvent(e);
  if(e.eventType==='record.upsert'&&e.streamId===marketingStream){if(e.moduleId!=='cee.marketing'||Object.keys(e.payload).some(k=>!['id','revision','projection'].includes(k))||e.payload.id!==e.recordId||Number(e.payload.revision)!==e.recordRevision||!marketingProjection.safeParse(e.payload.projection).success)fail(400,'Invalid marketing projection');}
  if(e.eventType==='record.upsert'&&e.streamId===monitoredStream){if(e.moduleId!=='cee.shopify'||Object.keys(e.payload).some(k=>!['id','revision','projection'].includes(k))||e.payload.id!==e.recordId||Number(e.payload.revision)!==e.recordRevision||!monitoredSchema.safeParse(e.payload.projection).success||(e.payload.projection as any).supplierSources.some((r:any)=>r.entityId!==e.source.entity.entityId||r.installationId!==e.source.installationId))fail(400,'Invalid monitored commerce projection');}
  if(e.eventType==='record.upsert'&&e.streamId==='commerce_orders'){
    if(Object.keys(e.payload).some(k=>!['id','revision','projection'].includes(k))||e.payload.id!==e.recordId||Number(e.payload.revision)!==e.recordRevision||!commerceWireSchema.safeParse(e.payload.projection).success)fail(400,'Invalid or non-private commerce projection');
  }
  if(e.eventType==='record.upsert'&&e.streamId==='simulation_runs'){
    const parsed=simulationRunSchema.safeParse(e.payload.projection);if(Object.keys(e.payload).some(k=>!['id','revision','projection'].includes(k))||e.payload.id!==e.recordId||Number(e.payload.revision)!==e.recordRevision||!parsed.success||parsed.data.datasetId!==e.recordId)fail(400,'Invalid simulation projection');
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
        records: (await pool.query("SELECT * FROM analytical_records WHERE stream_id NOT IN ('catalog_publications_v1','pricing_publications_v1','pricing_evidence_v1','sales_publications_v1','mission_aggregates_v1','mission_resources_v1','mission_disclosures_v1','economic_summaries_v1','economic_summary_status_v1') AND "+predicate+' ORDER BY entity_id,module_id,stream_id,record_id',args)).rows,
        peers: (await pool.query('SELECT * FROM sync_peers WHERE '+predicate,args)).rows,
        relationships: (await pool.query('SELECT * FROM entity_relationships WHERE ($1::boolean OR from_entity=ANY($2::uuid[]) AND to_entity=ANY($2::uuid[])) AND ($3::uuid IS NULL OR from_entity=$3 OR to_entity=$3)',args)).rows };
    });
    app.get('/api/v4/marketing',async req=>{const s=await scope(req);const rows=(await pool.query("SELECT * FROM analytical_records WHERE stream_id='marketing_reports_v1' AND ($1::boolean OR entity_id=ANY($2::uuid[])) ORDER BY entity_id,record_id LIMIT 10001",[s.all,s.entities])).rows;if(rows.length>10000)fail(413,'Narrow authorized evidence');return marketingPage(rows,undefined,20,0);});
    app.get('/api/v4/monitored-commerce',async req=>{const s=await scope(req);const rows=(await pool.query("SELECT * FROM analytical_records WHERE stream_id='monitored_commerce_v1' AND ($1::boolean OR entity_id=ANY($2::uuid[])) ORDER BY entity_id,record_id LIMIT 10001",[s.all,s.entities])).rows;if(rows.length>10000)fail(413,'Narrow authorized evidence');return monitoredPage(rows,undefined,20,0);});
    app.get('/api/v4/commerce-monitor',async req=>{const s=await scope(req);return{policies:(await pool.query('SELECT entity_id,enabled,updated_at FROM commerce_monitor_policies WHERE $1::boolean OR entity_id=ANY($2::uuid[])',[s.all,s.entities])).rows,conditions:(await pool.query("SELECT c.*,r.entity_id,(r.payload->'projection'->>'approved'='true') AS publication_approved FROM commerce_monitor_conditions c JOIN analytical_records r ON r.installation_id=c.installation_id AND r.module_id=c.module_id AND r.record_id=c.record_id AND r.stream_id=c.stream_id WHERE $1::boolean OR r.entity_id=ANY($2::uuid[])",[s.all,s.entities])).rows};});
    app.get('/api/v4/simulation-intelligence',async req=>{
      const s=await scope(req);const rows=(await pool.query("SELECT * FROM analytical_records WHERE stream_id IN ('simulation_runs','commerce_orders') AND ($1::boolean OR entity_id=ANY($2::uuid[])) ORDER BY entity_id,source_at DESC,record_id LIMIT 10001",[s.all,s.entities])).rows;if(rows.length>10000)fail(413,'Narrow the authorized simulation dataset');
      const conditions=(await pool.query('SELECT c.*,array_agg(e.entity_id) affected_entities FROM simulation_monitor_conditions c JOIN finding_entities e USING(finding_id) GROUP BY c.condition_key')).rows.filter(c=>s.all||c.affected_entities.every((id:string)=>s.entities.includes(id)));
      const policy=s.all?(await pool.query('SELECT enabled,entity_ids,interval_seconds,thresholds,last_checked_at,last_error FROM simulation_monitor_policy WHERE singleton')).rows[0]??null:null;
      return{...simulationDashboard(rows),conditions,policy,canConfigure:s.all};
    });
    app.get<{Params:{id:string}}>('/api/v4/simulation-findings/:id',async req=>{
      const s=await scope(req);if(!validUuid(req.params.id))fail(400,'Invalid finding identity');const row=(await pool.query(`SELECT d.detail,d.created_at,array_agg(e.entity_id) affected_entities FROM simulation_finding_evidence d JOIN finding_entities e USING(finding_id) WHERE d.finding_id=$1 GROUP BY d.finding_id`,[req.params.id])).rows[0];if(!row||!s.all&&!row.affected_entities.every((id:string)=>s.entities.includes(id)))fail(404,'Original simulation calculation unavailable in this account scope');return{findingId:req.params.id,detail:row.detail,createdAt:row.created_at,historical:true,decisionExecuted:false};
    });
    app.put<{Body:unknown}>('/api/v4/simulation-monitor',async req=>{
      const actor=await registry(req),parsed=simulationPolicySchema.safeParse(req.body);if(!parsed.success)fail(400,'Invalid bounded simulation monitoring policy');const b=parsed.data;if(b.enabled&&!b.entityIds.length)fail(400,'Choose authorized entities to monitor');
      return transaction(pool,async sql=>{for(const id of b.entityIds)if(!(await sql.query('SELECT 1 FROM legal_entities WHERE entity_id=$1',[id])).rowCount)fail(404,'Unknown monitoring entity');
        await sql.query(`INSERT INTO simulation_monitor_policy(singleton,enabled,entity_ids,approved_by,interval_seconds,thresholds) VALUES(true,$1,$2,$3,$4,$5) ON CONFLICT(singleton) DO UPDATE SET enabled=excluded.enabled,entity_ids=excluded.entity_ids,approved_by=excluded.approved_by,interval_seconds=excluded.interval_seconds,thresholds=excluded.thresholds,last_checked_at=NULL,updated_at=now()`,[b.enabled,[...new Set(b.entityIds)],actor.account_id,b.intervalSeconds,b.thresholds]);
        await monitorSimulation(sql,true);await materializeFindings(sql);await audit(sql,actor.account_id,'simulation.monitor.policy',null,{enabled:b.enabled,entityIds:b.entityIds,intervalSeconds:b.intervalSeconds});return{saved:true};});
    });
    let monitoring=false;const monitorTimer=setInterval(()=>{if(monitoring)return;monitoring=true;void transaction(pool,async sql=>{await monitorSimulation(sql);await materializeFindings(sql);}).catch(async()=>{await pool.query("UPDATE simulation_monitor_policy SET last_error='Monitoring failed; source observations are retained. Review service health and source limits.' WHERE singleton").catch(()=>{});}).finally(()=>{monitoring=false;});},2000).unref();app.addHook('onClose',async()=>{clearInterval(monitorTimer);});
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
      const rows=(await pool.query(`SELECT f.*,array_agg(e.entity_id ORDER BY e.entity_id) affected_entities FROM analytical_findings f JOIN finding_entities e USING(finding_id) WHERE $1::boolean OR e.entity_id=ANY($2::uuid[]) GROUP BY f.finding_id ORDER BY f.created_at DESC`,[s.all,s.entities])).rows,findings=[];
      for(const f of rows){try{await missionAuthorization(pool,installation.installationId).finding(s.actor.account_id,f.finding_id);await authorizeCatalogFinding(pool,s.actor.account_id,f.finding_id);findings.push({...f,supporting_references:s.all?f.supporting_references:f.supporting_references.filter((r:any)=>s.entities.includes(r.entityId))});}catch{}}
      const visible=new Set(findings.map(f=>f.finding_id));return{findings,receipts:(await pool.query('SELECT * FROM finding_receipts WHERE $1::boolean OR entity_id=ANY($2::uuid[])',[s.all,s.entities])).rows.filter(r=>visible.has(r.finding_id))};
    });
    app.get<{Params:{id:string}}>('/api/v4/findings/:id/evidence',async req=>{
      const s=await scope(req);if(!validUuid(req.params.id))fail(400,'Invalid finding identity');
      await missionAuthorization(pool,installation.installationId).finding(s.actor.account_id,req.params.id);await authorizeCatalogFinding(pool,s.actor.account_id,req.params.id);
      const finding=(await pool.query('SELECT f.supporting_references FROM analytical_findings f WHERE f.finding_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM finding_entities e WHERE e.finding_id=f.finding_id AND e.entity_id=ANY($3::uuid[])))',[req.params.id,s.all,s.entities])).rows[0];if(!finding)fail(404,'Finding unavailable');
      const evidence=[];for(const ref of finding.supporting_references.filter((r:any)=>s.all||s.entities.includes(r.entityId))){
        if(!['commerce_orders','commerce_exceptions','simulation_runs'].includes(ref.streamId)){evidence.push({reference:ref,available:false,reason:'Use the retained originating investigation for this evidence stream'});continue;}
        const rows=(await pool.query(`SELECT envelope,ingested_at FROM sync_inbox WHERE envelope->>'eventType'='record.upsert' AND envelope->'source'->'entity'->>'entityId'=$1 AND envelope->>'moduleId'=$2 AND envelope->>'streamId'=$3 AND envelope->>'recordId'=$4 AND envelope->>'recordRevision'=$5 ORDER BY ingested_at LIMIT 2`,[ref.entityId,ref.moduleId,ref.streamId,ref.recordId,String(ref.revision)])).rows;
        const signatures=new Set(rows.map(r=>canonical({source:r.envelope.source.installationId,payload:r.envelope.payload})));const row=rows[0];evidence.push(row&&signatures.size===1?{reference:ref,available:true,observedAt:row.envelope.occurredAt,ingestedAt:row.ingested_at,payload:row.envelope.payload}:{reference:ref,available:false,reason:signatures.size>1?'Ambiguous retained source identity':'Original envelope is not retained'});
      }return{evidence,historical:true,authoritative:false,decisionExecuted:false};
    });
    app.post<{Body:{findingId:string;severity:string;explanation:string;affectedEntities:string[];supportingReferences:any[]}}>('/api/v4/findings', async req => {
      const actor=await registry(req);const b=req.body;
      if (!validUuid(b?.findingId)||!['info','warning','critical'].includes(b.severity)||typeof b.explanation!=='string'||!b.explanation.trim()||b.explanation.length>4000||!Array.isArray(b.affectedEntities)||!b.affectedEntities.length||b.affectedEntities.length>20||b.affectedEntities.some(e=>!validUuid(e))||!Array.isArray(b.supportingReferences)||b.supportingReferences.length>20) fail(400,'Invalid finding');
      if(b.supportingReferences.some(r=>isIntelligenceStream(r?.streamId)))fail(403,'Use the exact-source Catalog intelligence finding workflow');
      if(b.supportingReferences.some(r=>['mission_aggregates_v1','mission_resources_v1','mission_disclosures_v1','economic_summaries_v1','economic_summary_status_v1'].includes(r?.streamId)))fail(403,'Use the programme-scoped mission finding workflow');
      return transaction(pool,async sql=>{
        for(const entity of new Set(b.affectedEntities)) if(!(await sql.query('SELECT 1 FROM legal_entities WHERE entity_id=$1',[entity])).rowCount) fail(404,'Unknown affected entity');
        for(const r of b.supportingReferences) if(!b.affectedEntities.includes(r.entityId)||!(await sql.query('SELECT 1 FROM analytical_records WHERE entity_id=$1 AND module_id=$2 AND stream_id=$3 AND record_id=$4 AND revision=$5',[r.entityId,r.moduleId,r.streamId,r.recordId,r.revision])).rowCount) fail(400,'Supporting reference is unavailable or outside affected entities');
        for(const ref of b.supportingReferences.filter((r:any)=>r.streamId===marketingStream)){if(!validUuid((ref as any).installationId))fail(400,'Exact marketing installation required');const rows=(await sql.query('SELECT payload FROM analytical_records WHERE entity_id=$1 AND installation_id=$2 AND module_id=$3 AND stream_id=$4 AND record_id=$5 AND revision=$6',[ref.entityId,(ref as any).installationId,ref.moduleId,ref.streamId,ref.recordId,ref.revision])).rows;if(ref.moduleId!=='cee.marketing'||rows.length!==1||!marketingProjection.safeParse(rows[0].payload.projection).success||rows[0].payload.projection.approved!==true)fail(409,'Marketing publication unavailable');}
        for(const ref of b.supportingReferences.filter((r:any)=>r.streamId===monitoredStream)){if(!validUuid((ref as any).installationId))fail(400,'Exact monitored installation required');const rows=(await sql.query('SELECT payload FROM analytical_records WHERE entity_id=$1 AND installation_id=$2 AND module_id=$3 AND stream_id=$4 AND record_id=$5 AND revision=$6',[ref.entityId,(ref as any).installationId,ref.moduleId,ref.streamId,ref.recordId,ref.revision])).rows;if(rows.length!==1||!monitoredSchema.safeParse(rows[0].payload.projection).success||rows[0].payload.projection.approved!==true)fail(409,'Monitored publication unavailable');}
        const old=(await sql.query('SELECT * FROM analytical_findings WHERE finding_id=$1',[b.findingId])).rows[0];
        if(old){if(old.severity!==b.severity||old.explanation!==b.explanation||canonical(old.supporting_references)!==canonical(b.supportingReferences)||canonical((await sql.query('SELECT entity_id FROM finding_entities WHERE finding_id=$1 ORDER BY entity_id',[b.findingId])).rows.map(r=>r.entity_id))!==canonical([...new Set(b.affectedEntities)].sort())) fail(409,'Finding ID already belongs to another request');return{findingId:b.findingId};}
        await sql.query("INSERT INTO analytical_findings(finding_id,severity,explanation,status,supporting_references) VALUES($1,$2,$3,'open',$4)",[b.findingId,b.severity,b.explanation,JSON.stringify(b.supportingReferences)]);
        for(const entity of new Set(b.affectedEntities))await sql.query('INSERT INTO finding_entities VALUES($1,$2)',[b.findingId,entity]);
        await materializeFindings(sql);await audit(sql,actor.account_id,'finding.created',b.findingId);return{findingId:b.findingId};
      });
    });
    app.put<{Params:{id:string};Body:{revision:number;status:string}}>('/api/v4/findings/:id',async req=>{
      const actor=await registry(req);if(!validUuid(req.params.id)||!Number.isSafeInteger(req.body?.revision)||!['open','closed'].includes(req.body.status))fail(400,'Invalid finding update');
      await authorizeCatalogFinding(pool,actor.account_id,req.params.id);const mission=(await pool.query('SELECT calculation_id FROM mission_finding_evidence WHERE finding_id=$1',[req.params.id])).rows[0];if(mission)await missionAuthorization(pool,installation.installationId).calculation(actor.account_id,mission.calculation_id,'publish');
      return transaction(pool,async sql=>{if(!(await sql.query('UPDATE analytical_findings SET status=$1,revision=revision+1 WHERE finding_id=$2 AND revision=$3',[req.body.status,req.params.id,req.body.revision])).rowCount)fail(409,'Finding changed; refresh');await materializeFindings(sql);await audit(sql,actor.account_id,'finding.updated',req.params.id);return{saved:true};});
    });
    async function materializeFindings(sql:Sql, worker?:string) {
      const rows=(await sql.query(`SELECT f.*,e.entity_id,w.installation_id FROM analytical_findings f JOIN finding_entities e USING(finding_id) JOIN enrolled_workers w ON w.entity_id=e.entity_id WHERE ($1::uuid IS NULL OR w.installation_id=$1) AND NOT EXISTS(SELECT 1 FROM finding_deliveries d WHERE d.finding_id=f.finding_id AND d.installation_id=w.installation_id AND d.master_revision=f.revision)`,[worker??null])).rows;
      for(const f of rows){let catalog:Awaited<ReturnType<typeof verifyCatalogCalculation>>|null=null;const catalogRow=(await sql.query('SELECT c.* FROM catalog_finding_evidence e JOIN catalog_calculations c USING(calculation_id) WHERE e.finding_id=$1',[f.finding_id])).rows[0];if(catalogRow){try{catalog=await verifyCatalogCalculation(sql,catalogRow.account_id,catalogRow);if(!catalog.references.some(r=>r.installationId===f.installation_id&&r.entityId===f.entity_id))continue;}catch{continue;}}const mission=(await sql.query('SELECT c.input,c.source_references,c.result FROM mission_finding_evidence e JOIN mission_calculations c USING(calculation_id) WHERE e.finding_id=$1',[f.finding_id])).rows[0];if(mission&&!mission.source_references.some((r:any)=>r.installationId===f.installation_id))continue;const economic=mission?.result?.capabilityId===ECONOMIC_PLANNING;const scopes=economic?economicFindingScopes(mission.input,mission.source_references,f.installation_id,f.entity_id):mission?mission.input.releases.filter((r:any)=>r.sourceInstallationId===f.installation_id).map((r:any)=>({moduleId:r.sourceModuleId,programId:r.programId,financial:mission.input.evidenceKind!=='operational'})):[];if(mission&&!economic){if(!Array.isArray(mission.input.allocationEvidence)||!Array.isArray(mission.input.releaseEvidence))fail(409,'Complete retained mission source bindings are required');for(const pair of mission.input.allocationEvidence){const a=pair.allocation,ref=pair.reference;if(ref.installationId===f.installation_id){if(ref.entityId!==a.sourceEntityId||ref.installationId!==a.sourceInstallationId||ref.recordId!==a.allocationId||ref.streamId!=='mission_resources_v1'||ref.revision!==1)fail(409,'Mission allocation source binding mismatch');scopes.push({moduleId:ref.moduleId,programId:a.sourceProgramId,financial:true});}}}const event=dataEvent(installation,f.installation_id,'finding.issued',f.finding_id,f.revision,{findingId:f.finding_id,severity:f.severity,explanation:catalog?catalogFindingText(catalog,f.installation_id,f.entity_id):economic?economicWorkerFindingText(mission,f.installation_id,f.entity_id):f.explanation,status:f.status,affectedEntities:[f.entity_id],supportingReferences:workerFindingReferences(f.supporting_references,f.entity_id,f.installation_id,Boolean(mission||catalog)),...(catalog?{synthetic:catalogFindingSynthetic(catalog,f.installation_id,f.entity_id),catalogScopes:catalogFindingScopes(catalog,f.installation_id,f.entity_id)}:{}),...(mission?{missionScopes:scopes}: {})});
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
              if(e.streamId===MISSION_DISCLOSURE_STREAM)await acceptMissionDisclosure(sql,e,installation.installationId);
              const old=(await sql.query('SELECT revision,payload FROM analytical_records WHERE installation_id=$1 AND module_id=$2 AND stream_id=$3 AND record_id=$4',[p.installationId,e.moduleId,e.streamId,e.recordId])).rows[0];
              if(old&&Number(old.revision)===e.recordRevision&&canonical(old.payload)!==canonical(e.payload))fail(409,'Conflicting source revision');
              await sql.query(`INSERT INTO analytical_records VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT(installation_id,module_id,stream_id,record_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,event_id=excluded.event_id,source_at=excluded.source_at,ingested_at=now() WHERE analytical_records.revision<excluded.revision`,[worker.entity_id,p.installationId,e.moduleId,e.streamId,e.recordId,e.recordRevision,e.payload,e.eventId,e.occurredAt]);
              if(['commerce_orders','commerce_exceptions'].includes(e.streamId)){const current=(await sql.query('SELECT * FROM analytical_records WHERE installation_id=$1 AND module_id=$2 AND stream_id=$3 AND record_id=$4',[p.installationId,e.moduleId,e.streamId,e.recordId])).rows[0];await monitorCommerce(sql,current);}
            }else{
              if(e.moduleId!=='steward.findings'||!['acknowledged','resolved','dismissed'].includes(String(e.payload.status))||!(await sql.query('SELECT 1 FROM finding_entities WHERE finding_id=$1 AND entity_id=$2',[e.recordId,worker.entity_id])).rowCount||!(await sql.query('SELECT 1 FROM finding_deliveries WHERE finding_id=$1 AND installation_id=$2',[e.recordId,p.installationId])).rowCount)fail(403,'Finding does not affect this installation');
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
    async function localMissionFinding(actor:any,row:any){if(!row?.payload?.missionScopes)return;if(actor.role!=='local_admin'||!broker||!process.env.STEWARD_MODULES_FILE)fail(404,'Finding unavailable');const cfg=JSON.parse(await readFile(process.env.STEWARD_MODULES_FILE,'utf8')),trust=JSON.parse(await readFile(cfg.trustFile,'utf8'));const scopes=row.payload.missionScopes;if(!Array.isArray(scopes)||!scopes.length||scopes.length>44)fail(404,'Finding unavailable');for(const s of scopes){if(!validUuid(s.programId)||typeof s.moduleId!=='string'||typeof s.financial!=='boolean'||Object.keys(s).some(k=>!['moduleId','programId','financial','economic'].includes(k)))fail(404,'Finding unavailable');const r=(await pool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[s.moduleId])).rows[0];if(!r)fail(404,'Finding unavailable');const m=verifyPackage(r.descriptor,trust).manifest;if(s.economic!==undefined&&s.economic!==true||s.economic===true&&(!s.financial||!m.economicServices)||m.economicServices&&s.economic!==true)fail(404,'Finding unavailable');const path=(s.economic?'/economic-disclosure-authority':s.financial?'/financial-disclosure-authority':'/program-authority')+'?q='+encodeURIComponent(s.programId),op=operationFor(m,'GET',path);if(op?.operationId!==(s.economic?'economicDisclosureAuthority':s.financial?'financialDisclosureAuthority':'programAuthority'))fail(404,'Finding unavailable');const response=await broker('proxy',r.descriptor,r.configuration,{method:'GET',path,permissions:[...new Set(m.api.map(a=>a.permission))],actorId:actor.account_id});if(response.status!==200||response.value?.authorized!==true||response.value.programId!==s.programId)fail(404,'Finding unavailable');}}
    async function localCatalogFinding(actor:any,row:any){if(!row?.payload?.catalogScopes&&!row?.payload?.supportingReferences?.some((r:any)=>isIntelligenceStream(r?.streamId)))return;if(!process.env.STEWARD_MODULES_FILE)fail(404,'Catalog finding unavailable');const cfg=JSON.parse(await readFile(process.env.STEWARD_MODULES_FILE,'utf8')),trust=JSON.parse(await readFile(cfg.trustFile,'utf8'));await authorizeLocalCatalogFinding(pool,actor,row,installation.installationId,trust);}
    app.get('/api/v4/findings',async req=>{const actor=await auth.session(req);if(!['local_admin','module_user'].includes(actor.role))fail(403,'Local business account required');const findings=[];for(const row of(await pool.query('SELECT * FROM local_findings ORDER BY received_at DESC')).rows){try{await localMissionFinding(actor,row);await localCatalogFinding(actor,row);findings.push(row);}catch{}}return{findings};});
    app.put<{Params:{id:string};Body:{revision:number;status:string}}>('/api/v4/findings/:id',async req=>{
      const actor=await auth.session(req,true);if(!validUuid(req.params.id))fail(400,'Invalid finding identity');const finding=(await pool.query('SELECT * FROM local_findings WHERE finding_id=$1',[req.params.id])).rows[0];if(!finding?.payload?.catalogScopes&&actor.role!=='local_admin')fail(403,'Worker-local administrator required');const b=req.body;if(!validUuid(req.params.id)||!Number.isSafeInteger(b?.revision)||!['acknowledged','resolved','dismissed'].includes(b.status))fail(400,'Invalid finding status');
      await localMissionFinding(actor,finding);await localCatalogFinding(actor,finding);
      return transaction(pool,async sql=>{const row=(await sql.query("SELECT * FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];if(!row)fail(409,'Enrollment required');const changed=(await sql.query('UPDATE local_findings SET status=$1,revision=revision+1 WHERE finding_id=$2 AND revision=$3 RETURNING revision',[b.status,req.params.id,b.revision])).rows[0];if(!changed)fail(409,'Finding changed; refresh');const source={...installation,entity:{entityId:row.entity_id,displayName:row.entity_name}};await queue(sql,dataEvent(source,row.certificate.payload.issuer,'finding.status',req.params.id,changed.revision,{status:b.status}));await audit(sql,actor.account_id,'finding.local_status',req.params.id,{status:b.status});return{saved:true};});
    });
    const broker=process.env.STEWARD_MODULES_FILE?await createModuleBroker(process.env.STEWARD_MODULES_FILE,installation,key):undefined;
    let busy=false,closed=false;let followup:ReturnType<typeof setTimeout>|undefined;
    // Keep idle polling unchanged, but drain at most four acknowledged batches per
    // burst. Round-robin module selection and all existing delivery bounds remain.
    async function pump(remaining=3){if(busy||closed)return;busy=true;let delivered=false;let client:pg.PoolClient|undefined;let locked=false;let selected:any[]=[];let module:any;let moduleEvents:DataEvent[]=[];
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
        delivered=outgoing.length>0||receipt.events.length>0;
      }catch{
        if(client)await client.query("UPDATE sync_status SET attempts=attempts+1,error_code='DELIVERY_UNAVAILABLE',next_attempt_at=now()+least(30,power(2,least(attempts,5)))*interval '1 second' WHERE singleton").catch(()=>{});
        if(client&&selected.length)await client.query("UPDATE sync_outbox SET attempts=attempts+1,error_code='DELIVERY_UNAVAILABLE',next_attempt_at=now()+interval '2 seconds' WHERE event_id=ANY($1::uuid[]) AND acknowledged_at IS NULL",[selected.map(r=>r.envelope.eventId)]).catch(()=>{});
        if(module&&moduleEvents.length)await broker?.('outbox.complete',module.descriptor,module.configuration,{acknowledged:[],failed:moduleEvents.map(e=>e.eventId)}).catch(()=>{});
      }finally{if(client){if(locked)await client.query('SELECT pg_advisory_unlock(14444001)').catch(()=>{});client.release();}busy=false;if(delivered&&remaining>0&&!closed)followup=setTimeout(()=>void pump(remaining-1),50).unref();}
    }
    const timer=setInterval(()=>void pump(),2000).unref();void pump();app.addHook('onClose',async()=>{closed=true;clearInterval(timer);if(followup)clearTimeout(followup);});
  }
}
export interface SyncTransport { exchange(value: SyncExchange): Promise<SyncReceipt> }
