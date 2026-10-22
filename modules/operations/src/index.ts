import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { digest } from '@steward/module-sdk';
import { createOperationsServer } from './server.js';
const config = JSON.parse(await readFile(process.env.MODULE_RUNTIME_FILE!, 'utf8'));
const pool = new pg.Pool({ host: config.databaseHost, database: config.databaseName, user: config.databaseUser,
  password: (await readFile('/run/module-secrets/db-password', 'utf8')).trim(), max: 5, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
pool.on('error', () => {});
const migrations = (await readdir('./migrations')).filter(f => /^\d{3}-[a-z-]+\.sql$/.test(f)).sort();
async function ready() {
  const row = (await pool.query('SELECT installation_id,module_id FROM module_identity WHERE singleton')).rows[0];
  const latest = (await pool.query('SELECT max(version) AS version FROM module_migrations')).rows[0];
  if (row?.installation_id !== config.installationId || row?.module_id !== config.moduleId || latest.version !== config.persistence.schemaVersion) throw new Error('Schema or installation mismatch');
}
async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(18443001)');
    await client.query('CREATE TABLE IF NOT EXISTS module_migrations(version integer PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query('CREATE TABLE IF NOT EXISTS module_identity(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),installation_id uuid NOT NULL,module_id text NOT NULL)');
    await client.query('INSERT INTO module_identity(singleton,installation_id,module_id) VALUES(true,$1,$2) ON CONFLICT DO NOTHING', [config.installationId, config.moduleId]);
    const identity = (await client.query('SELECT * FROM module_identity WHERE singleton')).rows[0];
    if (identity.installation_id !== config.installationId || identity.module_id !== config.moduleId) throw new Error('Module database identity mismatch');
    const applied = (await client.query('SELECT * FROM module_migrations ORDER BY version')).rows;
    if (applied.some(m => m.version > migrations.length) || migrations.length !== config.persistence.schemaVersion) throw new Error('Unsupported migration version');
    for (let i = 0; i < migrations.length; i++) {
      const sql = await readFile('./migrations/' + migrations[i], 'utf8');
      const sha256 = digest(sql);
      if (config.persistence.migrations[i].version !== i + 1 || config.persistence.migrations[i].sha256 !== sha256 || applied.some(m => m.version === i + 1 && m.sha256 !== sha256)) throw new Error('Migration content mismatch');
      if (!applied.some(m => m.version === i + 1)) { await client.query(sql); await client.query('INSERT INTO module_migrations(version,sha256) VALUES($1,$2)', [i + 1, sha256]); }
    }
    await client.query('COMMIT'); return migrations.length;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
const app = createOperationsServer(pool, (await readFile('/run/module-secrets/gateway-token', 'utf8')).trim(), migrate, ready, config.configuration.currency);
app.addHook('onClose', async () => { await pool.end(); });
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void app.close().then(() => process.exit(0)));
await app.listen({ host: '0.0.0.0', port: 8080 });
