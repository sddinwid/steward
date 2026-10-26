-- Commitment rows stay immutable; their append-only cancellation also invalidates old summaries.
CREATE FUNCTION economic_invalidate_budget_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE p uuid;BEGIN
 SELECT program_id INTO p FROM budget_commitments WHERE commitment_id=NEW.commitment_id;
 IF p IS NOT NULL THEN PERFORM economic_invalidate(p);END IF;RETURN NEW;
END;$$;
CREATE TRIGGER economic_invalidate_cancellation AFTER INSERT ON budget_commitment_cancellations FOR EACH ROW EXECUTE FUNCTION economic_invalidate_budget_cancellation();
