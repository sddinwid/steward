-- Preserve unsupported historical retention claims; do not rewrite source
-- observations, employment dates or earlier approved statements.
CREATE TABLE employment_retention_validation(
 observation_id uuid PRIMARY KEY,original_record jsonb NOT NULL,
 reason text NOT NULL,validated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION employment_retention_validation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical retention validation evidence is immutable' USING ERRCODE='55000';END;$$;
CREATE TRIGGER employment_retention_validation_immutable BEFORE UPDATE OR DELETE ON employment_retention_validation FOR EACH ROW EXECUTE FUNCTION employment_retention_validation_immutable();
INSERT INTO employment_retention_validation(observation_id,original_record,reason)
SELECT f.id,to_jsonb(f),'Actual human placement time and the original pathway subject must establish an elapsed observation before it was recorded; reported effective starts are not elapsed evidence.'
FROM business_records f LEFT JOIN business_records p ON p.kind='pathway' AND p.id::text=f.data->>'pathwayId'
WHERE f.kind='retention' AND f.data->>'milestoneDays' IN ('30','90')
AND NOT COALESCE(CASE WHEN pg_input_is_valid(p.data->>'employedAt','timestamp with time zone')
 AND pg_input_is_valid(f.data->>'observedAt','timestamp with time zone') AND pg_input_is_valid(f.data->>'recordedAt','timestamp with time zone')
 THEN isfinite((p.data->>'employedAt')::timestamptz) AND isfinite((f.data->>'observedAt')::timestamptz) AND isfinite((f.data->>'recordedAt')::timestamptz)
 AND p.data->>'programId'=f.data->>'programId' AND p.data->>'participantAlias'=f.data->>'participantAlias'
 AND (f.data->>'observedAt')::timestamptz >= (p.data->>'employedAt')::timestamptz + (f.data->>'milestoneDays')::integer*interval '1 day'
 AND (f.data->>'recordedAt')::timestamptz >= (f.data->>'observedAt')::timestamptz
 AND (f.data->>'recordedAt')::timestamptz <= now() ELSE false END,false);
UPDATE business_records f SET data=f.data||jsonb_build_object('verificationStatus','legacy-invalid-historical-basis','validationReason',v.reason,'validationPolicyVersion',1,'validatedAt',v.validated_at),revision=f.revision+1,updated_at=now()
FROM employment_retention_validation v WHERE f.id=v.observation_id;
