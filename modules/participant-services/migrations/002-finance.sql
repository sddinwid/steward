
CREATE TABLE mission_resource_allocations(id uuid PRIMARY KEY,revision integer NOT NULL DEFAULT 1 CHECK(revision=1),program_id uuid NOT NULL,authority_id uuid NOT NULL UNIQUE,transfer_id uuid UNIQUE,projection jsonb NOT NULL,private_ledger_id uuid NOT NULL UNIQUE REFERENCES business_records(id),reviewed_by uuid NOT NULL,reviewed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX mission_resource_program ON mission_resource_allocations(program_id);
CREATE FUNCTION mission_finance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'A sealed resource authority statement cannot be changed' USING ERRCODE='55000';END;$$;
CREATE TRIGGER mission_finance_immutable BEFORE UPDATE OR DELETE ON mission_resource_allocations FOR EACH ROW EXECUTE FUNCTION mission_finance_immutable();
