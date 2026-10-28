export * from './economic-summary.js';
export * from './workflow-rules.js';
export * from './workflow-graph.js';
export * from './workflow-values.js';
export * from './simulation.js';
import type {SimulationDeclaration} from './simulation.js';
import { createHash, sign, verify } from 'node:crypto';
import { Ajv } from 'ajv';
import {validateIntegration,type IntegrationContract} from './integration.js';
import {validateSmartManifest, type SmartModuleManifest} from './capabilities.js';
export * from './capabilities.js';

export const SDK_VERSION = 1;
export { outboxSql, captureSql } from './outbox.js';
export { boundedLookup } from './network.js';
export * from './integration.js';
export const QUERY_PARAMETERS=['limit','offset','fields','from','to','status','q'] as const;
export interface ApiContribution { operationId: string; method: 'GET' | 'POST' | 'PUT'; path: string; permission: string; query?: (typeof QUERY_PARAMETERS[number])[] }
/** Versioned, data-only forms. Nested fields are bounded by validateManifest. */
export interface ModuleFormField {
  name: string; label: string; type: 'string' | 'number' | 'json' | 'boolean' | 'object' | 'array'; required: boolean;
  readOnly?: boolean; minimum?: number; maximum?: number; maxLength?: number; enum?: string[]; default?: string | number | boolean;
  reference?: {operationId:string;valueField:string;labelField:string;currencyField?:string}; generate?:'uuid'|'synthetic-participant'|'synthetic-reference';
  format?: 'multiline'|'date'|'date-time'|'money'|'workflow'; fields?:ModuleFormField[]; items?:ModuleFormField; minItems?:number; maxItems?:number;
  visibleWhen?:{field:string;equals:string|number|boolean};
}
export interface ScreenContribution {
  workspace?: 'business'|'administration'|'developer'; refreshMs?:number; currencyReference?:string;
  formVersion?:1; navigationGroup?:string;
  preview?:{version:1;operationId:string;submitLabel?:string};
  screenId: string; title: string; navigationLabel: string;
  listOperation?: string; createOperation?: string; updateOperation?: string;
  fields: ModuleFormField[]; columns: string[];
  actions?:{label:string;operationId:string;confirmation?:string}[];
}
export interface ModulePackageManifest {
  /** Read-only source of immutable publications; discovery grants no execution authority. */
  workflowServices?:{contractVersion:1;publicationOperationId:string;triggerDiscovery?:{operationId:string;selectionField:string;maxAgeMs:number}};
  /** Requests a fresh current-reviewer context; it grants no account permission. */
  approvalServices?:{contractVersion:1;reviewerPermission:string};
  /** Closed disclosure streams only; private programme/case records never replicate. */
  programServices?:{contractVersion:1;domain:'housing'|'participant-services'|'employment'|'food';syntheticOnly:true};
  /** Optional signed economic metadata. It does not itself authorize any operation. */
  economicServices?:{contractVersion:1;kind:'resource-availability'|'mission-budget'|'resource-coordination';syntheticOnly:true};
  simulation?:SimulationDeclaration;
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
  integration?:IntegrationContract;
  smart?: SmartModuleManifest;
  connector?: { version:1; provider:'shopify'|'printify'; webhookTopics:string[] };
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
function validateScreens(m:ModulePackageManifest) {
  const modern=atLeast(m.minimumPlatformVersion,'0.15.0'), safeName=(v:unknown)=>typeof v==='string'&&/^[a-z][a-zA-Z0-9_]{0,49}$/.test(v)&&!['constructor','prototype','__proto__','revision'].includes(v);
  const check=(ok:unknown,message='Unsupported declarative UI contribution')=>{if(!ok)reject(message);};
  check(Array.isArray(m.ui)&&m.ui.length<=(atLeast(m.minimumPlatformVersion,'0.13.0')?20:10));
  check(new Set(m.ui.map(s=>s.screenId)).size===m.ui.length);
  for(const s of m.ui){
    check(onlyKeys(s,['screenId','title','navigationLabel','listOperation','createOperation','updateOperation','fields','columns','actions','workspace','refreshMs','currencyReference','formVersion','navigationGroup','preview']));
    check(/^[a-z][a-z0-9-]{0,49}$/.test(s.screenId)&&typeof s.title==='string'&&typeof s.navigationLabel==='string');
    check(s.workspace===undefined||['business','administration','developer'].includes(s.workspace));
    check(s.refreshMs===undefined||Number.isInteger(s.refreshMs)&&s.refreshMs>=2000&&s.refreshMs<=60000);
    check(s.formVersion===undefined||modern&&s.formVersion===1);
    check(s.navigationGroup===undefined||modern&&typeof s.navigationGroup==='string'&&s.navigationGroup.trim().length>0&&s.navigationGroup.length<=80&&!/[\u0000-\u001f]/.test(s.navigationGroup));
    check(s.listOperation===undefined?!!s.preview:m.api.some(a=>a.operationId===s.listOperation&&a.method==='GET'));
    if(s.preview){check(modern&&s.formVersion===1&&onlyKeys(s.preview,['version','operationId','submitLabel'])&&s.preview.version===1&&m.api.some(a=>a.operationId===s.preview!.operationId&&a.method==='POST'&&!a.path.includes(':'))&&!s.createOperation&&!s.updateOperation&&!s.actions?.length&&!s.refreshMs);check(s.preview.submitLabel===undefined||typeof s.preview.submitLabel==='string'&&s.preview.submitLabel.length>0&&s.preview.submitLabel.length<=80);}
    check(s.createOperation===undefined||m.api.some(a=>a.operationId===s.createOperation&&a.method==='POST'));
    check(s.updateOperation===undefined||m.api.some(a=>a.operationId===s.updateOperation&&a.method==='PUT'&&a.path.endsWith('/:id')));
    let total=0;
    const fields=(values:ModuleFormField[],depth:number)=>{
      check(Array.isArray(values)&&values.length<=30&&depth<=4&&new Set(values.map(f=>f.name)).size===values.length);
      for(const f of values){
        check(++total<=100&&onlyKeys(f,['name','label','type','required','minimum','maximum','maxLength','readOnly','enum','default','reference','generate','format','fields','items','minItems','maxItems','visibleWhen']));
        check(safeName(f.name)&&(f.name!=='id'||f.readOnly)&&typeof f.label==='string'&&f.label.length<=160&&typeof f.required==='boolean'&&['string','number','json','boolean','object','array'].includes(f.type));
        const extended=['boolean','object','array'].includes(f.type)||['format','fields','items','minItems','maxItems','visibleWhen','maximum'].some(k=>Object.hasOwn(f,k));
        check(!extended||modern&&s.formVersion===1);
        check(f.readOnly===undefined||typeof f.readOnly==='boolean');
        check(f.minimum===undefined||f.type==='number'&&Number.isFinite(f.minimum));check(f.maximum===undefined||f.type==='number'&&Number.isFinite(f.maximum)&&(f.minimum===undefined||f.maximum>=f.minimum));
        check(f.maxLength===undefined||f.type==='string'&&Number.isInteger(f.maxLength)&&f.maxLength>=1&&f.maxLength<=100000);
        check(f.enum===undefined||f.type==='string'&&Array.isArray(f.enum)&&f.enum.length>0&&f.enum.length<=30&&new Set(f.enum).size===f.enum.length&&f.enum.every(v=>typeof v==='string'&&v.length<=120));
        check(f.default===undefined||(f.type==='number'?typeof f.default==='number'&&Number.isFinite(f.default):f.type==='boolean'?typeof f.default==='boolean':f.type==='string'&&typeof f.default==='string'&&f.default.length<=120&&(!f.enum||f.enum.includes(f.default))));
        check(f.format===undefined||(f.format==='workflow'?f.type==='json'&&atLeast(m.minimumPlatformVersion,'0.16.0'):f.type==='number'?f.format==='money':f.type==='string'&&['multiline','date','date-time'].includes(f.format)));
        if(f.format==='money')check([f.minimum,f.maximum,f.default].every(v=>v===undefined||Number.isSafeInteger(v)));
        if(f.visibleWhen){const condition=f.visibleWhen,other=values.find(v=>v.name===condition.field);check(onlyKeys(condition,['field','equals'])&&safeName(condition.field)&&other&&other!==f&&!other.visibleWhen&&['string','number','boolean'].includes(other.type)&&typeof condition.equals===other.type&&(typeof condition.equals!=='number'||Number.isFinite(condition.equals))&&(other.enum===undefined||other.enum.includes(String(condition.equals))));}
        if(f.type==='object'){check(!f.items&&f.minItems===undefined&&f.maxItems===undefined);fields(f.fields!,depth+1);}else check(f.fields===undefined);
        if(f.type==='array'){check(!!f.items&&Number.isInteger(f.maxItems)&&f.maxItems!>=1&&f.maxItems!<=100&&(f.minItems===undefined||Number.isInteger(f.minItems)&&f.minItems>=0&&f.minItems<=f.maxItems!)&&!f.items?.visibleWhen&&!f.items?.readOnly);fields([f.items!],depth+1);}else check(f.items===undefined&&f.minItems===undefined&&f.maxItems===undefined);
        if(f.reference){const r=f.reference;check(atLeast(m.minimumPlatformVersion,'0.13.0')&&onlyKeys(r,['operationId','valueField','labelField','currencyField'])&&f.type==='string'&&!f.format&&m.api.some(a=>a.operationId===r.operationId&&a.method==='GET'&&!a.path.includes(':'))&&[r.valueField,r.labelField,...(r.currencyField===undefined?[]:[r.currencyField])].every(safeName),'Invalid declarative reference');}
        if(f.generate!==undefined)check(atLeast(m.minimumPlatformVersion,'0.13.0')&&f.type==='string'&&['uuid','synthetic-participant','synthetic-reference'].includes(f.generate)&&f.default===undefined&&f.reference===undefined&&f.enum===undefined&&!f.readOnly&&!f.format);
      }
    };
    fields(s.fields,0);
    check(Array.isArray(s.columns)&&s.columns.every(c=>s.fields.some(f=>f.name===c)));
    check(s.actions===undefined||Array.isArray(s.actions)&&s.actions.length<=12&&s.actions.every(a=>onlyKeys(a,['label','operationId','confirmation'])&&typeof a.label==='string'&&a.label.length<=100&&(a.confirmation===undefined||typeof a.confirmation==='string'&&a.confirmation.length<=500)&&m.api.some(op=>op.operationId===a.operationId&&op.method==='POST'&&op.path.endsWith('/:id'))));
  }
}
export function validateManifest(m: ModulePackageManifest): void {
  if (!m || m.manifestVersion !== 1 || m.sdkVersion !== 1 || !/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(m.moduleId) || m.moduleId.length > 80 ||
      !versionPattern.test(m.version) || !versionPattern.test(m.minimumPlatformVersion) || typeof m.name !== 'string' || !m.name.trim() || m.name.length > 120 || typeof m.description !== 'string' || m.description.length > 2000) reject('Invalid module manifest identity or SDK version');
  if (!onlyKeys(m, ['manifestVersion','sdkVersion','moduleId','version','name','description','minimumPlatformVersion','dependencies','requiredPermissions','api','ui','configurationSchema','persistence','integrationEvents','analyticalCapabilities','replication','mcpTools','integration','smart','connector','simulation','programServices','economicServices','approvalServices','workflowServices'])) reject('Unsupported module manifest fields');
  if(m.programServices&&(!onlyKeys(m.programServices,['contractVersion','domain','syntheticOnly'])||m.programServices.contractVersion!==1||m.programServices.syntheticOnly!==true||!['housing','participant-services','employment','food'].includes(m.programServices.domain)||!atLeast(m.minimumPlatformVersion,'0.13.0')||!m.replication||m.replication.streams.some(s=>!['mission_aggregates_v1','mission_resources_v1'].includes(s.streamId)||s.columns.join(',')!=='id,revision,projection')))reject('Program services require closed aggregate-only disclosure contracts');
  if(m.economicServices&&(m.programServices||!onlyKeys(m.economicServices,['contractVersion','kind','syntheticOnly'])||m.economicServices.contractVersion!==1||m.economicServices.syntheticOnly!==true||!['resource-availability','mission-budget','resource-coordination'].includes(m.economicServices.kind)||!atLeast(m.minimumPlatformVersion,'0.14.0')||m.replication?.streams.some(s=>!['economic_summaries_v1','economic_summary_status_v1'].includes(s.streamId)||s.columns.join(',')!=='id,revision,projection')))reject('Economic services require synthetic, closed summary contracts and platform 0.14.0');
  if(m.simulation&&(!onlyKeys(m.simulation,['version','role'])||m.simulation.version!==1||!['engine','provider','participant'].includes(m.simulation.role)||!atLeast(m.minimumPlatformVersion,'0.11.0')||(['engine','provider'].includes(m.simulation.role)&&m.connector)))reject('Invalid isolated simulation declaration');
  if(m.connector&&(!onlyKeys(m.connector,['version','provider','webhookTopics'])||m.connector.version!==1||!['shopify','printify'].includes(m.connector.provider)||!atLeast(m.minimumPlatformVersion,'0.8.0')||!Array.isArray(m.connector.webhookTopics)||m.connector.webhookTopics.length>20||m.connector.webhookTopics.some(t=>typeof t!=='string'||! /^[a-z][a-z0-9_-]*(?:[/:][a-z][a-z0-9_-]*)+$/.test(t))))reject('Invalid connector declaration');
  if(m.api?.some(a=>a.path==='/connector-webhook'))reject('Connector ingress must not be a public module API');
  validateIntegration(m);
  if(m.api?.some(a=>['/integration-inbox','/integration-outbox','/integration-ack'].includes(a.path)))reject('Private integration endpoints must not be public APIs');
  if (m.replication && (m.replication.contractVersion !== 1 || !Array.isArray(m.replication.streams) || !m.replication.streams.length || m.replication.streams.length > 10 || new Set(m.replication.streams.map(s => s.streamId)).size !== m.replication.streams.length || m.replication.streams.some(s =>
    !onlyKeys(s, ['streamId','table','idColumn','revisionColumn','columns']) || ![s.streamId,s.table,s.idColumn,s.revisionColumn,...s.columns].every(v => /^[a-z][a-z0-9_]{0,49}$/.test(v)) || !s.columns.includes(s.idColumn) || !s.columns.includes(s.revisionColumn) || s.columns.length > 30))) reject('Invalid replication projection');
  if (!Array.isArray(m.dependencies) || m.dependencies.some(d => d.moduleId === m.moduleId || !/^[a-z][a-z0-9.-]{0,79}$/.test(d.moduleId) || !versionPattern.test(d.minimumVersion)) || new Set(m.dependencies.map(d => d.moduleId)).size !== m.dependencies.length) reject('Invalid module dependencies');
  if (!Array.isArray(m.requiredPermissions) || m.requiredPermissions.some(p => p !== 'storage.own-database')) reject('Unsupported module platform permission');
  if (!m.persistence || m.persistence.isolation !== 'dedicated-database' || m.persistence.destructiveRollback !== false || !Number.isInteger(m.persistence.schemaVersion) || m.persistence.schemaVersion < 1 || !Array.isArray(m.persistence.migrations) ||
      m.persistence.migrations.length !== m.persistence.schemaVersion || m.persistence.migrations.some((migration, i) => migration.version !== i + 1 || !/^[0-9a-f]{64}$/.test(migration.sha256))) reject('Invalid persistence contract');
  if (!Array.isArray(m.api) || !m.api.length || m.api.length > (atLeast(m.minimumPlatformVersion,'0.13.0')?96:30) || new Set(m.api.map(a => a.operationId)).size !== m.api.length || m.api.some(a =>
    !onlyKeys(a, ['operationId','method','path','permission','query']) || !/^[a-z][a-zA-Z0-9]{0,49}$/.test(a.operationId) || !['GET', 'POST', 'PUT'].includes(a.method) || !/^\/[a-z][a-z0-9-]*(?:\/:id)?$/.test(a.path) || !a.permission.startsWith(m.moduleId + '.') || !/^[a-z0-9.-]+$/.test(a.permission) || a.query!==undefined&&(!Array.isArray(a.query)||a.method!=='GET'||new Set(a.query).size!==a.query.length||a.query.some(q=>!QUERY_PARAMETERS.includes(q))))) reject('Invalid API or permission contribution');
  if(Array.isArray(m.ui)&&m.ui.some(s=>s.workspace!==undefined||s.refreshMs!==undefined||Array.isArray(s.fields)&&s.fields.some(f=>f.default!==undefined)||s.actions?.some(a=>a.confirmation!==undefined))&&!atLeast(m.minimumPlatformVersion,'0.11.0'))reject('UI contribution metadata requires Steward 0.11.0');
  if(m.workflowServices){const service=m.workflowServices,op=m.api.find(a=>a.operationId===service.publicationOperationId);if(!atLeast(m.minimumPlatformVersion,'0.16.0')||!onlyKeys(service,['contractVersion','publicationOperationId','triggerDiscovery'])||service.contractVersion!==1||!m.approvalServices||!op||op.method!=='GET'||op.path.includes(':')||!op.query?.includes('q'))reject('Invalid workflow publication service declaration');
    if(service.triggerDiscovery){const t=service.triggerDiscovery,discovery=m.api.find(a=>a.operationId===t.operationId);if(!onlyKeys(t,['operationId','selectionField','maxAgeMs'])||!discovery||discovery.method!=='GET'||discovery.path.includes(':')||!discovery.query?.includes('q')||!Number.isSafeInteger(t.maxAgeMs)||t.maxAgeMs<1||t.maxAgeMs>31*86400000||!m.ui.some(s=>s.fields.some(f=>f.format==='workflow')&&s.fields.some(f=>f.name===t.selectionField&&f.type==='string'&&f.reference?.operationId===t.operationId&&f.reference.valueField==='id')))reject('Invalid workflow trigger discovery declaration');}
  }
  if(m.approvalServices&&(!atLeast(m.minimumPlatformVersion,'0.15.0')||!onlyKeys(m.approvalServices,['contractVersion','reviewerPermission'])||m.approvalServices.contractVersion!==1||!m.api.some(a=>a.permission===m.approvalServices!.reviewerPermission)))reject('Invalid current reviewer context declaration');
  validateScreens(m);
  for(const s of m.ui){if((s.currencyReference!==undefined||s.fields.some(f=>f.reference?.currencyField!==undefined))&&!atLeast(m.minimumPlatformVersion,'0.14.0'))reject('Declared currency sources require Steward 0.14.0');if(s.currencyReference!==undefined&&(typeof s.currencyReference!=='string'||!s.fields.some(f=>f.name===s.currencyReference&&f.reference?.currencyField)))reject('Currency source must reference a declared local record choice');}
  if (m.mcpTools !== undefined && (!Array.isArray(m.mcpTools) || m.mcpTools.length > 10 || new Set(m.mcpTools.map(t=>t.name)).size !== m.mcpTools.length || m.mcpTools.some(t=>!onlyKeys(t,['name','description','operationId']) || !/^[a-z][a-z0-9_]{0,59}$/.test(t.name) || typeof t.description !== 'string' || t.description.length > 300 || !m.api.some(a=>a.operationId===t.operationId && a.method==='GET' && !a.path.includes(':'))))) reject('Invalid read-only MCP contribution');
  if(m.economicServices&&m.mcpTools?.some(t=>m.api.find(a=>a.operationId===t.operationId)?.path!=='/published-economic-summaries'))reject('Economic MCP must use approved summaries');
  if(m.programServices&&m.mcpTools?.some(t=>m.api.find(a=>a.operationId===t.operationId)?.path!=='/published-aggregates'))reject('Private-service MCP must use the sealed aggregate operation');
  if (!m.configurationSchema || m.configurationSchema.type !== 'object' || m.configurationSchema.additionalProperties !== false) reject('Configuration must be a closed JSON object schema');
  configurationValidator(m.configurationSchema);
  validateSmartManifest(m);
  if (!Array.isArray(m.integrationEvents) || m.integrationEvents.some(e => !e.name.startsWith(m.moduleId + '.') || !Number.isInteger(e.version) || e.version < 1 || !['produced', 'consumed'].includes(e.direction)) ||
      !Array.isArray(m.analyticalCapabilities) || m.analyticalCapabilities.some(c => typeof c.name !== 'string' || !Number.isInteger(c.version) || c.version < 1)) reject('Invalid event/analytical declarations');
}
export function validateConfiguration(manifest: ModulePackageManifest, configuration: unknown): void {
  if (!configurationValidator(manifest.configurationSchema)(configuration)) reject('Configuration does not satisfy the module schema');
}
export function operationFor(manifest: ModulePackageManifest, method: string, path: string): ApiContribution | undefined {
  if(path.length>2000||path.includes('#'))return undefined;
  const [pathname,query]=path.split('?');
  const op=manifest.api.find(op => op.method === method && (op.path === pathname || (op.path.endsWith('/:id') && new RegExp('^' + op.path.slice(0, -4) + '/[0-9a-f-]{36}$').test(pathname!))));
  if(!op||query!==undefined&&([...new URLSearchParams(query)].some(([k,v])=>!op.query?.includes(k as any)||v.length>300)||new Set([...new URLSearchParams(query).keys()]).size!==[...new URLSearchParams(query)].length))return undefined;
  return op;
}
export function assertCompatible(manifest: ModulePackageManifest, platform: string, installed: { moduleId: string; version: string; state: string }[]): void {
  if (!atLeast(platform, manifest.minimumPlatformVersion)) reject('Platform version is incompatible');
  for (const dependency of manifest.dependencies) {
    if (!installed.some(m => m.moduleId === dependency.moduleId && m.state === 'active' && atLeast(m.version, dependency.minimumVersion))) reject(`Required active dependency is missing: ${dependency.moduleId}`);
  }
}

export * from './workflow-plan.js';
export * from './workflow-preview.js';
