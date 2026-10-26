-- Existing provider receipt bytes and referral identities remain unchanged.
-- A retained boolean alone is not new elapsed evidence after a policy upgrade.
CREATE TABLE participant_retention_policy_epoch(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled_at timestamptz NOT NULL DEFAULT now());
INSERT INTO participant_retention_policy_epoch(singleton) VALUES(true);
CREATE TABLE participant_retention_quarantine(referral_id uuid PRIMARY KEY,original_record jsonb NOT NULL,reason text NOT NULL,validated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO participant_retention_quarantine(referral_id,original_record,reason)
SELECT id,to_jsonb(b),'Legacy cached retention flags lack a fresh authoritative provider status under the corrected elapsed-time policy; preserve the receipt and request a new status observation.'
FROM business_records b WHERE kind='referral' AND (data->'providerStatus'->>'followUpMaintained'='true' OR data->'providerStatus'->>'retained'='true');
CREATE TABLE participant_retention_observations(
 command_id uuid PRIMARY KEY REFERENCES integration_outbox(command_id),referral_id uuid NOT NULL REFERENCES business_records(id),
 command_issued_at timestamptz NOT NULL,observed_at timestamptz NOT NULL DEFAULT now(),provider jsonb NOT NULL,receipt jsonb NOT NULL
);
CREATE FUNCTION participant_retention_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Participant retention provenance evidence is immutable' USING ERRCODE='55000';END;$$;
CREATE TRIGGER participant_retention_epoch_immutable BEFORE UPDATE OR DELETE ON participant_retention_policy_epoch FOR EACH ROW EXECUTE FUNCTION participant_retention_evidence_immutable();
CREATE TRIGGER participant_retention_quarantine_immutable BEFORE UPDATE OR DELETE ON participant_retention_quarantine FOR EACH ROW EXECUTE FUNCTION participant_retention_evidence_immutable();
CREATE TRIGGER participant_retention_observations_immutable BEFORE UPDATE OR DELETE ON participant_retention_observations FOR EACH ROW EXECUTE FUNCTION participant_retention_evidence_immutable();
