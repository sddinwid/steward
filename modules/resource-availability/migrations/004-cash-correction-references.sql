CREATE TABLE cash_adjustment_reversals(original_adjustment_id uuid PRIMARY KEY REFERENCES business_records(id),reversal_adjustment_id uuid NOT NULL UNIQUE REFERENCES business_records(id),journal_id uuid NOT NULL REFERENCES financial_journals(id));
CREATE TRIGGER cash_reversal_immutable BEFORE UPDATE OR DELETE ON cash_adjustment_reversals FOR EACH ROW EXECUTE FUNCTION economic_immutable();
