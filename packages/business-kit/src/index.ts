import {parsePeerScope,type AttestedPeerScope} from './peer-context.js';
export * from './peer-context.js';
export * from './simulation.js';
import {setSimulationContext,simulationEpoch,inferSimulationContext} from './simulation.js';
import {simulationEpochSql,sameSimulationDataset,type SimulationOrigin} from '@steward/module-sdk';
import Fastify, { type FastifyRequest, type FastifyInstance } from 'fastify';
import pg from 'pg';
import { Ajv } from 'ajv';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { capabilityInboundEnabled,canonical, digest, integrationSql, validateCommand, operationFor, INTEGRATION_PROTOCOL, type IntegrationCommand, type ModulePackageManifest } from '@steward/module-sdk';
export * from './schema.js';
/** JSON values are accepted only after a closed, module-owned schema validates them. */
export type Data = Record<string, any>;
/** Identity attested by the local module host in its read-only runtime file. */
export interface ProviderIdentity {
    readonly workerInstallationId:string;readonly entityId:string;readonly moduleId:string;
    readonly moduleInstallationId:string;readonly packageDigest:string;
}
export interface RecordValue {
    id: string;
    kind: string;
    key: string;
    data: Data;
    revision: number;
}
export class BusinessError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function ensure(condition: unknown, message: string, status = 422): asserts condition { if (!condition)
    throw new BusinessError(status, message); }
export interface Context {
    readonly peerScope?:AttestedPeerScope|undefined;
    simulation?:SimulationOrigin;
    db: pg.PoolClient;
    config: Data;
    installationId: string;
    actor: string;
    permissions: string[];
    moduleId: string;
    /** Enrolled identity from the trusted runtime file, never module settings. */
    readonly entityId?: string;
    readonly providerIdentity?:ProviderIdentity;
    /** Current sender attested by the host's locked local delivery, never a body field. */
    readonly incomingProviderIdentity?:ProviderIdentity;
    /** Fresh, private Worker authentication context; never accepted from module API bodies. */
    readonly financialPrincipals?: {readonly issuedAt:number;readonly actors:readonly string[]};
    /** Current eligible accounts only; module-owned policies decide quorum and approval. */
    readonly approvalPrincipals?: {readonly issuedAt:number;readonly reviewerPermission:string;readonly actors:readonly string[]};
}
/** Optional module-owned data policy. Platform permission is checked separately. */
export interface AccessRequest {
    operation: 'list' | 'create' | 'update' | 'action' | 'query' | 'report' | 'integration-status' | 'integration-receive' | 'integration-ack';
    path: string;
    kind?: string;
    record?: RecordValue;
    input?: Data;
    query?: Record<string, string>;
    command?: IntegrationCommand;
}
export interface AccessAuditEvent {
    actor: string | null;
    operationId: string;
    method: string;
    path: string;
    kind?: string;
    recordId?: string;
    /** Opaque identities of returned collection rows, bounded by page size. */
    recordIds?: string[];
    statusCode: number;
    allowed: boolean;
}
export interface Resource {
    authorize?: (ctx: Context, access: AccessRequest) => Promise<void>;
    /** UUID allowlist applied in SQL before pagination/search; no browser SQL. */
    listScope?: (ctx: Context) => Promise<{ ids: string[] }>;
    /** Module-owned top-level text fields searched alongside the immutable key. */
    searchFields?: string[];
    /** Deterministic private identity namespace; legacy resources use input[key]. */
    deriveKey?: (ctx: Context, input: Data) => Promise<string> | string;
    /** Optional logical configuration revision; background state keeps its own row revision. */
    revisionField?: string;
    kind: string;
    path: string;
    schema: Data;
    key: string;
    prepare?: (data: Data, previous: RecordValue | null, ctx: Context) => Promise<Data>;
    after?: (record: RecordValue, previous: RecordValue | null, ctx: Context) => Promise<void>;
}
export interface Action {
    /** State controls still lock the current row and validate its domain state. */
    concurrency?: 'revision' | 'current-state';
    path: string;
    permission: string;
    kind: string;
    run: (record: RecordValue, ctx: Context) => Promise<Data>;
}
export interface Definition {
    /** Idempotent module-owned initialization in the schema migration transaction.
     * Receives only trusted runtime configuration; never a public request body. */
    afterMigrate?: (ctx:Context)=>Promise<void>;
    authorize?: (ctx: Context, access: AccessRequest) => Promise<void>;
    /** Runs in a separate committed transaction after the request transaction.
     * Receives no body, query strings, record contents or error text. Failure is
     * closed: the original response is withheld and a generic 503 is returned. */
    auditAccess?: (event: AccessAuditEvent, db: pg.PoolClient) => Promise<void>;
    manifest: ModulePackageManifest;
    resources: Resource[];
    actions: Action[];
    receive?: (command: IntegrationCommand, ctx: Context) => Promise<Data>;
    acknowledge?: (command: IntegrationCommand, status: 'delivered' | 'rejected', result: Data, ctx: Context) => Promise<void>;
    report?: (ctx: Context) => Promise<Data>;
    queries?: {
        path: string;
        method?: 'GET'|'POST';
        /** Required closed input schema for POST read-only previews. */
        schema?: Data;
        run: (ctx: Context, query?: Record<string,string>, body?:Data) => Promise<Data>;
    }[];
    tick?: (ctx: Context) => Promise<void>;
    webhook?: (body: Data, ctx: Context) => Promise<Data>;
}
export const businessSql = `
CREATE TABLE IF NOT EXISTS business_records(id uuid PRIMARY KEY,kind text NOT NULL,key text NOT NULL,data jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,key));
CREATE INDEX IF NOT EXISTS business_records_kind ON business_records(kind,key);
CREATE TABLE IF NOT EXISTS business_requests(request_id uuid PRIMARY KEY,actor text NOT NULL,operation text NOT NULL,digest text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS business_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor text NOT NULL,operation text NOT NULL,record_id uuid,created_at timestamptz NOT NULL DEFAULT now());
${integrationSql}
${simulationEpochSql}`;
export async function transaction<T>(pool: pg.Pool, run: (db: pg.PoolClient) => Promise<T>,options:{readonly?:boolean}={}): Promise<T> {
    const db = await pool.connect();
    try {
        await db.query(options.readonly?'BEGIN READ ONLY':'BEGIN');
        // One lock per dedicated module database serializes business transitions and inbox/outbox commits.
        await db.query('SELECT pg_advisory_xact_lock(711007)');
        const value = await run(db);
        await db.query('COMMIT');
        return value;
    }
    catch (error) {
        await db.query('ROLLBACK');
        throw error;
    }
    finally {
        db.release();
    }
}
const convert = (r: any): RecordValue => ({ id: r.id, kind: r.kind, key: r.key, data: r.data, revision: r.revision });
export async function find(ctx: Context, kind: string, key: string): Promise<RecordValue | null> { const row = (await ctx.db.query('SELECT * FROM business_records WHERE kind=$1 AND key=$2', [kind, key])).rows[0]; if(row&&ctx.simulation)ensure(row.data.simulation&&sameSimulationDataset(row.data.simulation,ctx.simulation),'SIMULATION_RECORD_SCOPE_MISMATCH',403);return row ? convert(row) : null; }
export async function get(ctx: Context, kind: string, id: string): Promise<RecordValue> { const row = (await ctx.db.query('SELECT * FROM business_records WHERE kind=$1 AND id=$2 FOR UPDATE', [kind, id])).rows[0]; ensure(row, 'Record not found', 404);if(ctx.simulation)ensure(row.data.simulation&&sameSimulationDataset(row.data.simulation,ctx.simulation),'SIMULATION_RECORD_SCOPE_MISMATCH',403); return convert(row); }
export async function records(ctx: Context, kind: string): Promise<RecordValue[]> { const rows = (await ctx.db.query('SELECT * FROM business_records WHERE kind=$1 ORDER BY key LIMIT 10001', [kind])).rows; ensure(rows.length <= 10000, 'Reporting limit reached; narrow the operational dataset', 413); return rows.map(convert); }
function resourceRecord(resource:Resource,record:RecordValue){const value=publicRecord(record);if(resource.revisionField){const revision=record.data[resource.revisionField]??1;ensure(Number.isInteger(revision)&&revision>=1,'Invalid resource configuration revision');value.revision=revision;}return value;}
export async function save(ctx: Context, kind: string, key: string, data: Data, previous?: RecordValue | null): Promise<RecordValue> {
    const origin=ctx.simulation??previous?.data.simulation;
    if(origin){setSimulationContext(ctx,origin);if(previous)ensure(previous.data.simulation&&sameSimulationDataset(previous.data.simulation,origin),'SIMULATION_RECORD_NOT_OWNED',403);ensure(!data.simulation||sameSimulationDataset(data.simulation,origin),'SIMULATION_PROVENANCE_CHANGED',403);data={...data,simulation:previous?.data.simulation??origin};}
    const row = previous ? (await ctx.db.query('UPDATE business_records SET data=$1,revision=revision+1,updated_at=now() WHERE id=$2 AND revision=$3 RETURNING *', [data, previous.id, previous.revision])).rows[0]
        : (await ctx.db.query('INSERT INTO business_records(id,kind,key,data) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(), kind, key, data])).rows[0];
    ensure(row, 'Record changed; refresh before retrying', 409);
    return convert(row);
}
export const publicRecord = (r: RecordValue): Data => ({ ...r.data, id: r.id, revision: r.revision });
export async function enqueue(ctx: Context, targetModuleId: string, command: string, aggregateId: string, payload: Data) {
    await inferSimulationContext(ctx,aggregateId);
    const last = Number((await ctx.db.query("SELECT COALESCE(max((envelope->>'sequence')::bigint),0) AS n FROM integration_outbox WHERE envelope->>'aggregateId'=$1 AND envelope->>'targetModuleId'=$2", [aggregateId, targetModuleId])).rows[0].n);
    const envelope: IntegrationCommand = { protocol: INTEGRATION_PROTOCOL, commandId: randomUUID(), sourceModuleId: ctx.moduleId, targetModuleId, command, version: 1, aggregateId, sequence: last + 1, occurredAt: new Date().toISOString(), payload,...(ctx.simulation?{simulation:ctx.simulation}:{}) };
    validateCommand(envelope);
    await ctx.db.query('INSERT INTO integration_outbox(command_id,envelope) VALUES($1,$2)', [envelope.commandId, envelope]);
    return envelope.commandId;
}
export async function enqueueCapability(ctx:Context,capabilityId:string,operation:string,aggregateId:string,payload:Data,options:{expectedProvider?:ProviderIdentity}={}) {
    await inferSimulationContext(ctx,aggregateId);
    const last=Number((await ctx.db.query("SELECT COALESCE(max((envelope->>'sequence')::bigint),0) n FROM integration_outbox WHERE envelope->>'aggregateId'=$1 AND envelope->'capability'->>'capabilityId'=$2",[aggregateId,capabilityId])).rows[0].n);
    const p=options.expectedProvider;
    const envelope:IntegrationCommand={protocol:INTEGRATION_PROTOCOL,commandId:randomUUID(),sourceModuleId:ctx.moduleId,targetModuleId:'steward.capability',command:operation,version:1,aggregateId,sequence:last+1,occurredAt:new Date().toISOString(),payload,capability:{capabilityId,operation,...(p?{providerConstraint:{version:1,workerInstallationId:p.workerInstallationId,entityId:p.entityId,moduleId:p.moduleId,moduleInstallationId:p.moduleInstallationId,packageDigest:p.packageDigest}}:{})},...(ctx.simulation?{simulation:ctx.simulation}:{})};
    validateCommand(envelope);await ctx.db.query('INSERT INTO integration_outbox(command_id,envelope) VALUES($1,$2)',[envelope.commandId,envelope]);return envelope.commandId;
}
export async function receiveCommand(ctx: Context, command: IntegrationCommand, receive: NonNullable<Definition['receive']>): Promise<{
    httpStatus: number;
    value: Data;
}> {
    const hash = validateCommand(command);
    ensure(command.targetModuleId === ctx.moduleId, 'Wrong integration target', 403);
    const cached = (await ctx.db.query('SELECT * FROM integration_inbox WHERE source_module=$1 AND command_id=$2', [command.sourceModuleId, command.commandId])).rows[0];
    if (cached) {
        ensure(cached.digest === hash, 'Command identity reused with different content', 409);
        return cached.response;
    }
    if(command.simulation){setSimulationContext(ctx,command.simulation);ensure(command.command==='simulation.dataset.reset'||await simulationEpoch(ctx,command.command==='simulation.dataset.begin'),'SIMULATION_DATASET_CLOSED',403);}
    const previous = Number((await ctx.db.query('SELECT sequence FROM integration_sequences WHERE source_module=$1 AND aggregate_id=$2 FOR UPDATE', [command.sourceModuleId, command.aggregateId])).rows[0]?.sequence ?? 0);
    ensure(command.sequence === previous + 1, command.sequence > previous + 1 ? 'Earlier command has not arrived' : 'Stale integration sequence', command.sequence > previous + 1 ? 425 : 409);
    await ctx.db.query('SAVEPOINT business_command');
    let response: {
        httpStatus: number;
        value: Data;
    };
    try {
        response = { httpStatus: 200, value: await receive(command, ctx) };
        await ctx.db.query('RELEASE SAVEPOINT business_command');
    }
    catch (error) {
        if (!(error instanceof BusinessError) || ![400, 403, 409, 422].includes(error.status))
            throw error;
        await ctx.db.query('ROLLBACK TO SAVEPOINT business_command');
        response = { httpStatus: error.status, value: { error: error.message } };
    }
    if(ctx.simulation)await ctx.db.query('INSERT INTO integration_inbox(source_module,command_id,digest,response,simulation) VALUES($1,$2,$3,$4,$5)',[command.sourceModuleId,command.commandId,hash,response,ctx.simulation]);
    else await ctx.db.query('INSERT INTO integration_inbox(source_module,command_id,digest,response) VALUES($1,$2,$3,$4)', [command.sourceModuleId, command.commandId, hash, response]);
    await ctx.db.query('INSERT INTO integration_sequences(source_module,aggregate_id,sequence) VALUES($1,$2,$3) ON CONFLICT(source_module,aggregate_id) DO UPDATE SET sequence=excluded.sequence', [command.sourceModuleId, command.aggregateId, command.sequence]);
    return response;
}
function permissions(request: FastifyRequest) { try {
    const p = JSON.parse(String(request.headers['x-steward-permissions'] ?? '[]'));
    return Array.isArray(p) && p.every(v => typeof v === 'string') ? p : [];
}
catch {
    return [];
} }
const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';
const idParams = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', pattern: uuidPattern } } };
const ajv = new Ajv({ strict: true, allErrors: false });
async function authorizeAccess(definition: Definition, resource: Resource | undefined, c: Context, access: AccessRequest) {
    try {
        await definition.authorize?.(c, access);
        await resource?.authorize?.(c, access);
    } catch (error) {
        if (error instanceof BusinessError && [403, 404].includes(error.status))
            throw new BusinessError(access.operation === 'update' || access.operation === 'action' || access.record ? 404 : 403, access.operation === 'update' || access.operation === 'action' || access.record ? 'Record unavailable or not permitted' : 'Module data access denied');
        throw error;
    }
}
async function authorizedRecord(definition: Definition, resource: Resource | undefined, c: Context, access: AccessRequest, id: string) {
    let record: RecordValue;
    try { record = await get(c, access.kind!, id); }
    catch (error) {
        if ((definition.authorize || resource?.authorize) && error instanceof BusinessError && error.status === 404)
            throw new BusinessError(404, 'Record unavailable or not permitted');
        throw error;
    }
    await authorizeAccess(definition, resource, c, { ...access, record });
    return record;
}
async function resourceKey(resource: Resource, c: Context, input: Data) {
    if (!resource.deriveKey) return String(input[resource.key]);
    const key = await resource.deriveKey(c, input);
    ensure(typeof key === 'string' && key.length > 0 && key.length <= 512, 'Invalid module record identity', 500);
    return key;
}
const financialContext=(request?:FastifyRequest)=>{const raw=request?.headers['x-steward-financial-principals'];if(raw===undefined)return{};let value:any;try{ensure(typeof raw==='string'&&raw.length<=12000,'Financial authentication context unavailable',403);value=JSON.parse(raw);}catch{throw new BusinessError(403,'Financial authentication context unavailable');}ensure(value&&Object.keys(value).length===2&&Object.keys(value).every(k=>['issuedAt','actors'].includes(k))&&Number.isSafeInteger(value.issuedAt)&&Array.isArray(value.actors)&&value.actors.length<=256&&new Set(value.actors).size===value.actors.length&&value.actors.every((id:unknown)=>typeof id==='string'&&new RegExp(uuidPattern).test(id)),'Financial authentication context unavailable',403);return{financialPrincipals:Object.freeze({issuedAt:value.issuedAt,actors:Object.freeze(value.actors)})};};
function approvalContext(manifest:ModulePackageManifest,request?:FastifyRequest){
    const raw=request?.headers['x-steward-approval-principals'];if(raw===undefined)return{};
    const unavailable=()=>new BusinessError(403,'Approval authentication context unavailable');let value:any;
    try{if(typeof raw!=='string'||raw.length>12000)throw unavailable();value=JSON.parse(raw);}catch{throw unavailable();}
    if(!manifest.approvalServices||!value||Object.keys(value).length!==3||!Object.keys(value).every(k=>['issuedAt','reviewerPermission','actors'].includes(k))||value.reviewerPermission!==manifest.approvalServices.reviewerPermission||!Number.isSafeInteger(value.issuedAt)||Date.now()-value.issuedAt>60000||value.issuedAt-Date.now()>5000||!Array.isArray(value.actors)||value.actors.length>256||new Set(value.actors).size!==value.actors.length||!value.actors.every((id:unknown)=>typeof id==='string'&&new RegExp(uuidPattern).test(id)))throw unavailable();
    return{approvalPrincipals:Object.freeze({issuedAt:value.issuedAt,reviewerPermission:value.reviewerPermission as string,actors:Object.freeze(value.actors as string[])})};
}
function providerContext(runtime:Data,moduleId:string):{providerIdentity?:ProviderIdentity}{
    const p=runtime.providerIdentity;if(p===undefined)return{};
    ensure(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===5&&Object.keys(p).every(k=>['workerInstallationId','entityId','moduleId','moduleInstallationId','packageDigest'].includes(k))&&p.workerInstallationId===runtime.installationId&&p.entityId===runtime.entityId&&p.moduleId===moduleId&&['workerInstallationId','entityId','moduleInstallationId'].every(k=>typeof p[k]==='string'&&new RegExp(uuidPattern).test(p[k]))&&typeof p.packageDigest==='string'&&/^[a-f0-9]{64}$/.test(p.packageDigest),'Module provider identity unavailable',503);
    return{providerIdentity:Object.freeze({...p}) as ProviderIdentity};
}
function incomingProviderContext(request:FastifyRequest,ctx:Context,command:IntegrationCommand):void{
    const raw=request.headers['x-steward-source-identity'];if(raw===undefined)return;
    let p:any;try{ensure(typeof raw==='string'&&raw.length<=2048,'Integration source identity unavailable',403);p=JSON.parse(raw);}catch{throw new BusinessError(403,'Integration source identity unavailable');}
    ensure(p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===5&&Object.keys(p).every(k=>['workerInstallationId','entityId','moduleId','moduleInstallationId','packageDigest'].includes(k))&&p.workerInstallationId===ctx.installationId&&p.entityId===ctx.entityId&&p.moduleId===command.sourceModuleId&&['workerInstallationId','entityId','moduleInstallationId'].every(k=>typeof p[k]==='string'&&new RegExp(uuidPattern).test(p[k]))&&typeof p.packageDigest==='string'&&/^[a-f0-9]{64}$/.test(p.packageDigest),'Integration source identity unavailable',403);
    Object.defineProperty(ctx,'incomingProviderIdentity',{value:Object.freeze({...p}),enumerable:true,writable:false});
}
export function createBusinessServer(pool: pg.Pool, token: string, runtime: Data, definition: Definition, migrate: () => Promise<number>, ready: () => Promise<void>) {
    const app = Fastify({ logger: false, bodyLimit: definition.manifest.connector?196608:49152, requestTimeout: 10000 });

    const provider=providerContext(runtime,definition.manifest.moduleId);
    const ctx = (db: pg.PoolClient, request?: FastifyRequest): Context => ({ db, config: runtime.configuration, installationId: runtime.installationId, moduleId: definition.manifest.moduleId, actor: String(request?.headers['x-steward-actor'] ?? 'module-runtime'), peerScope:parsePeerScope(request?.headers['x-steward-peer-scope']), permissions: request ? permissions(request) : [], ...(typeof runtime.entityId === 'string' ? { entityId: runtime.entityId } : {}),...provider,...financialContext(request),...approvalContext(definition.manifest,request) });
    const accesses = new WeakMap<FastifyRequest, Omit<AccessAuditEvent, 'statusCode' | 'allowed'>>();
    const audited = new WeakSet<FastifyRequest>();
    const previews=new Set((definition.queries??[]).filter(query=>query.method==='POST').map(query=>query.path));
    const identifyRecord = (request: FastifyRequest, kind: string, id?: string) => {
        const access = accesses.get(request);
        if (access) { access.kind = kind; if (id) access.recordId = id; }
    };
    app.addHook('onRequest', async (request, reply) => {
        if (request.url === '/health')
            return;
        const op = operationFor(definition.manifest, request.method, request.url);
        if (op) accesses.set(request, { actor: null, operationId: op.operationId, method: request.method, path: op.path });
        else if (['/integration-inbox', '/integration-ack'].includes(request.url) && request.method === 'POST')
            accesses.set(request, { actor: null, operationId: request.url === '/integration-inbox' ? 'integrationReceive' : 'integrationAcknowledge', method: request.method, path: request.url });
        const a = Buffer.from(String(request.headers.authorization ?? '')), b = Buffer.from('Bearer ' + token);
        if (a.length !== b.length || !timingSafeEqual(a, b))
            return reply.code(401).send({ error: 'Module gateway authentication required' });
        const access = accesses.get(request);
        if (access) access.actor = String(request.headers['x-steward-actor'] ?? 'module-runtime');
        const privatePaths = ['/ready', '/internal/migrate', '/integration-outbox', '/integration-inbox', '/integration-ack', ...(definition.manifest.connector?['/connector-webhook']:[])];
        if (!op && !privatePaths.includes(request.url))
            return reply.code(403).send({ error: 'Undeclared module operation' });
        if (op && !permissions(request).includes(op.permission))
            return reply.code(403).send({ error: 'Module permission denied' });
    });
    if (definition.auditAccess) app.addHook('onSend', async (request, reply, payload) => {
        const access = accesses.get(request);
        if (!access || audited.has(request)) return payload;
        audited.add(request);
        let db: pg.PoolClient | undefined;
        try {
            db = await pool.connect();
            await db.query('BEGIN');
            await definition.auditAccess!({ ...access, statusCode: reply.statusCode, allowed: reply.statusCode < 400 }, db);
            await db.query('COMMIT');
            return payload;
        } catch {
            if (db) await db.query('ROLLBACK').catch(() => {});
            const committedMutation = request.method !== 'GET' && !previews.has(access.path) && reply.statusCode < 400;
            reply.code(503);
            return JSON.stringify(committedMutation ? { error: 'Module access audit unavailable; the operation may have committed. Refresh and reconcile using the original request identity.', recovery: 'OUTCOME_REQUIRES_RECONCILIATION' } : { error: 'Module access audit unavailable' });
        } finally { db?.release(); }
    });
    app.get('/health', async () => ({ status: 'ok' }));
    app.get('/ready', async (_req, reply) => { try {
        await ready();
        return { status: 'ready' };
    }
    catch {
        return reply.code(503).send({ error: 'Module schema not ready' });
    } });
    app.post('/internal/migrate', async () => ({ schemaVersion: await migrate() }));
    if(definition.webhook)app.post<{Body:Data}>('/connector-webhook',async req=>transaction(pool,db=>definition.webhook!(req.body,ctx(db))));
    for (const resource of definition.resources) {
        const validate = ajv.compile(resource.schema);
        const searchable=resource.searchFields??[];
        ensure(Array.isArray(searchable)&&searchable.length<=20&&new Set(searchable).size===searchable.length&&searchable.every(name=>typeof name==='string'&&/^[a-z][a-zA-Z0-9_]{0,49}$/.test(name)&&resource.schema.properties?.[name]?.type==='string'),'Invalid module search fields',500);
        app.get<{
            Querystring: Record<string, string>;
        }>(resource.path, async (req) => transaction(pool, async (db) => {
            const c = ctx(db, req), q = req.query, limit = Number(q.limit ?? 20), offset = Number(q.offset ?? 0);
            identifyRecord(req, resource.kind);
            await authorizeAccess(definition, resource, c, { operation: 'list', path: resource.path, kind: resource.kind, query: q });
            ensure(Number.isInteger(limit) && limit >= 1 && limit <= 20 && Number.isInteger(offset) && offset >= 0 && offset <= 100000, 'Invalid pagination', 400);
            const allowed = Object.keys(resource.schema.properties).concat('id', 'revision', ...definition.manifest.ui.filter(s => definition.manifest.api.find(a => a.operationId === s.listOperation)?.path === resource.path).flatMap(s => s.fields.map(f => f.name)));
            const fields = q.fields?.split(',');
            ensure(!fields || fields.every(f => allowed.includes(f)), 'Unknown selected field', 400);
            const scope = resource.listScope ? await resource.listScope(c) : undefined;
            ensure(!scope || Array.isArray(scope.ids) && scope.ids.length <= 10000 && scope.ids.every(id => typeof id === 'string' && new RegExp(uuidPattern).test(id)), 'Invalid module record scope', 500);
            const textSearch=searchable.length?" OR EXISTS (SELECT 1 FROM jsonb_each_text(data) AS search_value WHERE search_value.key=ANY($"+(scope?7:6)+"::text[]) AND search_value.value ILIKE $3 ESCAPE '!')":'';
            const rows = (await db.query("SELECT * FROM business_records WHERE kind=$1 AND ($2='' OR data->>'status'=$2) AND ($3='' OR key ILIKE $3 ESCAPE '!'"+textSearch+")" + (scope ? ' AND id=ANY($6::uuid[])' : '') + ' ORDER BY key LIMIT $4 OFFSET $5', [resource.kind, q.status ?? '', q.q ? '%' + q.q.replace(/[!%_]/g, '!$&') + '%' : '', limit + 1, offset, ...(scope ? [scope.ids] : []),...(searchable.length?[searchable]:[])])).rows;
            const audit = accesses.get(req);
            if (audit) audit.recordIds = rows.slice(0, limit).map(r => r.id);
            return { records: rows.slice(0, limit).map(r => { const value = resourceRecord(resource,convert(r)); return fields ? Object.fromEntries(fields.map(f => [f, value[f]])) : value; }), nextOffset: rows.length > limit ? offset + limit : null, summary: 'Module-owned records; quantities and money use the declared units.' };
        }));
        app.post<{
            Body: Data;
        }>(resource.path, async (req, reply) => {
            ensure(validate(req.body), 'Invalid record: ' + ajv.errorsText(validate.errors), 400);
            return reply.code(201).send(await transaction(pool, async (db) => {
                const c = ctx(db, req);
                identifyRecord(req, resource.kind);
                await authorizeAccess(definition, resource, c, { operation: 'create', path: resource.path, kind: resource.kind, input: req.body });
                const key = await resourceKey(resource, c, req.body);
                const previous = await find(c, resource.kind, key);
                if (previous) {
                    identifyRecord(req, resource.kind, previous.id);
                    await authorizeAccess(definition, resource, c, { operation: 'create', path: resource.path, kind: resource.kind, input: req.body, record: previous });
                    const original = (await db.query('SELECT actor,digest,response FROM business_requests WHERE operation=$1 AND response->>\'id\'=$2', [resource.kind + ':create', previous.id])).rows[0];
                    ensure(original?.actor === c.actor && original?.digest === digest(canonical(req.body)), 'Business key already belongs to another creation request', 409);
                    // Creation retries return their original receipt, never a later private
                    // record snapshot. Legacy receipts without a snapshot disclose only identity.
                    return { record: original.response.record ?? { id: previous.id }, replayed: true };
                }
                const data = resource.prepare ? await resource.prepare({ ...req.body }, null, c) : req.body;
                const record = await save(c, resource.kind, key, data);
                identifyRecord(req, resource.kind, record.id);
                await resource.after?.(record, null, c);
                await db.query('INSERT INTO business_requests(request_id,actor,operation,digest,response) VALUES($1,$2,$3,$4,$5)', [randomUUID(), c.actor, resource.kind + ':create', digest(canonical(req.body)), { id: record.id, record: resourceRecord(resource,record) }]);
                await db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)', [c.actor, resource.kind + ':create', record.id]);
                return { record: resourceRecord(resource,record) };
            }));
        });
        app.put<{
            Params: {
                id: string;
            };
            Body: Data;
        }>(resource.path + '/:id', { schema: { params: idParams } }, async (req) => transaction(pool, async (db) => {
            ensure(req.body && typeof req.body === 'object' && !Array.isArray(req.body), 'Invalid update', 400);
            const { revision, ...input } = req.body;
            ensure(Number.isInteger(revision) && validate(input), 'Invalid update', 400);
            const c = ctx(db, req);
            identifyRecord(req, resource.kind, req.params.id);
            const previous = await authorizedRecord(definition, resource, c, { operation: 'update', path: resource.path + '/:id', kind: resource.kind, input }, req.params.id);
            ensure((resource.revisionField?previous.data[resource.revisionField]??1:previous.revision) === revision, 'Revision conflict', 409);
            ensure(await resourceKey(resource, c, input) === previous.key, 'Business key cannot change', 409);
            const data = resource.prepare ? await resource.prepare(input, previous, c) : input;
            const record = await save(c, resource.kind, previous.key, data, previous);
            await resource.after?.(record, previous, c);
            await db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)', [c.actor, resource.kind + ':update', record.id]);
            return { record: resourceRecord(resource,record) };
        }));
    }
    for (const action of definition.actions) {
        app.post<{
            Params: {
                id: string;
            };
            Body: {
                revision: number;
                requestId: string;
            };
        }>(action.path, { preValidation:async req=>{ensure(req.body&&typeof req.body==='object'&&!Array.isArray(req.body)&&Object.keys(req.body).every(k=>['revision','requestId'].includes(k)),'Unsupported action parameters',400);},schema: { params: idParams, body: { type: 'object', additionalProperties: false, required: ['revision', 'requestId'], properties: { revision: { type: 'integer', minimum: 1 }, requestId: { type: 'string', pattern: uuidPattern } } } } }, async (req) => transaction(pool, async (db) => {
            const c = ctx(db, req);
            identifyRecord(req, action.kind, req.params.id);
            ensure(c.permissions.includes(action.permission), 'Action permission denied', 403);
            const hash = digest(canonical({ path: action.path, id: req.params.id, body: req.body }));
            const resource = definition.resources.find(r => r.kind === action.kind);
            const governed = !!(definition.authorize || resource?.authorize);
            // Opted-in policies recheck current relationships before returning an
            // old receipt. Legacy modules retain their original retry behavior.
            const authorized = governed ? await authorizedRecord(definition, resource, c, { operation: 'action', path: action.path, kind: action.kind, input: req.body }, req.params.id) : undefined;
            const cached = (await db.query('SELECT * FROM business_requests WHERE request_id=$1', [req.body.requestId])).rows[0];
            if (cached) {
                ensure(cached.actor === c.actor && cached.digest === hash, 'Request identity conflict', 409);
                return cached.response;
            }
            const record = authorized ?? await get(c, action.kind, req.params.id);
            if(action.concurrency!=='current-state')ensure(record.revision === req.body.revision, 'Revision conflict', 409);
            if(record.data.simulation){setSimulationContext(c,record.data.simulation);ensure(await simulationEpoch(c),'SIMULATION_DATASET_CLOSED',403);}
            const response = await action.run(record, c);
            if(c.simulation)await db.query('INSERT INTO business_requests(request_id,actor,operation,digest,response,simulation) VALUES($1,$2,$3,$4,$5,$6)',[req.body.requestId,c.actor,action.path,hash,response,c.simulation]);
            else await db.query('INSERT INTO business_requests(request_id,actor,operation,digest,response) VALUES($1,$2,$3,$4,$5)', [req.body.requestId, c.actor, action.path, hash, response]);
            await db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)', [c.actor, action.path, record.id]);
            return response;
        }));
    }
    app.get('/integration-status', async (req) => transaction(pool, async (db) => {
        await authorizeAccess(definition, undefined, ctx(db, req), { operation: 'integration-status', path: '/integration-status' });
        return { records: (await db.query('SELECT command_id AS id,envelope->>\'command\' AS command,envelope->>\'targetModuleId\' AS target,status,attempts,last_error AS error,created_at AS created FROM integration_outbox ORDER BY created_at DESC LIMIT 20')).rows };
    }));
    if (definition.report)
        app.get('/reports', async (req) => transaction(pool, async (db) => { const c = ctx(db, req); await authorizeAccess(definition, undefined, c, { operation: 'report', path: '/reports' }); const report = await definition.report!(c); if (Array.isArray(report.records) && report.records.length === 0)
            report.records = Object.entries(report).filter(([k]) => !['records', 'source', 'summary'].includes(k)).map(([metric, value]) => ({ id: metric, metric, value })); return report; }));
    for (const query of definition.queries ?? []){
        if(query.method==='POST'){
            ensure(query.schema?.type==='object'&&query.schema.additionalProperties===false,'POST query requires a closed input schema',500);
            const validate=ajv.compile(query.schema);
            app.post<{Querystring:Record<string,string>;Body:Data}>(query.path,async req=>transaction(pool,async db=>{ensure(validate(req.body),'Invalid preview input',400);const c=ctx(db,req);await authorizeAccess(definition,undefined,c,{operation:'query',path:query.path,query:req.query,input:req.body});return query.run(c,req.query,req.body);},{readonly:true}));
        }else app.get<{Querystring:Record<string,string>}>(query.path, async (req) => transaction(pool, async (db) => { const c = ctx(db, req); await authorizeAccess(definition, undefined, c, { operation: 'query', path: query.path, query: req.query }); return query.run(c, req.query); }));
    }
    registerIntegrationRoutes(app, pool, runtime, definition);
    app.setErrorHandler((error, _req, reply) => { const e = error as any; return reply.code(error instanceof BusinessError ? error.status : e.code === '23505' ? 409 : e.statusCode && e.statusCode < 500 ? e.statusCode : 500).send({ error: error instanceof BusinessError ? error.message : e.code === '23505' ? 'Business key already exists' : 'Business module request failed' }); });
    return app;
}
export function registerIntegrationRoutes(app: FastifyInstance, pool: pg.Pool, runtime: Data, definition: Definition) {
    const provider=providerContext(runtime,definition.manifest.moduleId);
    const ctx = (db: pg.PoolClient, request?:FastifyRequest): Context => ({ db, config: runtime.configuration, installationId: runtime.installationId, moduleId: definition.manifest.moduleId, actor: 'module-runtime',peerScope:parsePeerScope(request?.headers['x-steward-peer-scope']), permissions: [], ...(typeof runtime.entityId === 'string' ? { entityId: runtime.entityId } : {}),...provider,...financialContext(request),...approvalContext(definition.manifest,request) });
    app.get('/integration-outbox', async () => ({ commands: (await pool.query("SELECT envelope FROM integration_outbox WHERE status='pending' AND next_attempt_at<=now() ORDER BY created_at,(envelope->>'sequence')::bigint,command_id LIMIT 4")).rows.map(r => r.envelope) }));
    app.post<{
        Body: IntegrationCommand;
    }>('/integration-inbox', async (req, reply) => {
        const result = await transaction(pool, async (db) => {
            const c = ctx(db,req);
            validateCommand(req.body);
            const incomingCapability=typeof req.headers['x-steward-capability']==='string'?req.headers['x-steward-capability']:undefined;
            ensure((incomingCapability?capabilityInboundEnabled(definition.manifest,c.config,incomingCapability):c.config.integrationsEnabled===true)||req.body.simulation&&definition.manifest.simulation?.role==='participant'&&c.config.simulationEnabled===true,'Integrations disabled',403);
            if(incomingCapability&&req.body.capability)ensure(req.body.capability.capabilityId===incomingCapability,'Integration capability identity mismatch',403);
            ensure(!req.body.simulation||definition.manifest.simulation&&!definition.manifest.connector&&runtime.configuration.mode!=='live','SIMULATION_LIVE_PROVIDER_DENIED',403);
            ensure(!['engine','provider'].includes(definition.manifest.simulation?.role??'')||req.body.simulation,'SIMULATION_PROVENANCE_REQUIRED',403);
            ensure(req.headers['x-steward-integration-source'] === req.body.sourceModuleId && req.headers['x-steward-installation'] === c.installationId, 'Integration identity mismatch', 403);
            incomingProviderContext(req,c,req.body);
            const peer = definition.manifest.integration?.peers.find(p => p.moduleId === req.body.sourceModuleId);
            // This header is supplied only by the authenticated local host after
            // verifying a persisted SSMA approval. Ordinary gateway APIs cannot
            // forward it or address the private inbox.
            const capability = typeof req.headers['x-steward-capability'] === 'string' ? definition.manifest.smart?.provides.find(c => c.capabilityId === req.headers['x-steward-capability']) : undefined;
            ensure(peer?.receives.some(v => v.command === req.body.command && v.version === req.body.version) || capability?.operations.some(o => o.command === req.body.command && o.mode === 'durable'), 'Command is not authorized', 403);
            ensure(definition.receive, 'Integration command unsupported', 403);
            await authorizeAccess(definition, undefined, c, { operation: 'integration-receive', path: '/integration-inbox', command: req.body });
            return receiveCommand(c, req.body, definition.receive);
        });
        return reply.code(result.httpStatus).send(result.value);
    });
    app.post<{
        Body: Data;
    }>('/integration-ack', async (req) => transaction(pool, async (db) => {
        const b = req.body;
        ensure(b && ['retry', 'delivered', 'rejected'].includes(b.status) && typeof b.commandId === 'string', 'Invalid acknowledgment', 400);
        const row = (await db.query('SELECT * FROM integration_outbox WHERE command_id=$1 FOR UPDATE', [b.commandId])).rows[0];
        ensure(row && validateCommand(row.envelope) === b.digest, 'Acknowledgment digest mismatch', 409);
        await authorizeAccess(definition, undefined, ctx(db,req), { operation: 'integration-ack', path: '/integration-ack', command: row.envelope, input: b });
        if (row.status !== 'pending') {
            ensure(b.status === row.status || b.status === 'retry', 'Terminal acknowledgment conflict', 409);
            return { status: row.status };
        }
        const acknowledgmentContext={...ctx(db,req),actor:'module-runtime',permissions:[] as string[]};if(row.envelope.simulation)setSimulationContext(acknowledgmentContext,row.envelope.simulation);
        const domainReceipt={...(b.result??{}),...(b.status==='rejected'&&b.result?.error===undefined&&typeof b.error==='string'?{error:b.error.slice(0,160)}:{})};
        if (b.status !== 'retry'&&(!acknowledgmentContext.simulation||await simulationEpoch(acknowledgmentContext)))
            await definition.acknowledge?.(row.envelope, b.status, domainReceipt, acknowledgmentContext);
        await db.query("UPDATE integration_outbox SET attempts=attempts+1,status=$2,last_error=$3,result=$4,next_attempt_at=now()+make_interval(secs=>LEAST(60,power(2,LEAST(attempts,6))::integer)),completed_at=CASE WHEN $2='pending' THEN NULL ELSE now() END WHERE command_id=$1", [b.commandId, b.status === 'retry' ? 'pending' : b.status, String(b.error ?? '').slice(0, 160) || null, b.result ?? null]);
        return { status: b.status };
    }));
}
export async function startBusinessModule(definition: Definition, background?: (pool:pg.Pool,runtime:Data)=>Promise<void>) {
    const runtime = JSON.parse(await readFile(process.env.MODULE_RUNTIME_FILE!, 'utf8'));
    const pool = new pg.Pool({ host: runtime.databaseHost, database: runtime.databaseName, user: runtime.databaseUser, password: (await readFile('/run/module-secrets/db-password', 'utf8')).trim(), max: 5, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
    pool.on('error', () => { });
    const migrations = (await readdir('./migrations')).filter(f => /^\d{3}-[a-z-]+\.sql$/.test(f)).sort();
    const migrate = () => transaction(pool, async (db) => {
        await db.query('CREATE TABLE IF NOT EXISTS module_migrations(version integer PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
        await db.query('CREATE TABLE IF NOT EXISTS module_identity(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),installation_id uuid NOT NULL,module_id text NOT NULL)');
        await db.query('INSERT INTO module_identity(singleton,installation_id,module_id) VALUES(true,$1,$2) ON CONFLICT DO NOTHING', [runtime.installationId, runtime.moduleId]);
        const identity = (await db.query('SELECT * FROM module_identity')).rows[0];
        ensure(identity.installation_id === runtime.installationId && identity.module_id === definition.manifest.moduleId, 'Module database identity mismatch');
        const applied = (await db.query('SELECT * FROM module_migrations')).rows;
        ensure(migrations.length === runtime.persistence.schemaVersion && !applied.some(m => m.version > migrations.length), 'Unsupported schema version');
        for (let i = 0; i < migrations.length; i++) {
            const sql = await readFile('./migrations/' + migrations[i], 'utf8'), sha = digest(sql);
            ensure(runtime.persistence.migrations[i].sha256 === sha && !applied.some(m => m.version === i + 1 && m.sha256 !== sha), 'Migration content mismatch');
            if (!applied.some(m => m.version === i + 1)) {
                await db.query(sql);
                await db.query('INSERT INTO module_migrations(version,sha256) VALUES($1,$2)', [i + 1, sha]);
            }
        }
        if(definition.afterMigrate)await definition.afterMigrate({db,config:runtime.configuration,installationId:runtime.installationId,moduleId:definition.manifest.moduleId,actor:'module-runtime',permissions:[],...(typeof runtime.entityId==='string'?{entityId:runtime.entityId}:{}),...providerContext(runtime,definition.manifest.moduleId)});
        return migrations.length;
    });
    const ready = async () => { const identity = (await pool.query('SELECT * FROM module_identity')).rows[0], latest = (await pool.query('SELECT max(version) AS version FROM module_migrations')).rows[0]; ensure(identity?.installation_id === runtime.installationId && identity?.module_id === definition.manifest.moduleId && latest.version === runtime.persistence.schemaVersion, 'Schema or identity mismatch'); };
    const app = createBusinessServer(pool, (await readFile('/run/module-secrets/gateway-token', 'utf8')).trim(), runtime, definition, migrate, ready);
    let ticking = false;
    const timer = definition.tick ? setInterval(() => { if (ticking)
        return; ticking = true; void transaction(pool, db => definition.tick!({ db, config: runtime.configuration, installationId: runtime.installationId, moduleId: definition.manifest.moduleId, actor: 'module-runtime', permissions: [], ...(typeof runtime.entityId === 'string' ? { entityId: runtime.entityId } : {}),...providerContext(runtime,definition.manifest.moduleId) })).catch(() => { }).finally(() => { ticking = false; }); }, 30000).unref() : undefined;
    let working=false;
    const backgroundTimer=background?setInterval(()=>{if(working)return;working=true;void background(pool,runtime).catch(()=>{}).finally(()=>{working=false;});},2000).unref():undefined;
    app.addHook('onClose', async () => { if (timer)
        clearInterval(timer); if(backgroundTimer)clearInterval(backgroundTimer); await pool.end(); });
    for (const signal of ['SIGTERM', 'SIGINT'])
        process.once(signal, () => void app.close().then(() => process.exit(0)));
    await app.listen({ host: '0.0.0.0', port: 8080 });
}
