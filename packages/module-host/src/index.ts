import {financialAuthorityHeaders} from './financial-context.js';
import {protectSimulationRoute,rememberSimulationOrigin,recordSimulationDenial} from './simulation-routing.js';
import {plannedConnectorEgress,connectorNetworkName,validateEgressNetwork,requireConnectorConfiguration} from './connector-egress.js';
import Fastify from 'fastify';
import { moduleContainerName } from './naming.js';
import { boundReplicationEvents } from './replication.js';
import { executeSmartStep } from './smart-executor.js';
import { routeSmartCommand } from './smart-routing.js';
import {peerDeliveryHeaders,peerAcknowledgment} from './peer-delivery.js';
import pg from 'pg';
import { request, type RequestOptions } from 'node:http';
import { readFile, readdir, mkdir, writeFile, open, rename } from 'node:fs/promises';
import { randomBytes, randomUUID, verify } from 'node:crypto';
import { atLeast,canonical, digest, verifyPackage, validateConfiguration, operationFor, captureSql, authorizeCommand, validateCommand, validateCapabilityValue, type SignedModulePackage, type PublisherTrust, type ModuleCatalog,type IntegrationCommand } from '@steward/module-sdk';

interface HostConfig {
  installationId: string; workerPublicKey: string; catalogFile: string; trustFile: string;
  project: string; workerKey: string; databaseHost: string; databasePasswordFile: string;
  databaseNetwork: string; moduleNetwork: string; stateVolume: string;
  connectorSecretsRoot?:string;
}
const config: HostConfig = JSON.parse(await readFile(process.env.MODULE_HOST_CONFIG!, 'utf8'));
const stateRoot = '/var/lib/steward/modules';
const adminConnection = { host: config.databaseHost, user: 'postgres', database: 'postgres', password: (await readFile(config.databasePasswordFile, 'utf8')).trim() };
const pool = new pg.Pool({ ...adminConnection,
  max: 5, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
pool.on('error', () => {});
const resourcePool = new pg.Pool({ ...adminConnection, max: 2, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
resourcePool.on('error', () => {});
const metadataPool=new pg.Pool({...adminConnection,database:'steward',max:2,connectionTimeoutMillis:3000,statement_timeout:5000});
metadataPool.on('error',()=>{});
async function moduleDatabase<T>(id: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ host: config.databaseHost, user: slug(id), database: slug(id), password: (await readFile(`${stateRoot}/${slug(id)}/db-password`, 'utf8')).trim(), connectionTimeoutMillis: 3000, statement_timeout: 10000 });
  await client.connect(); try { return await work(client); } finally { await client.end(); }
}
await pool.query('CREATE TABLE IF NOT EXISTS module_host_nonces(nonce uuid PRIMARY KEY, expires_at timestamptz NOT NULL)');
await mkdir(stateRoot, { recursive: true });
const app = Fastify({ https: { key: await readFile('/run/secrets/tls_key'), cert: await readFile('/run/secrets/tls_cert'), minVersion: 'TLSv1.3' }, logger: false, bodyLimit: 262144, requestTimeout: 60000 });
function failure(code: string): never { throw Object.assign(new Error(code), { code }); }
function http(options: RequestOptions, body?: unknown): Promise<{ status: number; value: any }> {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ ...options, headers: { ...options.headers, ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) }, timeout: options.timeout??15000 }, res => {
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
const containerName = (id: string) => moduleContainerName(config.project, config.workerKey, id);
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
async function connectorSecret(id:string){
 if(!config.connectorSecretsRoot)return;
 try{const data=await readFile(`${config.connectorSecretsRoot}/${slug(id)}.json`,'utf8');if(Buffer.byteLength(data)>131072)failure('CONNECTOR_SECRET_INVALID');await atomicJson(`${stateRoot}/${slug(id)}/connector.json`,JSON.parse(data),0o444);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')failure('CONNECTOR_SECRET_INVALID');}
}
async function callModule(id: string, method: string, path: string, body?: unknown, context:Record<string,string>={},timeout=15000) {
  const token = (await readFile(`${stateRoot}/${slug(id)}/gateway-token`, 'utf8')).trim();
  const headers:Record<string,string>=Object.fromEntries(Object.entries(context).filter(([key])=>key.toLowerCase()!=='x-steward-financial-principals'));headers.authorization='Bearer '+token;
  if(!['/health','/ready','/internal/migrate'].includes(path))Object.assign(headers,await financialAuthorityHeaders(metadataPool,id));
  return http({ host: containerName(id), port: 8080, method, path,timeout,headers }, body);
}
async function ready(id: string) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { const result = await callModule(id, 'GET', '/health'); if (result.status === 200) return; } catch { /* Container is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  failure('MODULE_START_FAILED');
}
async function connectorEgress(descriptor:SignedModulePackage,configuration:unknown,container?:any){
 const latest=JSON.parse(await readFile(process.env.MODULE_HOST_CONFIG!,'utf8'));if(latest.installationId!==config.installationId||latest.project!==config.project||latest.workerKey!==config.workerKey)failure('CONNECTOR_EGRESS_IDENTITY_CHANGED');
 const network=plannedConnectorEgress(config,descriptor,configuration,latest.connectorEgress??{}),id=descriptor.payload.manifest.moduleId,expected=connectorNetworkName(config,id);
 if(network){const result=await docker('GET','/networks/'+encodeURIComponent(network),undefined,[200,404]);if(result.status!==200)failure('CONNECTOR_EGRESS_NETWORK_REQUIRED');validateEgressNetwork(config,id,result.value);await requireConnectorConfiguration(config.connectorSecretsRoot?`${config.connectorSecretsRoot}/${slug(id)}.json`:undefined);}
 if(container){const connected=Object.hasOwn(container.NetworkSettings?.Networks??{},expected);if(connected&&!network)await docker('POST','/networks/'+encodeURIComponent(expected)+'/disconnect',{Container:containerName(id),Force:false});if(network&&!connected)await docker('POST','/networks/'+encodeURIComponent(network)+'/connect',{Container:containerName(id)});}
 return network;
}
async function install(descriptor: SignedModulePackage, configuration: unknown, upgrade = false) {
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
  if(m.connector)await connectorSecret(id);
  const db = slug(id);
  // Identifiers and password are generated, never supplied by a package.
  if (!(await resourcePool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [db])).rowCount) await resourcePool.query(`CREATE ROLE ${db} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  if (!(await resourcePool.query('SELECT 1 FROM pg_database WHERE datname=$1', [db])).rowCount) await resourcePool.query(`CREATE DATABASE ${db} OWNER ${db}`);
  await resourcePool.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
  await resourcePool.query(`GRANT CONNECT ON DATABASE ${db} TO ${db}`);
  let sourceIdentity:unknown;
  if(m.programServices||m.smart&&atLeast(m.minimumPlatformVersion,'0.13.0')){
    const coreIdentity=new pg.Client({...adminConnection,database:'steward'});await coreIdentity.connect();
    try{const row=(await coreIdentity.query("SELECT entity_id,entity_name FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];if(!row)failure('ENROLLMENT_REQUIRED');sourceIdentity={installationId:config.installationId,role:'worker',entity:{entityId:row.entity_id,displayName:row.entity_name}};}finally{await coreIdentity.end();}
  }
  await atomicJson(base + '/runtime.json', { installationId: config.installationId, moduleId: id, version: m.version,
    ...(sourceIdentity?{sourceIdentity,entityId:(sourceIdentity as any).entity.entityId}:{}),
    databaseHost: config.databaseHost, databaseName: db, databaseUser: db, configuration, persistence: m.persistence }, 0o644);
  let container = await ownedContainer(id);
  if (container && container.Image !== payload.imageId) {
    if (existing.phase === 'active' && !upgrade) failure('ACTIVE_UPGRADE_UNSUPPORTED');
    await docker('POST', '/containers/' + containerName(id) + '/stop?t=5', undefined, [204, 304]);
    await docker('DELETE', '/containers/' + containerName(id), undefined, [204]);
    container = undefined;
  }
  const egress=await connectorEgress(descriptor,configuration,container);
  if (!container) await docker('POST', '/containers/create?name=' + containerName(id), {
    Image: payload.imageId, User: '1000:1000', Env: ['NODE_ENV=production', 'MODULE_RUNTIME_FILE=/run/module-secrets/runtime.json'],
    Labels: { 'steward.managed-by': 'module-host-v1', 'steward.installation': config.installationId, 'steward.module': id },
    HostConfig: { ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges:true'], PidsLimit: 100, Memory: 268435456,
      RestartPolicy: { Name: 'unless-stopped' }, NetworkMode: config.moduleNetwork,
      Mounts: [{ Type: 'volume', Source: config.stateVolume, Target: '/run/module-secrets', ReadOnly: true, VolumeOptions: { Subpath: slug(id) } }] },
    NetworkingConfig: { EndpointsConfig: { [config.moduleNetwork]: { Aliases: [containerName(id)] }, [config.databaseNetwork]: {}, ...(egress?{[egress]:{}}:{}) } }
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
  if (m.replication) {
    const core = new pg.Client({ ...adminConnection, database: 'steward' });
    await core.connect();
    let enrollment;
    try { enrollment = (await core.query("SELECT entity_id,entity_name,certificate FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0]; } finally { await core.end(); }
    if (!enrollment) failure('ENROLLMENT_REQUIRED');
    await moduleDatabase(id, async client => {
      await client.query('BEGIN');
      try {
        await client.query(captureSql(m, { installationId: config.installationId, role: 'worker', entity: { entityId: enrollment.entity_id, displayName: enrollment.entity_name } }, enrollment.certificate.payload.issuer));
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
    });
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
    // Outbox reads/acknowledgments use only committed module database rows.
    // They share lifecycle protection with application requests, rather than
    // briefly excluding user mutations on every synchronization poll.
    const lock = await client.query(['proxy','inspect','peer.deliver','peer.acknowledge','outbox.read','outbox.complete'].includes(p.operation)
      ? 'SELECT pg_try_advisory_xact_lock_shared(hashtext($1)) AS acquired'
      : 'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', [p.moduleId]);
    if (!lock.rows[0].acquired) return reply.code(409).send({ error: 'OPERATION_IN_PROGRESS' });
    if (p.operation === 'install') return await install(descriptor, p.configuration, p.upgrade === true);
    const current = await state(p.moduleId);
    if (!current || current.version !== p.version) failure('MODULE_NOT_INSTALLED');
    if(p.operation==='configure'){
      await connectorEgress(descriptor,p.configuration,await ownedContainer(p.moduleId));
      if(payload.manifest.connector)await connectorSecret(p.moduleId);
      const file=`${stateRoot}/${slug(p.moduleId)}/runtime.json`,runtime=JSON.parse(await readFile(file,'utf8'));
      await atomicJson(file,{...runtime,configuration:p.configuration},0o644);
      if(current.phase==='active'){
        await ownedContainer(p.moduleId);await docker('POST','/containers/'+containerName(p.moduleId)+'/stop?t=5',undefined,[204,304]);await docker('POST','/containers/'+containerName(p.moduleId)+'/start');await ready(p.moduleId);
      }
      return{saved:true};
    }
    if(p.operation==='proxy'||p.operation==='activate'||p.operation==='inspect'||p.operation==='webhook'||p.operation==='peer.deliver'||p.operation==='peer.acknowledge'){
      const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(p.moduleId)}/runtime.json`,'utf8'));
      if(canonical(runtime.configuration)!==canonical(p.configuration))failure('MODULE_CONFIGURATION_MISMATCH');
    }
    if(p.operation==='inspect'){
      if(current.phase!=='active')return reply.code(409).send({error:'MODULE_DISABLED'});
      const health=await callModule(p.moduleId,'GET','/ready',undefined,{},2000);
      return reply.code(health.status===200?200:503).send({state:health.status===200?'active':'unavailable'});
    }
    if(p.operation==='peer.deliver'||p.operation==='peer.acknowledge'){
      if(current.phase!=='active'||!payload.manifest.integration)return reply.code(503).send({error:'MODULE_RUNTIME_UNAVAILABLE'});
      const installed=(await metadataPool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[p.moduleId])).rows[0];
      if(!installed||canonical(installed.descriptor)!==canonical(descriptor)||canonical(installed.configuration)!==canonical(p.configuration))failure('INTEGRATION_PROVIDER_CHANGED');
      if(p.operation==='peer.acknowledge'){
        const acknowledgment=peerAcknowledgment(p.command,p.outcome,payload.manifest);
        const r=await callModule(p.moduleId,'POST',payload.manifest.integration.acknowledgmentPath,acknowledgment,{},4000);
        return reply.code(r.status).send(r.value);
      }
      const enrollment=(await metadataPool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];
      if(!enrollment)failure('INTEGRATION_IDENTITY_MISMATCH');
      const delivery=peerDeliveryHeaders({command:p.command,scope:p.scope},payload.manifest,p.configuration,config.installationId,installed.operation_id,digest(canonical(descriptor)),enrollment.entity_id);
      const r=await callModule(p.moduleId,'POST',payload.manifest.integration.inboxPath,p.command,delivery.headers,4000);
      if(r.status>=200&&r.status<300)validateCapabilityValue(r.value,delivery.operation.output);
      return reply.code(r.status).send(r.value);
    }
    if(p.operation==='webhook'){
      if(current.phase!=='active'||!payload.manifest.connector)return reply.code(404).send({error:'CONNECTOR_NOT_ACTIVE'});
      const result=await callModule(p.moduleId,'POST','/connector-webhook',p.body,{},4000);return reply.code(result.status).send(result.value);
    }
    if (p.operation === 'outbox.read' || p.operation === 'outbox.complete') {
      if (!payload.manifest.replication) return { events: [] };
      return moduleDatabase(p.moduleId, async sql => {
        if (p.operation === 'outbox.read') {
          const runtime = (payload.manifest.programServices||payload.manifest.economicServices) ? JSON.parse(await readFile(`${stateRoot}/${slug(p.moduleId)}/runtime.json`, 'utf8')) : undefined;
          return { events: boundReplicationEvents(payload.manifest, (await sql.query('SELECT envelope FROM sync_outbox WHERE acknowledged_at IS NULL AND next_attempt_at<=now() ORDER BY created_at,event_id LIMIT 10')).rows.map(r => r.envelope), config.installationId, runtime?.sourceIdentity) };
        }
        for (const ids of [p.acknowledged, p.failed]) if (!Array.isArray(ids) || ids.length > 20 || ids.some((id: unknown) => typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) failure('INVALID_ACKNOWLEDGMENT');
        await sql.query('UPDATE sync_outbox SET acknowledged_at=now(),error_code=NULL WHERE event_id=ANY($1::uuid[])', [p.acknowledged]);
        await sql.query("UPDATE sync_outbox SET attempts=attempts+1,error_code='TRANSPORT_UNAVAILABLE',next_attempt_at=now()+least(30,power(2,least(attempts,5)))*interval '1 second' WHERE event_id=ANY($1::uuid[]) AND acknowledged_at IS NULL", [p.failed]);
        return { saved: true };
      });
    }
    if (p.operation === 'activate') {
      const c = await ownedContainer(p.moduleId); if (!c || c.Image !== payload.imageId) failure('RESOURCE_OWNERSHIP_MISMATCH');
      await connectorEgress(descriptor,p.configuration,c);
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
      const result = await callModule(p.moduleId, p.method, p.path, p.body,{'x-steward-actor':typeof p.actorId==='string'?p.actorId:'','x-steward-permissions':JSON.stringify(p.permissions),'x-steward-installation':config.installationId});
      return reply.code(result.status).send(result.value);
    }
    return reply.code(400).send({ error: 'UNSUPPORTED_OPERATION' });
  } finally { await client.query('ROLLBACK'); client.release(); }
});
app.setErrorHandler((error, _request, reply) => {
  const code = (error as { code?: string }).code;
  reply.code(503).send({ error: code && /^[A-Z_]+$/.test(code) ? code : 'MODULE_RUNTIME_FAILED' });
});
let integrating=false,integrationCursor=0;
async function authorizeProgramme(actorId:string,moduleId:string,programId:string){
 const row=(await metadataPool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[moduleId])).rows[0];
 if(!row)failure('INTEGRATION_PROGRAM_APPROVAL_REQUIRED');
 const trust:PublisherTrust=JSON.parse(await readFile(config.trustFile,'utf8')),manifest=verifyPackage(row.descriptor,trust).manifest;
 const path='/program-authority?q='+encodeURIComponent(programId),operation=operationFor(manifest,'GET',path);
 if(!operation||operation.operationId!=='programAuthority')failure('INTEGRATION_PROGRAM_APPROVAL_REQUIRED');
 const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(moduleId)}/runtime.json`,'utf8'));
 if((await state(moduleId))?.phase!=='active'||canonical(runtime.configuration)!==canonical(row.configuration))failure('INTEGRATION_PROGRAM_APPROVAL_REQUIRED');
 const response=await callModule(moduleId,'GET',path,undefined,{'x-steward-actor':actorId,'x-steward-permissions':JSON.stringify([...new Set(manifest.api.map(o=>o.permission))]),'x-steward-installation':config.installationId},2000);
 if(response.status!==200||response.value?.programId!==programId||response.value?.authorized!==true)failure('INTEGRATION_PROGRAM_APPROVAL_REVOKED');
}
async function authorizeDispatch(actorId:string,command:IntegrationCommand,audience:Record<string,string>){
 const moduleId=command.sourceModuleId,row=(await metadataPool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[moduleId])).rows[0];
 if(!row)failure('INTEGRATION_PROGRAM_APPROVAL_REQUIRED');
 const trust:PublisherTrust=JSON.parse(await readFile(config.trustFile,'utf8')),manifest=verifyPackage(row.descriptor,trust).manifest;
 const path='/dispatch-authority?q='+encodeURIComponent(command.commandId),op=operationFor(manifest,'GET',path);
 if(!op||op.operationId!=='dispatchAuthority')failure('INTEGRATION_PROGRAM_APPROVAL_REQUIRED');
 const response=await callModule(moduleId,'GET',path,undefined,{'x-steward-actor':actorId,'x-steward-permissions':JSON.stringify([...new Set(manifest.api.map(o=>o.permission))]),'x-steward-installation':config.installationId},2000),r=response.value;
 if(response.status!==200||r?.authorized!==true||r.commandId!==command.commandId||r.commandDigest!==digest(canonical(command))||Object.entries(audience).some(([key,value])=>r[key]!==value))failure('INTEGRATION_PROGRAM_APPROVAL_REVOKED');
}
async function integrations(){
 if(integrating)return;integrating=true;const started=Date.now();let remaining=8;
 try{
  const rows=(await metadataPool.query("SELECT module_id,version,descriptor,configuration,operation_id FROM module_installations WHERE state='active' ORDER BY module_id")).rows;
  const trust:PublisherTrust=JSON.parse(await readFile(config.trustFile,'utf8'));
  const ordered=rows.length?[...rows.slice(integrationCursor%rows.length),...rows.slice(0,integrationCursor%rows.length)]:[];integrationCursor++;
  for(const source of ordered){try{
   const m=verifyPackage(source.descriptor,trust).manifest;
   if(!m.integration||!(source.configuration.integrationsEnabled===true||m.simulation?.role==='participant'&&source.configuration.simulationEnabled===true))continue;
   const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(m.moduleId)}/runtime.json`,'utf8'));
   if((await state(m.moduleId))?.phase!=='active'||canonical(runtime.configuration)!==canonical(source.configuration))continue;
   const batch=await callModule(m.moduleId,'GET',m.integration.outboxPath,undefined,{},4000);
   if(batch.status!==200||!Array.isArray(batch.value.commands)||batch.value.commands.length>4)continue;
   for(const command of batch.value.commands){
    if(--remaining<0||Date.now()-started>10000)return;
    try{validateCommand(command);}catch{continue;}
    let status='retry',result:unknown=null,error:string|null=null;
    let deliveryClient:pg.PoolClient|undefined;const deliveryLocks:string[]=[];
    try{
     if(source.configuration.integrationsEnabled!==true&&!command.simulation)continue;
     if(command.simulation&&m.simulation?.role==='participant'&&source.configuration.simulationEnabled!==true)continue;
     validateCommand(command);if(command.sourceModuleId!==m.moduleId)throw new Error('INTEGRATION_IDENTITY_MISMATCH');
     const smart=command.capability?await routeSmartCommand(metadataPool,command,m,trust,config.installationId,()=>moduleDatabase(m.moduleId,async db=>(await db.query("SELECT (envelope->>'sequence')::bigint n FROM integration_outbox WHERE status='rejected' AND envelope->>'aggregateId'=$1 AND envelope->'capability'->>'capabilityId'=$2 ORDER BY n DESC LIMIT 1000",[command.aggregateId,command.capability.capabilityId])).rows.map(r=>Number(r.n))),authorizeProgramme,authorizeDispatch):null;
     // Durable remote routes are consumed by the Worker API coordinator, which
     // owns external TLS connectivity. Only its verified receipt ACKs the source.
     if(smart?.remote)continue;
     if(!smart&&!m.integration.peers.some(p=>p.moduleId===command.targetModuleId&&p.sends.some(c=>c.command===command.command&&c.version===command.version)))throw new Error('INTEGRATION_NOT_AUTHORIZED');
     const wire=smart?.command??command;
     const target=rows.find(r=>r.module_id===wire.targetModuleId);
     if(!target){error='PEER_UNAVAILABLE';}
     else{
      // Share the same PostgreSQL advisory-lock namespace as lifecycle control.
      // An install/configure/deactivate cannot replace a service during delivery.
      deliveryClient=await pool.connect();
      for(const id of [...new Set([m.moduleId,target.module_id])].sort()){
       const acquired=(await deliveryClient.query('SELECT pg_try_advisory_lock_shared(hashtext($1)) acquired',[id])).rows[0].acquired;
       if(!acquired)throw new Error('INTEGRATION_PROVIDER_UNAVAILABLE');deliveryLocks.push(id);
      }
      const fresh=(await metadataPool.query('SELECT module_id,descriptor,configuration,state FROM module_installations WHERE module_id=ANY($1::text[])',[[m.moduleId,target.module_id]])).rows;
      if([source,target].some(old=>!fresh.some(r=>r.module_id===old.module_id&&r.state==='active'&&canonical(r.descriptor)===canonical(old.descriptor)&&canonical(r.configuration)===canonical(old.configuration))))throw new Error('INTEGRATION_PROVIDER_CHANGED');
      const targetManifest=verifyPackage(target.descriptor,trust).manifest;
      if(smart&&canonical(smart.manifest)!==canonical(targetManifest))throw new Error('INTEGRATION_PROVIDER_CHANGED');
      const targetRuntime=JSON.parse(await readFile(`${stateRoot}/${slug(target.module_id)}/runtime.json`,'utf8'));
      const liveSourceRuntime=JSON.parse(await readFile(`${stateRoot}/${slug(m.moduleId)}/runtime.json`,'utf8'));
      const current=await state(target.module_id),sourceState=await state(m.moduleId);
      if(current?.phase!=='active'||current.version!==target.version||sourceState?.version!==m.version||sourceState?.phase!=='active'||canonical(targetRuntime.configuration)!==canonical(target.configuration)||canonical(liveSourceRuntime.configuration)!==canonical(source.configuration)){error='PEER_UNAVAILABLE';}
      else if(target.configuration.integrationsEnabled!==true&&!(wire.simulation&&targetManifest.simulation?.role==='participant'&&target.configuration.simulationEnabled===true)){error='PEER_DISABLED';}
      else{
       await protectSimulationRoute(metadataPool,wire,m,targetManifest,target.configuration);
       if(!smart)authorizeCommand(command,m,targetManifest,{source:true,target:true});
       const response=await callModule(target.module_id,'POST',targetManifest.integration!.inboxPath,wire,{'x-steward-integration-source':m.moduleId,'x-steward-installation':config.installationId,...(smart?{'x-steward-capability':command.capability.capabilityId}:{}),...(smart?.scope?{'x-steward-peer-scope':JSON.stringify(smart.scope)}:{})},4000);
       if(response.status>=200&&response.status<300){if(smart)validateCapabilityValue(response.value,smart.operation.output);if(wire.simulation)for(const aggregate of [response.value.orderId,response.value.jobId].filter(v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v)))await rememberSimulationOrigin(metadataPool,target.module_id,aggregate,wire.simulation);status='delivered';result=smart?{...response.value,_steward:{providerModuleId:target.module_id,providerInstallationId:target.operation_id??null,packageDigest:digest(canonical(target.descriptor)),...(smart.scope?{destinationEntityId:smart.scope.destinationEntityId,destinationInstallationId:smart.scope.destinationInstallationId,destinationProgramId:smart.scope.destinationProgramId,sourceProgramId:smart.scope.sourceProgramId,grantId:smart.scope.grantId}:{})}}:response.value;}
       else if([400,403,409,422].includes(response.status)){status='rejected';error='PEER_COMMAND_REJECTED';result=response.value;}
       else error='PEER_UNAVAILABLE';
      }
     }
    }catch(e){const code=(e as Error).message;error=code==='CAPABILITY_SCHEMA_MISMATCH'?'INTEGRATION_SCHEMA_MISMATCH':/^INTEGRATION_[A-Z_]+$/.test(code)?code:'INTEGRATION_TRANSPORT_UNAVAILABLE';await recordSimulationDenial(metadataPool,command,(e as any).targetModuleId??command.targetModuleId,error);if(error.startsWith('INTEGRATION_SIMULATION_'))status='rejected';if(['INTEGRATION_IDENTITY_MISMATCH','INTEGRATION_NOT_AUTHORIZED','INTEGRATION_APPROVAL_REQUIRED','INTEGRATION_APPROVAL_REVOKED','INTEGRATION_PROVIDER_CHANGED','INTEGRATION_DURABLE_SAFE_RECEIPT_REQUIRED','INTEGRATION_SCHEMA_MISMATCH'].includes(error))status='rejected';}
    finally{if(deliveryClient){let broken=false;try{for(const id of deliveryLocks)await deliveryClient.query('SELECT pg_advisory_unlock_shared(hashtext($1))',[id]);}catch{broken=true;}deliveryClient.release(broken);}}
    // A lost ACK is safe: the next delivery has the same identity and digest.
    await callModule(m.moduleId,'POST',m.integration.acknowledgmentPath,{commandId:command.commandId,digest:digest(canonical(command)),status,result,error},{},4000);
    if(command.capability)await metadataPool.query("UPDATE smart_routes SET state=$2,attempts=attempts+1,error_code=$3,updated_at=now() WHERE command_id=$1",[command.commandId,status==='retry'?'pending':status,error]);
   }
  }catch{continue;}}
 }catch{ /* Local module failures do not block the provider or other Workers. */ }
 finally{integrating=false;}
}
const integrationTimer=setInterval(()=>void integrations(),1000).unref();
let smartBusy=false;
const smartTimer=setInterval(()=>{if(smartBusy)return;smartBusy=true;void(async()=>{
  const trust:PublisherTrust=JSON.parse(await readFile(config.trustFile,'utf8'));
  await executeSmartStep(metadataPool,config.installationId,trust,callModule,async(id,configuration)=>{
    const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(id)}/runtime.json`,'utf8'));
    return(await state(id))?.phase==='active'&&canonical(runtime.configuration)===canonical(configuration);
  });
})().catch(()=>{}).finally(()=>{smartBusy=false;});},1000).unref();
app.addHook('onClose', async () => { clearInterval(integrationTimer);clearInterval(smartTimer);await pool.end(); await resourcePool.end();await metadataPool.end(); });
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
    else await connectorEgress(descriptor,runtime.configuration,container);
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
