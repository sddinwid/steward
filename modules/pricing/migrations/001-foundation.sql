
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

CREATE TABLE pricing_rule_versions(rule_id uuid NOT NULL,revision integer NOT NULL,terms jsonb NOT NULL,terms_digest text NOT NULL,PRIMARY KEY(rule_id,revision));
CREATE TABLE pricing_approval_versions(id uuid PRIMARY KEY,approval jsonb NOT NULL);
CREATE TABLE pricing_history(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,record_id uuid NOT NULL,kind text NOT NULL,revision integer NOT NULL,owner_entity_id uuid NOT NULL,actor_id text NOT NULL,operation text NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(record_id,revision));
CREATE TABLE pricing_decisions(job_id uuid PRIMARY KEY,request jsonb NOT NULL,resolution jsonb NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE SEQUENCE pricing_catalog_generation;
CREATE FUNCTION pricing_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Pricing evidence is immutable'; END $$;
CREATE TRIGGER pricing_rule_versions_immutable BEFORE UPDATE OR DELETE ON pricing_rule_versions FOR EACH ROW EXECUTE FUNCTION pricing_immutable();
CREATE TRIGGER pricing_approval_versions_immutable BEFORE UPDATE OR DELETE ON pricing_approval_versions FOR EACH ROW EXECUTE FUNCTION pricing_immutable();
CREATE TRIGGER pricing_history_immutable BEFORE UPDATE OR DELETE ON pricing_history FOR EACH ROW EXECUTE FUNCTION pricing_immutable();
CREATE TRIGGER pricing_decisions_immutable BEFORE UPDATE OR DELETE ON pricing_decisions FOR EACH ROW EXECUTE FUNCTION pricing_immutable();
CREATE FUNCTION pricing_authoritative_terms_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.kind='review' OR OLD.kind='price-rule' AND (TG_OP='DELETE' OR NEW.data->'terms' IS DISTINCT FROM OLD.data->'terms' OR NEW.data->'termsDigest' IS DISTINCT FROM OLD.data->'termsDigest') THEN RAISE EXCEPTION 'Authoritative pricing terms and reviews are immutable'; END IF;
 IF OLD.kind='quote-job' AND OLD.data->>'status'='completed' AND (TG_OP='DELETE' OR NEW.data->'request' IS DISTINCT FROM OLD.data->'request' OR NEW.data->'resolution' IS DISTINCT FROM OLD.data->'resolution') THEN RAISE EXCEPTION 'Completed pricing decisions are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER pricing_authoritative_terms BEFORE UPDATE OR DELETE ON business_records FOR EACH ROW EXECUTE FUNCTION pricing_authoritative_terms_guard();
CREATE UNIQUE INDEX pricing_default_currency ON business_records((data->>'currency')) WHERE kind='default-price-list';
CREATE UNIQUE INDEX pricing_reviewer_terms ON business_records((data->'approval'->>'ruleId'),(data->'approval'->>'ruleRevision'),(data->'approval'->'reviewer'->>'accountId')) WHERE kind='review';

