import { Ajv } from 'ajv';
import { canonical, digest, atLeast, type ModulePackageManifest } from './index.js';

export type JsonSchema = Record<string, unknown>;
export type Sensitivity = 'public' | 'business' | 'restricted';
export interface CapabilityContract {
  configuration?:Record<string,string|number|boolean>;
  capabilityId: string; contract: string; version: string;
  operations: { name: string; command: string; input: JsonSchema; output: JsonSchema; permission: string; mode: 'sync' | 'durable'; idempotency: 'required'; retry: 'safe' | 'reconcile' }[];
  events: { name: string; schema: JsonSchema }[];
  sensitivity: Sensitivity; scope: 'entity'; ownership: 'provider';
}
export interface CapabilityRequirement {
  capabilityId: string; contract: string; minimumVersion: string; maximumMajor: number;
  operations: { name: string; input: JsonSchema; output: JsonSchema }[];
  events: { name: string; schema: JsonSchema }[];
  maximumSensitivity: Sensitivity; optional: boolean;
}
export interface SmartModuleManifest {
  version: 1; provides: CapabilityContract[]; consumes: CapabilityRequirement[];
  prerequisites: { configuration: Record<string, string | number | boolean>; requiresActive: true; requiresHealthy: true };
}
export interface CapabilityProvider {
  moduleId: string; moduleVersion: string; installationId: string; entityId: string; packageDigest: string;
  state: 'active' | 'inactive' | 'failed' | 'unavailable'; configured: boolean; capability: CapabilityContract;
}
export interface ResolutionContext { entityId: string; permissions: string[]; preferredProvider?: string }
export interface ProviderEvaluation { provider: CapabilityProvider; compatible: boolean; reasons: string[] }
const id = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const levels: Sensitivity[] = ['public', 'business', 'restricted'];
const ajv = new Ajv({ strict: true, allErrors: false });
const validators = new Map<string, ReturnType<Ajv['compile']>>();
function closed(value: unknown, keys: string[]): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error('Invalid SSMA manifest: ' + message); }
function schema(value: unknown) {
  check(closed(value, ['type','properties','required','additionalProperties','items','enum','const','minimum','maximum','minLength','maxLength','minItems','maxItems','pattern','format','description','oneOf','anyOf']), 'schema');
  check(Buffer.byteLength(canonical(value)) <= 16384, 'schema size');
  // No external schema references, executable annotations or unbounded remote resolution.
  check(!/"\$(?:ref|id|async)"\s*:/.test(canonical(value)), 'schema references');
  const key=canonical(value),cached=validators.get(key);if(cached)return cached;
  const validator = ajv.compile(value); ajv.removeSchema(value);
  if(validators.size>=128)validators.delete(validators.keys().next().value!);
  validators.set(key,validator);return validator;
}
function unique<T>(items: T[], key: (item: T) => string, max: number) {
  return Array.isArray(items) && items.length <= max && new Set(items.map(key)).size === items.length;
}
export function validateSmartManifest(m: ModulePackageManifest) {
  const s = m.smart; if (s === undefined) return;
  check(atLeast(m.minimumPlatformVersion,'0.8.0'),'minimum platform version must support SSMA');
  check(closed(s, ['version','provides','consumes','prerequisites']) && s.version === 1, 'version');
  check(unique(s.provides, c => c.capabilityId, 20) && unique(s.consumes, c => c.capabilityId, 20), 'capabilities');
  check(closed(s.prerequisites, ['configuration','requiresActive','requiresHealthy']) && s.prerequisites.requiresActive === true && s.prerequisites.requiresHealthy === true, 'prerequisites');
  check(s.prerequisites.configuration && Object.keys(s.prerequisites.configuration).length <= 12 && Object.entries(s.prerequisites.configuration).every(([k,v]) => Object.hasOwn((m.configurationSchema.properties ?? {}) as object,k) && ['string','number','boolean'].includes(typeof v)), 'configuration prerequisites');
  for (const c of s.provides) {
    check(closed(c, ['capabilityId','contract','version','operations','events','sensitivity','scope','ownership','configuration']) && id.test(c.capabilityId) && id.test(c.contract) && semver.test(c.version), 'provider identity');
    if(c.configuration!==undefined)check(atLeast(m.minimumPlatformVersion,'0.11.0')&&c.configuration&&typeof c.configuration==='object'&&!Array.isArray(c.configuration)&&Object.keys(c.configuration).length<=12&&Object.entries(c.configuration).every(([k,v])=>Object.hasOwn((m.configurationSchema.properties??{}) as object,k)&&['string','number','boolean'].includes(typeof v)),'capability configuration prerequisites');
    check(levels.includes(c.sensitivity) && c.scope === 'entity' && c.ownership === 'provider', 'authority');
    check(unique(c.operations, o => o.name, 12) && c.operations.length, 'operations');
    for (const o of c.operations) {
      check(closed(o, ['name','command','input','output','permission','mode','idempotency','retry']) && id.test(o.name) && id.test(o.command) && ['sync','durable'].includes(o.mode) && o.idempotency === 'required' && ['safe','reconcile'].includes(o.retry), 'operation');
      check(m.api.some(a => a.permission === o.permission) && o.permission.startsWith(m.moduleId + '.'), 'permission'); schema(o.input); schema(o.output);
      if(o.mode==='durable')check(m.integration,'durable endpoint');
      else {
        const api=m.api.find(a=>a.operationId===o.command&&a.permission===o.permission&&!a.path.includes(':'));
        check(api,'synchronous endpoint');
        if(api.method==='GET')check(o.input.type==='object'&&o.input.additionalProperties===false&&Object.keys(o.input.properties as object??{}).length===0,'parameterless synchronous query schema');
        else check((o.input.properties as Record<string,any>)?.requestId?.type==='string','synchronous command idempotency field');
      }
    }
    events(c.events);
  }
  for (const c of s.consumes) {
    check(closed(c, ['capabilityId','contract','minimumVersion','maximumMajor','operations','events','maximumSensitivity','optional']) && id.test(c.capabilityId) && id.test(c.contract) && semver.test(c.minimumVersion) && Number.isSafeInteger(c.maximumMajor) && c.maximumMajor === Number(c.minimumVersion.split('.')[0]) && typeof c.optional === 'boolean' && levels.includes(c.maximumSensitivity), 'requirement');
    check(unique(c.operations, o => o.name, 12) && c.operations.length, 'required operations');
    for (const o of c.operations) { check(closed(o,['name','input','output']) && id.test(o.name), 'required operation'); schema(o.input); schema(o.output); }
    events(c.events);
  }
}
function events(values: { name: string; schema: JsonSchema }[]) {
  check(unique(values, e => e.name, 12), 'events'); for (const e of values) { check(closed(e,['name','schema']) && id.test(e.name), 'event'); schema(e.schema); }
}
export function capabilityFingerprint(c: CapabilityContract) { return digest(canonical(c)); }
export function evaluateProvider(requirement: CapabilityRequirement, provider: CapabilityProvider, context: ResolutionContext): ProviderEvaluation {
  const c = provider.capability, reasons: string[] = [];
  if (provider.entityId !== context.entityId) reasons.push('ENTITY_SCOPE_MISMATCH');
  if (provider.state !== 'active') reasons.push('PROVIDER_' + provider.state.toUpperCase());
  if (!provider.configured) reasons.push('CONFIGURATION_PREREQUISITE');
  if (c.capabilityId !== requirement.capabilityId || c.contract !== requirement.contract) reasons.push('CONTRACT_IDENTITY_MISMATCH');
  if (!atLeast(c.version, requirement.minimumVersion) || Number(c.version.split('.')[0]) !== requirement.maximumMajor) reasons.push('CONTRACT_VERSION_MISMATCH');
  if (levels.indexOf(c.sensitivity) > levels.indexOf(requirement.maximumSensitivity)) reasons.push('SENSITIVITY_EXCEEDED');
  for (const r of requirement.operations) {
    const op = c.operations.find(o => o.name === r.name);
    if (!op) reasons.push('MISSING_OPERATION:' + r.name);
    else {
      if (canonical(op.input) !== canonical(r.input) || canonical(op.output) !== canonical(r.output)) reasons.push('SCHEMA_MISMATCH:' + r.name);
      if (!context.permissions.includes(op.permission)) reasons.push('PERMISSION_DENIED:' + op.permission);
    }
  }
  for (const e of requirement.events) if (!c.events.some(p => p.name === e.name && canonical(p.schema) === canonical(e.schema))) reasons.push('EVENT_MISMATCH:' + e.name);
  return { provider, compatible: reasons.length === 0, reasons };
}
export function resolveCapability(requirement: CapabilityRequirement, providers: CapabilityProvider[], context: ResolutionContext) {
  const evaluations = [...providers].sort((a,b) => a.moduleId.localeCompare(b.moduleId) || a.packageDigest.localeCompare(b.packageDigest)).map(p => evaluateProvider(requirement,p,context));
  const compatible = evaluations.filter(e => e.compatible && (!context.preferredProvider || e.provider.moduleId === context.preferredProvider));
  return { state: compatible.length === 1 ? 'resolved' as const : compatible.length ? 'ambiguous' as const : 'unavailable' as const, selected: compatible.length === 1 ? compatible[0]!.provider : null, evaluations };
}
export function validateCapabilityValue(value: unknown, contract: JsonSchema) { if (!schema(contract)(value)) throw new Error('CAPABILITY_SCHEMA_MISMATCH'); }

export function capabilityConfigured(manifest:ModulePackageManifest,configuration:Record<string,unknown>,capability:CapabilityContract){return Object.entries({...manifest.smart?.prerequisites.configuration,...capability.configuration}).every(([k,v])=>configuration[k]===v);}
