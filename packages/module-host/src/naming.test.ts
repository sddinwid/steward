import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleContainerName } from './naming.js';

test('module runtime keeps existing short project names stable', () => {
  assert.equal(moduleContainerName('steward-dev', 'worker-1', 'cee.inventory'), 'steward-dev-worker-1-m_1675588e58787da091eb');
});
test('long valid installation projects retain distinct DNS-safe module names', () => {
  for (const worker of ['worker-1', 'worker-999']) {
    const a = moduleContainerName('steward-phase7-release-acceptance', worker, 'cee.inventory');
    const b = moduleContainerName('steward-phase7-release-acceptance-other', worker, 'cee.inventory');
    assert(a.length <= 63); assert(b.length <= 63); assert.notEqual(a, b);
    assert.notEqual(a, moduleContainerName('steward-phase7-release-acceptance', worker, 'cee.sales'));
  }
});
