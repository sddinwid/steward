import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { provision, type ProvisionOptions } from '../provision.js';

async function snapshot(dir: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const p = path.join(entry.parentPath, entry.name);
      result[path.relative(dir, p)] = await readFile(p, 'utf8');
    }
  }
  return result;
}
test('provisioning creates distinct identities/secrets and reruns preserve all bytes, including edited config', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'steward-provision-'));
  const o: ProvisionOptions = { directory: path.join(base, 'deployment'), sourceRoot: process.cwd(), mode: 'all', workers: 3, project: 'test-project', label: 'Test' };
  try {
    const first = await provision(o);
    assert.equal(first.created, true);
    assert.equal(new Set(first.manifest.instances.map(i => i.installationId)).size, 4);
    const configPath = path.join(o.directory, 'worker-1', 'installation.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.entity.displayName = 'Locally configured entity';
    await writeFile(configPath, JSON.stringify(config));
    const before = await snapshot(o.directory);
    assert.equal((before['compose.yaml']!.match(/dockerfile: infra\/Dockerfile.api/g) ?? []).length, 2);
    assert.equal((before['compose.yaml']!.match(/image: steward-worker-api:0.4.0/g) ?? []).length, 3);
    assert.equal(new Set(Object.entries(before).filter(([k]) => k.endsWith('db-password')).map(([,v]) => v)).size, 4);
    assert.equal((await provision(o)).created, false);
    assert.deepEqual(await snapshot(o.directory), before);
    await assert.rejects(provision({ ...o, workers: 2 }), /Existing deployment differs/);
    assert.deepEqual(await snapshot(o.directory), before);
    await rm(path.join(o.directory, 'worker-1', 'secrets', 'db-password'));
    await assert.rejects(provision(o), /ENOENT/);
    assert.equal(await readFile(configPath, 'utf8'), before[path.relative(o.directory, configPath)]);
  } finally { await rm(base, { recursive: true, force: true }); }
});
test('worker-only deployment has no Master services or network dependencies', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'steward-worker-'));
  try {
    const directory = path.join(base, 'worker');
    await provision({ directory, sourceRoot: process.cwd(), mode: 'worker', workers: 1, project: 'standalone-worker', label: 'Independent' });
    const compose = await readFile(path.join(directory, 'compose.yaml'), 'utf8');
    assert.equal(compose.includes('master'), false);
    assert.ok(compose.includes('127.0.0.1:4201:3000'));
    assert.ok(compose.includes('steward-worker-api:0.4.0'));
  } finally { await rm(base, { recursive: true, force: true }); }
});
test('invalid options and concurrent provisioning fail without partial state', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'steward-invalid-'));
  const o: ProvisionOptions = { directory: path.join(base, 'deployment'), sourceRoot: process.cwd(), mode: 'all', workers: 3, project: 'test-project', label: 'Test' };
  try {
    await assert.rejects(provision({ ...o, workers: 0 }), /Invalid/);
    await assert.rejects(provision({ ...o, project: '../escape' }), /Invalid/);
    await mkdir(`${o.directory}.provision-lock`);
    await assert.rejects(provision(o), /lock exists/);
    assert.deepEqual(await readdir(base), ['deployment.provision-lock']);
  } finally { await rm(base, { recursive: true, force: true }); }
});
test('master-only deployment has no Worker services', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'steward-master-'));
  try {
    const directory = path.join(base, 'master');
    const result = await provision({ directory, sourceRoot: process.cwd(), mode: 'master', workers: 3, project: 'standalone-master', label: 'Independent' });
    assert.equal(result.manifest.instances.length, 1);
    const compose = await readFile(path.join(directory, 'compose.yaml'), 'utf8');
    assert.equal(compose.includes('worker-'), false);
    assert.ok(compose.includes('steward-master-api:0.4.0'));
  } finally { await rm(base, { recursive: true, force: true }); }
});
