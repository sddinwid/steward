/** Draft design v1, not an installed module or a published SDK contract.
 * Strings require runtime UUID/UTC/length validation in the implementation.
 * No credentials, customer addresses, signature images or arbitrary URLs here.
 */
export type Mode = 'simulator' | 'sandbox' | 'live';
export type Status = 'announced' | 'in_transit' | 'out_for_delivery' |
  'delivered' | 'exception' | 'returning' | 'returned' | 'cancelled' | 'unknown';

export interface Scope {
  entityId: string;
  workerInstallationId: string;
  providerInstallationId: string;
  moduleId: string;
  authorityPackageDigest: string;
  connectionId: string;
  /** Opaque local identity, not a billing account number. */
  accountScopeId: string;
  mode: Mode;
}

export interface SourceReference {
  entityId: string;
  installationId: string;
  moduleId: string;
  streamId: string;
  recordId: string;
  revision: number;
}

export interface TrackingRegistration {
  contractVersion: 1;
  id: string;
  revision: number;
  scope: Scope;
  carrierId: string;
  shipmentId: string;
  packageId: string;
  trackingNumber: string;
  carrierShipmentId: string | null;
  shipDate: string | null;
  identityState: 'resolved' | 'ambiguous';
  registeredAt: string;
  source: SourceReference | null;
}

export interface CarrierTime {
  original: string | null;
  utc: string | null;
  timezone: string | null;
  precision: 'instant' | 'day' | 'unknown';
}

export interface EventObservation {
  id: string;
  registrationId: string;
  attemptId: string;
  providerEventId: string | null;
  receivedAt: string;
  occurredAt: CarrierTime;
  rawStatus: string | null;
  normalizedStatus: Status;
  mappingVersion: string;
  /** Hash of canonical, allowlisted fields, never credentials/raw payloads. */
  contentDigest: string;
  supersedesObservationId: string | null;
  correctionBasis: 'provider_revision' | 'documented_semantics' | null;
  exception: null | {
    code: string;
    safeDescription: string;
    businessActionability: 'yes' | 'no' | 'unknown';
  };
}

export interface SyncAttempt {
  id: string;
  registrationId: string;
  scope: Scope;
  configurationGeneration: number;
  executionPackageDigest: string;
  transport: 'rest' | 'upstream_mcp' | 'simulator';
  startedAt: string;
  completedAt: string | null;
  outcome: 'running' | 'success' | 'partial' | 'failed' | 'superseded';
  coverage: 'complete_response' | 'partial_response' | 'unknown';
  safeErrorCode: string | null;
  nextRetryAt: string | null;
  requestCount: number;
}

export interface ShipmentSummary {
  contractVersion: 1;
  registration: TrackingRegistration;
  revision: number;
  status: Status;
  statusEvidenceIds: string[];
  reconciliation: 'consistent' | 'ambiguous' | 'insufficient_evidence';
  lastAttemptId: string | null;
  lastSuccessfulSyncAt: string | null;
  freshUntil: string | null;
  coverage: SyncAttempt['coverage'];
  qualifications: string[];
  expectedPackages: number | null;
  estimatedDelivery: CarrierTime | null;
  actualDelivery: CarrierTime | null;
}

/** Module-owned services receive authenticated context, never caller-selected authority. */
export interface AuthorizedContext {
  scope: Scope;
  actorId: string;
  permissions: readonly string[];
}
export interface Page<T> { records: T[]; nextOffset: number | null }

/** Carrier implementation is injected into the shared synchronization service.
 * Token acquisition and allowlisted endpoints live in private injected dependencies.
 * This interface does NOT authorize a public API caller by itself.
 */
export interface CarrierTransport {
  verify(signal: AbortSignal): Promise<{
    mode: Mode;
    state: 'verified' | 'not_configured' | 'unavailable' | 'denied';
    checkedAt: string;
    safeErrorCode: string | null;
  }>;
  retrieve(registration: TrackingRegistration, signal: AbortSignal): Promise<{
    observations: EventObservation[];
    coverage: SyncAttempt['coverage'];
    qualifications: string[];
    providerContinuation: string | null;
  }>;
}

/** UI and MCP implement these from retained module data, with no network fallback. */
export interface CarrierReads {
  shipments(context: AuthorizedContext, offset: number, limit: number): Promise<Page<ShipmentSummary>>;
  events(context: AuthorizedContext, registrationId: string, offset: number,
    limit: number): Promise<Page<EventObservation>>;
}

export interface AcceptanceExample {
  id: string;
  given: string[];
  when: string[];
  expected: string[];
}
