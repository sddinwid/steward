-- Append-only correction to 006: preserve source records and prior validation
-- snapshots, then exclude impossible chronology and mismatched subjects.
CREATE TABLE housing_followup_integrity(
 followup_id uuid PRIMARY KEY,original_record jsonb NOT NULL,
 reason text NOT NULL,validated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION housing_followup_integrity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical follow-up integrity evidence is immutable' USING ERRCODE='55000';END;$$;
CREATE TRIGGER housing_followup_integrity_immutable BEFORE UPDATE OR DELETE ON housing_followup_integrity FOR EACH ROW EXECUTE FUNCTION housing_followup_integrity_immutable();
INSERT INTO housing_followup_integrity(followup_id,original_record,reason)
SELECT f.id,to_jsonb(f),'The observation must match its original placement, programme and scoped alias, and be recorded after an actual elapsed observation; preserve it as unverified historical evidence.'
FROM business_records f LEFT JOIN business_records p ON p.kind='placement' AND p.id::text=f.data->>'placementId'
WHERE f.kind='followup' AND f.data->>'milestoneDays' IN ('30','90')
AND NOT COALESCE(CASE WHEN pg_input_is_valid(p.data->>'confirmedAt','timestamp with time zone')
 AND pg_input_is_valid(f.data->>'observedAt','timestamp with time zone') AND pg_input_is_valid(f.data->>'recordedAt','timestamp with time zone')
 THEN isfinite((p.data->>'confirmedAt')::timestamptz) AND isfinite((f.data->>'observedAt')::timestamptz) AND isfinite((f.data->>'recordedAt')::timestamptz)
 AND p.data->>'programId'=f.data->>'programId' AND p.data->>'participantAlias'=f.data->>'participantAlias'
 AND (f.data->>'observedAt')::timestamptz >= (p.data->>'confirmedAt')::timestamptz + (f.data->>'milestoneDays')::integer*interval '1 day'
 AND (f.data->>'recordedAt')::timestamptz >= (f.data->>'observedAt')::timestamptz
 AND (f.data->>'recordedAt')::timestamptz <= now() ELSE false END,false);
UPDATE business_records f SET data=f.data||jsonb_build_object('verificationStatus','legacy-invalid-historical-basis','validationReason',v.reason,'validationPolicyVersion',2,'validatedAt',v.validated_at),revision=f.revision+1,updated_at=now()
FROM housing_followup_integrity v WHERE f.id=v.followup_id;
