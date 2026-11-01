CREATE TABLE shopify_monitor_receipts(command_id uuid PRIMARY KEY, response_digest text NOT NULL, received_at timestamptz NOT NULL DEFAULT now());
