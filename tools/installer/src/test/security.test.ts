import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { provision } from '../provision.js';
import { provisionSecurity } from '../security.js';

test('security provisioning is additive, preserves keys and binds only each installation secrets', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'steward-security-'));
  const directory = path.join(base, 'deployment');
  try {
    await provision({ directory, sourceRoot: process.cwd(), mode: 'all', workers: 2, project: 'test-security', label: 'Test' });
    const original = await readFile(path.join(directory, 'compose.yaml'), 'utf8');
    assert.equal(await provisionSecurity(directory, process.cwd()), true);
    const before: Record<string, string> = {};
    const security = path.join(directory, 'security');
    for (const e of await readdir(security, { recursive: true, withFileTypes: true })) if (e.isFile()) before[path.relative(security, path.join(e.parentPath, e.name))] = await readFile(path.join(e.parentPath, e.name), 'utf8');
    assert.equal(await provisionSecurity(directory, process.cwd()), false);
    for (const [p, contents] of Object.entries(before)) assert.equal(await readFile(path.join(security, p), 'utf8'), contents);
    assert.equal(await readFile(path.join(directory, 'compose.yaml'), 'utf8'), original);
    const overlay = before['compose.yaml']!;
    assert.ok(overlay.includes('steward-worker-api:0.3.0'));
    assert.equal(overlay.includes('ca-key.pem'), false);
    assert.equal((overlay.match(/target: \/etc\/steward\/security.json/g) ?? []).length, 3);
    assert.notEqual(before[path.join('worker-1', 'identity-key.pem')], before[path.join('worker-2', 'identity-key.pem')]);
    await assert.rejects(provisionSecurity(directory, process.cwd(), 'new-unreviewed-trust.json'), /Trust changes/);
  } finally { await rm(base, { recursive: true, force: true }); }
});
