import { createHash } from 'node:crypto';

export const statuses = ['announced', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returning', 'returned', 'cancelled', 'unknown'] as const;
export type Status = typeof statuses[number];
export interface Scope {
  entityId: string; workerInstallationId: string; providerInstallationId: string;
  moduleId: string; authorityPackageDigest: string; connectionId: string;
  accountScopeId: string; mode: 'simulator' | 'sandbox' | 'live';
}
export interface CarrierEvent {
  eventId: string; providerEventId: string | null; occurredAt: string | null;
  originalTime: string | null; rawStatus: string; status: Status;
  mappingVersion: 1; supersedes: string | null;
  correctionBasis: 'documented_semantics' | 'provider_revision' | null;
}
export interface Observation extends CarrierEvent {
  digest: string; receivedAt: string; scopeKey: string;
}
export interface Reconciled {
  status: Status; reconciliation: 'consistent' | 'ambiguous' | 'insufficient_evidence';
  evidence: string[]; qualifications: string[];
}
export const limits = Object.freeze({ registrations: 200, events: 500, page: 20, attempts: 5, leaseMs: 30_000, freshMs: 3_600_000 });
export function requireValue(ok: unknown, message: string): asserts ok { if (!ok) throw Error(message); }
export function closed(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join(), 'CARRIER_CLOSED_SCHEMA');
}
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const utc = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v);
}
export const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
export function scopeKey(s: Scope): string {
  closed(s, ['entityId','workerInstallationId','providerInstallationId','moduleId','authorityPackageDigest','connectionId','accountScopeId','mode']);
  requireValue([s.entityId,s.workerInstallationId,s.providerInstallationId,s.connectionId,s.accountScopeId].every(uuid), 'CARRIER_SCOPE_INVALID');
  requireValue(/^[a-z][a-z0-9.-]{1,79}$/.test(s.moduleId) && /^[a-f0-9]{64}$/.test(s.authorityPackageDigest) && ['simulator','sandbox','live'].includes(s.mode), 'CARRIER_SCOPE_INVALID');
  return hash(s);
}
export function registrationKey(scope: Scope, tracking: string, cycle: string): string {
  requireValue(/^[A-Z0-9-]{3,60}$/.test(tracking) && uuid(cycle), 'CARRIER_TRACKING_INVALID');
  return hash({ scope: scopeKey(scope), tracking, cycle });
}
export function validateEvent(e: CarrierEvent): void {
  closed(e, ['eventId','providerEventId','occurredAt','originalTime','rawStatus','status','mappingVersion','supersedes','correctionBasis']);
  requireValue(uuid(e.eventId) && (e.providerEventId === null || /^[A-Za-z0-9-]{1,80}$/.test(e.providerEventId)) && (e.occurredAt === null || utc(e.occurredAt)) && (e.originalTime === null || typeof e.originalTime === 'string' && e.originalTime.length <= 80), 'CARRIER_EVENT_INVALID');
  requireValue(typeof e.rawStatus === 'string' && /^[A-Z0-9_-]{1,60}$/.test(e.rawStatus) && statuses.includes(e.status) && e.mappingVersion === 1, 'CARRIER_EVENT_INVALID');
  requireValue((e.supersedes === null && e.correctionBasis === null) || (uuid(e.supersedes) && e.supersedes !== e.eventId && ['documented_semantics','provider_revision'].includes(e.correctionBasis!)), 'CARRIER_CORRECTION_INVALID');
}
export function ingest(previous: Observation[], incoming: CarrierEvent[], scope: string, receivedAt: string): Observation[] {
  requireValue(/^[a-f0-9]{64}$/.test(scope) && utc(receivedAt) && incoming.length <= limits.events, 'CARRIER_INGEST_INVALID');
  requireValue(previous.every(e => e.scopeKey === scope), 'CARRIER_SCOPE_MISMATCH');
  const rows = [...previous];
  for (const e of incoming) {
    validateEvent(e);
    const digest = hash(e);
    if (!rows.some(r => r.digest === digest)) rows.push({ ...e, digest, receivedAt, scopeKey: scope });
  }
  requireValue(rows.length <= limits.events, 'CARRIER_EVENT_LIMIT');
  return rows;
}
/** Missing times or unsupported revisions never receive an invented ordering. */
export function reconcile(rows: Observation[]): Reconciled {
  if (!rows.length) return { status: 'unknown', reconciliation: 'insufficient_evidence', evidence: [], qualifications: ['no_observations'] };
  requireValue(new Set(rows.map(r => r.scopeKey)).size === 1, 'CARRIER_SCOPE_MISMATCH');
  const issues = new Set<string>(), superseded = new Set<string>();
  for (const r of rows) {
    if (rows.some(s => s !== r && (s.eventId === r.eventId || r.providerEventId !== null && s.providerEventId === r.providerEventId) && s.digest !== r.digest)) issues.add('conflicting_event_identity');
    if (r.supersedes) {
      const target = rows.find(s => s.eventId === r.supersedes);
      if (!target || !r.correctionBasis || target.supersedes === r.eventId || !utc(r.occurredAt) || !utc(target.occurredAt) || r.occurredAt < target.occurredAt) issues.add('unsupported_correction');
      else superseded.add(target.eventId);
    }
  }
  const active = rows.filter(r => !superseded.has(r.eventId));
  if (!active.length) issues.add('correction_cycle');
  if (active.some(e => !e.occurredAt)) issues.add('unknown_event_time');
  const sorted = [...active].sort((a,b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''));
  const latest = sorted[0];
  if (latest && active.some(e => e.occurredAt === latest.occurredAt && e.status !== latest.status)) issues.add('conflicting_event_time');
  // A later transit scan is not by itself evidence that a completed delivery was wrong.
  if (latest && !['delivered','returned'].includes(latest.status) && active.some(e => ['delivered','returned'].includes(e.status))) issues.add('terminal_status_conflict');
  if (issues.size) return { status: 'unknown', reconciliation: 'ambiguous', evidence: active.map(e => e.eventId), qualifications: [...issues].sort() };
  return { status: latest?.status ?? 'unknown', reconciliation: latest?.status === 'unknown' ? 'insufficient_evidence' : 'consistent', evidence: latest ? [latest.eventId] : [], qualifications: latest?.status === 'unknown' ? ['unmapped_status'] : [] };
}
export function fresh(freshUntil: string | null, now: number): boolean { return freshUntil !== null && utc(freshUntil) && Number.isFinite(now) && now < Date.parse(freshUntil); }
export function retryAt(attempt: number, now: number, jitter = 0): string | null {
  requireValue(Number.isInteger(attempt) && attempt > 0 && Number.isFinite(now) && jitter >= 0 && jitter <= 1, 'CARRIER_RETRY_INVALID');
  return attempt >= limits.attempts ? null : new Date(now + Math.min(1000 * 2 ** (attempt - 1), 60_000) + Math.floor(250 * jitter)).toISOString();
}
export function shipmentDelivered(packages: { status: Status }[], expected: number | null): boolean | null {
  return expected === null || expected < 1 || packages.length !== expected ? null : packages.every(p => p.status === 'delivered');
}
