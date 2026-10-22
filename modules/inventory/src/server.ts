import Fastify from 'fastify';
import type pg from 'pg';
import { randomUUID, timingSafeEqual } from 'node:crypto';

export function createInventoryServer(pool: pg.Pool, token: string, migrate: () => Promise<number>, ready: () => Promise<void>, quantityUnit: string) {
  const app = Fastify({ logger: false, bodyLimit: 16384, requestTimeout: 10000, ajv: { customOptions: { multipleOfPrecision: 8 } } });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health') return;
    const supplied = Buffer.from(request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : '');
    const expected = Buffer.from(token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply.code(401).send({ error: 'Module gateway authentication required' });
  });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => { try { await ready(); return { status: 'ready' }; } catch { return reply.code(503).send({ error: 'Module schema is not ready' }); } });
  app.post('/internal/migrate', async (_request, reply) => {
    try { return { schemaVersion: await migrate() }; } catch { return reply.code(503).send({ error: 'Module migration failed; data and prior schema were retained' }); }
  });
  const properties = { sku: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' }, name: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' }, quantity: { type: 'number', minimum: 0, maximum: 999999999999.999, multipleOf: 0.001 } };
  app.get('/items', async () => {
    const result = await pool.query('SELECT item_id AS id,sku,name,quantity::float8 AS quantity,revision FROM inventory_items ORDER BY sku');
    return { records: result.rows, summary: 'Quantity unit: ' + quantityUnit };
  });
  app.post<{ Body: { sku: string; name: string; quantity: number } }>('/items', { schema: { body: { type: 'object', additionalProperties: false, required: ['sku', 'name', 'quantity'], properties } } }, async (request, reply) => {
    const item = request.body;
    const result = await pool.query('INSERT INTO inventory_items(item_id,sku,name,quantity) VALUES($1,$2,$3,$4) RETURNING item_id AS id,sku,name,quantity::float8 AS quantity,revision', [randomUUID(), item.sku.trim(), item.name.trim(), item.quantity]);
    return reply.code(201).send({ record: result.rows[0] });
  });
  app.put<{ Params: { id: string }; Body: { sku: string; name: string; quantity: number; revision: number } }>('/items/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: { type: 'object', additionalProperties: false, required: ['sku', 'name', 'quantity', 'revision'], properties: { ...properties, revision: { type: 'integer', minimum: 1 } } } }
  }, async (request, reply) => {
    const b = request.body;
    const result = await pool.query('UPDATE inventory_items SET sku=$1,name=$2,quantity=$3,revision=revision+1,updated_at=now() WHERE item_id=$4 AND revision=$5 RETURNING item_id AS id,sku,name,quantity::float8 AS quantity,revision', [b.sku.trim(), b.name.trim(), b.quantity, request.params.id, b.revision]);
    if (!result.rowCount) return reply.code(409).send({ error: 'Item changed or no longer exists; refresh before editing' });
    return { record: result.rows[0] };
  });
  app.setErrorHandler((error, _request, reply) => {
    const e = error as { code?: string; statusCode?: number };
    return reply.code(e.code === '23505' ? 409 : e.statusCode && e.statusCode < 500 ? e.statusCode : 500).send({ error: e.code === '23505' ? 'SKU already exists' : 'Inventory request failed' });
  });
  return app;
}
