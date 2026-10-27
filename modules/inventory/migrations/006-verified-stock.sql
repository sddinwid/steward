-- Additive verified reservation evidence; original stock tables/contracts remain intact.
CREATE TABLE verified_stock_obligations(source_module text NOT NULL,order_id uuid NOT NULL,provider jsonb NOT NULL,consumer jsonb,definitions jsonb NOT NULL,request_digest text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_module,order_id));
CREATE FUNCTION verified_stock_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Original verified stock evidence is immutable'; END $$;
CREATE TRIGGER verified_stock_evidence_no_update BEFORE UPDATE OR DELETE ON verified_stock_obligations FOR EACH ROW EXECUTE FUNCTION verified_stock_evidence_immutable();
CREATE TABLE stock_unit_identity(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),unit_definition jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER stock_unit_identity_no_update BEFORE UPDATE OR DELETE ON stock_unit_identity FOR EACH ROW EXECUTE FUNCTION verified_stock_evidence_immutable();
