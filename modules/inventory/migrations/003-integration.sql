
CREATE TABLE IF NOT EXISTS integration_outbox(command_id uuid PRIMARY KEY,envelope jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','rejected')),attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_error text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE INDEX IF NOT EXISTS integration_outbox_due ON integration_outbox(next_attempt_at,created_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS integration_inbox(source_module text NOT NULL,command_id uuid NOT NULL,digest text NOT NULL,response jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_module,command_id));
CREATE TABLE IF NOT EXISTS integration_sequences(source_module text NOT NULL,aggregate_id uuid NOT NULL,sequence bigint NOT NULL,PRIMARY KEY(source_module,aggregate_id));
ALTER TABLE inventory_items ADD COLUMN min_stock integer NOT NULL DEFAULT 0 CHECK(min_stock>=0 AND min_stock<=100000000);
ALTER TABLE inventory_items ADD COLUMN replenishment_pending boolean NOT NULL DEFAULT false;
CREATE TABLE inventory_reservations(source_module text NOT NULL,order_id uuid NOT NULL,sku text NOT NULL REFERENCES inventory_items(sku),quantity numeric(18,3) NOT NULL CHECK(quantity>=0),PRIMARY KEY(source_module,order_id,sku));
CREATE TABLE inventory_movements(command_id uuid PRIMARY KEY,source_module text NOT NULL,source_reference text NOT NULL,movement text NOT NULL,lines jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(source_module,movement,source_reference));
