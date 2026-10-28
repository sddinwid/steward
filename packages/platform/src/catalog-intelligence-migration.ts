/** Append-only platform migration 19. */
export const catalogIntelligenceMigration=`
CREATE TABLE catalog_calculations(
 calculation_id uuid PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES security_accounts(account_id),
 request_digest text NOT NULL,
 input jsonb NOT NULL,
 result jsonb NOT NULL,
 source_references jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE catalog_finding_evidence(
 finding_id uuid PRIMARY KEY REFERENCES analytical_findings(finding_id),
 calculation_id uuid NOT NULL REFERENCES catalog_calculations(calculation_id)
);
CREATE FUNCTION catalog_calculation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Catalog calculation evidence is immutable'; END $$;
CREATE TRIGGER catalog_calculations_immutable BEFORE UPDATE OR DELETE ON catalog_calculations FOR EACH ROW EXECUTE FUNCTION catalog_calculation_immutable();
CREATE TRIGGER catalog_finding_evidence_immutable BEFORE UPDATE OR DELETE ON catalog_finding_evidence FOR EACH ROW EXECUTE FUNCTION catalog_calculation_immutable();
`;
