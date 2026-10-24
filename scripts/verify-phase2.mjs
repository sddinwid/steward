import {openWorkspace} from './ui-navigation.mjs';
import assert from 'node:assert/strict';
import { request as httpsRequest } from 'node:https';
import { randomBytes, randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import { directory, manifest, compose, sql } from './lib.mjs';
import { signAssertion, publicKey, hash } from '../packages/platform/dist/security/crypto.js';

const deployment = await manifest();
const securityDir = path.join(directory, 'security');
const ca = await readFile(path.join(securityDir, 'ca-cert.pem'), 'utf8');
const master = deployment.instances.find(i => i.role === 'master');
const workers = deployment.instances.filter(i => i.role === 'worker');
assert.ok(master && workers.length >= 3, 'Verification requires the default Master + three Worker topology');
const masterOrigin = `https://master.localhost:${master.webPort + 1000}`;
const workerOrigin = i => `https://${i.key}.localhost:${i.webPort + 1000}`;
const composeArgs = ['compose', '-f', path.join(directory, 'compose.yaml'), '-f', path.join(securityDir, 'compose.yaml')];
const fixturePath = path.join(securityDir, 'verification.json');
let fixture;
if (existsSync(fixturePath)) fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
else {
  const suffix = randomBytes(4).toString('hex');
  fixture = { entityA: randomUUID(), entityB: randomUUID(), nameA: `Verification entity ${suffix}`, nameB: `Restricted entity ${suffix}`, accounts: {} };
  for (const [name, service, role] of [['registry', 'master', 'registry_admin'], ['enroller', 'master', 'enrollment_admin'], ['viewer', 'master', 'viewer'], ...workers.map(i => [i.key, i.key, 'local_admin'])]) {
    const username = `${name}-${suffix}`;
    const password = randomBytes(32).toString('base64url');
    execFileSync('docker', [...composeArgs, 'exec', '-T', `${service}-api`, 'node', 'packages/platform/dist/security/admin-cli.js', '--username', username, '--role', role, '--password-stdin'], { input: password + '\n', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 });
    fixture.accounts[name] = { username, password };
  }
  await writeFile(fixturePath, JSON.stringify(fixture, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}
const credentials = Object.values(fixture.accounts).map(a => a.password);
function ensureNoSecrets(text) {
  assert.ok(!text.includes('PRIVATE KEY-----'));
  for (const password of credentials) assert.ok(!text.includes(password), 'A generated credential was exposed');
}
function tls(origin, pathname, method = 'GET', body, auth, expected = 200) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const headers = { ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), origin } : {}),
      ...(auth ? { cookie: auth.cookie, 'x-csrf-token': auth.csrfToken } : {}) };
    const request = httpsRequest(new URL(pathname, origin), { ca, rejectUnauthorized: true, minVersion: 'TLSv1.3', method, headers,
      lookup: (_hostname, _options, callback) => callback(null, [{ address: '127.0.0.1', family: 4 }]), timeout: 10000 }, response => {
      let value = '';
      response.on('data', chunk => value += chunk);
      response.on('end', () => {
        try {
          assert.equal(response.statusCode, expected, `${method} ${pathname}: ${value}`);
          const parsed = value ? JSON.parse(value) : {};
          resolve({ value: parsed, cookie: response.headers['set-cookie']?.[0]?.split(';')[0], headers: response.headers });
        } catch (e) { reject(e); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('TLS request timeout')));
    request.on('error', reject); request.end(data);
  });
}
async function login(origin, credentials) {
  const result = await tls(origin, '/api/v2/auth/login', 'POST', credentials);
  assert.ok(result.headers['set-cookie'][0].includes('Secure; HttpOnly; SameSite=Strict'));
  return { cookie: result.cookie, csrfToken: result.value.csrfToken, account: result.value.account };
}
const api = async (origin, route, method, body, auth, expected) => (await tls(origin, '/api/v2' + route, method, body, auth, expected)).value;
async function waitFor(check, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await new Promise(r => setTimeout(r, 500)); }
  throw new Error(`Timed out: ${description}`);
}
const registryAuth = await login(masterOrigin, fixture.accounts.registry);
const enrollerAuth = await login(masterOrigin, fixture.accounts.enroller);
const viewerAuth = await login(masterOrigin, fixture.accounts.viewer);
const workerAuth = {};
for (const i of workers) workerAuth[i.key] = await login(workerOrigin(i), fixture.accounts[i.key]);
await api(masterOrigin, '/auth/login', 'POST', { username: 'unknown-account', password: randomBytes(32).toString('hex') }, undefined, 401);
await api(masterOrigin, '/entities', 'PUT', { entityId: randomUUID(), name: 'Forbidden', classification: 'test', enrollmentEligible: true }, viewerAuth, 403);
await api(masterOrigin, '/entities', 'PUT', { entityId: randomUUID(), name: 'No CSRF', classification: 'test', enrollmentEligible: true }, { ...registryAuth, csrfToken: 'invalid' }, 403);
// Sensitive endpoints do not exist on the original HTTP listener, even with spoofed proxy headers.
const plain = await fetch(`http://127.0.0.1:${master.apiPort}/api/v2/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' }, body: JSON.stringify({ username: 'probe', password: 'invalid-probe-password' }) });
assert.equal(plain.status, 404);
console.log('PASS real authentication, unknown-account rejection, administrator authorization, CSRF, secure cookies, and HTTP route isolation');

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
const pages = [];
const pageErrors = [];
const contexts = [];
async function pageFor(origin, credentials) {
  // Browser-only allowance for the generated development CA. Node and Worker TLS clients verify the CA and hostname.
  const context = await browser.newContext({ ignoreHTTPSErrors: true }); contexts.push(context);
  const page = await context.newPage(); pages.push(page);
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByLabel('Username', { exact: true }).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText(credentials.username, { exact: true }).first().waitFor();
  return page;
}
const transientCandidates = [];
try {
  const adminPage = await pageFor(masterOrigin, fixture.accounts.registry);
  if(await adminPage.getByRole('navigation',{name:'Workspaces',exact:true}).count())await openWorkspace(adminPage,'/administration/companies');
  for (const [entityId, name] of [[fixture.entityA, fixture.nameA], [fixture.entityB, fixture.nameB]]) {
    await adminPage.getByLabel('Entity ID', { exact: true }).fill(entityId);
    await adminPage.getByLabel('Legal name', { exact: true }).fill(name);
    await adminPage.getByLabel('Classification', { exact: true }).fill('verification');
    await adminPage.getByRole('button', { name: 'Save legal entity', exact: true }).click();
    await adminPage.getByText(name, { exact: true }).first().waitFor();
  }
  for (const account of [registryAuth.account, enrollerAuth.account]) {
    await adminPage.getByLabel('Administrator', { exact: true }).selectOption(account.account_id);
    await adminPage.getByLabel('Authorized entity', { exact: true }).selectOption(fixture.entityA);
    await adminPage.getByRole('button', { name: 'Grant authorization', exact: true }).click();
    await waitFor(async () => {
      const scopes = await api(masterOrigin, '/accounts', 'GET', undefined, registryAuth);
      return scopes.authorizations.some(s => s.account_id === account.account_id && s.entity_id === fixture.entityA);
    }, 'entity scope persisted');
  }
  console.log('PASS browser registration of legal entities and explicit entity authorization');
  const workerPage = await pageFor(workerOrigin(workers[0]), fixture.accounts[workers[0].key]);
  if(await workerPage.getByRole('navigation',{name:'Workspaces',exact:true}).count())await openWorkspace(workerPage,'/administration/enrollment');
  let state = await api(workerOrigin(workers[0]), '/worker/status');
  if (state.enrollmentState !== 'enrolled') {
    if (state.enrollmentState !== 'pending') {
      await workerPage.getByRole('button', { name: 'Save Master connection', exact: true }).click();
      await waitFor(async () => (await api(workerOrigin(workers[0]), '/worker/status')).profileId, 'Master connection configured');
      await workerPage.getByRole('button', { name: 'Begin enrollment', exact: true }).click();
    }
    state = await waitFor(async () => { const s = await api(workerOrigin(workers[0]), '/worker/status'); return s.userCode && s; }, 'Worker authorization code');
    await workerPage.getByTestId('user-code').waitFor();
    const authorizePage = await pageFor(`${masterOrigin}/?authorize=${state.userCode}`, fixture.accounts.enroller);
    await authorizePage.getByLabel('Legal entity', { exact: true }).selectOption(fixture.entityA);
    assert.equal(await authorizePage.getByLabel('Legal entity', { exact: true }).locator('option').filter({ hasText: fixture.nameB }).count(), 0);
    if (await authorizePage.getByRole('button', { name: 'Request enrollment', exact: true }).isEnabled()) await authorizePage.getByRole('button', { name: 'Request enrollment', exact: true }).click();
    await waitFor(async () => (await api(masterOrigin, '/enrollment/requests', 'GET', undefined, registryAuth)).requests.some(r => r.request_id === state.requestId && r.status === 'pending'), 'scoped request pending approval');
    await adminPage.getByRole('button', { name: 'Refresh requests', exact: true }).click();
    const card = adminPage.getByTestId(`request-${state.requestId}`);
    await card.getByRole('button', { name: 'Approve enrollment', exact: true }).click();
    await workerPage.getByTestId('enrollment-state').filter({ hasText: /^enrolled/ }).waitFor({ timeout: 30000 });
  }
  const enrolled = await api(workerOrigin(workers[0]), '/worker/status');
  assert.equal(enrolled.enrollmentState, 'enrolled'); assert.equal(enrolled.entityId, fixture.entityA);
  for (const forbidden of ['privateKey', 'grant', 'certificate', 'deviceCode', 'password']) assert.equal(Object.hasOwn(enrolled, forbidden), false);
  const workerCookies = await workerPage.context().cookies(workerOrigin(workers[0]));
  assert.ok(workerCookies.every(c => c.domain === `${workers[0].key}.localhost`));
  await workerPage.screenshot({ path: 'artifacts/phase2-enrolled-worker.png', fullPage: true });
  await adminPage.screenshot({ path: 'artifacts/phase2-master-registry.png', fullPage: true });
  console.log('PASS browser enrollment with Master-hosted administrator sign-in, scoped entity selection, approval, and local certificate persistence');

  const secondOrigin = workerOrigin(workers[1]);
  const secondAuth = workerAuth[workers[1].key];
  await api(secondOrigin, '/worker/connection', 'PUT', { profileId: 'untrusted-url' }, secondAuth, 400);
  await api(secondOrigin, '/worker/connection', 'PUT', { profileId: 'master' }, secondAuth);
  let second = await api(secondOrigin, '/worker/status');
  if (second.enrollmentState !== 'pending') await api(secondOrigin, '/worker/start', 'POST', { requestId: randomUUID() }, secondAuth);
  second = await waitFor(async () => { const s = await api(secondOrigin, '/worker/status'); return s.userCode && s.enrollmentState === 'pending' && s; }, 'second Worker pending');
  await api(secondOrigin, '/worker/start', 'POST', { requestId: second.requestId }, secondAuth);
  await api(masterOrigin, '/enrollment/authorize', 'POST', { code: second.userCode, entityId: randomUUID() }, enrollerAuth, 404);
  await api(masterOrigin, '/enrollment/authorize', 'POST', { code: second.userCode, entityId: fixture.entityB }, enrollerAuth, 403);
  await api(masterOrigin, '/enrollment/authorize', 'POST', { code: second.userCode, entityId: fixture.entityA }, viewerAuth, 403);
  await api(masterOrigin, '/enrollment/authorize', 'POST', { code: second.userCode, entityId: fixture.entityA }, enrollerAuth);
  await api(masterOrigin, '/enrollment/authorize', 'POST', { code: second.userCode, entityId: fixture.entityA }, enrollerAuth);
  await api(masterOrigin, '/enrollment/decision', 'POST', { requestId: second.requestId, entityId: fixture.entityB, decision: 'approve' }, registryAuth, 403);
  await api(masterOrigin, '/enrollment/decision', 'POST', { requestId: second.requestId, entityId: fixture.entityA, decision: 'approve' }, viewerAuth, 403);
  await api(masterOrigin, '/enrollment/decision', 'POST', { requestId: second.requestId, entityId: fixture.entityA, decision: 'reject' }, enrollerAuth);
  await waitFor(async () => (await api(secondOrigin, '/worker/status')).enrollmentState === 'rejected', 'rejection persisted on Worker');
  console.log('PASS unknown entity, untrusted profile, unauthorized account, cross-entity authorization/approval, safe request retries, and rejection handling');

  const ephemeralKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const installationId = randomUUID(); transientCandidates.push(installationId);
  const requestId = randomUUID();
  const makeProof = (operation, extra = {}, privateKey = ephemeralKey) => signAssertion({ protocol: 'steward-enrollment-v1', operation,
    installationId, publicKey: publicKey(privateKey), requestId, nonce: randomUUID(), issuedAt: Date.now(), ...extra }, privateKey);
  const sendProof = (proof, expected = 200) => api(masterOrigin, '/enrollment/proof', 'POST', proof, undefined, expected);
  const firstProof = makeProof('start');
  const first = await sendProof(firstProof);
  await sendProof(firstProof, 409);
  const retry = await sendProof(makeProof('start'));
  assert.equal(first.userCode, retry.userCode);
  await sendProof(makeProof('start', { issuedAt: Date.now() - 120000 }), 400);
  const otherKey = generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  await sendProof(makeProof('start', {}, otherKey), 409);
  const duplicateKey = signAssertion({ ...makeProof('start').payload, installationId: randomUUID(), nonce: randomUUID(), requestId: randomUUID() }, ephemeralKey);
  await sendProof(duplicateKey, 409);
  const invalidSignature = makeProof('poll'); invalidSignature.signature = signAssertion(invalidSignature.payload, otherKey).signature;
  await sendProof(invalidSignature, 403);
  await api(masterOrigin, '/enrollment/authorize', 'POST', { code: first.userCode, entityId: fixture.entityA }, enrollerAuth);
  await api(masterOrigin, '/enrollment/decision', 'POST', { requestId, entityId: fixture.entityA, decision: 'approve' }, registryAuth);
  const approved = await sendProof(makeProof('poll'));
  await sendProof(makeProof('redeem', { entityId: fixture.entityB, grant: approved.grant }), 403);
  const certificate = await sendProof(makeProof('redeem', { entityId: fixture.entityA, grant: approved.grant }));
  const receipt = await sendProof(makeProof('redeem', { entityId: fixture.entityA, grant: approved.grant }));
  assert.deepEqual(certificate.certificate, receipt.certificate);
  assert.equal(sql('master', `SELECT count(*) FROM enrolled_workers WHERE installation_id='${installationId}'`), '1');
  await api(masterOrigin, '/authorizations', 'PUT', { accountId: enrollerAuth.account.account_id, entityId: fixture.entityA, allowed: false }, registryAuth);
  await sendProof(makeProof('redeem', { entityId: fixture.entityA, grant: approved.grant }), 403);
  await api(masterOrigin, '/authorizations', 'PUT', { accountId: enrollerAuth.account.account_id, entityId: fixture.entityA, allowed: true }, registryAuth);
  console.log('PASS replay/stale-proof rejection, duplicate installation/key rejection, invalid signatures, wrong-entity grant redemption, scope revocation, and idempotent certificate issuance');

  const beforeRestart = sql(workers[0].key, 'SELECT certificate FROM local_enrollment WHERE singleton');
  compose('restart', `${workers[0].key}-api`);
  await waitFor(async () => { try { return (await api(workerOrigin(workers[0]), '/worker/status')).enrollmentState === 'enrolled'; } catch { return false; } }, 'enrollment after restart');
  assert.equal(sql(workers[0].key, 'SELECT certificate FROM local_enrollment WHERE singleton'), beforeRestart);
  console.log('PASS Worker restart preserves enrollment and resumes without a Master administrator login');
  compose('stop', 'master-web', 'master-api', 'master-db');
  try {
    await waitFor(async () => (await api(workerOrigin(workers[0]), '/worker/status')).status === 'connection_unavailable', 'Master outage status');
    const outage = await api(workerOrigin(workers[0]), '/worker/status');
    assert.equal(outage.enrollmentState, 'enrolled');
    for (const i of workers) for (const endpoint of ['health', 'ready']) assert.equal((await fetch(`http://127.0.0.1:${i.apiPort}/${endpoint}`)).status, 200);
    compose('restart', `${workers[0].key}-api`);
    await waitFor(async () => { try { return (await api(workerOrigin(workers[0]), '/worker/status')).enrollmentState === 'enrolled'; } catch { return false; } }, 'offline restart preserves enrollment');
    await workerPage.reload({ waitUntil: 'networkidle' });
    await workerPage.getByTestId('enrollment-state').filter({ hasText: 'enrolled' }).waitFor();
    await workerPage.screenshot({ path: 'artifacts/phase2-master-outage.png', fullPage: true });
  } finally { compose('up', '-d', '--wait', '--wait-timeout', '180'); }
  await waitFor(async () => (await api(workerOrigin(workers[0]), '/worker/status')).masterAvailable === true, 'Master recovery');
  console.log('PASS enrolled Worker operation and restart during a complete Master outage, with browser status and automatic recovery');

  // An operator-installed but incorrect Master ID must fail identity verification.
  const third = workers[2];
  const configFile = path.join(securityDir, third.key, 'security.json');
  const originalConfig = await readFile(configFile, 'utf8');
  const altered = JSON.parse(originalConfig); altered.trustedMasters[0].installationId = randomUUID();
  await api(workerOrigin(third), '/worker/connection', 'PUT', { profileId: 'master' }, workerAuth[third.key]);
  try {
    await writeFile(configFile, JSON.stringify(altered)); compose('restart', `${third.key}-api`);
    await waitFor(async () => { try { return (await api(workerOrigin(third), '/worker/status')).status === 'connection_unavailable'; } catch { return false; } }, 'wrong Master identity rejected');
    assert.equal((await api(workerOrigin(third), '/worker/status')).enrollmentState, 'unenrolled');
  } finally { await writeFile(configFile, originalConfig); compose('restart', `${third.key}-api`); }
  await waitFor(async () => { try { return (await api(workerOrigin(third), '/worker/status')).masterAvailable === true; } catch { return false; } }, 'correct trust restored');
  const trustProfile = JSON.parse(originalConfig).trustedMasters[0];
  assert.ok(trustProfile.publicKey);
  // Exercise the actual Worker HTTPS client with a wrong CA, without disabling verification.
  compose('exec', '-T', `${third.key}-api`, 'node', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {loadSecurityConfig} from './packages/platform/dist/security/config.js';
    import {masterRequest} from './packages/platform/dist/security/worker.js';
    const {config}=await loadSecurityConfig(process.env.STEWARD_SECURITY_FILE);
    await assert.rejects(masterRequest({...config.trustedMasters[0],caFile:'/run/secrets/tls_cert'},'/api/v2/master/identity'));
  `);
  console.log('PASS Master identity pin mismatch and untrusted TLS CA rejection');

  const audit = await api(masterOrigin, '/audit', 'GET', undefined, registryAuth);
  assert.ok(audit.records.some(r => r.action === 'enrollment.completed'));
  assert.ok(audit.records.some(r => r.action === 'security.denied'));
  ensureNoSecrets(JSON.stringify(audit));
  for (const page of pages) {
    const bundles = await page.locator('script[src]').evaluateAll(elements => elements.map(e => e.src));
    for (const bundle of bundles) ensureNoSecrets(await page.evaluate(async url => (await fetch(url)).text(), bundle));
  }
  ensureNoSecrets(compose('logs', '--no-color', '--tail', '1000', ...deployment.instances.filter(i => i.role === 'master' || i.role === 'worker').flatMap(i => [`${i.key}-api`, `${i.key}-web`])));
  assert.deepEqual(pageErrors, []);
  await writeFile('artifacts/phase2-results.json', JSON.stringify({ verifiedAt: new Date().toISOString(), entityId: fixture.entityA,
    enrolledWorker: workers[0].installationId, requestId: enrolled.requestId, assertions: 'all passed', browserPageErrors: pageErrors.length }, null, 2));
  console.log('PASS audit records, credential/private-key absence from browser bundles and logs, and zero browser page errors');
} finally {
  compose('up', '-d', '--wait', '--wait-timeout', '180');
  for (const id of transientCandidates) sql('master', `DELETE FROM enrolled_workers WHERE installation_id='${id}'; DELETE FROM enrollment_requests WHERE installation_id='${id}'; DELETE FROM enrollment_nonces WHERE installation_id='${id}'; DELETE FROM worker_candidates WHERE installation_id='${id}'`);
  const masterIds = [registryAuth, enrollerAuth, viewerAuth].map(a => a.account.account_id);
  sql('master', `DELETE FROM security_sessions WHERE account_id IN (${masterIds.map(id => `'${id}'`).join(',')})`);
  for (const i of workers) sql(i.key, `DELETE FROM security_sessions WHERE account_id='${workerAuth[i.key].account.account_id}'`);
  for (const context of contexts) await context.close();
  await browser.close();
}
