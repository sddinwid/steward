import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { provision } from '../provision.js';
import { provisionSecurity } from '../security.js';
import { provisionModules } from '../modules.js';

test('module provisioning is additive, repeatable, and contains no business module or publisher key', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'steward-modules-'));
  const directory = path.join(base, 'deployment');
  try {
    await provision({ directory, sourceRoot: process.cwd(), mode: 'all', workers: 3, project: 'test-modules', label: 'Test' });
    await provisionSecurity(directory, process.cwd());
    const original = await Promise.all(['compose.yaml', 'security/compose.yaml', 'manifest.json'].map(p => readFile(path.join(directory, p), 'utf8')));
    assert.equal(await provisionModules(directory, process.cwd()), true);
    const folder = path.join(directory, 'modules');
    const before: Record<string, string> = {};
    for (const e of await readdir(folder, { recursive: true, withFileTypes: true })) if (e.isFile()) before[path.relative(folder, path.join(e.parentPath, e.name))] = await readFile(path.join(e.parentPath, e.name), 'utf8');
    assert.equal(await provisionModules(directory, process.cwd()), false);
    for (const [p, value] of Object.entries(before)) assert.equal(await readFile(path.join(folder, p), 'utf8'), value);
    assert.deepEqual(await Promise.all(['compose.yaml', 'security/compose.yaml', 'manifest.json'].map(p => readFile(path.join(directory, p), 'utf8'))), original);
    const overlay = before['compose.yaml']!;
    assert.equal((overlay.match(/\/var\/run\/docker.sock:\/var\/run\/docker.sock/g) ?? []).length, 3);
    assert.equal((overlay.match(/dockerfile: infra\/Dockerfile.module-host/g) ?? []).length, 1);
    assert.equal(overlay.includes('publisher-key'), false);
    assert.equal(overlay.includes('inventory'), false);
    assert.deepEqual(JSON.parse(before[path.join('public', 'catalog.json')]!).packages, []);
  } finally { await rm(base, { recursive: true, force: true }); }
});
