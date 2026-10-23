import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { directory } from './lib.mjs';
import { api, login, credentials, sessions, origin, waitFor } from './phase4-client.mjs';

// Observe the operator's unconfigured deployment without replacing any secret.
const fingerprint = async name => createHash('sha256').update(await readFile(path.join(directory, 'analyst/config', name))).digest('hex');
const before = await Promise.all(['model.json', 'api-key.txt'].map(fingerprint));
await mkdir('artifacts', { recursive: true });
await login('master', credentials.accounts.registry);
assert.equal((await api('master', '/api/v5/analyst/config')).value.configured, false,
  'This check requires deferred model setup; it never replaces operator configuration');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.addCookies([{ name: '__Host-steward', value: sessions.master.cookie.split('=')[1], url: origin('master'), secure: true, httpOnly: true, sameSite: 'Strict' }]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin('master'));
  await page.getByText('AI setup deferred.', { exact: false }).waitFor();
  await page.getByLabel('Investigation question').fill('Verify deferred AI setup without a provider or API key.');
  const started = page.waitForResponse(r => r.url().endsWith('/api/v5/analyst/investigations') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Investigate', exact: true }).click();
  const response = await started;
  assert.equal(response.status(), 202);
  const { investigationId } = await response.json();
  await page.getByRole('alert').filter({ hasText: 'MODEL_NOT_CONFIGURED' }).waitFor();
  const record = await waitFor(async () => {
    const r = (await api('master', '/api/v5/analyst/investigations/' + investigationId)).value;
    return r.investigation.status === 'failed' ? r : false;
  }, 'persistent unconfigured investigation');
  assert.equal(record.investigation.error_code, 'MODEL_NOT_CONFIGURED');
  assert.equal(record.investigation.result, null);
  await page.reload();
  await page.getByLabel('Investigation history').selectOption(investigationId);
  await page.getByRole('alert').filter({ hasText: 'MODEL_NOT_CONFIGURED' }).waitFor();
  for (const key of ['master', 'worker-1', 'worker-2', 'worker-3']) {
    for (const endpoint of ['/health', '/ready']) await api(key, endpoint);
  }
  assert.deepEqual(await Promise.all(['model.json', 'api-key.txt'].map(fingerprint)), before);
  assert.deepEqual(errors, []);
  await page.locator('section[aria-label="AI Analyst"]').screenshot({ path: 'artifacts/phase5-unconfigured.png' });
  await writeFile('artifacts/phase5-unconfigured.json', JSON.stringify({ verifiedAt: new Date().toISOString(), investigationId, status: 'passed', checks: ['browser explains deferred setup', 'missing provider produces persistent explicit failure', 'no fabricated analysis', 'failure remains visible after reload', 'Master and three Workers healthy and ready', 'operator configuration and secret unchanged', 'no browser errors'], liveProviderValidation: 'deferred by operator' }, null, 2) + '\n');
  console.log('PASS deferred AI setup in browser, persistent MODEL_NOT_CONFIGURED, no fabricated result, unchanged configuration and healthy independent applications');
} finally { await browser.close(); }
