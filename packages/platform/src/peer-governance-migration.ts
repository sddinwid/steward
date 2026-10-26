/** Append-only extension of the existing SSMA binding/obligation authority. */
export const peerGovernanceMigration = `
ALTER TABLE smart_bindings ADD COLUMN peer_installation_id uuid REFERENCES smart_peers(installation_id),
 ADD COLUMN peer_grant_id uuid REFERENCES smart_peer_grants(grant_id),
 ADD COLUMN source_program_id uuid, ADD COLUMN destination_program_id uuid,
 ADD COLUMN purpose text, ADD COLUMN expires_at timestamptz;
ALTER TABLE smart_bindings ADD CONSTRAINT smart_binding_program_scope CHECK (
 (source_program_id IS NULL AND destination_program_id IS NULL AND purpose IS NULL AND expires_at IS NULL AND peer_installation_id IS NULL AND peer_grant_id IS NULL)
 OR (source_program_id IS NOT NULL AND destination_program_id IS NOT NULL AND purpose IS NOT NULL AND expires_at IS NOT NULL
 AND ((peer_installation_id IS NULL AND peer_grant_id IS NULL) OR (peer_installation_id IS NOT NULL AND peer_grant_id IS NOT NULL))));
ALTER TABLE smart_bindings DROP CONSTRAINT smart_bindings_provider_id_fkey;
ALTER TABLE smart_bindings ADD COLUMN local_provider_id text GENERATED ALWAYS AS
 (CASE WHEN peer_installation_id IS NULL THEN provider_id ELSE NULL END) STORED REFERENCES module_installations(module_id);
ALTER TABLE smart_bindings ADD CONSTRAINT smart_binding_peer_package FOREIGN KEY
 (peer_installation_id,provider_id,provider_installation_id,package_digest)
 REFERENCES smart_peer_providers(peer_installation_id,module_id,provider_installation_id,package_digest);
DROP INDEX smart_one_binding;
CREATE UNIQUE INDEX smart_one_binding ON smart_bindings(consumer_id,capability_id,
 COALESCE(source_program_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE state='approved';
ALTER TABLE smart_workflows ADD COLUMN scope_program_id uuid;
ALTER TABLE smart_routes ADD COLUMN peer_installation_id uuid REFERENCES smart_peers(installation_id),
 ADD COLUMN peer_grant_id uuid REFERENCES smart_peer_grants(grant_id), ADD COLUMN original_envelope jsonb;
`;
