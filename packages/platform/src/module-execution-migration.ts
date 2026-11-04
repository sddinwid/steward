export const moduleExecutionMigration=`
CREATE TABLE module_execution_plans (
 plan_id uuid PRIMARY KEY,
 module_id text NOT NULL REFERENCES module_installations(module_id),
 binding jsonb NOT NULL, target_descriptor jsonb NOT NULL, transition jsonb NOT NULL,
 configuration jsonb NOT NULL, assessment jsonb, governance_digest text,
 state text NOT NULL CHECK(state IN ('preparing','prepared','approved','installing','installed','activating','active','aborting','aborted','failed')),
 actor_id uuid NOT NULL REFERENCES security_accounts(account_id),
 approved_by uuid REFERENCES security_accounts(account_id),
 review_reason text, error_code text, prior_plan_id uuid REFERENCES module_execution_plans(plan_id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX module_execution_one_open ON module_execution_plans(module_id) WHERE state NOT IN ('active','aborted');
CREATE TABLE module_execution_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 plan_id uuid NOT NULL REFERENCES module_execution_plans(plan_id),
 actor_id uuid REFERENCES security_accounts(account_id),
 event text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
`;
