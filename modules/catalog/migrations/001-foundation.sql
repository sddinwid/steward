
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

CREATE TABLE catalog_history(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,offering_id uuid NOT NULL,revision integer NOT NULL,owner_entity_id uuid NOT NULL,actor_id text NOT NULL,operation text NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(offering_id,revision));
CREATE FUNCTION catalog_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Catalog history is append only'; END $$;
CREATE TRIGGER catalog_history_no_update BEFORE UPDATE OR DELETE ON catalog_history FOR EACH ROW EXECUTE FUNCTION catalog_history_immutable();
CREATE UNIQUE INDEX catalog_variant_code ON business_records((data->>'offeringId'),(data->>'code')) WHERE kind='variant';
CREATE UNIQUE INDEX catalog_attribute_definition_key ON business_records((data->>'key')) WHERE kind='attribute-definition';
CREATE UNIQUE INDEX catalog_attribute_value ON business_records((data->>'offeringId'),coalesce(data->>'variantId',''),(data->>'definitionId')) WHERE kind='attribute';

CREATE UNIQUE INDEX catalog_bundle_component ON business_records((data->>'offeringId'),(data->>'componentOfferingId'),coalesce(data->>'componentVariantId','')) WHERE kind='bundle-component';
CREATE UNIQUE INDEX catalog_mapping_identity ON business_records((data->'mapping'->'provider'->>'workerInstallationId'),(data->'mapping'->'provider'->>'entityId'),(data->'mapping'->'provider'->>'moduleId'),(data->'mapping'->'provider'->>'moduleInstallationId'),(data->'mapping'->'provider'->>'packageDigest'),(data->'mapping'->>'externalProvider'),(data->'mapping'->>'accountId'),(data->'mapping'->>'productId'),coalesce(data->'mapping'->>'externalVariantId','')) WHERE kind='mapping' AND data->'mapping'->>'status'<>'inactive';
