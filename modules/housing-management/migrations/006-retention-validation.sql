-- Preserve erroneous legacy synthetic milestone claims in a private immutable
-- validation ledger. Requested reservation dates never prove elapsed occupancy.
CREATE TABLE housing_followup_validation(
 followup_id uuid PRIMARY KEY,original_record jsonb NOT NULL,
 validation_status text NOT NULL CHECK(validation_status='legacy-invalid-historical-basis'),
 reason text NOT NULL,validated_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION housing_followup_validation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historical follow-up validation evidence is immutable' USING ERRCODE='55000';END;$$;
CREATE TRIGGER housing_followup_validation_immutable BEFORE UPDATE OR DELETE ON housing_followup_validation FOR EACH ROW EXECUTE FUNCTION housing_followup_validation_immutable();
INSERT INTO housing_followup_validation(followup_id,original_record,validation_status,reason)
SELECT f.id,to_jsonb(f),'legacy-invalid-historical-basis','Requested service dates did not establish actual elapsed occupancy; exclude this claim from retention until a new due observation is recorded.'
FROM business_records f LEFT JOIN business_records p ON p.kind='placement' AND p.id::text=f.data->>'placementId'
WHERE f.kind='followup' AND f.data->>'milestoneDays' IN ('30','90')
AND NOT COALESCE(
 CASE WHEN pg_input_is_valid(p.data->>'confirmedAt','timestamp with time zone') AND pg_input_is_valid(f.data->>'observedAt','timestamp with time zone')
 THEN (f.data->>'observedAt')::timestamptz >= (p.data->>'confirmedAt')::timestamptz + (f.data->>'milestoneDays')::integer*interval '1 day'
 ELSE false END,false);
UPDATE business_records f SET data=f.data||jsonb_build_object('verificationStatus',v.validation_status,'validationReason',v.reason,'validationPolicyVersion',1,'validatedAt',v.validated_at),revision=f.revision+1,updated_at=now()
FROM housing_followup_validation v WHERE f.id=v.followup_id;
