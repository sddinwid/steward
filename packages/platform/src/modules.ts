import type { InstallationIdentity, ModuleManifest } from '@steward/contracts';
import type { FastifyInstance } from 'fastify';

/** Future modules ship outside core and receive an explicit local context.
 * No module discovery, loading, installation, or execution is implemented in Phase 1. */
export interface PlatformModule {
  manifest: ModuleManifest;
  register(context: { installation: InstallationIdentity; routes: FastifyInstance }): Promise<void>;
  stop(): Promise<void>;
}
