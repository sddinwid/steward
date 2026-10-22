import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { manifest } from './lib.mjs';
const deployment = await manifest();
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const i of deployment.instances) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${i.webPort}`, { waitUntil: 'networkidle' });
    await page.getByRole('status').filter({ hasText: 'Local runtime ready' }).waitFor();
    await page.getByText(i.installationId, { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'No modules installed' }).waitFor();
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `artifacts/${i.key}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `artifacts/${i.key}-mobile.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log(`PASS ${i.key}: React rendered identity/readiness, no page errors, mobile fits viewport`);
    await page.close();
  }
} finally { await browser.close(); }
