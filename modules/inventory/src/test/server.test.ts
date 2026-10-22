import { test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { createInventoryServer } from '../server.js';
const token = 'test-gateway-token-value-only';
test('module API and migration endpoints require their isolated gateway credential', async () => {
  const app = createInventoryServer({ query: async () => { throw new Error('Must not access persistence'); } } as unknown as pg.Pool, token, async () => 1, async () => {}, 'pieces');
  try {
    assert.equal((await app.inject('/health')).statusCode, 200);
    for (const path of ['/items', '/ready']) assert.equal((await app.inject(path)).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/internal/migrate', payload: {} })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/ready', headers: { authorization: 'Bearer ' + token } })).statusCode, 200);
  } finally { await app.close(); }
});
test('inventory validation rejects negative quantities and returns stale-edit conflicts', async () => {
  let calls = 0;
  const app = createInventoryServer({ query: async () => { calls++; return { rows: [], rowCount: 0 }; } } as unknown as pg.Pool, token, async () => 1, async () => {}, 'pieces');
  const headers = { authorization: 'Bearer ' + token };
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/items', headers, payload: { sku: 'SKU', name: 'Item', quantity: -1 } })).statusCode, 400);
    assert.equal(calls, 0);
    assert.equal((await app.inject({ method: 'PUT', url: '/items/12345678-1234-4234-8234-123456789abc', headers, payload: { sku: 'SKU', name: 'Item', quantity: 1.001, revision: 1 } })).statusCode, 409);
    assert.equal(calls, 1);
  } finally { await app.close(); }
});
