-- Additive opt-in service operations; legacy Workforce rows remain intact.
CREATE TABLE workforce_mission_guard(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,enabled_by uuid,enabled_at timestamptz);
INSERT INTO workforce_mission_guard(singleton,enabled) VALUES(true,false);
CREATE TABLE workforce_service_reservations(enrollment_id uuid PRIMARY KEY REFERENCES business_records(id),training_program_id uuid NOT NULL REFERENCES business_records(id),participant_alias text NOT NULL CHECK(participant_alias ~ '^SYNREF-[A-F0-9]{32}$'),state text NOT NULL CHECK(state IN ('reserved','confirmed','participating','completed','cancelled')),created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX workforce_private_training_unique ON workforce_service_reservations(training_program_id,participant_alias) WHERE state<>'cancelled';
CREATE INDEX workforce_private_seats ON workforce_service_reservations(training_program_id) WHERE state<>'cancelled';
