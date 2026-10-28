// Additive shared-outbox subscriber metadata. Business records remain at source.
export const sharedEventMigration=`
CREATE TABLE smart_event_subscriptions (
 subscription_id uuid PRIMARY KEY,
 workflow_id uuid NOT NULL REFERENCES smart_workflows,
 binding_id uuid NOT NULL REFERENCES smart_bindings,
 binding_revision integer NOT NULL CHECK(binding_revision>0),
 source_module_installation_id uuid NOT NULL,
 source_package_digest text NOT NULL,
 consumer_installation_id uuid NOT NULL,
 consumer_package_digest text NOT NULL,
 event_name text NOT NULL,
 stream_id text NOT NULL,
 event_schema jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES security_accounts,
 state text NOT NULL CHECK(state IN ('active','suspended')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 20 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(workflow_id,binding_id,event_name)
);
CREATE TABLE smart_event_deliveries (
 subscription_id uuid NOT NULL REFERENCES smart_event_subscriptions,
 event_id uuid NOT NULL,
 digest text NOT NULL,
 source_module_installation_id uuid NOT NULL,
 source_package_digest text NOT NULL,
 record_id uuid NOT NULL,
 record_revision bigint NOT NULL CHECK(record_revision>0),
 envelope jsonb NOT NULL CHECK(pg_column_size(envelope)<=65536),
 state text NOT NULL CHECK(state IN ('pending','delivered','dead_letter','superseded')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 execution_id uuid REFERENCES smart_executions,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(subscription_id,event_id),
 UNIQUE(subscription_id,record_id,record_revision)
);
CREATE INDEX smart_event_delivery_due ON smart_event_deliveries(next_attempt_at,created_at)
 WHERE state='pending';
CREATE TABLE smart_event_cursors (
 subscription_id uuid NOT NULL REFERENCES smart_event_subscriptions,
 record_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision>0),
 PRIMARY KEY(subscription_id,record_id)
);
CREATE TABLE smart_event_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 subscription_id uuid NOT NULL REFERENCES smart_event_subscriptions,
 event_id uuid,
 actor_id uuid REFERENCES security_accounts,
 action text NOT NULL,
 detail jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION smart_event_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Event delivery history is append only'; END $$;
CREATE TRIGGER smart_event_history_no_change BEFORE UPDATE OR DELETE ON smart_event_history
 FOR EACH ROW EXECUTE FUNCTION smart_event_history_immutable();
`;
