-- Monotonic authoritative read generation; never infer ordering from wall-clock timestamps.
CREATE SEQUENCE catalog_operational_generation;
CREATE UNIQUE INDEX catalog_one_active_inventory_link ON business_records ((data->>'offeringId'),(COALESCE(data->>'variantId',''))) WHERE kind='operational-link' AND data->>'purpose'='inventory' AND data->>'status'='active';
