import { outboxSql } from '@steward/module-sdk';
export const syncMigration = outboxSql + `
CREATE TABLE sync_inbox(event_id uuid PRIMARY KEY,source_installation uuid NOT NULL,digest text NOT NULL,envelope jsonb NOT NULL,ingested_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sync_nonces(installation_id uuid NOT NULL,nonce uuid NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(installation_id,nonce));
CREATE TABLE sync_status(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_attempt_at timestamptz,last_success_at timestamptz,error_code text);
INSERT INTO sync_status(singleton) VALUES(true);
CREATE TABLE sync_peers(installation_id uuid PRIMARY KEY,entity_id uuid NOT NULL,last_contact_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE analytical_records(entity_id uuid NOT NULL REFERENCES legal_entities,installation_id uuid NOT NULL,module_id text NOT NULL,stream_id text NOT NULL,record_id text NOT NULL,revision bigint NOT NULL,payload jsonb NOT NULL,event_id uuid NOT NULL,source_at timestamptz NOT NULL,ingested_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(installation_id,module_id,stream_id,record_id));
CREATE TABLE entity_relationships(relationship_id uuid PRIMARY KEY,from_entity uuid NOT NULL REFERENCES legal_entities,to_entity uuid NOT NULL REFERENCES legal_entities,kind text NOT NULL,description text NOT NULL,UNIQUE(from_entity,to_entity,kind),CHECK(from_entity<>to_entity));
CREATE TABLE analytical_findings(finding_id uuid PRIMARY KEY,revision integer NOT NULL DEFAULT 1,severity text NOT NULL CHECK(severity IN ('info','warning','critical')),explanation text NOT NULL,status text NOT NULL CHECK(status IN ('open','closed')),supporting_references jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE finding_entities(finding_id uuid NOT NULL REFERENCES analytical_findings,entity_id uuid NOT NULL REFERENCES legal_entities,PRIMARY KEY(finding_id,entity_id));
CREATE TABLE finding_deliveries(finding_id uuid NOT NULL REFERENCES analytical_findings,installation_id uuid NOT NULL,master_revision integer NOT NULL,event_id uuid NOT NULL,PRIMARY KEY(finding_id,installation_id,master_revision));
CREATE TABLE finding_receipts(finding_id uuid NOT NULL REFERENCES analytical_findings,installation_id uuid NOT NULL,entity_id uuid NOT NULL,status text NOT NULL,revision integer NOT NULL,event_id uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(finding_id,installation_id));
CREATE TABLE local_findings(finding_id uuid PRIMARY KEY,master_revision integer NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','acknowledged','resolved','dismissed')),revision integer NOT NULL DEFAULT 0,received_at timestamptz NOT NULL DEFAULT now());
`;
export const syncReliabilityMigration = `ALTER TABLE sync_inbox ADD COLUMN acknowledged_to_source boolean NOT NULL DEFAULT false;
CREATE TABLE sync_module_progress(module_id text PRIMARY KEY,last_poll timestamptz NOT NULL);`;
