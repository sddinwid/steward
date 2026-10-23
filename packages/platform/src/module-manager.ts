import { createModuleBroker } from './module-broker.js';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { request } from 'node:https';
import { atLeast, canonical, digest, verifyPackage, validateConfiguration, assertCompatible, operationFor, type ModuleCatalog, type SignedModulePackage, type PublisherTrust } from '@steward/module-sdk';
import type { InstallationConfig } from '@steward/contracts';
import type pg from 'pg';
import type { Authentication, SecureApp, Account } from './security/auth.js';
import { signAssertion, fail } from './security/crypto.js';
import { audit, transaction } from './security/store.js';
import { RELEASE } from './config.js';

interface ModuleRuntimeConfig { catalogFile: string; trustFile: string; brokerUrl: string; caFile: string; tlsServerName: string }
export async function moduleRoutes(app: SecureApp, pool: pg.Pool, auth: Authentication, installation: InstallationConfig, key: string, configFile: string) {
  const runtime: ModuleRuntimeConfig = JSON.parse(await readFile(configFile, 'utf8'));
  async function catalog() {
    const trust: PublisherTrust = JSON.parse(await readFile(runtime.trustFile, 'utf8'));
    const catalog: ModuleCatalog = JSON.parse(await readFile(runtime.catalogFile, 'utf8'));
    if (catalog.catalogVersion !== 1 || !Array.isArray(catalog.packages) || catalog.packages.length > 100) fail(503, 'Module catalog is invalid');
    return { trust, catalog };
  }
  async function admin(req: Parameters<Authentication['session']>[0], mutate = false) {
    const actor = await auth.session(req, mutate);
    if (actor.role !== 'local_admin') fail(403, 'Worker-local module administrator required');
    return actor;
  }
  async function rows(client?: pg.PoolClient) { return (await (client ?? pool).query('SELECT * FROM module_installations ORDER BY module_id')).rows; }
  async function permissions(actor: Account, moduleId: string, declared: string[]) {
    if (actor.role === 'local_admin') return declared;
    if (actor.role !== 'module_user') return [];
    return (await pool.query('SELECT permission FROM module_permissions WHERE account_id=$1 AND module_id=$2', [actor.account_id, moduleId])).rows.map(r => r.permission).filter(p => declared.includes(p));
  }
  const broker = await createModuleBroker(configFile, installation, key);
  app.get('/api/v3/modules', async req => {
    await admin(req);
    const { catalog: c, trust } = await catalog();
    const installed = await rows();
    const available = c.packages.map(descriptor => {
      try {
        const p = verifyPackage(descriptor, trust);
        let compatibilityError: string | undefined;
        try { assertCompatible(p.manifest, RELEASE, installed.map(r => ({ moduleId: r.module_id, version: r.version, state: r.state }))); }
        catch (e) { compatibilityError = (e as Error).message; }
        return { packageId: p.manifest.moduleId + '@' + p.manifest.version, manifest: p.manifest, imageId: p.imageId, publisherId: p.publisherId, trusted: true, compatible: !compatibilityError, error: compatibilityError };
      } catch (e) { return { packageId: descriptor?.payload?.manifest?.moduleId + '@' + descriptor?.payload?.manifest?.version, trusted: false, compatible: false, error: (e as Error).message }; }
    });
    return { available, installed: installed.map(r => ({ moduleId: r.module_id, version: r.version, state: r.state, manifest: r.descriptor.payload.manifest,
      configuration: r.configuration, operationId: r.operation_id, errorCode: r.error_code, imageId: r.descriptor.payload.imageId })) };
  });
  app.get('/api/v3/modules/discovery', async req => {
    const actor = await auth.session(req);
    const { trust } = await catalog();
    const modules = [];
    for (const row of await rows()) {
      if (row.state !== 'active') continue;
      const p = verifyPackage(row.descriptor, trust);
      const allowed = await permissions(actor, row.module_id, p.manifest.api.map(a => a.permission));
      const api = p.manifest.api.filter(a => allowed.includes(a.permission));
      const ui = p.manifest.ui.filter(s => api.some(a => a.operationId === s.listOperation));
      const mcpTools=(p.manifest.mcpTools??[]).filter(t=>api.some(a=>a.operationId===t.operationId));
      if (ui.length || mcpTools.length) modules.push({ moduleId: row.module_id, version: row.version, name: p.manifest.name, api, ui, mcpTools });
    }
    return { modules };
  });
  app.post<{ Body: { packageId: string; operationId: string; configuration: unknown; recover?: boolean; upgrade?: boolean } }>('/api/v3/modules/install', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['packageId', 'operationId', 'configuration'], properties: {
      packageId: { type: 'string', maxLength: 120 }, operationId: { type: 'string', format: 'uuid' }, configuration: { type: 'object' }, recover: { type: 'boolean' }, upgrade: { type: 'boolean' }
    } } }
  }, async (req, reply) => {
    const actor = await admin(req, true);
    const { catalog: c, trust } = await catalog();
    const descriptor = c.packages.find(d => d.payload.manifest.moduleId + '@' + d.payload.manifest.version === req.body.packageId);
    if (!descriptor) fail(404, 'Package is not available');
    try { verifyPackage(descriptor, trust); validateConfiguration(descriptor.payload.manifest, req.body.configuration); }
    catch (e) { fail(400, (e as Error).message); }
    const m = descriptor.payload.manifest;
    const client = await pool.connect();
    let locked = false;
    try {
      locked = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', ['module:' + m.moduleId])).rows[0].acquired;
      if (!locked) fail(409, 'A module operation is already in progress');
      const installed = await rows(client);
      try { assertCompatible(m, RELEASE, installed.map(r => ({ moduleId: r.module_id, version: r.version, state: r.state }))); } catch (e) { fail(409, (e as Error).message); }
      const existing = installed.find(r => r.module_id === m.moduleId);
      if (m.replication && !(await client.query("SELECT 1 FROM local_enrollment WHERE singleton AND state='enrolled'")).rowCount) fail(409, 'Enrollment is required for this module');
      if (installed.some(r => r.operation_id === req.body.operationId && r.module_id !== m.moduleId)) fail(409, 'Operation ID belongs to another module');
      if (existing?.operation_id === req.body.operationId && (canonical(existing.descriptor) !== canonical(descriptor) || canonical(existing.configuration) !== canonical(req.body.configuration))) fail(409, 'Operation ID is bound to a different installation request');
      // A successful upgrade is now the installed version. Check its bound
      // request identity before requiring the candidate to be newer again.
      if(existing?.operation_id===req.body.operationId&&!['failed','installing'].includes(existing.state))return{state:existing.state,moduleId:m.moduleId,operationId:existing.operation_id};
      if (req.body.upgrade && (!existing || !atLeast(m.version, existing.version) || m.version === existing.version)) fail(409, 'Upgrade requires a newer compatible package');
      if (existing && !req.body.upgrade && existing.state !== 'failed' && existing.state !== 'installing') {
        if (digest(canonical(existing.descriptor)) !== digest(canonical(descriptor)) || canonical(existing.configuration) !== canonical(req.body.configuration)) fail(409, 'Module is already installed with a different package or configuration');
        return { state: existing.state, moduleId: m.moduleId, operationId: existing.operation_id };
      }
      if (existing && ['failed','installing'].includes(existing.state) && existing.operation_id !== req.body.operationId && !req.body.recover) fail(409, 'Use explicit recovery for an interrupted or failed installation');
      await client.query(`INSERT INTO module_installations(module_id,version,descriptor,configuration,state,operation_id) VALUES($1,$2,$3,$4,'installing',$5)
        ON CONFLICT(module_id) DO UPDATE SET version=excluded.version,descriptor=excluded.descriptor,configuration=excluded.configuration,state='installing',operation_id=excluded.operation_id,error_code=NULL,updated_at=now()`,
        [m.moduleId, m.version, descriptor, req.body.configuration, req.body.operationId]);
      await audit(client, actor.account_id, 'module.install_started', m.moduleId, { version: m.version, operationId: req.body.operationId });
      try {
        const result = await broker('install', descriptor, req.body.configuration, { upgrade: req.body.upgrade === true });
        if (result.status !== 200) throw new Error(result.value.error ?? 'MODULE_INSTALL_FAILED');
        await client.query("UPDATE module_installations SET state='installed',error_code=NULL,updated_at=now() WHERE module_id=$1", [m.moduleId]);
        await audit(client, actor.account_id, 'module.installed', m.moduleId, { version: m.version });
        return { state: 'installed', moduleId: m.moduleId };
      } catch (e) {
        const error = (e as Error).message;
        const code = /^[A-Z_]+$/.test(error) ? error : 'MODULE_RUNTIME_UNAVAILABLE';
        await client.query("UPDATE module_installations SET state='failed',error_code=$1,updated_at=now() WHERE module_id=$2", [code, m.moduleId]);
        await audit(client, actor.account_id, 'module.install_failed', m.moduleId, { code });
        return reply.code(503).send({ error: code, state: 'failed', recovery: 'Retry this trusted package, or explicitly recover using a compatible corrected package. Existing databases are retained.' });
      }
    } finally { if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['module:' + m.moduleId]); client.release(); }
  });
  app.post<{ Params: { moduleId: string }; Body: { action: 'activate' | 'deactivate' } }>('/api/v3/modules/:moduleId/lifecycle', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['action'], properties: { action: { type: 'string', enum: ['activate', 'deactivate'] } } } }
  }, async req => {
    const actor = await admin(req, true);
    const client = await pool.connect(); let locked = false;
    try {
      locked = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS acquired', ['module:' + req.params.moduleId])).rows[0].acquired;
      if (!locked) fail(409, 'A module operation is already in progress');
      const installed = await rows(client); const row = installed.find(r => r.module_id === req.params.moduleId);
      if (!row || ['failed', 'installing'].includes(row.state)) fail(409, 'Module installation must complete first');
      const { trust } = await catalog(); const p = verifyPackage(row.descriptor, trust);
      if (req.body.action === 'activate') assertCompatible(p.manifest, RELEASE, installed.map(r => ({ moduleId: r.module_id, version: r.version, state: r.state })));
      else if (installed.some(r => r.state === 'active' && r.descriptor.payload.manifest.dependencies.some((d: { moduleId: string }) => d.moduleId === row.module_id))) fail(409, 'Deactivate dependent modules first');
      const result = await broker(req.body.action, row.descriptor, row.configuration);
      if (result.status !== 200) fail(503, result.value.error ?? 'Module runtime unavailable');
      const state = req.body.action === 'activate' ? 'active' : 'disabled';
      await client.query('UPDATE module_installations SET state=$1,updated_at=now() WHERE module_id=$2', [state, row.module_id]);
      await audit(client, actor.account_id, 'module.' + state, row.module_id);
      return { state };
    } finally { if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['module:' + req.params.moduleId]); client.release(); }
  });
  app.get('/api/v3/modules/accounts', async req => {
    await admin(req); return { accounts: (await pool.query("SELECT account_id,username,role FROM security_accounts WHERE role IN ('local_admin','module_user') AND enabled ORDER BY username")).rows };
  });
  app.put<{Params:{moduleId:string};Body:{configuration:unknown}}>('/api/v3/modules/:moduleId/configuration',{schema:{body:{type:'object',additionalProperties:false,required:['configuration'],properties:{configuration:{type:'object'}}}}},async req=>{
    const actor=await admin(req,true),client=await pool.connect();let locked=false;
    try{
      locked=(await client.query('SELECT pg_try_advisory_lock(hashtext($1)) acquired',['module:'+req.params.moduleId])).rows[0].acquired;
      if(!locked)fail(409,'A module operation is already in progress');
      const row=(await rows(client)).find(r=>r.module_id===req.params.moduleId);if(!row||['failed','installing'].includes(row.state))fail(409,'Module installation must complete first');
      const {trust}=await catalog(),p=verifyPackage(row.descriptor,trust);validateConfiguration(p.manifest,req.body.configuration);
      const result=await broker('configure',row.descriptor,req.body.configuration);if(result.status!==200)fail(503,result.value.error??'Module configuration unavailable');
      await client.query('UPDATE module_installations SET configuration=$1,updated_at=now() WHERE module_id=$2',[req.body.configuration,row.module_id]);
      await audit(client,actor.account_id,'module.configuration_updated',row.module_id);return{saved:true};
    }finally{if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1))',['module:'+req.params.moduleId]);client.release();}
  });
  app.put<{ Body: { accountId: string; moduleId: string; permissions: string[] } }>('/api/v3/modules/permissions', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['accountId', 'moduleId', 'permissions'], properties: {
      accountId: { type: 'string', format: 'uuid' }, moduleId: { type: 'string', maxLength: 80 }, permissions: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 120 } }
    }
  } } }, async req => {
    const actor = await admin(req, true); const b = req.body;
    return transaction(pool, async sql => {
      if (!(await sql.query("SELECT account_id FROM security_accounts WHERE account_id=$1 AND role='module_user' AND enabled", [b.accountId])).rowCount) fail(400, 'A Worker-local module user is required');
      const row = (await sql.query('SELECT descriptor FROM module_installations WHERE module_id=$1', [b.moduleId])).rows[0];
      if (!row || b.permissions.some(p => !row.descriptor.payload.manifest.api.some((a: { permission: string }) => a.permission === p))) fail(400, 'Undeclared module permission');
      await sql.query('DELETE FROM module_permissions WHERE account_id=$1 AND module_id=$2', [b.accountId, b.moduleId]);
      for (const permission of new Set(b.permissions)) await sql.query('INSERT INTO module_permissions(account_id,module_id,permission) VALUES($1,$2,$3)', [b.accountId, b.moduleId, permission]);
      await audit(sql, actor.account_id, 'module.permissions_updated', b.moduleId, { accountId: b.accountId, permissions: b.permissions });
      return { saved: true };
    });
  });
  app.route<{ Params: { moduleId: string; '*': string } }>({ method: ['GET', 'POST', 'PUT'], url: '/api/v3/modules/:moduleId/api/*', handler: async (req, reply) => {
    const actor = await auth.session(req, req.method !== 'GET');
    const row = (await pool.query('SELECT * FROM module_installations WHERE module_id=$1', [req.params.moduleId])).rows[0];
    if (!row || row.state !== 'active') fail(404, 'Module is not active');
    const { trust } = await catalog(); const p = verifyPackage(row.descriptor, trust);
    const query=new URLSearchParams();for(const [k,v]of Object.entries(req.query as Record<string,unknown>)) {if(typeof v!=='string')fail(400,'Invalid query parameter');query.append(k,v);}
    const path = '/' + req.params['*']+(query.size?'?'+query.toString():''); const op = operationFor(p.manifest, req.method, path);
    if (!op) fail(404, 'Module operation is not declared');
    const allowed = await permissions(actor, row.module_id, p.manifest.api.map(a => a.permission));
    if (!allowed.includes(op.permission)) fail(403, 'Module permission denied');
    const result = await broker('proxy', row.descriptor, row.configuration, { method: req.method, path, ...(req.method === 'GET' ? {} : { body: req.body }), permissions: allowed, actorId: actor.account_id });
    if (req.method !== 'GET' && result.status < 400) await audit(pool, actor.account_id, 'module.api_mutation', row.module_id, { operation: op.operationId });
    return reply.code(result.status).send(result.value);
  } });
}
