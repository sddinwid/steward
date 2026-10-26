-- A confirmed absent original reservation is permanently fenced against late delivery.
CREATE TABLE resource_absence_fences(
 commitment_id uuid PRIMARY KEY, program_id uuid NOT NULL,
 consumer_installation_id uuid NOT NULL, consumer_program_id uuid NOT NULL,
 terms_digest text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER resource_absence_fences_immutable BEFORE UPDATE OR DELETE ON resource_absence_fences
 FOR EACH ROW EXECUTE FUNCTION economic_immutable();
