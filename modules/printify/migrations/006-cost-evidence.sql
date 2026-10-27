-- Successful read-only production estimate provenance; original product/cost records remain authoritative.
CREATE SEQUENCE printify_cost_generation;
CREATE TABLE printify_cost_sync(connection_id text PRIMARY KEY REFERENCES external_catalog_origins(connection_id),generation bigint NOT NULL,snapshot_digest text NOT NULL,currency text,currency_confirmation_digest text,observed_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,unit_definition jsonb NOT NULL);
