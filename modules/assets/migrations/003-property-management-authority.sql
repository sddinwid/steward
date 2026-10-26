-- Asset identity/ownership remains in the existing module-owned registry. These
-- rows record access review only; no participant or housing occupancy is copied.
CREATE INDEX asset_management_lookup ON business_records((data->>'assetId'),(data->>'managedEntityId'),(data->>'managedProgramId')) WHERE kind='management-authority';
CREATE TABLE asset_authority_access_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor text, operation_id text NOT NULL, record_id uuid,
 status_code integer NOT NULL, allowed boolean NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX asset_authority_audit_record ON asset_authority_access_audit(record_id,occurred_at);
