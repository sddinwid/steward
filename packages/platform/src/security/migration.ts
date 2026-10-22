export const securityMigration = `
CREATE TABLE security_accounts (
  account_id uuid PRIMARY KEY, username text NOT NULL UNIQUE, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('registry_admin','enrollment_admin','viewer','local_admin')),
  enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE legal_entities (
  entity_id uuid PRIMARY KEY, name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  classification text NOT NULL CHECK (length(classification) BETWEEN 1 AND 80),
  enrollment_eligible boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE entity_authorizations (
  account_id uuid NOT NULL REFERENCES security_accounts, entity_id uuid NOT NULL REFERENCES legal_entities,
  PRIMARY KEY(account_id,entity_id)
);
CREATE TABLE security_sessions (
  token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES security_accounts,
  csrf_hash text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE security_rate_limits (bucket text PRIMARY KEY, hits integer NOT NULL, reset_at timestamptz NOT NULL);
CREATE TABLE security_audit (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES security_accounts, action text NOT NULL, target_id text,
  detail jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE worker_candidates (
  installation_id uuid PRIMARY KEY, public_key text NOT NULL UNIQUE, key_thumbprint text NOT NULL UNIQUE
);
CREATE TABLE enrollment_requests (
  request_id uuid PRIMARY KEY, installation_id uuid NOT NULL REFERENCES worker_candidates,
  user_code text NOT NULL UNIQUE, status text NOT NULL CHECK (status IN ('authorizing','pending','approved','rejected','enrolled','expired')),
  entity_id uuid REFERENCES legal_entities, requested_by uuid REFERENCES security_accounts,
  decided_by uuid REFERENCES security_accounts, expires_at timestamptz NOT NULL,
  authorization_grant jsonb, certificate jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX enrollment_active_installation ON enrollment_requests(installation_id)
  WHERE status IN ('authorizing','pending','approved','enrolled');
CREATE TABLE enrollment_nonces (
  installation_id uuid NOT NULL, nonce uuid NOT NULL, expires_at timestamptz NOT NULL,
  PRIMARY KEY(installation_id,nonce)
);
CREATE TABLE enrolled_workers (
  installation_id uuid PRIMARY KEY REFERENCES worker_candidates, entity_id uuid NOT NULL REFERENCES legal_entities,
  key_thumbprint text NOT NULL UNIQUE, request_id uuid NOT NULL UNIQUE REFERENCES enrollment_requests,
  certificate jsonb NOT NULL, enrolled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE local_enrollment (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), profile_id text NOT NULL,
  request_id uuid, state text NOT NULL CHECK(state IN ('unenrolled','pending','enrolled','rejected','expired')),
  user_code text, entity_id uuid, entity_name text, certificate jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;
