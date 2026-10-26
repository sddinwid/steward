-- A generic SSMA binding does not authorize audience substitution for an
-- existing property obligation. Retain the operator-selected destination and
-- actual human requester without adding actor fields to the shared command.
CREATE TABLE housing_dispatch_authority(
 command_id uuid PRIMARY KEY REFERENCES integration_outbox(command_id),
 command_digest text NOT NULL CHECK(command_digest ~ '^[a-f0-9]{64}$'),
 actor_id uuid NOT NULL,
 source_program_id uuid NOT NULL REFERENCES business_records(id),
 destination_program_id uuid NOT NULL,
 destination_installation_id uuid NOT NULL,
 destination_entity_id uuid NOT NULL,
 provider_module_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
