
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

CREATE TABLE participant_audience_aliases(participant_ref text NOT NULL CHECK(participant_ref ~ '^SYN-PART-[A-F0-9]{32}$'),entity_id uuid NOT NULL,installation_id uuid NOT NULL,module_id text NOT NULL,alias text NOT NULL UNIQUE CHECK(alias ~ '^SYNREF-[A-F0-9]{32}$'),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(participant_ref,entity_id,installation_id,module_id));
CREATE TABLE participant_dispatch_authority(command_id uuid PRIMARY KEY REFERENCES integration_outbox(command_id),referral_id uuid NOT NULL REFERENCES business_records(id),actor_id uuid NOT NULL);
