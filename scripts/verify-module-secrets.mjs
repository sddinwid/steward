import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { directory, manifest, compose, sql } from './lib.mjs';
import { digest } from '../packages/module-sdk/dist/index.js';
const deployment = await manifest();
const fixture = JSON.parse(await readFile(path.join(directory, 'security/verification.json'), 'utf8'));
const secrets = Object.values(fixture.accounts).map(a => a.password);
const outputs = [compose('logs', '--no-color', '--tail', '1000')];
for (const worker of deployment.instances.filter(i => i.role === 'worker')) {
  const ids = sql(worker.key, 'SELECT module_id FROM module_installations ORDER BY module_id').split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const folder = 'm_' + digest(id).slice(0, 20);
    const credentials = JSON.parse(compose('exec', '-T', worker.key + '-module-host', 'node', '-e', `const fs=require('fs'),base='/var/lib/steward/modules/${folder}/';console.log(JSON.stringify(['db-password','gateway-token'].map(f=>fs.readFileSync(base+f,'utf8').trim())))`));
    secrets.push(...credentials);
    const logs = spawnSync('docker', ['logs', '--tail', '1000', `${deployment.project}-${worker.key}-${folder}`], { encoding: 'utf8' });
    assert.equal(logs.status, 0); outputs.push(logs.stdout + logs.stderr);
    if (id === 'cee.inventory') {
      outputs.push(compose('exec', '-T', worker.key + '-module-host', 'node', '-e', `const fs=require('fs'),http=require('http'),token=fs.readFileSync('/var/lib/steward/modules/${folder}/gateway-token','utf8');http.get('http://${deployment.project}-${worker.key}-${folder}:8080/items',{headers:{authorization:'Bearer '+token}},r=>{r.pipe(process.stdout)})`));
    }
  }
}
for (const app of ['master-web', 'worker-web']) {
  const folder = path.join('apps', app, 'dist/assets');
  for (const file of await readdir(folder)) if (file.endsWith('.js')) outputs.push(await readFile(path.join(folder, file), 'utf8'));
}
for (const output of outputs) {
  assert.equal(output.includes('-----BEGIN PRIVATE KEY-----'), false, 'Private key marker absent');
  for (const secret of secrets) assert.ok(secret.length > 20 && !output.includes(secret), 'Actual credential absent from browser bundles, API responses and logs');
}
await writeFile('artifacts/phase3-secret-check.json', JSON.stringify({ verifiedAt: new Date().toISOString(), assertions: 'all passed', secretsChecked: secrets.length }, null, 2));
console.log('PASS actual verification passwords and module database/gateway secrets are absent from frontend bundles, module item responses and runtime logs');
