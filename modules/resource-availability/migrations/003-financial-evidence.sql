CREATE TABLE financial_journals(id uuid PRIMARY KEY,program_id uuid NOT NULL,transaction_id uuid NOT NULL,kind text NOT NULL,currency text NOT NULL CHECK(currency IN ('USD','EUR')),amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=1000000000000),classification text NOT NULL CHECK(classification IN ('external','intercompany','internal')),payload jsonb NOT NULL,UNIQUE(transaction_id,kind));
CREATE TRIGGER financial_journals_immutable BEFORE UPDATE OR DELETE ON financial_journals FOR EACH ROW EXECUTE FUNCTION economic_immutable();
ALTER TABLE resource_holds ADD COLUMN journal_id uuid REFERENCES financial_journals(id);
ALTER TABLE resource_holds DROP CONSTRAINT resource_holds_state_check;
ALTER TABLE resource_holds ADD CONSTRAINT resource_holds_state_check CHECK(state IN ('held','consumed','released','returned'));
