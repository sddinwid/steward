export const moduleMigration = `
ALTER TABLE security_accounts DROP CONSTRAINT security_accounts_role_check;
ALTER TABLE security_accounts ADD CONSTRAINT security_accounts_role_check CHECK(role IN ('registry_admin','enrollment_admin','viewer','local_admin','module_user'));
CREATE TABLE module_installations (
  module_id text PRIMARY KEY, version text NOT NULL, descriptor jsonb NOT NULL,
  configuration jsonb NOT NULL, state text NOT NULL CHECK(state IN ('installing','installed','active','disabled','failed')),
  operation_id uuid NOT NULL UNIQUE, error_code text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE module_permissions (
  account_id uuid NOT NULL REFERENCES security_accounts, module_id text NOT NULL REFERENCES module_installations,
  permission text NOT NULL, PRIMARY KEY(account_id,module_id,permission)
);
`;
