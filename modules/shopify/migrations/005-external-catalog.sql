-- Successful read-only product synchronization provenance; existing observations remain unchanged.
CREATE SEQUENCE external_catalog_generation;
CREATE TABLE external_catalog_origins(connection_id text PRIMARY KEY,origin jsonb NOT NULL,origin_digest text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION external_catalog_origin_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'External catalog connection origin is immutable'; END $$;
CREATE TRIGGER external_catalog_origin_no_change BEFORE UPDATE OR DELETE ON external_catalog_origins FOR EACH ROW EXECUTE FUNCTION external_catalog_origin_immutable();
CREATE TABLE external_catalog_sync(connection_id text PRIMARY KEY REFERENCES external_catalog_origins(connection_id),generation bigint NOT NULL,snapshot_digest text NOT NULL,observed_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,lease_seconds integer NOT NULL CHECK(lease_seconds BETWEEN 10 AND 86400),product_ids jsonb NOT NULL,product_count integer NOT NULL CHECK(product_count>=0),status text NOT NULL CHECK(status IN ('available','unavailable')),error text);
