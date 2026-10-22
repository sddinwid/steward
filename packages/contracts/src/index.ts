/** Wire contracts v1. UUID values are validated at the configuration boundary. */
export type EntityId = string & { readonly __entityId: unique symbol };
export type InstallationId = string & { readonly __installationId: unique symbol };
export type StewardRole = 'master' | 'worker';
export interface EntityIdentity { entityId: EntityId; displayName: string }
export interface InstallationIdentity {
  installationId: InstallationId;
  role: StewardRole;
  entity: EntityIdentity;
}
export interface InstallationConfig extends InstallationIdentity { configVersion: 1 }
export interface ModuleCapability {
  name: string;
  contractVersion: number;
}
export interface ModuleManifest {
  moduleId: string;
  version: string;
  compatibleCore: string;
  capabilities: readonly ModuleCapability[];
}
/** Future wire format only; no outbox, transport, delivery, or acknowledgment exists in Phase 1. */
export interface SynchronizationEnvelope<T = unknown> {
  envelopeVersion: 1;
  eventId: string;
  source: InstallationIdentity;
  destinationInstallationId: InstallationId;
  sequence: string;
  occurredAt: string;
  eventType: string;
  payloadVersion: number;
  correlationId?: string;
  payload: T;
}
export interface PlatformOverview {
  release: string;
  administrationOrigin?: string;
  installation: InstallationConfig;
  modules: readonly ModuleManifest[];
  extensions: Record<'enrollment' | 'mcp' | 'analytics' | 'synchronization', 'not_implemented' | 'available'>;
}
/** Reserved adapters. These contracts do not register routes or imply working integrations. */
export interface EnrollmentProvider {
  authenticateEnrollment(proof: unknown): Promise<InstallationIdentity>;
}
export interface McpServerAdapter { start(): Promise<void>; stop(): Promise<void> }
export interface AnalyticalService { analyze(request: unknown, signal: AbortSignal): Promise<unknown> }
export interface DurableEventTransport {
  publish(envelope: SynchronizationEnvelope): Promise<void>;
  acknowledge(eventId: string): Promise<void>;
}
/** Phase 2 authorization assertion. Versioned for future offline grant transport;
 * no offline workflow is implemented. Every grant is bound to a Worker key. */
export interface EnrollmentGrant {
  version: 1;
  kind: 'enrollment-grant';
  issuer: string;
  audience: string;
  entityId: string;
  keyThumbprint: string;
  requestId: string;
  grantId: string;
  notBefore: number;
  expiresAt: number;
  capabilities: ['worker.enroll'];
}
export interface SignedAssertion<T> { payload: T; signature: string }
export interface EnrollmentCertificate {
  version: 1;
  kind: 'worker-enrollment';
  issuer: string;
  installationId: string;
  entityId: string;
  keyThumbprint: string;
  requestId: string;
  serial: string;
  issuedAt: number;
}
export interface LegalEntity { entityId: string; name: string; classification: string; enrollmentEligible: boolean }
export type EnrollmentState = 'unenrolled' | 'pending' | 'enrolled' | 'rejected' | 'expired';
