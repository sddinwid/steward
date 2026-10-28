// Append-only Phase 16 execution projection. Definitions remain module-owned.
export const workflowMigration=`
ALTER TABLE smart_executions ADD COLUMN graph_state jsonb;
CREATE TABLE smart_graph_reviews (
 review_id uuid PRIMARY KEY,
 execution_id uuid NOT NULL REFERENCES smart_executions,
 node_id text NOT NULL,
 actor_id uuid NOT NULL REFERENCES security_accounts,
 permission text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approve','reject','revoke')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 20 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX smart_graph_reviews_node ON smart_graph_reviews(execution_id,node_id,created_at,review_id);
CREATE FUNCTION smart_graph_review_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Workflow decisions are append only'; END $$;
CREATE TRIGGER smart_graph_review_no_change BEFORE UPDATE OR DELETE ON smart_graph_reviews
 FOR EACH ROW EXECUTE FUNCTION smart_graph_review_immutable();
`;
