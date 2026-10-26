/** Append-only core migration 17. Operational cases remain module-owned. */
export const missionMigration=`
CREATE TABLE mission_disclosure_leases(
 grant_id uuid PRIMARY KEY,revision integer NOT NULL CHECK(revision>0),source_installation_id uuid NOT NULL,
 source_entity_id uuid NOT NULL,module_id text NOT NULL,program_id uuid NOT NULL,domain text NOT NULL,
 master_installation_id uuid NOT NULL,master_account_id uuid NOT NULL,expires_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('approved','revoked')),proof jsonb NOT NULL,
 master_approved_revision integer,master_approved_by uuid,master_approved_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_disclosure_actor ON mission_disclosure_leases(master_account_id,state,expires_at);
CREATE TABLE mission_scenarios(scenario_id uuid PRIMARY KEY,created_by uuid NOT NULL,request jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION mission_scenario_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'A reviewed mission scenario cannot be changed' USING ERRCODE='55000';END;$$;
CREATE TRIGGER mission_scenario_immutable BEFORE UPDATE OR DELETE ON mission_scenarios FOR EACH ROW EXECUTE FUNCTION mission_scenario_immutable();
CREATE TABLE mission_calculations(
 calculation_id uuid PRIMARY KEY,created_by uuid NOT NULL,request_digest text NOT NULL,
 source_references jsonb NOT NULL,input jsonb NOT NULL,result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),finding_id uuid UNIQUE
);
CREATE TABLE mission_finding_evidence(
 finding_id uuid PRIMARY KEY REFERENCES analytical_findings(finding_id),
 calculation_id uuid NOT NULL UNIQUE REFERENCES mission_calculations(calculation_id)
);
CREATE FUNCTION mission_calculation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR NEW.calculation_id<>OLD.calculation_id OR NEW.created_by<>OLD.created_by OR NEW.request_digest<>OLD.request_digest OR NEW.source_references<>OLD.source_references OR NEW.input<>OLD.input OR NEW.result<>OLD.result OR NEW.created_at<>OLD.created_at THEN RAISE EXCEPTION 'Mission calculation evidence is immutable' USING ERRCODE='55000'; END IF;
 IF OLD.finding_id IS NOT NULL AND NEW.finding_id IS DISTINCT FROM OLD.finding_id THEN RAISE EXCEPTION 'Mission finding evidence is immutable' USING ERRCODE='55000'; END IF;RETURN NEW;END;$$;
CREATE TRIGGER mission_calculation_immutable BEFORE UPDATE OR DELETE ON mission_calculations FOR EACH ROW EXECUTE FUNCTION mission_calculation_immutable();
`;
