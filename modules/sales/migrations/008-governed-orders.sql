-- Durable read/confirmation workflows remain in the Sales database. Immutable
-- intents retain original actors and pins; current membership is never stored.
CREATE SEQUENCE sales_catalog_generation;
CREATE TABLE sales_confirmation_intents(id uuid PRIMARY KEY,draft_id uuid NOT NULL,terms jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER sales_confirmation_intent_immutable BEFORE UPDATE OR DELETE ON sales_confirmation_intents FOR EACH ROW EXECUTE FUNCTION sales_price_append_only();
