CREATE TABLE economic_peer_commands(source_module text NOT NULL,command_id uuid NOT NULL,scope_digest text NOT NULL,command_digest text NOT NULL,PRIMARY KEY(source_module,command_id));
