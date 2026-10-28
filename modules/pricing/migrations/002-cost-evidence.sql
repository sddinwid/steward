CREATE SEQUENCE pricing_cost_generation;
CREATE TABLE pricing_cost_receipts(command_id uuid PRIMARY KEY,input_id uuid NOT NULL,provider jsonb NOT NULL,response jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER pricing_cost_receipts_immutable BEFORE UPDATE OR DELETE ON pricing_cost_receipts FOR EACH ROW EXECUTE FUNCTION pricing_immutable();
CREATE FUNCTION pricing_cost_terms_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.kind IN ('cost-observation','cost-source-signal') THEN RAISE EXCEPTION 'Cost source observations are immutable'; END IF;
 IF OLD.kind='cost-input' AND (TG_OP='DELETE' OR NEW.data->'terms' IS DISTINCT FROM OLD.data->'terms' OR OLD.data->>'status'='inactive' AND NEW.data->>'status'<>'inactive' OR OLD.data->'observation' IS NOT NULL AND OLD.data->'observation'<>'null'::jsonb AND NEW.data->'observation' IS DISTINCT FROM OLD.data->'observation') THEN RAISE EXCEPTION 'Cost terms and activated evidence are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER pricing_cost_terms BEFORE UPDATE OR DELETE ON business_records FOR EACH ROW EXECUTE FUNCTION pricing_cost_terms_guard();
CREATE UNIQUE INDEX pricing_cost_category_current ON business_records((data->'terms'->>'modelId'),(data->'terms'->>'modelRevision'),(data->'terms'->>'category')) WHERE kind='cost-input' AND data->>'status' IN ('draft','pending','active') AND data->'terms'->>'kind'<>'discover';
