CREATE TABLE financial_journals(id uuid PRIMARY KEY,program_id uuid NOT NULL,transaction_id uuid NOT NULL,kind text NOT NULL,currency text NOT NULL CHECK(currency IN ('USD','EUR')),amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),classification text NOT NULL CHECK(classification IN ('external','intercompany','internal')),payload jsonb NOT NULL,UNIQUE(transaction_id,kind));
CREATE TRIGGER financial_journals_immutable BEFORE UPDATE OR DELETE ON financial_journals FOR EACH ROW EXECUTE FUNCTION economic_immutable();
ALTER TABLE budget_receipts ADD COLUMN receipt_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX budget_receipt_identity ON budget_receipts(receipt_id);
CREATE TABLE budget_commitment_cancellations(commitment_id uuid PRIMARY KEY REFERENCES budget_commitments(commitment_id),cancelled_at timestamptz NOT NULL DEFAULT now(),actor text NOT NULL);
CREATE TRIGGER budget_cancellation_immutable BEFORE UPDATE OR DELETE ON budget_commitment_cancellations FOR EACH ROW EXECUTE FUNCTION economic_immutable();
CREATE TABLE budget_expense_reversals(expense_id uuid PRIMARY KEY REFERENCES business_records(id),reversal_id uuid NOT NULL UNIQUE REFERENCES business_records(id),journal_id uuid NOT NULL REFERENCES financial_journals(id));
CREATE TRIGGER budget_reversal_immutable BEFORE UPDATE OR DELETE ON budget_expense_reversals FOR EACH ROW EXECUTE FUNCTION economic_immutable();
