-- Bind cached sealed cost evidence to the original approved peer before inbox lookup.
CREATE TABLE mission_cost_peer_commands(source_module text NOT NULL,command_id uuid NOT NULL,scope_digest text NOT NULL,command_digest text NOT NULL,PRIMARY KEY(source_module,command_id));
