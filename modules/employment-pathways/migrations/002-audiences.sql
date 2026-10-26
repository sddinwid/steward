CREATE TABLE employment_audience_aliases(
 source_entity_id uuid NOT NULL,source_installation_id uuid NOT NULL,source_module_id text NOT NULL,
 participant_alias text NOT NULL CHECK(participant_alias ~ '^SYNREF-[A-F0-9]{32}$'),
 destination_entity_id uuid NOT NULL,destination_installation_id uuid NOT NULL,destination_module_id text NOT NULL,
 alias text NOT NULL UNIQUE CHECK(alias ~ '^SYNREF-[A-F0-9]{32}$'),
 PRIMARY KEY(source_entity_id,source_installation_id,source_module_id,participant_alias,destination_entity_id,destination_installation_id,destination_module_id)
);
CREATE TABLE employment_dispatch_authority(
 command_id uuid PRIMARY KEY REFERENCES integration_outbox(command_id),command_digest text NOT NULL CHECK(command_digest ~ '^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL,program_id uuid NOT NULL REFERENCES business_records(id),case_id uuid REFERENCES business_records(id),
 permission text NOT NULL,audience jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
