export type SourceKind = "openapi" | "html" | "markdown";
export interface SourceDescriptor {
  version: 1;
  id: string;
  kind: SourceKind;
  fingerprint: string;
  specificationVersion?: string;
  diagnostics: string[];
  references?: { id: string; fingerprint: string }[];
}
export interface OperationCandidate {
  id: string;
  method: string;
  path: string;
  status: "review_required";
  parameters: string[];
  diagnostics: string[];
  sourceId: string;
}
export interface RequestRule {
  id: string;
  url: string;
  method: "GET" | "HEAD";
  kind: SourceKind | "api";
  basis: string;
  query: Record<string, string[]>;
  paginationParameter?: string;
  credential?: { kind: "env" | "file"; reference: string; origin: string };
}
export interface ExplorationPolicy {
  version: 1;
  requests: RequestRule[];
  documentation: { origin: string; pathPrefix: string; basis: string }[];
  budgets: {
    requests: number;
    pages: number;
    depth: number;
    requestMs: number;
    overallMs: number;
    responseBytes: number;
    totalBytes: number;
    intervalMs: number;
    concurrency: 1;
  };
  retentionDays: number;
  samples: "none";
}
export interface EvidenceRecord {
  version: 1;
  id: string;
  sourceId: string;
  retrievedAt: string;
  url: string;
  urlFingerprint: string;
  fingerprint?: string;
  status?: number;
  contentType?: string;
  rateLimit?: { remaining?: number; retryAfterSeconds?: number };
  qualification: "observed" | "documented" | "unverified";
  outcome: string;
  structure?: unknown;
  diagnostics: string[];
  operations?: OperationCandidate[];
  links?: string[];
}
export interface QueueItem {
  ruleId: string;
  url: string;
  depth: number;
  page: number;
  relation: "seed" | "documentation" | "pagination" | "reference";
}
export interface ExplorationJob {
  version: 1;
  planDigest: string;
  startedAt: number;
  requests: number;
  bytes: number;
  nextAt: number;
  queue: QueueItem[];
  seen: string[];
  evidence: EvidenceRecord[];
  state: "ready" | "running" | "paused" | "complete" | "stopped";
  stopReason?: string;
  inFlight?: QueueItem;
}
export interface AdapterDraft {
  version: 1;
  status: "unsigned-uninstalled-draft";
  moduleId: string;
  sourceIds: string[];
  operations: string[];
  gaps: string[];
}
/** Future interpretation is advisory data only; it cannot approve or execute requests. */
export interface InterpretationProvider {
  propose(
    evidence: readonly EvidenceRecord[],
  ): Promise<{ suggestions: string[]; evidenceIds: string[] }>;
}
export const defaults: ExplorationPolicy["budgets"] = {
  requests: 25,
  pages: 5,
  depth: 2,
  requestMs: 10000,
  overallMs: 300000,
  responseBytes: 1048576,
  totalBytes: 10485760,
  intervalMs: 1000,
  concurrency: 1,
};
export class ExplorationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function ensure(value: unknown, code: string): asserts value {
  if (!value) throw new ExplorationError(code);
}
export function safeCode(e: unknown) {
  return e instanceof ExplorationError ? e.code : "OPERATION_FAILED";
}
