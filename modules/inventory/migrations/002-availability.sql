ALTER TABLE inventory_items ADD COLUMN reserved_quantity numeric(18,3) NOT NULL DEFAULT 0 CHECK(reserved_quantity>=0 AND reserved_quantity<=quantity);
