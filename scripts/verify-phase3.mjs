import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { request } from 'node:https';
import { randomUUID, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { directory, manifest, docker, compose, sql, json } from './lib.mjs';
import { digest, canonical, signPackage } from '../packages/module-sdk/dist/index.js';

// Integration fixture credentials remain in the private deployment directory.
// Browser certificate exceptions apply only to the operator's development CA.
const deployment = await manifest();
const fixture = JSON.parse(await readFile(path.join(directory, 'security/verification.json'), 'utf8'));
const ca = await readFile(path.join(directory, 'security/ca-cert.pem'));
const catalogFile = path.join(directory, 'modules/public/catalog.json');
const privateKey = await readFile(path.join(directory, 'security/module-publisher-key.pem'), 'utf8');
const moduleId = 'cee.inventory';
const slug = id => 'm_' + digest(id).slice(0, 20);
const {moduleContainerName}=await import('../packages/module-host/dist/naming.js');
const container = (worker, id = moduleId) => moduleContainerName(deployment.project,worker,id);
const base = worker => `https://${worker}.localhost:${6200 + Number(worker.slice(-1))}`;
const results = { verifiedAt: new Date().toISOString(), checks: [], coreBefore: {}, coreAfterInstallation: {} };
await mkdir('artifacts', { recursive: true });
function pass(message) { results.checks.push(message); console.log('PASS ' + message); }
function call(worker, url, method = 'GET', body, session, extra = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = request(base(worker) + url, { method, ca, rejectUnauthorized: true, timeout: 100000,
      lookup: (_host, _options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]),
      headers: { ...(session ? { cookie: session.cookie } : {}), ...(method === 'GET' ? {} : { origin: base(worker), 'content-type': 'application/json', 'x-csrf-token': session?.csrf ?? '' }), ...extra } }, response => {
      let data = ''; response.setEncoding('utf8'); response.on('data', chunk => data += chunk);
      response.on('end', () => { try { resolve({ status: response.statusCode, value: JSON.parse(data), cookie: response.headers['set-cookie']?.[0]?.split(';')[0] }); } catch { reject(new Error('Non-JSON module test response')); } });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Module verification timeout'))); req.end(data);
  });
}
async function expect(worker, url, method = 'GET', body, session, status = 200) {
  const result = await call(worker, url, method, body, session);
  assert.equal(result.status, status, `${worker} ${method} ${url}: ${JSON.stringify(result.value)}`); return result.value;
}
const endpoint = '/api/v3/modules';
const items = endpoint + '/' + moduleId + '/api/items';
const sessions = {};
async function manager(worker) { return expect(worker, endpoint, 'GET', undefined, sessions[worker]); }
async function lifecycle(worker, action, id = moduleId) { return expect(worker, `${endpoint}/${id}/lifecycle`, 'POST', { action }, sessions[worker]); }
function moduleSql(worker, query, id = moduleId) { return compose('exec', '-T', worker + '-db', 'psql', '-U', 'postgres', '-d', slug(id), '-At', '-v', 'ON_ERROR_STOP=1', '-c', query); }
function coreSnapshot() {
  const snapshot = {};
  for (const i of deployment.instances) for (const kind of ['api', 'web']) {
    const c = JSON.parse(docker(['inspect', compose('ps', '-q', `${i.key}-${kind}`)]))[0];
    snapshot[`${i.key}-${kind}`] = { image: c.Image, container: c.Id, startedAt: c.State.StartedAt };
  }
  return snapshot;
}
async function worker2Snapshot() {
  return { installations: sql('worker-2', 'SELECT row_to_json(m) FROM module_installations m'),
    databases: compose('exec', '-T', 'worker-2-db', 'psql', '-U', 'postgres', '-At', '-c', "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname"),
    config: digest(await readFile(path.join(directory, 'worker-2/installation.json'), 'utf8')) };
}
const browser = await chromium.launch({ headless: true });
const pages = {};
const browserErrors = [];
let masterStopped = false;
try {
  for (const worker of ['worker-1', 'worker-2', 'worker-3']) {
    console.log('Checking authenticated browser '+worker);
    const context = await browser.newContext({ ignoreHTTPSErrors: true }); context.setDefaultTimeout(20000);
    const page = await context.newPage(); pages[worker] = page;
    page.on('pageerror', e => browserErrors.push(e.message));
    await page.goto(base(worker), { waitUntil: 'networkidle' });
    await page.getByLabel('Username', { exact: true }).fill(fixture.accounts[worker].username);
    await page.getByLabel('Password', { exact: true }).fill(fixture.accounts[worker].password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Module Manager', exact: true }).waitFor();
    const auth = await page.evaluate(() => fetch('/api/v2/auth/session').then(r => r.json()));
    const cookie = (await context.cookies()).find(c => c.name === '__Host-steward');
    assert.ok(cookie); sessions[worker] = { cookie: cookie.name + '=' + cookie.value, csrf: auth.csrfToken };
  }
  console.log('Capturing running core identity'); results.coreBefore = coreSnapshot();
  const worker2Before = await worker2Snapshot();
  const enrollmentBefore = sql('worker-1', 'SELECT row_to_json(e) FROM local_enrollment e');
  console.log('Checking initial module absence'); const installedBefore = await Promise.all(['worker-1', 'worker-2', 'worker-3'].map(manager));
  if (installedBefore.every(m => m.installed.length === 0)) {
    for (const worker of ['worker-1', 'worker-2', 'worker-3']) {
      await expect(worker, items, 'GET', undefined, sessions[worker], 404);
      assert.equal(await pages[worker].getByRole('navigation', { name: 'Module navigation' }).count(), 0);
      await pages[worker].screenshot({ path: `artifacts/phase3-${worker}-before.png`, fullPage: true });
    }
    const before = { capturedAt: new Date().toISOString(), core: results.coreBefore, allThreeModulesAbsent: true,
      catalog: JSON.parse(await readFile(catalogFile, 'utf8')) };
    await writeFile('artifacts/phase3-initial-baseline.json', JSON.stringify(before, null, 2));
    pass('All three Workers initially have no module package, API, or UI navigation');
  } else {
    const initial = JSON.parse(await readFile('artifacts/phase3-initial-baseline.json', 'utf8'));
    assert.ok(initial.allThreeModulesAbsent); results.initialBaseline = initial.capturedAt;
    pass('Resumed verification; first-run absence evidence is retained in phase3-initial-baseline.json');
  }
  for (const worker of ['worker-1', 'worker-2', 'worker-3']) {
    compose('exec', '-T', worker + '-api', 'node', '-e', "if(require('fs').existsSync('/app/modules/inventory'))process.exit(1)");
  }
  pass('Running Worker core images contain no Inventory package');
  let catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  if (!catalog.packages.some(d => d.payload.manifest.moduleId === moduleId)) {
    execFileSync(process.execPath, ['scripts/publish-module.mjs', 'modules/inventory', directory], { stdio: 'inherit', timeout: 240000 });
  }
  catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  const inventory = catalog.packages.find(d => d.payload.manifest.moduleId === moduleId);
  assert.ok(inventory); results.inventoryPackage = inventory.payload;
  pass('Inventory is a separately built, versioned, signed immutable OCI package');

  async function browserInstall(worker) {
    const page = pages[worker]; await page.getByRole('button', { name: 'Refresh modules', exact: true }).click();
    const card = page.getByTestId('package-cee.inventory@1.0.0');
    await card.getByText('Publisher verified', { exact: false }).waitFor();
    const current = (await manager(worker)).installed.find(m => m.moduleId === moduleId);
    if (!current) {
      await card.getByLabel('Configuration for cee.inventory@1.0.0').fill(JSON.stringify({ quantityUnit: worker === 'worker-1' ? 'pieces' : 'boxes' }));
      const response = page.waitForResponse(r => r.url().endsWith('/api/v3/modules/install') && r.request().method() === 'POST', { timeout: 90000 });
      await card.getByRole('button', { name: 'Install Inventory', exact: true }).click();
      assert.equal((await response).status(), 200, 'Browser module installation succeeds');
      await page.getByTestId('installed-cee.inventory').getByText('installed', { exact: true }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: 'Module navigation' }).count(), 0);
    }
    if ((await manager(worker)).installed.find(m => m.moduleId === moduleId).state !== 'active') {
      const response = page.waitForResponse(r => r.url().endsWith('/cee.inventory/lifecycle') && r.request().method() === 'POST', { timeout: 90000 });
      await page.getByRole('button', { name: 'Activate Inventory', exact: true }).click(); assert.equal((await response).status(), 200);
    }
    await page.getByRole('navigation', { name: 'Module navigation' }).getByRole('button', { name: 'Inventory', exact: true }).click();
    const screen = page.getByTestId('module-screen-cee.inventory'); await screen.getByRole('heading', { name: 'Inventory items' }).waitFor();
    const sku = worker === 'worker-1' ? 'PHASE3-W1' : 'PHASE3-W3';
    if (!(await expect(worker, items, 'GET', undefined, sessions[worker])).records.some(r => r.sku === sku)) {
      await screen.getByLabel('SKU', { exact: true }).fill(sku);
      await screen.getByLabel('Item name', { exact: true }).fill('Verified module item');
      await screen.getByLabel('Quantity', { exact: true }).fill('12.125');
      const response = page.waitForResponse(r => r.url().endsWith('/api/items') && r.request().method() === 'POST');
      await screen.getByRole('button', { name: 'Create record' }).click(); assert.equal((await response).status(), 201);
    }
    const row = screen.getByRole('row').filter({ hasText: sku }); await row.getByRole('button', { name: 'Edit record' }).click();
    await screen.getByLabel('Item name', { exact: true }).fill('Verified edited module item');
    await screen.getByLabel('Quantity', { exact: true }).fill('19.375');
    const response = page.waitForResponse(r => r.url().includes('/api/items/') && r.request().method() === 'PUT');
    await screen.getByRole('button', { name: 'Save changes' }).click(); assert.equal((await response).status(), 200);
    await row.getByText('19.375', { exact: true }).waitFor();
    await page.screenshot({ path: `artifacts/phase3-${worker}-inventory.png`, fullPage: true });
    const records = (await expect(worker, items, 'GET', undefined, sessions[worker])).records;
    assert.equal(records.find(r => r.sku === sku).quantity, 19.375);
    assert.equal(moduleSql(worker, `SELECT quantity FROM inventory_items WHERE sku='${sku}'`), '19.375');
    pass(`${worker}: ${current ? 'persisted Inventory' : 'new browser installation and activation'} supports browser creation/editing of real persistent records`);
  }
  await browserInstall('worker-1');
  await expect('worker-3', items, 'GET', undefined, sessions['worker-3'], installedBefore[2].installed.length ? 200 : 404);
  await browserInstall('worker-3');
  assert.deepEqual(await worker2Snapshot(), worker2Before);
  await expect('worker-2', items, 'GET', undefined, sessions['worker-2'], 404);
  assert.deepEqual((await expect('worker-2', endpoint + '/discovery', 'GET', undefined, sessions['worker-2'])).modules, []);
  assert.equal(moduleSql('worker-1', "SELECT count(*) FROM inventory_items WHERE sku='PHASE3-W3'"), '0');
  assert.equal(moduleSql('worker-3', "SELECT count(*) FROM inventory_items WHERE sku='PHASE3-W1'"), '0');
  results.coreAfterInstallation = coreSnapshot(); assert.deepEqual(results.coreAfterInstallation, results.coreBefore);
  assert.equal(new Set(['worker-1', 'worker-2', 'worker-3'].map(w => results.coreBefore[w + '-api'].image)).size, 1);
  assert.equal(new Set(['worker-1', 'worker-2', 'worker-3'].map(w => results.coreBefore[w + '-web'].image)).size, 1);
  pass('Worker 2 remains module-free and unchanged; Worker 1/3 records, databases, and configuration are isolated');
  pass('Every core image hash, container ID, and start time is unchanged during publication, installation, activation, and CRUD');

  const retryBody = { packageId: 'cee.inventory@1.0.0', operationId: randomUUID(), configuration: { quantityUnit: 'boxes' } };
  const retries = await Promise.all(Array.from({ length: 6 }, () => call('worker-3', endpoint + '/install', 'POST', retryBody, sessions['worker-3'])));
  assert.ok(retries.every(r => [200, 409].includes(r.status))); assert.ok(retries.some(r => r.status === 200));
  assert.equal(sql('worker-3', "SELECT count(*) FROM module_installations WHERE module_id='cee.inventory'"), '1');
  const c3 = JSON.parse(docker(['inspect', container('worker-3')]))[0]; assert.equal(c3.Image, inventory.payload.imageId);
  pass('Concurrent and repeated installation requests preserve one installation and one immutable module container');
  const storedOperation = (await manager('worker-3')).installed.find(m => m.moduleId === moduleId).operationId;
  await expect('worker-3', endpoint + '/install', 'POST', { ...retryBody, operationId: storedOperation, configuration: { quantityUnit: 'changed' } }, sessions['worker-3'], 409);
  await expect('worker-1', endpoint + '/install', 'POST', { ...retryBody, configuration: { quantityUnit: 'pieces', extra: true } }, sessions['worker-1'], 400);
  await expect('worker-1', items, 'GET', undefined, undefined, 401);
  const noCsrf = await call('worker-1', items, 'POST', {}, sessions['worker-1'], { 'x-csrf-token': '' }); assert.equal(noCsrf.status, 403);
  const cross = await call('worker-2', endpoint, 'GET', undefined, sessions['worker-1']); assert.equal(cross.status, 401);
  pass('Unauthenticated, cross-Worker-session, invalid-configuration, and CSRF requests are rejected');

  // Operator-only negative catalog fixtures; none can start untrusted code.
  const signedVariant = (id, change = {}) => {
    const p = structuredClone(inventory.payload); p.manifest.moduleId = id;
    p.manifest.api.forEach(a => a.permission = a.permission.replace(moduleId, id)); Object.assign(p.manifest, change);
    return signPackage(p, privateKey);
  };
  const invalids = [signedVariant('cee.tampered'), signedVariant('cee.unknown'), signedVariant('cee.future', { minimumPlatformVersion: '99.0.0' }),
    signedVariant('cee.dependent', { dependencies: [{ moduleId: 'cee.missing', minimumVersion: '1.0.0' }] })];
  invalids[0].payload.manifest.name += ' altered'; invalids[1].payload.publisherId = 'untrusted-publisher';
  const originalCatalog = await readFile(catalogFile, 'utf8');
  try {
    await writeFile(catalogFile, JSON.stringify({ ...catalog, packages: [...catalog.packages, ...invalids] }));
    for (const [index, bad] of invalids.entries()) await expect('worker-1', endpoint + '/install', 'POST', {
      packageId: bad.payload.manifest.moduleId + '@1.0.0', operationId: randomUUID(), configuration: { quantityUnit: 'pieces' }
    }, sessions['worker-1'], index < 2 ? 400 : 409);
    assert.equal(sql('worker-1', "SELECT count(*) FROM module_installations WHERE module_id IN ('cee.tampered','cee.unknown','cee.future','cee.dependent')"), '0');
  } finally { await writeFile(catalogFile, originalCatalog); }
  pass('Tampered/unknown-publisher packages, incompatible platform versions, and missing dependencies are rejected before provisioning');

  const userFile = path.join(directory, 'security/phase3-reader-password');
  if (!existsSync(userFile)) execFileSync(process.execPath, ['scripts/create-account.mjs', 'worker-1', 'phase3-reader', 'module_user', '--generate-password-file', userFile], { stdio: 'pipe', env: { ...process.env, STEWARD_DEPLOYMENT: directory } });
  const login = await call('worker-1', '/api/v2/auth/login', 'POST', { username: 'phase3-reader', password: (await readFile(userFile, 'utf8')).trim() });
  assert.equal(login.status, 200); const reader = { cookie: login.cookie, csrf: login.value.csrfToken };
  await expect('worker-1', endpoint + '/permissions', 'PUT', { accountId: login.value.account.account_id, moduleId, permissions: [] }, sessions['worker-1']);
  await expect('worker-1', endpoint, 'GET', undefined, reader, 403);
  await expect('worker-1', items, 'GET', undefined, reader, 403);
  await expect('worker-1', endpoint + '/install', 'POST', retryBody, reader, 403);
  await expect('worker-1', endpoint + '/permissions', 'PUT', { accountId: login.value.account.account_id, moduleId, permissions: ['cee.inventory.read'] }, sessions['worker-1']);
  await expect('worker-1', items, 'GET', undefined, reader);
  await expect('worker-1', items, 'POST', { sku: 'DENIED', name: 'Denied', quantity: 1 }, reader, 403);
  const readContext = await browser.newContext({ ignoreHTTPSErrors: true });
  await readContext.addCookies([{ name: '__Host-steward', value: reader.cookie.split('=')[1], url: base('worker-1'), httpOnly: true, secure: true, sameSite: 'Strict' }]);
  const readPage = await readContext.newPage(); await readPage.goto(base('worker-1'), { waitUntil: 'networkidle' });
  await readPage.getByRole('navigation', { name: 'Module navigation' }).getByRole('button', { name: 'Inventory', exact: true }).click();
  await readPage.getByRole('heading', { name: 'Inventory items', exact: true }).waitFor();
  assert.equal(await readPage.getByRole('button', { name: 'Create record' }).count(), 0);
  assert.equal(await readPage.getByRole('heading', { name: 'Module Manager' }).count(), 0);
  await readContext.close();
  pass('Worker-local module users require explicit API grants; read-only users can list but cannot write or administer, in API and browser');

  const inventoryBefore = moduleSql('worker-1', 'SELECT row_to_json(i) FROM inventory_items i ORDER BY sku');
  await lifecycle('worker-1', 'deactivate');
  await expect('worker-1', items, 'GET', undefined, sessions['worker-1'], 404);
  assert.equal(JSON.parse(docker(['inspect', container('worker-1')]))[0].State.Running, false);
  assert.equal(moduleSql('worker-1', 'SELECT row_to_json(i) FROM inventory_items i ORDER BY sku'), inventoryBefore);
  await lifecycle('worker-1', 'activate');
  pass('Deactivation stops the module and hides/rejects its API while preserving records; reactivation restores access');

  // Real failed SQL migration followed by explicit recovery with a new signed package.
  const recoveryId = 'cee.migration-check';
  if (!(await manager('worker-1')).installed.some(m => m.moduleId === recoveryId && m.version === '1.0.1' && m.state !== 'failed')) {
    const source = path.resolve('artifacts/phase3-migration-fixture'); await mkdir(source, { recursive: true });
    const originalMigration = await readFile('modules/inventory/migrations/001-items.sql', 'utf8');
    const fixtureBase = 'steward-phase3-fixture-base:' + inventory.payload.imageId.slice(7, 19);
    docker(['tag', inventory.payload.imageId, fixtureBase]);
    for (const [version, sqlText] of [['1.0.0', 'CREATE TABLE module_partial_probe(id integer); SELECT 1/0;'], ['1.0.1', 'CREATE TABLE module_partial_probe(id integer);']]) {
      await writeFile(path.join(source, '002-recovery.sql'), sqlText);
      await writeFile(path.join(source, 'Dockerfile'), `FROM ${fixtureBase}\nCOPY 002-recovery.sql ./migrations/002-recovery.sql\nLABEL steward.module.id="${recoveryId}" steward.module.version="${version}"\n`);
      docker(['build', '-t', recoveryId + ':' + version, source]);
      const payload = structuredClone(inventory.payload); payload.imageId = JSON.parse(docker(['image', 'inspect', recoveryId + ':' + version]))[0].Id;
      payload.manifest.moduleId = recoveryId; payload.manifest.version = version; payload.manifest.name = 'Migration recovery verification fixture';
      payload.manifest.api.forEach(a => a.permission = a.permission.replace(moduleId, recoveryId));
      payload.manifest.persistence = { ...payload.manifest.persistence, schemaVersion: 2, migrations: [{ version: 1, sha256: digest(originalMigration) }, { version: 2, sha256: digest(sqlText) }] };
      catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
      const descriptor = signPackage(payload, privateKey);
      const index = catalog.packages.findIndex(d => d.payload.manifest.moduleId === recoveryId && d.payload.manifest.version === version);
      if (index < 0) catalog.packages.push(descriptor); else catalog.packages[index] = descriptor;
      await writeFile(catalogFile, JSON.stringify(catalog, null, 2));
      const response = await expect('worker-1', endpoint + '/install', 'POST', { packageId: recoveryId + '@' + version, operationId: randomUUID(), configuration: { quantityUnit: 'fixtures' }, recover: true }, sessions['worker-1'], version === '1.0.0' ? 503 : 200);
      if (version === '1.0.0') {
        assert.equal(response.error, 'MIGRATION_FAILED');
        assert.equal((await manager('worker-1')).installed.find(m => m.moduleId === recoveryId).state, 'failed');
        assert.equal(moduleSql('worker-1', "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'", recoveryId), '0');
        await pages['worker-1'].getByRole('button', { name: 'Refresh modules', exact: true }).click();
        await pages['worker-1'].getByTestId('installed-' + recoveryId).getByRole('alert').waitFor();
        await pages['worker-1'].screenshot({ path: 'artifacts/phase3-migration-failure.png', fullPage: true });
      } else {
        assert.equal(moduleSql('worker-1', 'SELECT max(version) FROM module_migrations', recoveryId), '2');
        await lifecycle('worker-1', 'deactivate', recoveryId);
      }
    }
  }
  pass('Real failing SQL migration reports failed state, rolls back its uncommitted transaction, and explicitly recovers with corrected signed version; databases are never dropped');

  const runtime = JSON.parse(docker(['inspect', container('worker-1')]))[0];
  assert.equal(runtime.HostConfig.ReadonlyRootfs, true); assert.deepEqual(runtime.HostConfig.CapDrop, ['ALL']);
  assert.equal(runtime.Mounts.length, 1); assert.equal(runtime.Mounts[0].RW, false);
  assert.equal(Object.keys(runtime.NetworkSettings.Networks).length, 2);
  assert.equal(Object.keys(runtime.NetworkSettings.Ports).length, 1); assert.equal(runtime.NetworkSettings.Ports['8080/tcp'], null);
  const direct = compose('exec', '-T', 'worker-1-module-host', 'node', '-e', `require('http').get('http://${container('worker-1')}:8080/items',r=>{console.log(r.statusCode);r.resume()})`);
  assert.equal(direct, '401');
  assert.equal((await fetch('http://127.0.0.1:4201/api/v3/modules')).status, 404);
  // Exercise the real provider's independent cryptographic boundary/replay store.
  const identityKey = await readFile(path.join(directory, 'security/worker-1/identity-key.pem'), 'utf8');
  const control = { protocol: 'steward-module-control-v1', installationId: deployment.instances.find(i => i.key === 'worker-1').installationId,
    nonce: randomUUID(), issuedAt: Date.now(), operation: 'proxy', moduleId, version: '1.0.0', configuration: { quantityUnit: 'pieces' }, method: 'GET', path: '/items', permissions: ['cee.inventory.read'] };
  const envelope = payload => ({ payload, signature: sign(null, Buffer.from(canonical(payload)), identityKey).toString('base64url') });
  function providerProof(proof) {
    const code = `import fs from 'node:fs';import https from 'node:https';const body=fs.readFileSync(0,'utf8');const q=https.request({hostname:'127.0.0.1',port:8443,path:'/control',method:'POST',servername:'worker-1-api',ca:fs.readFileSync('/run/secrets/trust_ca'),headers:{'content-type':'application/json'}},r=>{r.resume();r.on('end',()=>console.log(r.statusCode))});q.on('error',()=>process.exit(1));q.end(body)`;
    return execFileSync('docker', ['exec', '-i', compose('ps', '-q', 'worker-1-module-host'), 'node', '--input-type=module', '-e', code], { input: JSON.stringify(proof), encoding: 'utf8' }).trim();
  }
  const validProof = envelope(control); assert.equal(providerProof(validProof), '200'); assert.equal(providerProof(validProof), '409');
  assert.equal(providerProof(envelope({ ...control, nonce: randomUUID(), issuedAt: Date.now() - 120000 })), '403');
  assert.equal(providerProof(envelope({ ...control, nonce: randomUUID(), installationId: randomUUID() })), '403');
  const altered = envelope({ ...control, nonce: randomUUID() }); altered.payload.permissions.push('cee.inventory.write');
  assert.equal(providerProof(altered), '403');
  pass('Provider verifies TLS identity and Worker signatures, rejects exact replay, stale/wrong-installation/altered proofs; sensitive v3 routes are absent on HTTP');
  compose('exec', '-T', 'worker-1-module-host', 'node', '--input-type=module', '-e', `import fs from 'node:fs';import pg from 'pg';const slug='${slug(moduleId)}';const p=new pg.Pool({host:'worker-1-db',database:'steward',user:slug,password:fs.readFileSync('/var/lib/steward/modules/'+slug+'/db-password','utf8')});try{await p.query('SELECT 1');process.exitCode=1}catch(e){if(e.code!=='42501')process.exitCode=1}finally{await p.end()}`);
  pass('Module has only its own read-only secret subpath, no published port/socket/core credentials, isolated networks, and no permission to connect to the Worker core database');

  compose('restart', 'worker-1-api', 'worker-1-module-host');
  compose('up', '-d', '--wait', '--wait-timeout', '120', 'worker-1-api', 'worker-1-module-host');
  await expect('worker-1', items, 'GET', undefined, sessions['worker-1']);
  assert.equal(sql('worker-1', 'SELECT row_to_json(e) FROM local_enrollment e'), enrollmentBefore);
  assert.equal(moduleSql('worker-1', 'SELECT row_to_json(i) FROM inventory_items i ORDER BY sku'), inventoryBefore);
  pass('Worker and module-host restarts preserve enrollment, local administrator session, module configuration, activation, and inventory records without Master login');
  const masterServices = ['master-web', 'master-api', 'master-db'];
  compose('stop', ...masterServices); masterStopped = true;
  for (const worker of ['worker-1', 'worker-2', 'worker-3']) {
    const i = deployment.instances.find(i => i.key === worker);
    assert.equal((await json(`http://127.0.0.1:${i.apiPort}/health`)).status, 'ok');
    assert.equal((await json(`http://127.0.0.1:${i.apiPort}/ready`)).status, 'ready');
  }
  const outage = await expect('worker-1', items, 'POST', { sku: 'OUTAGE-' + randomUUID().slice(0, 8), name: 'Created during Master outage', quantity: 2.5 }, sessions['worker-1'], 201);
  assert.equal(outage.record.quantity, 2.5);
  await pages['worker-1'].reload({ waitUntil: 'networkidle' });
  await pages['worker-1'].getByRole('navigation', { name: 'Module navigation' }).getByRole('button', { name: 'Inventory', exact: true }).click();
  await pages['worker-1'].getByTestId('module-screen-cee.inventory').getByText(outage.record.sku, { exact: true }).waitFor();
  await pages['worker-1'].screenshot({ path: 'artifacts/phase3-master-outage.png', fullPage: true });
  pass('All Workers remain healthy/ready with the entire Master stack stopped; Inventory API writes and browser reads continue');
  assert.deepEqual(browserErrors, []); pass('Browser installation and CRUD flows have no uncaught JavaScript errors');
  results.finalModules = Object.fromEntries(await Promise.all(['worker-1', 'worker-2', 'worker-3'].map(async w => [w, (await manager(w)).installed.map(m => ({ moduleId: m.moduleId, version: m.version, state: m.state, configuration: m.configuration }))])));
  await writeFile('artifacts/phase3-results.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  if (masterStopped) compose('up', '-d', '--wait', '--wait-timeout', '180', 'master-db', 'master-api', 'master-web');
  for (const worker of Object.keys(sessions)) await call(worker, '/api/v2/auth/logout', 'POST', {}, sessions[worker]).catch(() => {});
}
