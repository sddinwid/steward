
CREATE TABLE mission_program_access(
 program_id uuid NOT NULL REFERENCES business_records(id), actor_id text NOT NULL,
 role text NOT NULL, permissions text[] NOT NULL, granted_by text NOT NULL,
 granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(program_id,actor_id)
);
CREATE TABLE mission_case_access(
 program_id uuid NOT NULL REFERENCES business_records(id), participant_ref text NOT NULL,
 actor_id text NOT NULL, granted_by text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
 PRIMARY KEY(program_id,participant_ref,actor_id),
 CHECK(participant_ref ~ '^(SYN-PART-|SYNREF-)[A-F0-9]{32}$')
);
CREATE TABLE mission_private_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id text,operation_id text NOT NULL,
 method text NOT NULL,path text NOT NULL,kind text,record_id uuid,record_ids uuid[],
 status_code integer NOT NULL,allowed boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mission_access_actor ON mission_program_access(actor_id,program_id) WHERE revoked_at IS NULL;
CREATE INDEX mission_case_actor ON mission_case_access(actor_id,program_id,participant_ref) WHERE revoked_at IS NULL;
CREATE INDEX mission_audit_actor_time ON mission_private_audit(actor_id,created_at DESC);
