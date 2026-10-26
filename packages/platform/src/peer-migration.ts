// Appended by database.ts after earlier platform migrations. No module case data
// is projected to Master: these are private, Worker-local delivery ledgers.
export const peerRegistryMigration=`
CREATE TABLE smart_peers(
 installation_id uuid PRIMARY KEY, entity_id uuid NOT NULL, profile jsonb NOT NULL,
 pins jsonb NOT NULL, verified_at bigint NOT NULL, imported_by uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('approved','revoked')), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE smart_peer_providers(
 peer_installation_id uuid NOT NULL REFERENCES smart_peers(installation_id), module_id text NOT NULL,
 provider_installation_id uuid NOT NULL, package_digest text NOT NULL, descriptor jsonb NOT NULL,
 state text NOT NULL, configured_capabilities jsonb NOT NULL,
 PRIMARY KEY(peer_installation_id,module_id,provider_installation_id,package_digest));
CREATE TABLE smart_peer_grants(
 grant_id uuid PRIMARY KEY, signed_grant jsonb NOT NULL, grant_digest text NOT NULL,
 local_side text NOT NULL CHECK(local_side IN ('source','destination')), local_actor_id uuid NOT NULL,
 peer_installation_id uuid NOT NULL REFERENCES smart_peers(installation_id),
 state text NOT NULL CHECK(state IN ('approved','revoked')), approved_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE smart_peer_nonces(source_installation_id uuid NOT NULL,nonce uuid NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(source_installation_id,nonce));
CREATE INDEX smart_peer_nonce_expiry ON smart_peer_nonces(expires_at);
CREATE TABLE smart_peer_deliveries(
 command_id uuid PRIMARY KEY, grant_id uuid NOT NULL REFERENCES smart_peer_grants(grant_id),
 binding_id uuid NOT NULL, workflow_id uuid, actor_id uuid NOT NULL,
 original_command jsonb NOT NULL, wire_command jsonb NOT NULL, routed_digest text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','delivering','ack_pending','delivered','rejected')),
 attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz,
 result jsonb, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX smart_peer_delivery_due ON smart_peer_deliveries(state,next_attempt_at);
CREATE TABLE smart_peer_inbox(
 source_installation_id uuid NOT NULL, command_id uuid NOT NULL, grant_id uuid NOT NULL REFERENCES smart_peer_grants(grant_id),
 delivery_digest text NOT NULL, state text NOT NULL CHECK(state IN ('pending','delivered','rejected')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_installation_id,command_id));
`;
