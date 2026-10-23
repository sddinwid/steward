
CREATE TABLE IF NOT EXISTS business_records(id uuid PRIMARY KEY,kind text NOT NULL,key text NOT NULL,data jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,key));
CREATE INDEX IF NOT EXISTS business_records_kind ON business_records(kind,key);
CREATE TABLE IF NOT EXISTS business_requests(request_id uuid PRIMARY KEY,actor text NOT NULL,operation text NOT NULL,digest text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS business_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor text NOT NULL,operation text NOT NULL,record_id uuid,created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS integration_outbox(command_id uuid PRIMARY KEY,envelope jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','rejected')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE INDEX IF NOT EXISTS integration_outbox_due ON integration_outbox(next_attempt_at,created_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS integration_inbox(source_module text NOT NULL,command_id uuid NOT NULL,digest text NOT NULL,response jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_module,command_id));
CREATE TABLE IF NOT EXISTS integration_sequences(source_module text NOT NULL,aggregate_id uuid NOT NULL,sequence bigint NOT NULL,PRIMARY KEY(source_module,aggregate_id));
CREATE TABLE capacities(id uuid PRIMARY KEY,revision integer NOT NULL,name text NOT NULL,site text NOT NULL,capacity_m3 numeric NOT NULL,utilized_m3 numeric NOT NULL,available_m3 numeric NOT NULL,monthly_operating_cost numeric NOT NULL,currency text NOT NULL,ownership jsonb NOT NULL);
