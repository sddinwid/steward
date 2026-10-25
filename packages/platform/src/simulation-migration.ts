// Append-only Phase 11 coordination metadata; operational records stay module-owned.
export const simulationMigration=`
CREATE TABLE simulation_origins(module_id text NOT NULL,aggregate_id uuid NOT NULL,origin jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(module_id,aggregate_id));
CREATE TABLE simulation_denials(command_id uuid NOT NULL,source_module text NOT NULL,target_module text NOT NULL,reason text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(command_id,target_module,reason));
`;
