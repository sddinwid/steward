export const analystMigration = `
CREATE TABLE analyst_investigations (
 investigation_id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES security_accounts(account_id),
 agent_id text NOT NULL, prompt text NOT NULL, provider text NOT NULL, test_model boolean NOT NULL,
 status text NOT NULL CHECK(status IN ('running','completed','failed','interrupted')),
 result jsonb, error_code text, finding_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE analyst_activity (
 activity_id bigserial PRIMARY KEY, investigation_id uuid NOT NULL REFERENCES analyst_investigations(investigation_id),
 kind text NOT NULL, tool text, source text NOT NULL, status text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analyst_owner ON analyst_investigations(owner_id,created_at);
`;
