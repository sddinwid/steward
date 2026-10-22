import { createHash, sign, verify } from 'node:crypto';
import { Ajv } from 'ajv';

export const SDK_VERSION = 1;
export { outboxSql, captureSql } from './outbox.js';
export { boundedLookup } from './network.js';
export interface ApiContribution { operationId: string; method: 'GET' | 'POST' | 'PUT'; path: string; permission: string }
export interface ScreenContribution {
  screenId: string; title: string; navigationLabel: string;
  listOperation: string; createOperation: string; updateOperation: string;
  fields: { name: string; label: string; type: 'string' | 'number'; required: boolean; readOnly?: boolean; minimum?: number; maxLength?: number }[];
  columns: string[];
}
export interface ModulePackageManifest {
  manifestVersion: 1; sdkVersion: 1; moduleId: string; version: string; name: string; description: string;
  minimumPlatformVersion: string;
  dependencies: { moduleId: string; minimumVersion: string }[];
  requiredPermissions: string[];
  api: ApiContribution[];
  ui: ScreenContribution[];
  configurationSchema: Record<string, unknown>;
  persistence: { isolation: 'dedicated-database'; schemaVersion: number; migrations: { version: number; sha256: string }[]; destructiveRollback: false };
  integrationEvents: { name: string; version: number; direction: 'produced' | 'consumed' }[];
  analyticalCapabilities: { name: string; version: number }[];
  mcpTools?: { name: string; description: string; operationId: string }[];
  replication?: { contractVersion: 1; streams: { streamId: string; table: string; idColumn: string; revisionColumn: string; columns: string[] }[] };
}
export interface ModulePackage {
  formatVersion: 1; publisherId: string; imageId: string; manifest: ModulePackageManifest;
}
export interface SignedModulePackage { payload: ModulePackage; signature: string }
export interface ModuleCatalog { catalogVersion: 1; packages: SignedModulePackage[] }
export interface PublisherTrust { publishers: { publisherId: string; publicKey: string }[] }
export function reject(message: string): never { throw new Error(message); }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort().map(k => JSON.stringify(k) + ':' + canonical(object[k])).join(',') + '}';
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function signPackage(payload: ModulePackage, privateKey: string): SignedModulePackage {
  validateManifest(payload.manifest);
  return { payload, signature: sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64url') };
}
export function verifyPackage(value: SignedModulePackage, trust: PublisherTrust): ModulePackage {
  const publisher = trust.publishers.find(p => p.publisherId === value?.payload?.publisherId);
  if (!publisher || value.payload.formatVersion !== 1 || !/^sha256:[0-9a-f]{64}$/.test(value.payload.imageId) ||
      typeof value.signature !== 'string' || !verify(null, Buffer.from(canonical(value.payload)), publisher.publicKey, Buffer.from(value.signature, 'base64url'))) reject('Package authenticity verification failed');
  validateManifest(value.payload.manifest);
  return value.payload;
}
const versionPattern = /^\d+\.\d+\.\d+$/;
export function atLeast(version: string, minimum: string): boolean {
  if (!versionPattern.test(version) || !versionPattern.test(minimum)) return false;
  const a = version.split('.').map(Number); const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return true;
}
const ajv = new Ajv({ strict: true, allErrors: false });
// Catalogs are reread during polling; cache equivalent schemas without retaining
// a newly parsed object and generated validator on every exchange forever.
const schemaValidators = new Map<string, ReturnType<Ajv['compile']>>();
function configurationValidator(schema: Record<string,unknown>) {
  const key=canonical(schema);let validate=schemaValidators.get(key);
  if(!validate){validate=ajv.compile(schema);ajv.removeSchema(schema);if(schemaValidators.size>=100)schemaValidators.delete(schemaValidators.keys().next().value!);schemaValidators.set(key,validate);}
  return validate;
}
function onlyKeys(object: object, keys: string[]): boolean { return Object.keys(object).every(k => keys.includes(k)); }
export function validateManifest(m: ModulePackageManifest): void {
  if (!m || m.manifestVersion !== 1 || m.sdkVersion !== 1 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(m.moduleId) || m.moduleId.length > 80 ||
      !versionPattern.test(m.version) || !versionPattern.test(m.minimumPlatformVersion) || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 120 || typeof m.description !== 'string' || m.description.length > 2000) reject('Invalid module manifest identity or SDK version');
  if (!onlyKeys(m, ['manifestVersion','sdkVersion','moduleId','version','name','description','minimumPlatformVersion','dependencies','requiredPermissions','api','ui','configurationSchema','persistence','integrationEvents','analyticalCapabilities','replication','mcpTools'])) reject('Unsupported module manifest fields');
  if (m.replication && (m.replication.contractVersion !== 1 || !Array.isArray(m.replication.streams) || !m.replication.streams.length || m.replication.streams.length > 10 || new Set(m.replication.streams.map(s => s.streamId)).size !== m.replication.streams.length || m.replication.streams.some(s =>
    !onlyKeys(s, ['streamId','table','idColumn','revisionColumn','columns']) || ![s.streamId,s.table,s.idColumn,s.revisionColumn,...s.columns].every(v => /^[a-z][a-z0-9_]{0,49}$/.test(v)) || !s.columns.includes(s.idColumn) || !s.columns.includes(s.revisionColumn) || s.columns.length > 30))) reject('Invalid replication projection');
  if (!Array.isArray(m.dependencies) || m.dependencies.some(d => d.moduleId === m.moduleId || !/^[a-z][a-z0-9.-]{0,79}$/.test(d.moduleId) || !versionPattern.test(d.minimumVersion)) || new Set(m.dependencies.map(d => d.moduleId)).size !== m.dependencies.length) reject('Invalid module dependencies');
  if (!Array.isArray(m.requiredPermissions) || m.requiredPermissions.some(p => p !== 'storage.own-database')) reject('Unsupported module platform permission');
  if (!m.persistence || m.persistence.isolation !== 'dedicated-database' || m.persistence.destructiveRollback !== false || !Number.isInteger(m.persistence.schemaVersion) || m.persistence.schemaVersion < 1 || !Array.isArray(m.persistence.migrations) ||
      m.persistence.migrations.length !== m.persistence.schemaVersion || m.persistence.migrations.some((migration, i) => migration.version !== i + 1 || !/^[0-9a-f]{64}$/.test(migration.sha256))) reject('Invalid persistence contract');
  if (!Array.isArray(m.api) || !m.api.length || m.api.length > 30 || new Set(m.api.map(a => a.operationId)).size !== m.api.length || m.api.some(a =>
    !onlyKeys(a, ['operationId','method','path','permission']) || !/^[a-z][a-zA-Z0-9]{0,49}$/.test(a.operationId) || !['GET', 'POST', 'PUT'].includes(a.method) || !/^\/[a-z][a-z0-9-]*(?:\/:id)?$/.test(a.path) || !a.permission.startsWith(m.moduleId + '.') || !/^[a-z0-9.-]+$/.test(a.permission))) reject('Invalid API or permission contribution');
  if (!Array.isArray(m.ui) || m.ui.length > 10 || m.ui.some(s => !/^[a-z][a-z0-9-]{0,49}$/.test(s.screenId) || typeof s.title !== 'string' || typeof s.navigationLabel !== 'string' ||
    !onlyKeys(s, ['screenId','title','navigationLabel','listOperation','createOperation','updateOperation','fields','columns']) ||
    !m.api.some(a => a.operationId === s.listOperation && a.method === 'GET') || !m.api.some(a => a.operationId === s.createOperation && a.method === 'POST') || !m.api.some(a => a.operationId === s.updateOperation && a.method === 'PUT' && a.path.endsWith('/:id')) || !Array.isArray(s.fields) || s.fields.length > 30 || s.fields.some(f =>
      !onlyKeys(f, ['name','label','type','required','minimum','maxLength','readOnly']) || !/^[a-z][a-zA-Z0-9_]{0,49}$/.test(f.name) || ['constructor', 'prototype', '__proto__', 'id', 'revision'].includes(f.name) || typeof f.label !== 'string' || !['string', 'number'].includes(f.type) || typeof f.required !== 'boolean') ||
    !Array.isArray(s.columns) || s.columns.some(c => !s.fields.some(f => f.name === c)))) reject('Unsupported declarative UI contribution');
  if (m.mcpTools !== undefined && (!Array.isArray(m.mcpTools) || m.mcpTools.length > 10 || new Set(m.mcpTools.map(t=>t.name)).size !== m.mcpTools.length || m.mcpTools.some(t=>!onlyKeys(t,['name','description','operationId']) || !/^[a-z][a-z0-9_]{0,59}$/.test(t.name) || typeof t.description !== 'string' || t.description.length > 300 || !m.api.some(a=>a.operationId===t.operationId && a.method==='GET' && !a.path.includes(':'))))) reject('Invalid read-only MCP contribution');
  if (!m.configurationSchema || m.configurationSchema.type !== 'object' || m.configurationSchema.additionalProperties !== false) reject('Configuration must be a closed JSON object schema');
  configurationValidator(m.configurationSchema);
  if (!Array.isArray(m.integrationEvents) || m.integrationEvents.some(e => !e.name.startsWith(m.moduleId + '.') || !Number.isInteger(e.version) || e.version < 1 || !['produced', 'consumed'].includes(e.direction)) ||
      !Array.isArray(m.analyticalCapabilities) || m.analyticalCapabilities.some(c => typeof c.name !== 'string' || !Number.isInteger(c.version) || c.version < 1)) reject('Invalid event/analytical declarations');
}
export function validateConfiguration(manifest: ModulePackageManifest, configuration: unknown): void {
  if (!configurationValidator(manifest.configurationSchema)(configuration)) reject('Configuration does not satisfy the module schema');
}
export function operationFor(manifest: ModulePackageManifest, method: string, path: string): ApiContribution | undefined {
  return manifest.api.find(op => op.method === method && (op.path === path || (op.path.endsWith('/:id') && new RegExp('^' + op.path.slice(0, -4) + '/[0-9a-f-]{36}$').test(path))));
}
export function assertCompatible(manifest: ModulePackageManifest, platform: string, installed: { moduleId: string; version: string; state: string }[]): void {
  if (!atLeast(platform, manifest.minimumPlatformVersion)) reject('Platform version is incompatible');
  for (const dependency of manifest.dependencies) {
    if (!installed.some(m => m.moduleId === dependency.moduleId && m.state === 'active' && atLeast(m.version, dependency.minimumVersion))) reject(`Required active dependency is missing: ${dependency.moduleId}`);
  }
}
