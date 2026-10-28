CREATE TABLE pricing_analytical_publications(id uuid PRIMARY KEY,revision integer NOT NULL CHECK(revision>0),projection jsonb NOT NULL CHECK(octet_length(projection::text)<=8000));
CREATE TABLE pricing_analytical_evidence(id uuid PRIMARY KEY,revision integer NOT NULL CHECK(revision=1),projection jsonb NOT NULL CHECK(octet_length(projection::text)<=8000));
CREATE TRIGGER pricing_analytical_evidence_immutable BEFORE UPDATE OR DELETE ON pricing_analytical_evidence FOR EACH ROW EXECUTE FUNCTION pricing_immutable();
CREATE FUNCTION pricing_analytical_publication_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.revision<>OLD.revision+1 OR OLD.projection->>'status'<>'published' OR NEW.projection->>'status'<>'withdrawn' OR (NEW.projection - ARRAY['revision','status','withdrawnAt','withdrawalReason']) IS DISTINCT FROM (OLD.projection - ARRAY['revision','status','withdrawnAt','withdrawalReason']) THEN RAISE EXCEPTION 'Published analytical terms are immutable; only append withdrawal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER pricing_analytical_publications_guard BEFORE UPDATE OR DELETE ON pricing_analytical_publications FOR EACH ROW EXECUTE FUNCTION pricing_analytical_publication_guard();
CREATE FUNCTION pricing_analytical_draft_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.kind='analytical-publication' AND (TG_OP='DELETE' OR (NEW.data - ARRAY['status','publishedAt','reviewedBy','withdrawnAt','withdrawalReason']) IS DISTINCT FROM (OLD.data - ARRAY['status','publishedAt','reviewedBy','withdrawnAt','withdrawalReason']) OR OLD.data->>'status'='withdrawn' AND NEW.data->>'status'<>'withdrawn') THEN RAISE EXCEPTION 'Analytical review candidates are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER pricing_analytical_draft_terms BEFORE UPDATE OR DELETE ON business_records FOR EACH ROW EXECUTE FUNCTION pricing_analytical_draft_guard();

CREATE TABLE pricing_analytical_reviews(id uuid PRIMARY KEY,publication_id uuid NOT NULL,reviewer_id uuid NOT NULL,terms_digest text NOT NULL,reviewed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(publication_id,reviewer_id));
CREATE TRIGGER pricing_analytical_reviews_immutable BEFORE UPDATE OR DELETE ON pricing_analytical_reviews FOR EACH ROW EXECUTE FUNCTION pricing_immutable();
