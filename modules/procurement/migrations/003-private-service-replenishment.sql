-- Private requirements never enter commercial requisition/cost projections.
CREATE INDEX procurement_private_service_sources ON business_records((data->>'programId')) WHERE kind IN ('private-service-source','private-service-replenishment');
CREATE TABLE procurement_service_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id text,operation text NOT NULL,status_code integer NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now());
