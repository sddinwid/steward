import Fastify from 'fastify';
import pg from 'pg';
import { request, type RequestOptions } from 'node:http';
import { readFile, readdir, mkdir, writeFile, open, rename } from 'node:fs/promises';
import { randomBytes, randomUUID, verify } from 'node:crypto';
import { canonical, digest, verifyPackage, validateConfiguration, operationFor, type SignedModulePackage, type PublisherTrust, type ModuleCatalog } from '@steward/module-sdk';

interface HostConfig {
  installationId: string; workerPublicKey: string; catalogFile: string; trustFile: string;
  project: string; workerKey: string; databaseHost: string; databasePasswordFile: string;
  databaseNetwork: string; moduleNetwork: string; stateVolume: string;
}
const config: HostConfig = JSON.parse(await readFile(process.env.MODULE_HOST_CONFIG!, 'utf8'));
const stateRoot = '/var/lib/steward/modules';
const pool = new pg.Pool({ host: config.databaseHost, user: 'postgres', database: 'postgres', password: (await readFile(config.databasePasswordFile, 'utf8')).trim(),
  max: 5, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
pool.on('error', () => {});
await pool.query('CREATE TABLE IF NOT EXISTS module_host_nonces(nonce uuid PRIMARY KEY, expires_at timestamptz NOT NULL)');
await mkdir(stateRoot, { recursive: true });
const app = Fastify({ https: { key: await readFile('/run/secrets/tls_key'), cert: await readFile('/run/secrets/tls_cert'), minVersion: 'TLSv1.3' }, logger: false, bodyLimit: 65536, requestTimeout: 60000 });
function failure(code: string): never { throw Object.assign(new Error(code), { code }); }
function http(options: RequestOptions, body?: unknown): Promise<{ status: number; value: any }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ ...options, headers: { ...options.headers, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) }, timeout: 15000 }, res => {
      let value = ''; res.setEncoding('utf8');
      res.on('data', chunk => { value += chunk; if (value.length > 1048576) req.destroy(new Error('Response exceeds limit')); });
      res.on('end', () => { try { resolve({ status: res.statusCode ?? 500, value: value ? JSON.parse(value) : {} }); } catch { reject(new Error('Invalid runtime response')); } });
    });
    req.on('timeout', () => req.destroy(new Error('Runtime timeout'))); req.on('error', reject); req.end(data);
  });
}
async function docker(method: string, path: string, body?: unknown, allowed = [200, 201, 204, 304]) {
  const result = await http({ socketPath: '/var/run/docker.sock', path: '/v1.51' + path, method }, body);
  if (!allowed.includes(result.status)) failure('CONTAINER_PROVIDER_FAILED');
  return result;
}
const slug = (id: string) => 'm_' + digest(id).slice(0, 20);
const containerName = (id: string) => `${config.project}-${config.workerKey}-${slug(id)}`;
async function ownedContainer(id: string) {
  const result = await docker('GET', '/containers/' + containerName(id) + '/json', undefined, [200, 404]);
  if (result.status === 404) return undefined;
  const c = result.value;
  if (c.Config.Labels['steward.installation'] !== config.installationId || c.Config.Labels['steward.module'] !== id || c.Config.Labels['steward.managed-by'] !== 'module-host-v1') failure('RESOURCE_OWNERSHIP_MISMATCH');
  return c;
}
async function state(id: string): Promise<any | undefined> {
  try { return JSON.parse(await readFile(`${stateRoot}/${slug(id)}/state.json`, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; }
}
async function atomicJson(file: string, value: unknown, mode: number) {
  const temporary = file + '.tmp-' + randomUUID();
  const handle = await open(temporary, 'wx', mode);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file);
  const parent = await open(file.slice(0, file.lastIndexOf('/')), 'r');
  try { await parent.sync(); } finally { await parent.close(); }
}
async function save(id: string, value: unknown) { await atomicJson(`${stateRoot}/${slug(id)}/state.json`, value, 0o600); }
async function callModule(id: string, method: string, path: string, body?: unknown) {
  const token = (await readFile(`${stateRoot}/${slug(id)}/gateway-token`, 'utf8')).trim();
  return http({ host: containerName(id), port: 8080, method, path, headers: { authorization: 'Bearer ' + token } }, body);
}
async function ready(id: string) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { const result = await callModule(id, 'GET', '/health'); if (result.status === 200) return; } catch { /* Container is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  failure('MODULE_START_FAILED');
}
async function install(descriptor: SignedModulePackage, configuration: unknown) {
  const payload = descriptor.payload; const m = payload.manifest; const id = m.moduleId;
  const inspected = await docker('GET', '/images/' + payload.imageId + '/json', undefined, [200, 404]);
  if (inspected.status !== 200) failure('IMAGE_UNAVAILABLE');
  if (inspected.value.Id !== payload.imageId || inspected.value.Config.Labels?.['steward.module.id'] !== id || inspected.value.Config.Labels?.['steward.module.version'] !== m.version) failure('IMAGE_IDENTITY_MISMATCH');
  const base = `${stateRoot}/${slug(id)}`;
  await mkdir(base, { recursive: true, mode: 0o755 });
  let existing = await state(id);
  if (!existing) {
    // Write secrets once before creating resources. Retrying never rotates an existing role password.
    const password = randomBytes(32).toString('hex');
    const token = randomBytes(32).toString('hex');
    for (const [file, value] of [['db-password', password], ['gateway-token', token]]) {
      try { await writeFile(base + '/' + file, value!, { flag: 'wx', mode: 0o444 }); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    }
    existing = { moduleId: id, phase: 'preparing' }; await save(id, existing);
  }
  const password = (await readFile(base + '/db-password', 'utf8')).trim();
  const db = slug(id);
  // Identifiers and password are generated, never supplied by a package.
  if (!(await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [db])).rowCount) await pool.query(`CREATE ROLE ${db} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  if (!(await pool.query('SELECT 1 FROM pg_database WHERE datname=$1', [db])).rowCount) await pool.query(`CREATE DATABASE ${db} OWNER ${db}`);
  await pool.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
  await pool.query(`GRANT CONNECT ON DATABASE ${db} TO ${db}`);
  await atomicJson(base + '/runtime.json', { installationId: config.installationId, moduleId: id, version: m.version,
    databaseHost: config.databaseHost, databaseName: db, databaseUser: db, configuration, persistence: m.persistence }, 0o644);
  let container = await ownedContainer(id);
  if (container && container.Image !== payload.imageId) {
    if (existing.phase === 'active') failure('ACTIVE_UPGRADE_UNSUPPORTED');
    await docker('POST', '/containers/' + containerName(id) + '/stop?t=5', undefined, [204, 304]);
    await docker('DELETE', '/containers/' + containerName(id), undefined, [204]);
    container = undefined;
  }
  if (!container) await docker('POST', '/containers/create?name=' + containerName(id), {
    Image: payload.imageId, User: '1000:1000', Env: ['NODE_ENV=production', 'MODULE_RUNTIME_FILE=/run/module-secrets/runtime.json'],
    Labels: { 'steward.managed-by': 'module-host-v1', 'steward.installation': config.installationId, 'steward.module': id },
    HostConfig: { ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], PidsLimit: 100, Memory: 268435456,
      RestartPolicy: { Name: 'unless-stopped' }, NetworkMode: config.moduleNetwork,
      Mounts: [{ Type: 'volume', Source: config.stateVolume, Target: '/run/module-secrets', ReadOnly: true, VolumeOptions: { Subpath: slug(id) } }] },
    NetworkingConfig: { EndpointsConfig: { [config.moduleNetwork]: { Aliases: [containerName(id)] }, [config.databaseNetwork]: {} } }
  });
  await save(id, { moduleId: id, phase: 'installing', descriptorDigest: digest(canonical(descriptor)), version: m.version });
  await docker('POST', '/containers/' + containerName(id) + '/start');
  await ready(id);
  const migration = await callModule(id, 'POST', '/internal/migrate', {});
  if (migration.status !== 200) {
    await save(id, { moduleId: id, phase: 'failed', version: m.version });
    await docker('POST', '/containers/' + containerName(id) + '/stop?t=5', undefined, [204, 304]);
    failure('MIGRATION_FAILED');
  }
  await docker('POST', '/containers/' + containerName(id) + '/stop?t=5', undefined, [204, 304]);
  await save(id, { moduleId: id, phase: 'installed', version: m.version, imageId: payload.imageId });
  return { state: 'installed', schemaVersion: migration.value.schemaVersion };
}
app.get('/health', async () => ({ status: 'ok' }));
app.post<{ Body: { payload: any; signature: string } }>('/control', async (req, reply) => {
  const envelope = req.body; const p = envelope?.payload;
  if (!p || p.protocol !== 'steward-module-control-v1' || p.installationId !== config.installationId || !/^[0-9a-f-]{36}$/.test(p.nonce) ||
      !Number.isSafeInteger(p.issuedAt) || Math.abs(Date.now() - p.issuedAt) > 60000 || typeof envelope.signature !== 'string' ||
      !verify(null, Buffer.from(canonical(p)), config.workerPublicKey, Buffer.from(envelope.signature, 'base64url'))) return reply.code(403).send({ error: 'CONTROL_PROOF_REJECTED' });
  await pool.query('DELETE FROM module_host_nonces WHERE expires_at<now()');
  if (!(await pool.query("INSERT INTO module_host_nonces(nonce,expires_at) VALUES($1,now()+interval '5 minutes') ON CONFLICT DO NOTHING", [p.nonce])).rowCount) return reply.code(409).send({ error: 'CONTROL_REPLAY_REJECTED' });
  const trust: PublisherTrust = JSON.parse(await readFile(config.trustFile, 'utf8'));
  const catalog: ModuleCatalog = JSON.parse(await readFile(config.catalogFile, 'utf8'));
  const descriptor = catalog.packages.find(d => d.payload.manifest.moduleId === p.moduleId && d.payload.manifest.version === p.version);
  if (!descriptor) return reply.code(404).send({ error: 'PACKAGE_NOT_AVAILABLE' });
  const payload = verifyPackage(descriptor, trust);
  validateConfiguration(payload.manifest, p.configuration);
  // Cross-process, transaction-scoped lock: even a broker restart cannot allow overlapping lifecycle actions.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query(p.operation === 'proxy'
      ? 'SELECT pg_try_advisory_xact_lock_shared(hashtext($1)) AS acquired'
      : 'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', [p.moduleId]);
    if (!lock.rows[0].acquired) return reply.code(409).send({ error: 'OPERATION_IN_PROGRESS' });
    if (p.operation === 'install') return await install(descriptor, p.configuration);
    const current = await state(p.moduleId);
    if (!current || current.version !== p.version) failure('MODULE_NOT_INSTALLED');
    if (p.operation === 'activate') {
      const c = await ownedContainer(p.moduleId); if (!c || c.Image !== payload.imageId) failure('RESOURCE_OWNERSHIP_MISMATCH');
      await docker('POST', '/containers/' + containerName(p.moduleId) + '/start'); await ready(p.moduleId);
      const r = await callModule(p.moduleId, 'GET', '/ready'); if (r.status !== 200) failure('MODULE_NOT_READY');
      await save(p.moduleId, { ...current, phase: 'active' }); return { state: 'active' };
    }
    if (p.operation === 'deactivate') {
      await ownedContainer(p.moduleId);
      await docker('POST', '/containers/' + containerName(p.moduleId) + '/stop?t=5', undefined, [204, 304]);
      await save(p.moduleId, { ...current, phase: 'disabled' }); return { state: 'disabled' };
    }
    if (p.operation === 'proxy') {
      if (current.phase !== 'active') return reply.code(409).send({ error: 'MODULE_DISABLED' });
      const op = operationFor(payload.manifest, p.method, p.path);
      if (!op || !Array.isArray(p.permissions) || !p.permissions.includes(op.permission)) return reply.code(403).send({ error: 'MODULE_PERMISSION_DENIED' });
      const result = await callModule(p.moduleId, p.method, p.path, p.body);
      return reply.code(result.status).send(result.value);
    }
    return reply.code(400).send({ error: 'UNSUPPORTED_OPERATION' });
  } finally { await client.query('ROLLBACK'); client.release(); }
});
app.setErrorHandler((error, _request, reply) => {
  const code = (error as { code?: string }).code;
  reply.code(503).send({ error: code && /^[A-Z_]+$/.test(code) ? code : 'MODULE_RUNTIME_FAILED' });
});
app.addHook('onClose', async () => { await pool.end(); });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void app.close().then(() => process.exit(0)));
// Recreate disposable containers after a deployment teardown. Durable databases,
// secret subpaths, signed package identities and desired activation survive.
// Interrupted/failed installs require explicit operator recovery instead.
for (const entry of await readdir(stateRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^m_[0-9a-f]{20}$/.test(entry.name)) continue;
  try {
    const saved = JSON.parse(await readFile(`${stateRoot}/${entry.name}/state.json`, 'utf8'));
    if (!['active', 'installed', 'disabled'].includes(saved.phase)) continue;
    const trust: PublisherTrust = JSON.parse(await readFile(config.trustFile, 'utf8'));
    const catalog: ModuleCatalog = JSON.parse(await readFile(config.catalogFile, 'utf8'));
    const descriptor = catalog.packages.find(d => d.payload.manifest.moduleId === saved.moduleId && d.payload.manifest.version === saved.version);
    if (!descriptor || slug(saved.moduleId) !== entry.name) failure('RESTORE_PACKAGE_UNAVAILABLE');
    const payload = verifyPackage(descriptor, trust);
    if (payload.imageId !== saved.imageId) failure('RESTORE_PACKAGE_CHANGED');
    const runtime = JSON.parse(await readFile(`${stateRoot}/${entry.name}/runtime.json`, 'utf8'));
    validateConfiguration(payload.manifest, runtime.configuration);
    const container = await ownedContainer(saved.moduleId);
    if (!container) await install(descriptor, runtime.configuration);
    else if (container.Image !== saved.imageId) failure('RESOURCE_OWNERSHIP_MISMATCH');
    if (saved.phase === 'active') {
      await docker('POST', '/containers/' + containerName(saved.moduleId) + '/start'); await ready(saved.moduleId);
      if ((await callModule(saved.moduleId, 'GET', '/ready')).status !== 200) failure('MODULE_NOT_READY');
    }
    await save(saved.moduleId, saved);
  } catch {
    // A failed extension must not prevent local Worker/provider availability.
    // Its authenticated API reports unavailable; operator can retry activation.
    process.stderr.write(`Module restore unavailable for ${entry.name}; retained state requires operator review.\n`);
  }
}
await app.listen({ host: '0.0.0.0', port: 8443 });
