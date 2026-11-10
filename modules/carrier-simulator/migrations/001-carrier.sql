
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


CREATE TABLE carrier_provider(registration_id uuid PRIMARY KEY REFERENCES business_records(id),events jsonb NOT NULL,failure text);
CREATE TABLE carrier_jobs(id uuid PRIMARY KEY,registration_id uuid NOT NULL REFERENCES business_records(id),generation integer NOT NULL,state text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,attempt_id uuid,lease_until timestamptz,next_at timestamptz NOT NULL);
CREATE UNIQUE INDEX carrier_one_active_job ON carrier_jobs(registration_id) WHERE state IN ('pending','running','retry');
CREATE TABLE carrier_attempts(id uuid PRIMARY KEY,registration_id uuid NOT NULL REFERENCES business_records(id),data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE carrier_observations(id uuid PRIMARY KEY,registration_id uuid NOT NULL REFERENCES business_records(id),digest text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(registration_id,digest));
CREATE TABLE carrier_receipts(attempt_id uuid REFERENCES carrier_attempts(id),observation_id uuid REFERENCES carrier_observations(id),PRIMARY KEY(attempt_id,observation_id));
