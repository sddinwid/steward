// Append-only Phase 8 governance. Module business data remains in module databases.
export const smartMigration = `
CREATE TABLE smart_providers (
 module_id text NOT NULL REFERENCES module_installations, capability_id text NOT NULL,
 package_digest text NOT NULL, installation_id uuid NOT NULL, entity_id uuid NOT NULL,
 descriptor jsonb NOT NULL, state text NOT NULL CHECK(state IN ('active','inactive','failed','unavailable')),
 configured boolean NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(module_id,capability_id)
);
CREATE TABLE smart_bindings (
 binding_id uuid PRIMARY KEY, consumer_id text NOT NULL REFERENCES module_installations,
 capability_id text NOT NULL, provider_id text NOT NULL REFERENCES module_installations,
 provider_installation_id uuid NOT NULL, package_digest text NOT NULL,
 requirement jsonb NOT NULL, capability jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES security_accounts, entity_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('approved','disabled','suspended')),
 revision integer NOT NULL DEFAULT 1, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX smart_one_binding ON smart_bindings(consumer_id,capability_id) WHERE state='approved';
CREATE TABLE smart_obligations (
 consumer_id text NOT NULL, aggregate_id uuid NOT NULL, capability_id text NOT NULL,
 binding_id uuid NOT NULL REFERENCES smart_bindings, provider_id text NOT NULL,
 package_digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(consumer_id,aggregate_id,capability_id)
);
CREATE TABLE smart_workflows (
 workflow_id uuid PRIMARY KEY, name text NOT NULL, version integer NOT NULL CHECK(version>0),
 consumer_id text NOT NULL REFERENCES module_installations, definition jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('proposed','approved','active','disabled','suspended')),
 actor_id uuid NOT NULL REFERENCES security_accounts, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(name,version)
);
CREATE TABLE smart_executions (
 execution_id uuid PRIMARY KEY, workflow_id uuid NOT NULL REFERENCES smart_workflows,
 actor_id uuid NOT NULL REFERENCES security_accounts, digest text NOT NULL, inputs jsonb NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','running','completed','suspended')),
 step integer NOT NULL DEFAULT 0, attempts integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE smart_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, execution_id uuid REFERENCES smart_executions,
 workflow_id uuid REFERENCES smart_workflows, actor_id uuid REFERENCES security_accounts,
 event text NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- Intentionally no foreign key: the non-repeatable issuance journal must commit
-- on a separate connection while its execution row is locked by the coordinator.
CREATE TABLE smart_attempts (
 command_id uuid PRIMARY KEY, execution_id uuid NOT NULL, step integer NOT NULL,
 state text NOT NULL CHECK(state IN ('issued','responded')), response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(execution_id,step)
);
CREATE TABLE smart_routes (
 command_id uuid PRIMARY KEY, digest text NOT NULL, consumer_id text NOT NULL,
 aggregate_id uuid NOT NULL, provider_id text NOT NULL, binding_id uuid NOT NULL REFERENCES smart_bindings,
 capability_id text NOT NULL, source_sequence bigint NOT NULL,
 envelope jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX smart_routes_order ON smart_routes(consumer_id,aggregate_id,capability_id,source_sequence);
`;
