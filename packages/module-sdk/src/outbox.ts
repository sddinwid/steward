import type { ModulePackageManifest } from './index.js';
export const outboxSql = `CREATE TABLE IF NOT EXISTS sync_outbox(
 event_id uuid PRIMARY KEY, envelope jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), acknowledged_at timestamptz,
 error_code text, created_at timestamptz NOT NULL DEFAULT now());
 CREATE INDEX IF NOT EXISTS sync_outbox_due ON sync_outbox(next_attempt_at) WHERE acknowledged_at IS NULL;`;

/** Identifiers must pass validateManifest first. Capture runs in the record transaction. */
export function captureSql(manifest: ModulePackageManifest, source: unknown, destination: string): string {
  const literal = (v: unknown) => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
  return outboxSql + (manifest.replication?.streams ?? []).map(s => {
    const fn = 'sync_capture_' + s.table;
    const expression = (alias: string) => `jsonb_build_object('envelopeVersion',1,'eventId',gen_random_uuid(),'source',${literal(source)},'destinationInstallationId',${literal(destination)}#>>'{}','sequence',${alias}."${s.revisionColumn}"::text,'occurredAt',clock_timestamp(),'eventType','record.upsert','payloadVersion',1,'moduleId',${literal(manifest.moduleId)}#>>'{}','streamId','${s.streamId}','recordId',${alias}."${s.idColumn}"::text,'recordRevision',${alias}."${s.revisionColumn}",'payload',jsonb_build_object(${s.columns.map(c => `'${c}',${alias}."${c}"`).join(',')}))`;
    return `CREATE OR REPLACE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $capture$ DECLARE e jsonb; BEGIN e := ${expression('NEW')}; INSERT INTO sync_outbox(event_id,envelope) VALUES((e->>'eventId')::uuid,e); RETURN NEW; END $capture$;
      DROP TRIGGER IF EXISTS sync_capture ON "${s.table}";
      CREATE TRIGGER sync_capture AFTER INSERT OR UPDATE ON "${s.table}" FOR EACH ROW EXECUTE FUNCTION "${fn}"();
      INSERT INTO sync_outbox(event_id,envelope) SELECT (e->>'eventId')::uuid,e FROM (SELECT ${expression('t')} e FROM "${s.table}" t WHERE NOT EXISTS(SELECT 1 FROM sync_outbox o WHERE o.envelope->>'streamId'='${s.streamId}' AND o.envelope->>'recordId'=t."${s.idColumn}"::text AND (o.envelope->>'recordRevision')::bigint>=t."${s.revisionColumn}")) snapshots;`;
  }).join('\n');
}
