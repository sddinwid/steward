-- Existing reservations retain their original authority and are never adopted
-- into a new exclusive allocation implicitly.
ALTER TABLE workforce_service_reservations ADD COLUMN allocation_id uuid REFERENCES business_records(id);
CREATE INDEX workforce_capacity_claims ON workforce_service_reservations(allocation_id) WHERE allocation_id IS NOT NULL;
