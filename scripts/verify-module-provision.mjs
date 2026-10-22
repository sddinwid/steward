import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { directory, manifest, sql, compose } from './lib.mjs';
import { digest } from '../packages/module-sdk/dist/index.js';
const deployment = await manifest();
async function hashes() {
  const result = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) if (entry.isFile()) {
    const file = path.join(entry.parentPath, entry.name); result[path.relative(directory, file)] = digest(await readFile(file, 'utf8'));
  }
  return result;
}
function databaseState() {
  return Object.fromEntries(deployment.instances.map(i => [i.key, { modules: sql(i.key, 'SELECT row_to_json(m) FROM module_installations m ORDER BY module_id'),
    databases: compose('exec', '-T', i.key + '-db', 'psql', '-U', 'postgres', '-At', '-c', 'SELECT datname FROM pg_database ORDER BY datname') }]));
}
const before = await hashes(); const databases = databaseState();
for (const args of [
  ['tools/installer/dist/cli.js', 'provision', '--directory', directory, '--mode', deployment.mode, '--workers', String(deployment.instances.filter(i => i.role === 'worker').length), '--project', deployment.project, '--label', deployment.label],
  ['tools/installer/dist/security-cli.js', directory], ['tools/installer/dist/modules-cli.js', directory],
  ...(existsSync(path.join(directory,'data/compose.yaml')) ? [['tools/installer/dist/data-cli.js',directory]] : [])
]) execFileSync(process.execPath, args, { stdio: 'pipe' });
assert.deepEqual(await hashes(), before); assert.deepEqual(databaseState(), databases);
await writeFile('artifacts/phase3-provision-results.json', JSON.stringify({ verifiedAt: new Date().toISOString(), assertions: 'all passed', filesPreserved: Object.keys(before).length }, null, 2));
console.log('PASS base/security/module provisioning reruns preserve all configuration, identity/secret, signed catalog and publisher key bytes, every database and module installation state');
