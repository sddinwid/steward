import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { digest } from '../packages/module-sdk/dist/index.js';
import { directory, manifest, compose, sql, json, docker } from './lib.mjs';
const deployment = await manifest();
const workers = deployment.instances.filter(i => i.role === 'worker');
const before = {};
for (const worker of workers) {
  const key = worker.key;
  before[key] = { installations: sql(key, 'SELECT row_to_json(m) FROM module_installations m ORDER BY module_id'), enrollment: sql(key, 'SELECT certificate FROM local_enrollment WHERE singleton'),
    image: JSON.parse(docker(['inspect', compose('ps', '-q', key + '-api')]))[0].Image };
  if (sql(key, "SELECT count(*) FROM module_installations WHERE module_id='cee.inventory'") === '1') before[key].inventory = compose('exec', '-T', key + '-db', 'psql', '-U', 'postgres', '-d', 'm_' + digest('cee.inventory').slice(0, 20), '-At', '-c', 'SELECT row_to_json(i) FROM inventory_items i ORDER BY sku');
}
try {
  execFileSync(process.execPath, ['scripts/compose.mjs', 'down'], { stdio: 'inherit', env: { ...process.env, STEWARD_DEPLOYMENT: directory } });
  assert.equal(docker(['ps', '-aq', '--filter', 'label=steward.managed-by=module-host-v1']).split(/\s+/).filter(Boolean).filter(id => {
    const c = JSON.parse(docker(['inspect', id]))[0]; return workers.some(w => w.installationId === c.Config.Labels['steward.installation']);
  }).length, 0);
  execFileSync(process.execPath, ['scripts/compose.mjs', 'up', '-d', '--wait', '--wait-timeout', '180'], { stdio: 'inherit', env: { ...process.env, STEWARD_DEPLOYMENT: directory } });
  for (const worker of workers) {
    const key = worker.key; const old = before[key];
    assert.equal(sql(key, 'SELECT row_to_json(m) FROM module_installations m ORDER BY module_id'), old.installations);
    assert.equal(sql(key, 'SELECT certificate FROM local_enrollment WHERE singleton'), old.enrollment);
    assert.equal(JSON.parse(docker(['inspect', compose('ps', '-q', key + '-api')]))[0].Image, old.image);
    assert.equal((await json(`http://127.0.0.1:${worker.apiPort}/ready`)).status, 'ready');
    if (old.inventory !== undefined) {
      assert.equal(compose('exec', '-T', key + '-db', 'psql', '-U', 'postgres', '-d', 'm_' + digest('cee.inventory').slice(0, 20), '-At', '-c', 'SELECT row_to_json(i) FROM inventory_items i ORDER BY sku'), old.inventory);
      const name = `${deployment.project}-${key}-m_${digest('cee.inventory').slice(0, 20)}`;
      assert.equal(JSON.parse(docker(['inspect', name]))[0].State.Running, true);
      const result = compose('exec', '-T', key + '-module-host', 'node', '-e', `const fs=require('fs'),http=require('http'),token=fs.readFileSync('/var/lib/steward/modules/m_${digest('cee.inventory').slice(0, 20)}/gateway-token','utf8');http.get('http://${name}:8080/items',{headers:{authorization:'Bearer '+token}},r=>{console.log(r.statusCode);r.resume()})`);
      assert.equal(result, '200');
    }
  }
  await writeFile('artifacts/phase3-restart-results.json', JSON.stringify({ verifiedAt: new Date().toISOString(), assertions: 'all passed', before }, null, 2));
  console.log('PASS complete shutdown/removal/recreation retains core image hashes, enrollment, module states/configuration and every inventory record; active module APIs resume');
} finally { compose('up', '-d', '--wait', '--wait-timeout', '180'); }
