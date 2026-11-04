import {verifyExecutionTransition,executionBinding,assertExecutionBinding,assessModule,executionReadApi} from '@steward/module-sdk';
import {assertRetainedModulePackage} from '@steward/module-sdk';
import {pollSharedEventRuntime} from './shared-event-runtime.js';
import {localEventCaptureSql} from './shared-event-capture.js';
import {registerWorkflowSubscription,recoverWorkflowSubscription} from './workflow-event-admission.js';
import {verifyWorkflowPublication} from './workflow-authority.js';
import {assertInstallationContinuity,assertRuntimeInstallation} from './installation-continuity.js';
import {installedProviderHeaders} from './installed-providers.js';
import {financialAuthorityHeaders,approvalAuthorityHeaders,publicContextHeaders} from './financial-context.js';
import {protectSimulationRoute,rememberSimulationOrigin,recordSimulationDenial} from './simulation-routing.js';
import {plannedConnectorEgress,connectorNetworkName,validateEgressNetwork,requireConnectorConfiguration} from './connector-egress.js';
import Fastify from 'fastify';
import { moduleContainerName } from './naming.js';
import { boundReplicationEvents } from './replication.js';
import { executeSmartStep } from './smart-executor.js';
import { routeSmartCommand } from './smart-routing.js';
import {peerDeliveryHeaders,peerAcknowledgment} from './peer-delivery.js';
import pg from 'pg';
import {moduleHttp as http} from './http-client.js';
import { readFile, readdir, mkdir, writeFile, open, rename } from 'node:fs/promises';
import { randomBytes, randomUUID, verify } from 'node:crypto';
import { capabilityInboundEnabled,capabilityOutboundEnabled,atLeast,canonical, digest, verifyPackage, validateConfiguration, operationFor, captureSql, authorizeCommand, validateCommand, validateCapabilityValue, type SignedModulePackage, type PublisherTrust, type ModuleCatalog,type IntegrationCommand } from '@steward/module-sdk';

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
// Execution and routing each hold a transaction while trusted context reads
// need a separate connection. Keep that bounded nesting below pool capacity.
const metadataPool=new pg.Pool({...adminConnection,database:'steward',max:4,connectionTimeoutMillis:3000,statement_timeout:5000});
metadataPool.on('error',()=>{});
async function moduleDatabase<T>(id: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ host: config.databaseHost, user: slug(id), database: slug(id), password: (await readFile(`${stateRoot}/${slug(id)}/db-password`, 'utf8')).trim(), connectionTimeoutMillis: 3000, statement_timeout: 10000 });
  await client.connect(); try { return await work(client); } finally { await client.end(); }
}
await pool.query('CREATE TABLE IF NOT EXISTS module_host_nonces(nonce uuid PRIMARY KEY, expires_at timestamptz NOT NULL)');
await mkdir(stateRoot, { recursive: true });
const app = Fastify({ https: { key: await readFile('/run/secrets/tls_key'), cert: await readFile('/run/secrets/tls_cert'), minVersion: 'TLSv1.3' }, logger: false, bodyLimit: 262144, requestTimeout: 60000 });
function failure(code: string): never { throw Object.assign(new Error(code), { code }); }

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
async function callModule(id: string, method: string, path: string, body?: unknown, context:Record<string,string>={},timeout=15000,incomingIdentity?:Record<string,string>) {
  const deadline=Date.now()+timeout;
  const token = (await readFile(`${stateRoot}/${slug(id)}/gateway-token`, 'utf8')).trim();
  const headers:Record<string,string>=publicContextHeaders(context);headers.authorization='Bearer '+token;
  if(incomingIdentity)headers['x-steward-source-identity']=JSON.stringify(incomingIdentity);
  if(!['/health','/ready','/internal/migrate','/internal/execution'].includes(path)){
    Object.assign(headers,await financialAuthorityHeaders(metadataPool,id));
    const installed=(await metadataPool.query('SELECT descriptor,configuration FROM module_installations WHERE module_id=$1',[id])).rows[0];
    if(installed?.descriptor){const trust:PublisherTrust=JSON.parse(await readFile(config.trustFile,'utf8')),manifest=verifyPackage(installed.descriptor,trust).manifest;Object.assign(headers,await approvalAuthorityHeaders(metadataPool,manifest),await installedProviderHeaders(metadataPool,manifest,installed.configuration,trust));}
  }
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('Runtime timeout');
  return http({ host: containerName(id), port: 8080, method, path,timeout:remaining,headers }, body);
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
async function executionPlan(planId:string,authority:SignedModulePackage,configuration:unknown){
 const p=(await metadataPool.query('SELECT * FROM module_execution_plans WHERE plan_id=$1',[planId])).rows[0];
 const row=(await metadataPool.query('SELECT * FROM module_installations WHERE module_id=$1',[authority.payload.manifest.moduleId])).rows[0];
 const entity=(await metadataPool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];
 if(!p||!row||!entity||p.module_id!==row.module_id||canonical(authority)!==canonical(row.descriptor)||canonical(configuration)!==canonical(row.configuration))failure('EXECUTION_PLAN_SCOPE_MISMATCH');
 const trust:PublisherTrust=JSON.parse(await readFile(config.trustFile,'utf8'));verifyExecutionTransition(p.transition,authority,p.target_descriptor,trust);
 const actual=executionBinding(config.installationId,entity.entity_id,row,p.target_descriptor,p.transition);
 if(p.state==='active')actual.configurationDigest=p.binding.configurationDigest;
 assertExecutionBinding(p.binding,actual);
 if(['approved','installing','installed','activating'].includes(p.state)&&(!p.approved_by||!(await metadataPool.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND role='local_admin' AND enabled",[p.approved_by])).rowCount))failure('EXECUTION_APPROVAL_REVOKED');
 return p;
}
async function currentExecution(moduleId:string){try{return(await metadataPool.query("SELECT * FROM module_execution_plans WHERE module_id=$1 AND state='active' ORDER BY created_at DESC LIMIT 1",[moduleId])).rows[0];}catch(e){if((e as any).code==='42P01')return undefined;throw e;}}
async function assessment(p:any){return moduleDatabase(p.module_id,async db=>{await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');try{const expected=(await metadataPool.query('SELECT descriptor FROM module_installations WHERE module_id=$1',[p.module_id])).rows[0].descriptor.payload.manifest.persistence.migrations;const applied=(await db.query('SELECT version,sha256 FROM module_migrations ORDER BY version')).rows;if(canonical(applied)!==canonical(expected))failure('EXECUTION_SCHEMA_HISTORY_MISMATCH');const value=await assessModule(db,p.transition.payload.assessment);await db.query('COMMIT');return value;}catch(e){await db.query('ROLLBACK');throw e;}});}
async function executionControl(operation:string,planId:string,authority:SignedModulePackage,configuration:unknown){
 const p=await executionPlan(planId,authority,configuration),id=p.module_id,base=stateRoot+'/'+slug(id);let saved=await state(id);
 if(!saved)failure('MODULE_NOT_INSTALLED');
 if(operation==='execution.prepare'){
  if(p.state!=='preparing')failure('EXECUTION_PLAN_STATE_MISMATCH');
  await ownedContainer(id);await docker('POST','/containers/'+containerName(id)+'/stop?t=10',undefined,[204,304]);
  await save(id,{...saved,phase:'quiesced',pendingExecutionPlanId:planId});
  return{assessment:await assessment(p)};
 }
 if(operation==='execution.abort'){
  if(p.state!=='aborting')failure('EXECUTION_PLAN_STATE_MISMATCH');
  await install(authority,configuration,true,p,false,true);
  await docker('POST','/containers/'+containerName(id)+'/start');await ready(id);
  saved=await state(id);await save(id,{...saved,phase:'active',pendingExecutionPlanId:undefined});return{state:'active'};
 }
 if(operation!=='execution.commit'||!['installing','installed','activating','active'].includes(p.state)||!p.approved_by)failure('EXECUTION_PLAN_STATE_MISMATCH');
 if(saved.executionPlanId===planId&&saved.phase==='active'){await ready(id);return{state:'active'};}
 if(p.state==='installing'){
  const observed=await assessment(p);if(observed.blockers.length||observed.digest!==p.assessment?.digest)failure('EXECUTION_ASSESSMENT_CHANGED');
  await install(authority,configuration,true,p,true);
  const after=await assessment(p);if(after.digest!==p.assessment.digest)failure('EXECUTION_PREPARATION_CHANGED_DATA');
  await metadataPool.query("UPDATE module_execution_plans SET state='installed',updated_at=now() WHERE plan_id=$1",[planId]);
 }
 await metadataPool.query("UPDATE module_execution_plans SET state='activating',updated_at=now() WHERE plan_id=$1 AND state IN ('installed','activating')",[planId]);
 const runtime=JSON.parse(await readFile(base+'/runtime.json','utf8'));if(runtime.executionRelease?.planId!==planId)failure('EXECUTION_RUNTIME_MISMATCH');
 await ownedContainer(id);await docker('POST','/containers/'+containerName(id)+'/stop?t=10',undefined,[204,304]);
 await atomicJson(base+'/runtime.json',{...runtime,executionQuiesced:false},0o644);
 await docker('POST','/containers/'+containerName(id)+'/start');await ready(id);
 const proof=await callModule(id,'GET','/internal/execution');if(proof.status!==200||proof.value.quiesced!==false||proof.value.provenance?.executionPackageDigest!==p.binding.targetDigest||(await callModule(id,'GET','/ready')).status!==200)failure('EXECUTION_ACTIVATION_NOT_READY');
 saved=await state(id);await save(id,{...saved,phase:'active',executionPlanId:planId,pendingExecutionPlanId:undefined});return{state:'active'};
}
async function install(descriptor: SignedModulePackage, configuration: unknown, upgrade = false, execution?:any, quiesced=false, restoring=false) {
  if(execution)execution=await executionPlan(execution.plan_id,descriptor,configuration);
  let release=execution;
  if(restoring)release=execution.prior_plan_id?await executionPlan(execution.prior_plan_id,descriptor,configuration):undefined;
  const artifact:SignedModulePackage=release?.target_descriptor??descriptor;
  const payload={...descriptor.payload,imageId:artifact.payload.imageId};const m=descriptor.payload.manifest;const id=m.moduleId;
  const inspected = await docker('GET', '/images/' + payload.imageId + '/json', undefined, [200, 404]);
  if (inspected.status !== 200) failure('IMAGE_UNAVAILABLE');
  if (inspected.value.Id !== payload.imageId || inspected.value.Config.Labels?.['steward.module.id'] !== id || inspected.value.Config.Labels?.['steward.module.version'] !== artifact.payload.manifest.version) failure('IMAGE_IDENTITY_MISMATCH');
  const base = `${stateRoot}/${slug(id)}`;
  let existing = await state(id);
  if(!execution)assertRetainedModulePackage(existing,{digest:digest(canonical(descriptor)),version:m.version,imageId:payload.imageId});
  await mkdir(base, { recursive: true, mode: 0o755 });
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
  if(m.programServices||m.economicServices||atLeast(m.minimumPlatformVersion,'0.15.0')||m.smart&&atLeast(m.minimumPlatformVersion,'0.13.0')){
    const coreIdentity=new pg.Client({...adminConnection,database:'steward'});await coreIdentity.connect();
    try{const row=(await coreIdentity.query("SELECT entity_id,entity_name FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];if(!row)failure('ENROLLMENT_REQUIRED');sourceIdentity={installationId:config.installationId,role:'worker',entity:{entityId:row.entity_id,displayName:row.entity_name}};}finally{await coreIdentity.end();}
  }
  let providerIdentity:unknown;
  if(atLeast(m.minimumPlatformVersion,'0.15.0')){
    const installed=(await metadataPool.query('SELECT operation_id,descriptor FROM module_installations WHERE module_id=$1',[id])).rows[0];
    if(!installed||canonical(installed.descriptor)!==canonical(descriptor))failure('MODULE_INSTALLATION_IDENTITY_MISMATCH');
    providerIdentity={workerInstallationId:config.installationId,entityId:(sourceIdentity as any).entity.entityId,moduleId:id,moduleInstallationId:installed.operation_id,packageDigest:digest(canonical(descriptor))};
  }
  await atomicJson(base + '/runtime.json', { installationId: config.installationId, moduleId: id, version: m.version,
    ...(sourceIdentity?{sourceIdentity,entityId:(sourceIdentity as any).entity.entityId}:{}),
    ...(providerIdentity?{providerIdentity}:{}),
    ...(release?{executionQuiesced:quiesced,executionRelease:{planId:release.plan_id,provenance:{version:1,planId:release.plan_id,authorityPackageDigest:digest(canonical(descriptor)),executionPackageDigest:digest(canonical(artifact)),imageId:artifact.payload.imageId,moduleVersion:artifact.payload.manifest.version}}}:{}),
    databaseHost: config.databaseHost, databaseName: db, databaseUser: db, configuration, persistence: m.persistence }, 0o644);
  let container = await ownedContainer(id);
  if (container && container.Image !== payload.imageId) {
    if (existing.phase === 'active' && !upgrade) failure('ACTIVE_UPGRADE_UNSUPPORTED');
    await docker('POST', '/containers/' + containerName(id) + '/stop?t=5', undefined, [204, 304]);
    await docker('DELETE', '/containers/' + containerName(id), undefined, [204]);
    container = undefined;
  }
  const egress=await connectorEgress(artifact,configuration,container);
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
  if(release&&quiesced){const proof=await callModule(id,'GET','/internal/execution');if(proof.status!==200||proof.value.version!==1||proof.value.quiesced!==true||proof.value.provenance?.executionPackageDigest!==release.binding.targetDigest)failure('EXECUTION_PROTOCOL_NOT_READY');}
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
        if(m.smart?.provides.some(c=>c.events.some(e=>e.streamId)))await client.query(localEventCaptureSql);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
    });
  }
  await docker('POST', '/containers/' + containerName(id) + '/stop?t=5', undefined, [204, 304]);
  await save(id, { moduleId: id, phase: 'installed', version: m.version, imageId: payload.imageId,descriptorDigest:digest(canonical(descriptor)),...(release?{executionPlanId:release.plan_id}:{}),...(execution?{pendingExecutionPlanId:execution.plan_id}:{}) });
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
  let payload = verifyPackage(descriptor, trust);
  let executableDescriptor=descriptor;
  validateConfiguration(payload.manifest, p.configuration);
  // Cross-process, transaction-scoped lock: even a broker restart cannot allow overlapping lifecycle actions.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Outbox reads/acknowledgments use only committed module database rows.
    // They share lifecycle protection with application requests, rather than
    // briefly excluding user mutations on every synchronization poll.
    const lock = await client.query(['proxy','inspect','workflow.verify','workflow.subscribe','workflow.recover','peer.deliver','peer.acknowledge','outbox.read','outbox.complete'].includes(p.operation)
      ? 'SELECT pg_try_advisory_xact_lock_shared(hashtext($1)) AS acquired'
      : 'SELECT pg_try_advisory_xact_lock(hashtext($1)) AS acquired', [p.moduleId]);
    if (!lock.rows[0].acquired) return reply.code(409).send({ error: 'OPERATION_IN_PROGRESS' });
    if(typeof p.operation==='string'&&p.operation.startsWith('execution.'))return await executionControl(p.operation,p.planId,descriptor,p.configuration);
    const running=await currentExecution(p.moduleId);
    if(running){await executionPlan(running.plan_id,descriptor,p.operation==='configure'?(await metadataPool.query('SELECT configuration FROM module_installations WHERE module_id=$1',[p.moduleId])).rows[0].configuration:p.configuration);executableDescriptor=running.target_descriptor;payload={...payload,imageId:executableDescriptor.payload.imageId,manifest:{...payload.manifest,api:executionReadApi(descriptor,executableDescriptor)}};}
    if (p.operation === 'install'){if(running)failure('EXECUTION_RELEASE_USE_RECOVERY');return await install(descriptor, p.configuration, p.upgrade === true);}
    const current = await state(p.moduleId);
    if (!current || current.version !== p.version) failure('MODULE_NOT_INSTALLED');
    if(current.phase==='quiesced'||current.pendingExecutionPlanId)failure('EXECUTION_RELEASE_PREPARED');
    if(p.operation==='configure'){
      await connectorEgress(executableDescriptor,p.configuration,await ownedContainer(p.moduleId));
      if(payload.manifest.connector)await connectorSecret(p.moduleId);
      const file=`${stateRoot}/${slug(p.moduleId)}/runtime.json`,runtime=JSON.parse(await readFile(file,'utf8'));
      await atomicJson(file,{...runtime,configuration:p.configuration},0o644);
      if(current.phase==='active'){
        await ownedContainer(p.moduleId);await docker('POST','/containers/'+containerName(p.moduleId)+'/stop?t=5',undefined,[204,304]);await docker('POST','/containers/'+containerName(p.moduleId)+'/start');await ready(p.moduleId);
      }
      return{saved:true};
    }
    if(p.operation==='workflow.verify'||p.operation==='workflow.subscribe'||p.operation==='workflow.recover'||p.operation==='proxy'||p.operation==='activate'||p.operation==='inspect'||p.operation==='webhook'||p.operation==='peer.deliver'||p.operation==='peer.acknowledge'){
      const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(p.moduleId)}/runtime.json`,'utf8'));
      if(canonical(runtime.configuration)!==canonical(p.configuration))failure('MODULE_CONFIGURATION_MISMATCH');
    }
    if(p.operation==='workflow.recover'){
      if(current.phase!=='active')failure('WORKFLOW_SOURCE_UNAVAILABLE');
      const entity=(await metadataPool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];if(!entity)failure('ENROLLMENT_REQUIRED');
      try{return await recoverWorkflowSubscription(metadataPool,{installationId:config.installationId,entityId:entity.entity_id,trust},callModule,async(id,configuration)=>{
        const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(id)}/runtime.json`,'utf8'));
        return(await state(id))?.phase==='active'&&canonical(runtime.configuration)===canonical(configuration);
      },lockWorkflowModules,{subscriptionId:p.subscriptionId,actorId:p.actorId,consumerId:p.moduleId,reason:p.reason,action:p.action,...(p.eventId?{eventId:p.eventId}:{}),...(p.requestId?{requestId:p.requestId}:{})});}
      catch(error){const code=(error as Error).message;failure(/^(EVENT|WORKFLOW)_[A-Z_]+$/.test(code)?code:'EVENT_RECOVERY_UNAVAILABLE');}
    }
    if(p.operation==='workflow.subscribe'){
      if(current.phase!=='active')failure('WORKFLOW_SOURCE_UNAVAILABLE');
      const entity=(await metadataPool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];if(!entity)failure('ENROLLMENT_REQUIRED');
      try{return await registerWorkflowSubscription(metadataPool,{installationId:config.installationId,entityId:entity.entity_id,trust},callModule,async(id,configuration)=>{
        const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(id)}/runtime.json`,'utf8'));
        return(await state(id))?.phase==='active'&&canonical(runtime.configuration)===canonical(configuration);
      },lockWorkflowModules,{workflowId:p.workflowId,subscriptionId:p.subscriptionId,actorId:p.actorId,consumerId:p.moduleId,reason:p.reason});}
      catch(error){const code=(error as Error).message;failure(/^(EVENT|WORKFLOW)_[A-Z_]+$/.test(code)?code:'EVENT_SUBSCRIPTION_UNAVAILABLE');}
    }
    if(p.operation==='workflow.verify'){
      if(current.phase!=='active'||p.publication?.moduleId!==p.moduleId)failure('WORKFLOW_PUBLICATION_SCOPE_MISMATCH');
      const entity=(await metadataPool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];
      if(!entity)failure('ENROLLMENT_REQUIRED');
      try{
        const publication=await verifyWorkflowPublication(metadataPool,trust,callModule,async(id,configuration)=>{
          const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(id)}/runtime.json`,'utf8'));
          return(await state(id))?.phase==='active'&&canonical(runtime.configuration)===canonical(configuration);
        },{pin:p.publication,actorId:p.actorId,installationId:config.installationId,entityId:entity.entity_id});
        return{publication};
      }catch(error){const code=(error as Error).message;failure(/^WORKFLOW_[A-Z_]+$/.test(code)?code:'WORKFLOW_PUBLICATION_UNAVAILABLE');}
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
   if(!m.integration||!(source.configuration.integrationsEnabled===true||m.simulation?.role==='participant'&&source.configuration.simulationEnabled===true||m.smart?.consumes.some(r=>capabilityOutboundEnabled(m,source.configuration,r.capabilityId))))continue;
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
     if(!command.simulation&&(command.capability?!capabilityOutboundEnabled(m,source.configuration,command.capability.capabilityId):source.configuration.integrationsEnabled!==true))throw new Error('INTEGRATION_SOURCE_DISABLED');
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
      const fresh=(await metadataPool.query('SELECT module_id,operation_id,descriptor,configuration,state FROM module_installations WHERE module_id=ANY($1::text[])',[[m.moduleId,target.module_id]])).rows;
      assertInstallationContinuity([source,target],fresh);
      const targetManifest=verifyPackage(target.descriptor,trust).manifest;
      if(smart&&canonical(smart.manifest)!==canonical(targetManifest))throw new Error('INTEGRATION_PROVIDER_CHANGED');
      const targetRuntime=JSON.parse(await readFile(`${stateRoot}/${slug(target.module_id)}/runtime.json`,'utf8'));
      const liveSourceRuntime=JSON.parse(await readFile(`${stateRoot}/${slug(m.moduleId)}/runtime.json`,'utf8'));
      assertRuntimeInstallation(source,liveSourceRuntime,config.installationId);
      assertRuntimeInstallation(target,targetRuntime,config.installationId);
      const current=await state(target.module_id),sourceState=await state(m.moduleId);
      if(current?.phase!=='active'||current.version!==target.version||sourceState?.version!==m.version||sourceState?.phase!=='active'||canonical(targetRuntime.configuration)!==canonical(target.configuration)||canonical(liveSourceRuntime.configuration)!==canonical(source.configuration)){error='PEER_UNAVAILABLE';}
      else if(!(wire.capability?capabilityInboundEnabled(targetManifest,target.configuration,wire.capability.capabilityId):target.configuration.integrationsEnabled===true)&&!(wire.simulation&&targetManifest.simulation?.role==='participant'&&target.configuration.simulationEnabled===true)){error='PEER_DISABLED';}
      else{
       await protectSimulationRoute(metadataPool,wire,m,targetManifest,target.configuration);
       if(!smart)authorizeCommand(command,m,targetManifest,{source:true,target:true});
       const enrolled=(await metadataPool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];
       if(enrolled&&typeof liveSourceRuntime.entityId==='string'&&liveSourceRuntime.entityId!==enrolled.entity_id)throw new Error('INTEGRATION_IDENTITY_MISMATCH');
       const incomingIdentity=enrolled?{workerInstallationId:config.installationId,entityId:enrolled.entity_id,moduleId:m.moduleId,moduleInstallationId:source.operation_id,packageDigest:digest(canonical(source.descriptor))}:undefined;
       const response=await callModule(target.module_id,'POST',targetManifest.integration!.inboxPath,wire,{'x-steward-integration-source':m.moduleId,'x-steward-installation':config.installationId,...(smart?{'x-steward-capability':command.capability.capabilityId}:{}),...(smart?.scope?{'x-steward-peer-scope':JSON.stringify(smart.scope)}:{})},4000,incomingIdentity);
       if(response.status>=200&&response.status<300){if(smart)validateCapabilityValue(response.value,smart.operation.output);if(wire.simulation)for(const aggregate of [response.value.orderId,response.value.jobId].filter(v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v)))await rememberSimulationOrigin(metadataPool,target.module_id,aggregate,wire.simulation);status='delivered';result=smart?{...response.value,_steward:{providerModuleId:target.module_id,providerInstallationId:target.operation_id??null,packageDigest:digest(canonical(target.descriptor)),...(atLeast(m.minimumPlatformVersion,'0.15.0')&&response.providerConfigurationDigest?{providerConfigurationDigest:response.providerConfigurationDigest}:{}),...(smart.scope?{destinationEntityId:smart.scope.destinationEntityId,destinationInstallationId:smart.scope.destinationInstallationId,destinationProgramId:smart.scope.destinationProgramId,sourceProgramId:smart.scope.sourceProgramId,grantId:smart.scope.grantId}:{})}}:response.value;}
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
// Same lifecycle advisory-lock namespace used by install/configure/deactivate.
async function lockWorkflowModules(ids:string[]):Promise<()=>Promise<void>>{
 const client=await pool.connect(),held:string[]=[];
 const release=async()=>{let broken=false;try{for(const id of held)await client.query('SELECT pg_advisory_unlock_shared(hashtext($1))',[id]);}catch{broken=true;}finally{client.release(broken);}};
 try{for(const id of [...new Set(ids)].sort()){if(!(await client.query('SELECT pg_try_advisory_lock_shared(hashtext($1)) acquired',[id])).rows[0].acquired)throw Error('PROVIDER_UNAVAILABLE');held.push(id);}return release;}
 catch(error){await release();throw error;}
}
let smartBusy=false;
const smartTimer=setInterval(()=>{if(smartBusy)return;smartBusy=true;void(async()=>{
  const trust:PublisherTrust=JSON.parse(await readFile(config.trustFile,'utf8'));
  // Shared outbox failures cannot prevent legacy coordinator progress. Database
  // readiness and durable subscriber error/retry state remain independently visible.
  try{
    const enrolled=(await metadataPool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];
    if(enrolled)await pollSharedEventRuntime(metadataPool,{installationId:config.installationId,entityId:enrolled.entity_id,trust},callModule,async(id,configuration)=>{
      const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(id)}/runtime.json`,'utf8'));
      return(await state(id))?.phase==='active'&&canonical(runtime.configuration)===canonical(configuration);
    },lockWorkflowModules,async installed=>{
      const id=installed.module_id,password=(await readFile(`${stateRoot}/${slug(id)}/db-password`,'utf8')).trim();
      const source=new pg.Pool({host:config.databaseHost,user:slug(id),database:slug(id),password,max:1,connectionTimeoutMillis:3000,statement_timeout:10000});source.on('error',()=>{});
      return{pool:source,close:()=>source.end()};
    });
  }catch{/* Database unavailability retains source and subscriber work for recovery. */}
  await executeSmartStep(metadataPool,config.installationId,trust,callModule,async(id,configuration)=>{
    const runtime=JSON.parse(await readFile(`${stateRoot}/${slug(id)}/runtime.json`,'utf8'));
    return(await state(id))?.phase==='active'&&canonical(runtime.configuration)===canonical(configuration);
  },lockWorkflowModules);
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
    if (!['active', 'installed', 'disabled'].includes(saved.phase)||saved.pendingExecutionPlanId) continue;
    const trust: PublisherTrust = JSON.parse(await readFile(config.trustFile, 'utf8'));
    const catalog: ModuleCatalog = JSON.parse(await readFile(config.catalogFile, 'utf8'));
    const descriptor = catalog.packages.find(d => d.payload.manifest.moduleId === saved.moduleId && d.payload.manifest.version === saved.version);
    if (!descriptor || slug(saved.moduleId) !== entry.name) failure('RESTORE_PACKAGE_UNAVAILABLE');
    const retained=verifyPackage(descriptor, trust);const release=saved.executionPlanId?await executionPlan(saved.executionPlanId,descriptor,JSON.parse(await readFile(stateRoot+'/'+entry.name+'/runtime.json','utf8')).configuration):undefined;
    const executableDescriptor:SignedModulePackage=release?.target_descriptor??descriptor;const payload=verifyPackage(executableDescriptor,trust);
    if (payload.imageId !== saved.imageId) failure('RESTORE_PACKAGE_CHANGED');
    const runtime = JSON.parse(await readFile(`${stateRoot}/${entry.name}/runtime.json`, 'utf8'));
    validateConfiguration(retained.manifest, runtime.configuration);
    const container = await ownedContainer(saved.moduleId);
    if (!container) await install(descriptor, runtime.configuration,!!release,release);
    else if (container.Image !== saved.imageId) failure('RESOURCE_OWNERSHIP_MISMATCH');
    else await connectorEgress(executableDescriptor,runtime.configuration,container);
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
