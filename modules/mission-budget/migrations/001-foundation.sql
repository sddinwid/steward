
CREATE TABLE IF NOT EXISTS business_records(id uuid PRIMARY KEY,kind text NOT NULL,key text NOT NULL,data jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,key));
CREATE INDEX IF NOT EXISTS business_records_kind ON business_records(kind,key);
CREATE TABLE IF NOT EXISTS business_requests(request_id uuid PRIMARY KEY,actor text NOT NULL,operation text NOT NULL,digest text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS business_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor text NOT NULL,operation text NOT NULL,record_id uuid,created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS integration_outbox(command_id uuid PRIMARY KEY,envelope jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','rejected')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE INDEX IF NOT EXISTS integration_outbox_due ON integration_outbox(next_attempt_at,created_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS integration_inbox(source_module text NOT NULL,command_id uuid NOT NULL,digest text NOT NULL,response jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_module,command_id));
CREATE TABLE IF NOT EXISTS integration_sequences(source_module text NOT NULL,aggregate_id uuid NOT NULL,sequence bigint NOT NULL,PRIMARY KEY(source_module,aggregate_id));

ALTER TABLE integration_inbox ADD COLUMN IF NOT EXISTS simulation jsonb;
ALTER TABLE business_requests ADD COLUMN IF NOT EXISTS simulation jsonb;
CREATE TABLE IF NOT EXISTS simulation_dataset_epochs(dataset_id uuid PRIMARY KEY,run_id uuid NOT NULL,state text NOT NULL CHECK(state IN ('active','closed')),updated_at timestamptz NOT NULL DEFAULT now());


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


CREATE TABLE economic_events(id uuid PRIMARY KEY,sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,program_id uuid NOT NULL,record_id uuid NOT NULL,actor text NOT NULL,kind text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),payload jsonb NOT NULL,previous_digest text,event_digest text NOT NULL UNIQUE);
CREATE FUNCTION economic_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable economic evidence; append a referenced correction' USING ERRCODE='55000';END;$$;
CREATE TRIGGER economic_events_immutable BEFORE UPDATE OR DELETE ON economic_events FOR EACH ROW EXECUTE FUNCTION economic_immutable();
CREATE TABLE economic_summaries(id uuid PRIMARY KEY,revision integer NOT NULL DEFAULT 1 CHECK(revision=1),program_id uuid NOT NULL,projection jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER economic_summaries_immutable BEFORE UPDATE OR DELETE ON economic_summaries FOR EACH ROW EXECUTE FUNCTION economic_immutable();
CREATE TABLE economic_dispatch(command_id uuid PRIMARY KEY,command_digest text NOT NULL,actor_id text NOT NULL,program_id uuid NOT NULL,permission text NOT NULL,audience jsonb NOT NULL);

CREATE TABLE budget_commitments(commitment_id uuid PRIMARY KEY,program_id uuid NOT NULL,funding_request_id uuid NOT NULL,series_id uuid NOT NULL,category text NOT NULL,currency text NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),source_entity_id uuid NOT NULL,terms_digest text NOT NULL);
CREATE TRIGGER budget_commitments_immutable BEFORE UPDATE OR DELETE ON budget_commitments FOR EACH ROW EXECUTE FUNCTION economic_immutable();
CREATE TABLE budget_receipts(commitment_id uuid PRIMARY KEY REFERENCES budget_commitments(commitment_id),settlement_id uuid NOT NULL UNIQUE,program_id uuid NOT NULL,series_id uuid NOT NULL,category text NOT NULL,currency text NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),terms_digest text NOT NULL,received_at timestamptz NOT NULL);
CREATE TRIGGER budget_receipts_immutable BEFORE UPDATE OR DELETE ON budget_receipts FOR EACH ROW EXECUTE FUNCTION economic_immutable();
