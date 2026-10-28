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

// Migration 22. Receipt lineage is additive; original migration 21 is unchanged.
export const sharedEventExecutionMigration=`
ALTER TABLE smart_executions ADD COLUMN event_subscription_id uuid;
ALTER TABLE smart_executions ADD COLUMN source_event_id uuid;
ALTER TABLE smart_executions ADD CONSTRAINT smart_execution_event_pair CHECK
 ((event_subscription_id IS NULL)=(source_event_id IS NULL));
ALTER TABLE smart_executions ADD CONSTRAINT smart_execution_event_receipt
 FOREIGN KEY(event_subscription_id,source_event_id)
 REFERENCES smart_event_deliveries(subscription_id,event_id);
CREATE UNIQUE INDEX smart_event_execution_once ON smart_executions(event_subscription_id,source_event_id)
 WHERE event_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX smart_event_delivery_execution ON smart_event_deliveries(execution_id)
 WHERE execution_id IS NOT NULL;
`;

// Migration 23: observable capture health and bounded polling, without modifying
// any original subscriber approval, source envelope or Master acknowledgment.
export const sharedEventCaptureHealthMigration=`
ALTER TABLE smart_event_subscriptions ADD COLUMN capture_error text;
ALTER TABLE smart_event_subscriptions ADD COLUMN capture_checked_at timestamptz;
ALTER TABLE smart_event_subscriptions ADD COLUMN capture_next_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE INDEX smart_event_subscription_due ON smart_event_subscriptions(capture_next_at) WHERE state='active';
`;

// Migration 24: retries of an operator replay intent cannot reset its budget twice.
export const sharedEventReplayMigration=`
CREATE UNIQUE INDEX smart_event_replay_request ON smart_event_history((detail->>'requestId'))
 WHERE action='replay_requested' AND detail ? 'requestId';
CREATE INDEX smart_event_history_receipt ON smart_event_history(subscription_id,event_id,id);
`;
