CREATE TABLE inventory_items (
  item_id uuid PRIMARY KEY,
  sku text NOT NULL UNIQUE CHECK(length(sku) BETWEEN 1 AND 80),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  quantity numeric(18,3) NOT NULL CHECK(quantity >= 0 AND quantity <= 999999999999.999),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
