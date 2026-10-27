-- Provider reads are evidence, not synthetic local offering classifications.
CREATE SEQUENCE catalog_external_generation;
CREATE TABLE catalog_external_receipts(command_id uuid PRIMARY KEY,job_id uuid NOT NULL,operation text NOT NULL,provider jsonb NOT NULL,response jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION catalog_external_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'External Catalog evidence is append-only'; END $$;
CREATE TRIGGER external_receipt_immutable BEFORE UPDATE OR DELETE ON catalog_external_receipts FOR EACH ROW EXECUTE FUNCTION catalog_external_append_only();
CREATE FUNCTION catalog_external_observation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.kind='external-catalog-observation' OR OLD.kind='external-source-signal' THEN RAISE EXCEPTION 'External Catalog observations are immutable'; END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER external_observation_immutable BEFORE UPDATE OR DELETE ON business_records FOR EACH ROW EXECUTE FUNCTION catalog_external_observation_immutable();
CREATE TABLE catalog_external_reconciliations(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,observation_id uuid NOT NULL,offering_id uuid NOT NULL,actor_id text NOT NULL,decision jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER external_reconciliation_immutable BEFORE UPDATE OR DELETE ON catalog_external_reconciliations FOR EACH ROW EXECUTE FUNCTION catalog_external_append_only();
