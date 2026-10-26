-- Each read-only catalogue/authority observation may use a newly reviewed
-- consumer grant. Historical obligations and original provider pins stay intact.
ALTER TABLE housing_dispatch_authority ADD COLUMN record_id uuid REFERENCES business_records(id);
ALTER TABLE housing_dispatch_authority ADD COLUMN record_kind text;
ALTER TABLE housing_dispatch_authority ADD COLUMN read_aggregate_id uuid;
ALTER TABLE housing_dispatch_authority ADD COLUMN read_operation text;
ALTER TABLE housing_dispatch_authority ADD COLUMN observation_version integer NOT NULL DEFAULT 1 CHECK(observation_version IN (1,2));
UPDATE housing_dispatch_authority d SET record_id=(o.envelope->>'aggregateId')::uuid,
 record_kind=CASE o.envelope->'capability'->>'operation' WHEN 'catalog' THEN 'program' WHEN 'verify' THEN 'property-reference' END,
 read_aggregate_id=(o.envelope->>'aggregateId')::uuid,read_operation=o.envelope->'capability'->>'operation'
FROM integration_outbox o JOIN business_records b ON b.id::text=o.envelope->>'aggregateId'
WHERE o.command_id=d.command_id AND o.envelope->'capability'->>'capabilityId'='property.authority'
AND (o.envelope->'capability'->>'operation'='catalog' AND b.kind='program' OR o.envelope->'capability'->>'operation'='verify' AND b.kind='property-reference');
CREATE UNIQUE INDEX housing_authority_observation_id ON housing_dispatch_authority(read_aggregate_id) WHERE observation_version=2;
CREATE FUNCTION housing_dispatch_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'A property dispatch observation cannot be changed' USING ERRCODE='55000';END;$$;
CREATE TRIGGER housing_dispatch_immutable BEFORE UPDATE OR DELETE ON housing_dispatch_authority FOR EACH ROW EXECUTE FUNCTION housing_dispatch_immutable();
