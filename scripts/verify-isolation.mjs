import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { directory, manifest, json, compose, sql } from './lib.mjs';

const deployment = await manifest();
const workers = deployment.instances.filter(i => i.role === 'worker');
assert.ok(workers.length > 0);
async function hashes() {
  const result = {};
  for (const f of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (f.isFile()) { const p = path.join(f.parentPath, f.name); result[path.relative(directory, p)] = createHash('sha256').update(await readFile(p)).digest('hex'); }
  }
  return result;
}
const probe = `phase1_probe_${randomUUID().replaceAll('-', '')}`;
const created = [];
const masterServices = deployment.instances.filter(i => i.role === 'master').flatMap(i => [`${i.key}-web`, `${i.key}-api`, `${i.key}-db`]);
try {
  // An actual persistent marker in each database, not just container health.
  for (const i of deployment.instances) {
    sql(i.key, `CREATE TABLE ${probe}(marker text NOT NULL); INSERT INTO ${probe} VALUES ('${i.installationId}')`);
    created.push(i);
  }
  const before = await hashes();
  execFileSync(process.execPath, ['tools/installer/dist/cli.js', 'provision', '--directory', directory, '--mode', deployment.mode, '--workers', String(workers.length), '--project', deployment.project, '--label', deployment.label], { stdio: 'pipe' });
  assert.deepEqual(await hashes(), before);
  for (const i of deployment.instances) assert.equal(sql(i.key, `SELECT marker FROM ${probe}`), i.installationId);
  console.log('PASS re-provisioning preserved every configuration/secret byte and all database markers');
  if (masterServices.length) {
    compose('stop', ...masterServices);
    for (const service of masterServices) assert.equal(compose('ps', '--status', 'running', '-q', service), '');
    for (const i of workers) {
      assert.equal((await json(`http://127.0.0.1:${i.apiPort}/health`)).status, 'ok');
      assert.equal((await json(`http://127.0.0.1:${i.apiPort}/ready`)).status, 'ready');
      assert.equal((await json(`http://127.0.0.1:${i.webPort}/api/v1/platform`)).installation.installationId, i.installationId);
    }
    console.log('PASS all Workers remain healthy, ready, and independently reachable with the entire Master stack stopped');
  }
  const first = workers[0];
  compose('stop', `${first.key}-db`);
  try {
    assert.equal((await json(`http://127.0.0.1:${first.apiPort}/health`)).status, 'ok');
    assert.equal((await json(`http://127.0.0.1:${first.apiPort}/ready`, 503)).status, 'not_ready');
    for (const i of workers.slice(1)) assert.equal((await json(`http://127.0.0.1:${i.apiPort}/ready`)).status, 'ready');
    console.log('PASS loss of one Worker database fails only its readiness; local health and other Workers remain available');
  } finally { compose('up', '-d', '--wait', '--wait-timeout', '120', `${first.key}-db`, `${first.key}-api`, `${first.key}-web`); }
  for (const i of workers) assert.equal(sql(i.key, `SELECT marker FROM ${probe}`), i.installationId);
  // Exercise real PostgreSQL migration and wrong-installation protection via the runtime package.
  compose('exec', '-T', `${first.key}-api`, 'node', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { randomUUID } from 'node:crypto';
    import { loadConfig, PostgresDatabase } from '@steward/platform';
    const config = await loadConfig('worker');
    const db = new PostgresDatabase(config.database, config.installation);
    try {
      await db.migrate(); await db.migrate(); await db.check();
      const held = await db.pool.connect();
      const pid = (await held.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await db.pool.query('SELECT pg_terminate_backend($1)', [pid]);
      await new Promise(resolve => setTimeout(resolve, 200));
      held.release();
      await db.check();
    } finally { await db.close(); }
    const wrong = new PostgresDatabase(config.database, {...config.installation, installationId: randomUUID()});
    try { await assert.rejects(wrong.migrate(), /identity/); } finally { await wrong.close(); }
  `);
  console.log('PASS database restart retains data; migrations repeat safely, checked-out connection termination is handled, and mismatched installations are rejected');
} finally {
  // Always restore the full deployment, even if an assertion fails.
  compose('up', '-d', '--wait', '--wait-timeout', '180');
  for (const i of created) sql(i.key, `DROP TABLE ${probe}`);
}
