import { test } from 'node:test';
import {configurationFailure} from '../module-broker.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';
import { parseConfig, loadConfig } from '../config.js';

const config = () => parseConfig({ configVersion: 1, role: 'worker', installationId: randomUUID(), entity: { entityId: randomUUID(), displayName: 'Test installation' } }, 'worker');
test('health is independent of persistence; readiness returns 503 without leaking errors', async () => {
  let closed = false;
  const app = createServer(config(), { check: async () => { throw new Error('secret-db-credentials'); }, close: async () => { closed = true; } }, false);
  try {
    assert.equal((await app.inject('/health')).statusCode, 200);
    const ready = await app.inject('/ready');
    assert.equal(ready.statusCode, 503);
    assert.deepEqual(ready.json(), { status: 'not_ready', dependency: 'database' });
    assert.equal(ready.body.includes('secret'), false);
  } finally { await app.close(); }
  assert.equal(closed, true);
});
test('readiness recovers; overview has real local identity and explicitly unavailable extensions', async () => {
  let unavailable = true;
  const identity = config();
  const app = createServer(identity, { check: async () => { if (unavailable) throw new Error(); }, close: async () => {} }, false);
  try {
    assert.equal((await app.inject('/ready')).statusCode, 503);
    unavailable = false;
    assert.equal((await app.inject('/ready')).statusCode, 200);
    const response = await app.inject('/api/v1/platform');
    assert.deepEqual(response.json().installation, identity);
    assert.deepEqual(response.json().modules, []);
    assert.ok(Object.values(response.json().extensions).every(v => v === 'not_implemented'));
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/enrollment', payload: {} })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/modules', payload: {} })).statusCode, 404);
  } finally { await app.close(); }
});
test('configuration rejects invalid identity, unknown fields, version and role mismatch', () => {
  const c = config();
  assert.deepEqual(parseConfig({ ...c, installationId: c.installationId.toUpperCase(), entity: { ...c.entity, entityId: c.entity.entityId.toUpperCase() } }, 'worker'), c);
  assert.throws(() => parseConfig(c, 'master'));
  assert.throws(() => parseConfig({ ...c, configVersion: 2 }, 'worker'));
  assert.throws(() => parseConfig({ ...c, installationId: 'company-1' }, 'worker'));
  assert.throws(() => parseConfig({ ...c, password: 'bad' }, 'worker'));
  assert.throws(() => parseConfig({ ...c, entity: { ...c.entity, displayName: ' ' } }, 'worker'));
});
test('runtime config requires file secrets and verified database TLS by default', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'steward-config-'));
  try {
    const configFile = path.join(dir, 'installation.json');
    const secretFile = path.join(dir, 'password');
    await writeFile(configFile, JSON.stringify(config()));
    await writeFile(secretFile, 'x'.repeat(32));
    const env = { INSTALLATION_CONFIG_FILE: configFile, DB_PASSWORD_FILE: secretFile, DB_HOST: 'localhost', DB_NAME: 'test', DB_USER: 'test' };
    await assert.rejects(loadConfig('worker', env), /DB_CA_FILE/);
    await assert.rejects(loadConfig('worker', { ...env, DB_SSL_MODE: 'allow' }), /DB_SSL_MODE/);
    const loaded = await loadConfig('worker', { ...env, DB_SSL_MODE: 'disable' });
    assert.equal(loaded.host, '127.0.0.1');
    await assert.rejects(loadConfig('worker', { ...env, DB_SSL_MODE: 'disable', PORT: '1.5' }), /Invalid port/);
    await writeFile(secretFile, 'short');
    await assert.rejects(loadConfig('worker', { ...env, DB_SSL_MODE: 'disable' }), /secret/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('configuration errors expose only actionable static egress codes, never runtime details',()=>{
 for(const code of ['CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED','CONNECTOR_PRIVATE_CONFIGURATION_INVALID','CONNECTOR_EGRESS_GRANT_REQUIRED','CONNECTOR_EGRESS_GRANT_MISMATCH','CONNECTOR_EGRESS_NETWORK_REQUIRED','CONNECTOR_EGRESS_NETWORK_UNTRUSTED','CONNECTOR_EGRESS_IDENTITY_CHANGED'])assert.equal(configurationFailure(code),code);
 for(const value of [undefined,null,{},'credential-value','CONNECTOR_EGRESS_GRANT_REQUIRED credential-value','MODULE_RUNTIME_FAILED'])assert.equal(configurationFailure(value),'MODULE_CONFIGURATION_UNAVAILABLE');
});
