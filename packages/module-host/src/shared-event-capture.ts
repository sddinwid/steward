import type pg from 'pg';
import {canonical,digest,verifyPackage,validateCapabilityValue,type SignedModulePackage,type PublisherTrust} from '@steward/module-sdk';
import {boundReplicationEvents} from './replication.js';

/** Additive platform-owned delivery metadata, separate from authoritative module
 * tables and original signed migration bytes. Never changes Master ACK state. */
export const localEventCaptureSql=`
ALTER TABLE sync_outbox ADD COLUMN IF NOT EXISTS local_captured_at timestamptz;
CREATE INDEX IF NOT EXISTS sync_outbox_local_due ON sync_outbox(created_at,event_id) WHERE local_captured_at IS NULL;
`;
export interface SharedEventCapture {
  sourceCreatedAt:Date;eventId:string;envelope:Record<string,any>;digest:string;
  sourceModuleInstallationId:string;sourcePackageDigest:string;
}
export interface SharedEventCaptureScope {
  descriptor:SignedModulePackage;trust:PublisherTrust;
  installationId:string;entityId:string;moduleInstallationId:string;
  /** Only stream IDs from current governed subscriptions; no wildcard. */
  streamIds:string[];
  /** Governed activation cutoff; explicit replay is a separate operation. */
  from:Date;
}
/** Bridge the existing source outbox into authorized local subscriber receipts.
 * The callback MUST commit all authorized subscriber receipts idempotently before
 * returning. It revalidates the current subscriptions inside its transaction.
 * Source ACK happens afterward. A crash between commits replays identical events.
 * This function is not an authorization API or an independent event transport. */
export async function captureSharedEvents(pool:pg.Pool,scope:SharedEventCaptureScope,
  persistAuthorizedDelivery:(events:SharedEventCapture[])=>Promise<void>):Promise<number>{
  const manifest=verifyPackage(scope.descriptor,scope.trust).manifest;
  if(manifest.programServices||manifest.economicServices)throw Error('SCOPED_EVENT_DISCLOSURE_REQUIRED');
  if(!Array.isArray(scope.streamIds)||scope.streamIds.length<1||scope.streamIds.length>20
    ||new Set(scope.streamIds).size!==scope.streamIds.length||!Number.isFinite(scope.from.getTime()))throw Error('EVENT_CAPTURE_SCOPE_INVALID');
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  if(![scope.installationId,scope.entityId,scope.moduleInstallationId].every(v=>uuid.test(v)))throw Error('EVENT_CAPTURE_IDENTITY_INVALID');
  const schemas=new Map<string,Record<string,unknown>>();
  for(const streamId of scope.streamIds){
    const declared=manifest.smart?.provides.flatMap(c=>c.events).filter(e=>e.streamId===streamId)??[];
    if(declared.length!==1||!manifest.replication?.streams.some(s=>s.streamId===streamId))throw Error('SIGNED_EVENT_SCHEMA_REQUIRED');
    schemas.set(streamId,declared[0]!.schema);
  }
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const identity=(await client.query('SELECT installation_id,module_id FROM module_identity WHERE singleton')).rows[0];
    if(identity?.installation_id!==scope.installationId||identity?.module_id!==manifest.moduleId)throw Error('EVENT_CAPTURE_IDENTITY_INVALID');
    const rows=(await client.query("SELECT event_id,envelope,created_at FROM sync_outbox WHERE local_captured_at IS NULL AND created_at >= $1 AND envelope->>'streamId'=ANY($2::text[]) ORDER BY created_at,event_id FOR UPDATE SKIP LOCKED LIMIT 10",[scope.from,scope.streamIds])).rows;
    if(!rows.length){await client.query('COMMIT');return 0;}
    boundReplicationEvents(manifest,rows.map(r=>r.envelope),scope.installationId);
    const deliveries:SharedEventCapture[]=rows.map(row=>{
      const e=row.envelope;
      const allowed=['envelopeVersion','eventId','source','destinationInstallationId','sequence','occurredAt','eventType','payloadVersion','moduleId','streamId','recordId','recordRevision','payload','correlationId'];
      if(Object.keys(e).some(k=>!allowed.includes(k))||e.eventId!==row.event_id||!uuid.test(e.eventId)||!uuid.test(e.recordId)||e.source?.entity?.entityId!==scope.entityId
        ||e.source.role!=='worker'||Object.keys(e.source).some(k=>!['installationId','role','entity','configVersion'].includes(k))
        ||e.source.configVersion!==undefined&&e.source.configVersion!==1
        ||Object.keys(e.source.entity).some(k=>!['entityId','displayName'].includes(k))
        ||typeof e.source.entity.displayName!=='string'||e.source.entity.displayName.length<1||e.source.entity.displayName.length>200
        ||!uuid.test(e.destinationInstallationId)||e.correlationId!==undefined&&!uuid.test(e.correlationId)
        ||e.envelopeVersion!==1||e.payloadVersion!==1||e.sequence!==String(e.recordRevision)
        ||typeof e.occurredAt!=='string'||!Number.isFinite(Date.parse(e.occurredAt))
        ||Buffer.byteLength(canonical(e))>32768)throw Error('EVENT_CAPTURE_IDENTITY_INVALID');
      validateCapabilityValue(e.payload,schemas.get(e.streamId)!);
      return{sourceCreatedAt:row.created_at,eventId:e.eventId,envelope:e,digest:digest(canonical(e)),sourceModuleInstallationId:scope.moduleInstallationId,sourcePackageDigest:digest(canonical(scope.descriptor))};
    });
    await persistAuthorizedDelivery(deliveries);
    await client.query('UPDATE sync_outbox SET local_captured_at=now() WHERE event_id=ANY($1::uuid[])',[deliveries.map(e=>e.eventId)]);
    await client.query('COMMIT');return deliveries.length;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
