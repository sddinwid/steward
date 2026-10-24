CREATE TABLE connector_events(event_id text PRIMARY KEY,digest text NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE connector_issuance(request_key text PRIMARY KEY,digest text NOT NULL,state text NOT NULL CHECK(state IN ('issued','responded')),response jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
