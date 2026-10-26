-- Append-only invalidation evidence; old financial disclosures remain immutable.
CREATE TABLE economic_summary_revocations(id uuid PRIMARY KEY,revision integer NOT NULL DEFAULT 1 CHECK(revision=1),program_id uuid NOT NULL,projection jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER economic_summary_revocations_immutable BEFORE UPDATE OR DELETE ON economic_summary_revocations FOR EACH ROW EXECUTE FUNCTION economic_immutable();
CREATE FUNCTION economic_invalidate(p uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO economic_summary_revocations(id,program_id,projection)
 SELECT s.id,s.program_id,jsonb_build_object('contractVersion',1,'synthetic',true,'kind','economic-summary-revoked','summaryId',s.id,'programId',s.program_id,'sourceEntityId',s.projection->>'sourceEntityId','sourceInstallationId',s.projection->>'sourceInstallationId','sourceModuleId',s.projection->>'sourceModuleId','reason','source-state-changed','observedAt',clock_timestamp())
 FROM economic_summaries s WHERE s.program_id=p ON CONFLICT DO NOTHING;
END;$$;
CREATE FUNCTION economic_invalidate_record() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p uuid;BEGIN
 IF NEW.kind<>'economic-disclosure-request' THEN
  p:=CASE WHEN NEW.kind='program' THEN NEW.id ELSE (NEW.data->>'programId')::uuid END;
  IF p IS NOT NULL THEN PERFORM economic_invalidate(p);END IF;
 END IF;RETURN NEW;
END;$$;
CREATE TRIGGER economic_invalidate_record AFTER INSERT OR UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION economic_invalidate_record();
CREATE FUNCTION economic_invalidate_program_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN PERFORM economic_invalidate(OLD.program_id);RETURN OLD;
 ELSE PERFORM economic_invalidate(NEW.program_id);RETURN NEW;END IF;
END;$$;
CREATE TRIGGER economic_invalidate_hold AFTER INSERT OR UPDATE OR DELETE ON resource_holds FOR EACH ROW EXECUTE FUNCTION economic_invalidate_program_row();
