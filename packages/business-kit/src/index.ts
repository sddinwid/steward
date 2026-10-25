export * from './simulation.js';
import {setSimulationContext,simulationEpoch,inferSimulationContext} from './simulation.js';
import {simulationEpochSql,sameSimulationDataset,type SimulationOrigin} from '@steward/module-sdk';
import Fastify, { type FastifyRequest, type FastifyInstance } from 'fastify';
import pg from 'pg';
import { Ajv } from 'ajv';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { canonical, digest, integrationSql, validateCommand, operationFor, INTEGRATION_PROTOCOL, type IntegrationCommand, type ModulePackageManifest } from '@steward/module-sdk';
export * from './schema.js';
/** JSON values are accepted only after a closed, module-owned schema validates them. */
export type Data = Record<string, any>;
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
    simulation?:SimulationOrigin;
    db: pg.PoolClient;
    config: Data;
    installationId: string;
    actor: string;
    permissions: string[];
    moduleId: string;
}
export interface Resource {
    kind: string;
    path: string;
    schema: Data;
    key: string;
    prepare?: (data: Data, previous: RecordValue | null, ctx: Context) => Promise<Data>;
    after?: (record: RecordValue, previous: RecordValue | null, ctx: Context) => Promise<void>;
}
export interface Action {
    path: string;
    permission: string;
    kind: string;
    run: (record: RecordValue, ctx: Context) => Promise<Data>;
}
export interface Definition {
    manifest: ModulePackageManifest;
    resources: Resource[];
    actions: Action[];
    receive?: (command: IntegrationCommand, ctx: Context) => Promise<Data>;
    acknowledge?: (command: IntegrationCommand, status: 'delivered' | 'rejected', result: Data, ctx: Context) => Promise<void>;
    report?: (ctx: Context) => Promise<Data>;
    queries?: {
        path: string;
        run: (ctx: Context, query?: Record<string,string>) => Promise<Data>;
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
export async function transaction<T>(pool: pg.Pool, run: (db: pg.PoolClient) => Promise<T>): Promise<T> {
    const db = await pool.connect();
    try {
        await db.query('BEGIN');
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
export async function enqueueCapability(ctx:Context,capabilityId:string,operation:string,aggregateId:string,payload:Data) {
    await inferSimulationContext(ctx,aggregateId);
    const last=Number((await ctx.db.query("SELECT COALESCE(max((envelope->>'sequence')::bigint),0) n FROM integration_outbox WHERE envelope->>'aggregateId'=$1 AND envelope->'capability'->>'capabilityId'=$2",[aggregateId,capabilityId])).rows[0].n);
    const envelope:IntegrationCommand={protocol:INTEGRATION_PROTOCOL,commandId:randomUUID(),sourceModuleId:ctx.moduleId,targetModuleId:'steward.capability',command:operation,version:1,aggregateId,sequence:last+1,occurredAt:new Date().toISOString(),payload,capability:{capabilityId,operation},...(ctx.simulation?{simulation:ctx.simulation}:{})};
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
export function createBusinessServer(pool: pg.Pool, token: string, runtime: Data, definition: Definition, migrate: () => Promise<number>, ready: () => Promise<void>) {
    const app = Fastify({ logger: false, bodyLimit: definition.manifest.connector?196608:49152, requestTimeout: 10000 });
    const ctx = (db: pg.PoolClient, request?: FastifyRequest): Context => ({ db, config: runtime.configuration, installationId: runtime.installationId, moduleId: definition.manifest.moduleId, actor: String(request?.headers['x-steward-actor'] ?? 'module-runtime'), permissions: request ? permissions(request) : [] });
    app.addHook('onRequest', async (request, reply) => {
        if (request.url === '/health')
            return;
        const a = Buffer.from(String(request.headers.authorization ?? '')), b = Buffer.from('Bearer ' + token);
        if (a.length !== b.length || !timingSafeEqual(a, b))
            return reply.code(401).send({ error: 'Module gateway authentication required' });
        const op = operationFor(definition.manifest, request.method, request.url);
        const privatePaths = ['/ready', '/internal/migrate', '/integration-outbox', '/integration-inbox', '/integration-ack', ...(definition.manifest.connector?['/connector-webhook']:[])];
        if (!op && !privatePaths.includes(request.url))
            return reply.code(403).send({ error: 'Undeclared module operation' });
        if (op && !permissions(request).includes(op.permission))
            return reply.code(403).send({ error: 'Module permission denied' });
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
        app.get<{
            Querystring: Record<string, string>;
        }>(resource.path, async (req) => transaction(pool, async (db) => {
            const c = ctx(db, req), q = req.query, limit = Number(q.limit ?? 20), offset = Number(q.offset ?? 0);
            ensure(Number.isInteger(limit) && limit >= 1 && limit <= 20 && Number.isInteger(offset) && offset >= 0 && offset <= 100000, 'Invalid pagination', 400);
            const allowed = Object.keys(resource.schema.properties).concat('id', 'revision', ...definition.manifest.ui.filter(s => definition.manifest.api.find(a => a.operationId === s.listOperation)?.path === resource.path).flatMap(s => s.fields.map(f => f.name)));
            const fields = q.fields?.split(',');
            ensure(!fields || fields.every(f => allowed.includes(f)), 'Unknown selected field', 400);
            const rows = (await db.query("SELECT * FROM business_records WHERE kind=$1 AND ($2='' OR data->>'status'=$2) AND ($3='' OR key ILIKE $3 ESCAPE '!') ORDER BY key LIMIT $4 OFFSET $5", [resource.kind, q.status ?? '', q.q ? '%' + q.q.replace(/[!%_]/g, '!$&') + '%' : '', limit + 1, offset])).rows;
            return { records: rows.slice(0, limit).map(r => { const value = publicRecord(convert(r)); return fields ? Object.fromEntries(fields.map(f => [f, value[f]])) : value; }), nextOffset: rows.length > limit ? offset + limit : null, summary: 'Module-owned records; quantities and money use the declared units.' };
        }));
        app.post<{
            Body: Data;
        }>(resource.path, async (req, reply) => {
            ensure(validate(req.body), 'Invalid record: ' + ajv.errorsText(validate.errors), 400);
            return reply.code(201).send(await transaction(pool, async (db) => {
                const c = ctx(db, req), key = String(req.body[resource.key]);
                const previous = await find(c, resource.kind, key);
                if (previous) {
                    const original = (await db.query('SELECT actor,digest,response FROM business_requests WHERE operation=$1 AND response->>\'id\'=$2', [resource.kind + ':create', previous.id])).rows[0];
                    ensure(original?.actor === c.actor && original?.digest === digest(canonical(req.body)), 'Business key already belongs to another creation request', 409);
                    // Creation retries return their original receipt, never a later private
                    // record snapshot. Legacy receipts without a snapshot disclose only identity.
                    return { record: original.response.record ?? { id: previous.id }, replayed: true };
                }
                const data = resource.prepare ? await resource.prepare({ ...req.body }, null, c) : req.body;
                const record = await save(c, resource.kind, key, data);
                await resource.after?.(record, null, c);
                await db.query('INSERT INTO business_requests(request_id,actor,operation,digest,response) VALUES($1,$2,$3,$4,$5)', [randomUUID(), c.actor, resource.kind + ':create', digest(canonical(req.body)), { id: record.id, record: publicRecord(record) }]);
                await db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)', [c.actor, resource.kind + ':create', record.id]);
                return { record: publicRecord(record) };
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
            const c = ctx(db, req), previous = await get(c, resource.kind, req.params.id);
            ensure(previous.revision === revision, 'Revision conflict', 409);
            ensure(String(input[resource.key]) === previous.key, 'Business key cannot change', 409);
            const data = resource.prepare ? await resource.prepare(input, previous, c) : input;
            const record = await save(c, resource.kind, previous.key, data, previous);
            await resource.after?.(record, previous, c);
            await db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)', [c.actor, resource.kind + ':update', record.id]);
            return { record: publicRecord(record) };
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
        }>(action.path, { schema: { params: idParams, body: { type: 'object', additionalProperties: false, required: ['revision', 'requestId'], properties: { revision: { type: 'integer', minimum: 1 }, requestId: { type: 'string', pattern: uuidPattern } } } } }, async (req) => transaction(pool, async (db) => {
            const c = ctx(db, req);
            ensure(c.permissions.includes(action.permission), 'Action permission denied', 403);
            const hash = digest(canonical({ path: action.path, id: req.params.id, body: req.body }));
            const cached = (await db.query('SELECT * FROM business_requests WHERE request_id=$1', [req.body.requestId])).rows[0];
            if (cached) {
                ensure(cached.actor === c.actor && cached.digest === hash, 'Request identity conflict', 409);
                return cached.response;
            }
            const record = await get(c, action.kind, req.params.id);
            ensure(record.revision === req.body.revision, 'Revision conflict', 409);
            if(record.data.simulation){setSimulationContext(c,record.data.simulation);ensure(await simulationEpoch(c),'SIMULATION_DATASET_CLOSED',403);}
            const response = await action.run(record, c);
            if(c.simulation)await db.query('INSERT INTO business_requests(request_id,actor,operation,digest,response,simulation) VALUES($1,$2,$3,$4,$5,$6)',[req.body.requestId,c.actor,action.path,hash,response,c.simulation]);
            else await db.query('INSERT INTO business_requests(request_id,actor,operation,digest,response) VALUES($1,$2,$3,$4,$5)', [req.body.requestId, c.actor, action.path, hash, response]);
            await db.query('INSERT INTO business_audit(actor,operation,record_id) VALUES($1,$2,$3)', [c.actor, action.path, record.id]);
            return response;
        }));
    }
    app.get('/integration-status', async (req) => transaction(pool, async (db) => ({ records: (await db.query('SELECT command_id AS id,envelope->>\'command\' AS command,envelope->>\'targetModuleId\' AS target,status,attempts,last_error AS error,created_at AS created FROM integration_outbox ORDER BY created_at DESC LIMIT 20')).rows })));
    if (definition.report)
        app.get('/reports', async (req) => transaction(pool, async (db) => { const report = await definition.report!(ctx(db, req)); if (Array.isArray(report.records) && report.records.length === 0)
            report.records = Object.entries(report).filter(([k]) => !['records', 'source', 'summary'].includes(k)).map(([metric, value]) => ({ id: metric, metric, value })); return report; }));
    for (const query of definition.queries ?? [])
        app.get<{Querystring:Record<string,string>}>(query.path, async (req) => transaction(pool, async (db) => query.run(ctx(db, req),req.query)));
    registerIntegrationRoutes(app, pool, runtime, definition);
    app.setErrorHandler((error, _req, reply) => { const e = error as any; return reply.code(error instanceof BusinessError ? error.status : e.code === '23505' ? 409 : e.statusCode && e.statusCode < 500 ? e.statusCode : 500).send({ error: error instanceof BusinessError ? error.message : e.code === '23505' ? 'Business key already exists' : 'Business module request failed' }); });
    return app;
}
export function registerIntegrationRoutes(app: FastifyInstance, pool: pg.Pool, runtime: Data, definition: Definition) {
    const ctx = (db: pg.PoolClient): Context => ({ db, config: runtime.configuration, installationId: runtime.installationId, moduleId: definition.manifest.moduleId, actor: 'module-runtime', permissions: [] });
    app.get('/integration-outbox', async () => ({ commands: (await pool.query("SELECT envelope FROM integration_outbox WHERE status='pending' AND next_attempt_at<=now() ORDER BY created_at,command_id LIMIT 4")).rows.map(r => r.envelope) }));
    app.post<{
        Body: IntegrationCommand;
    }>('/integration-inbox', async (req, reply) => {
        const result = await transaction(pool, async (db) => {
            const c = ctx(db);
            ensure(c.config.integrationsEnabled === true, 'Integrations disabled', 403);
            validateCommand(req.body);
            ensure(!req.body.simulation||definition.manifest.simulation&&!definition.manifest.connector&&runtime.configuration.mode!=='live','SIMULATION_LIVE_PROVIDER_DENIED',403);
            ensure(!['engine','provider'].includes(definition.manifest.simulation?.role??'')||req.body.simulation,'SIMULATION_PROVENANCE_REQUIRED',403);
            ensure(req.headers['x-steward-integration-source'] === req.body.sourceModuleId && req.headers['x-steward-installation'] === c.installationId, 'Integration identity mismatch', 403);
            const peer = definition.manifest.integration?.peers.find(p => p.moduleId === req.body.sourceModuleId);
            // This header is supplied only by the authenticated local host after
            // verifying a persisted SSMA approval. Ordinary gateway APIs cannot
            // forward it or address the private inbox.
            const capability = typeof req.headers['x-steward-capability'] === 'string' ? definition.manifest.smart?.provides.find(c => c.capabilityId === req.headers['x-steward-capability']) : undefined;
            ensure(peer?.receives.some(v => v.command === req.body.command && v.version === req.body.version) || capability?.operations.some(o => o.command === req.body.command && o.mode === 'durable'), 'Command is not authorized', 403);
            ensure(definition.receive, 'Integration command unsupported', 403);
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
        if (row.status !== 'pending') {
            ensure(b.status === row.status || b.status === 'retry', 'Terminal acknowledgment conflict', 409);
            return { status: row.status };
        }
        const acknowledgmentContext=ctx(db);if(row.envelope.simulation)setSimulationContext(acknowledgmentContext,row.envelope.simulation);
        if (b.status !== 'retry'&&(!acknowledgmentContext.simulation||await simulationEpoch(acknowledgmentContext)))
            await definition.acknowledge?.(row.envelope, b.status, b.result ?? {}, acknowledgmentContext);
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
        return migrations.length;
    });
    const ready = async () => { const identity = (await pool.query('SELECT * FROM module_identity')).rows[0], latest = (await pool.query('SELECT max(version) AS version FROM module_migrations')).rows[0]; ensure(identity?.installation_id === runtime.installationId && identity?.module_id === definition.manifest.moduleId && latest.version === runtime.persistence.schemaVersion, 'Schema or identity mismatch'); };
    const app = createBusinessServer(pool, (await readFile('/run/module-secrets/gateway-token', 'utf8')).trim(), runtime, definition, migrate, ready);
    let ticking = false;
    const timer = definition.tick ? setInterval(() => { if (ticking)
        return; ticking = true; void transaction(pool, db => definition.tick!({ db, config: runtime.configuration, installationId: runtime.installationId, moduleId: definition.manifest.moduleId, actor: 'module-runtime', permissions: [] })).catch(() => { }).finally(() => { ticking = false; }); }, 30000).unref() : undefined;
    let working=false;
    const backgroundTimer=background?setInterval(()=>{if(working)return;working=true;void background(pool,runtime).catch(()=>{}).finally(()=>{working=false;});},2000).unref():undefined;
    app.addHook('onClose', async () => { if (timer)
        clearInterval(timer); if(backgroundTimer)clearInterval(backgroundTimer); await pool.end(); });
    for (const signal of ['SIGTERM', 'SIGINT'])
        process.once(signal, () => void app.close().then(() => process.exit(0)));
    await app.listen({ host: '0.0.0.0', port: 8080 });
}
