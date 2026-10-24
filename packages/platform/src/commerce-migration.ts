export const commerceMigration=`
ALTER TABLE smart_routes ADD COLUMN workflow_id uuid REFERENCES smart_workflows;
ALTER TABLE smart_routes ADD COLUMN state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','delivered','rejected'));
ALTER TABLE smart_routes ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE smart_routes ADD COLUMN error_code text;
ALTER TABLE smart_routes ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE smart_obligations ADD COLUMN workflow_id uuid REFERENCES smart_workflows;
`;

export const commerceGovernanceMigration=`
ALTER TABLE smart_workflows ADD COLUMN accepting_new boolean NOT NULL DEFAULT true;
ALTER TABLE smart_bindings DROP CONSTRAINT smart_bindings_state_check;
ALTER TABLE smart_bindings ADD CONSTRAINT smart_bindings_state_check CHECK(state IN ('approved','disabled','suspended','retained'));
`;
