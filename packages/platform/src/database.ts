import pg from 'pg';
import type { InstallationConfig } from '@steward/contracts';
import type { RuntimeConfig } from './config.js';
import { securityMigration } from './security/migration.js';

// Immutable, ordered migrations. Future changes append migrations; never edit applied SQL.
const migrations = [{ version: 1, sql: `
  CREATE TABLE platform_installation (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    installation_id uuid NOT NULL UNIQUE,
    entity_id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('master', 'worker')),
    created_at timestamptz NOT NULL DEFAULT now()
  );
` }, { version: 2, sql: securityMigration }];
export interface PlatformDatabase {
  check(): Promise<void>;
  close(): Promise<void>;
}
export class PostgresDatabase implements PlatformDatabase {
  readonly pool: pg.Pool;
  constructor(config: RuntimeConfig['database'], private readonly identity: InstallationConfig) {
    this.pool = new pg.Pool({ ...config, max: 5, connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000,
      query_timeout: 3000, statement_timeout: 3000, application_name: `steward-${identity.role}` });
    // Idle connection failures must not crash the process or log credentials.
    this.pool.on('error', () => {});
  }
  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(73106901)");
      await client.query('CREATE TABLE IF NOT EXISTS platform_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const applied = await client.query<{ version: number }>('SELECT version FROM platform_migrations ORDER BY version');
      if (applied.rows.some(row => !migrations.some(m => m.version === row.version))) throw new Error('Database schema is newer than this release');
      for (const migration of migrations) {
        if (!applied.rows.some(row => row.version === migration.version)) {
          await client.query(migration.sql);
          await client.query('INSERT INTO platform_migrations(version) VALUES ($1)', [migration.version]);
        }
      }
      const c = this.identity;
      await client.query('INSERT INTO platform_installation(singleton, installation_id, entity_id, role) VALUES (true, $1, $2, $3) ON CONFLICT (singleton) DO NOTHING', [c.installationId, c.entity.entityId, c.role]);
      const result = await client.query('SELECT installation_id, entity_id, role FROM platform_installation WHERE singleton = true');
      const row = result.rows[0];
      if (row.installation_id !== c.installationId || row.entity_id !== c.entity.entityId || row.role !== c.role) throw new Error('Database installation identity does not match configuration');
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async check(): Promise<void> {
    const result = await this.pool.query(`SELECT i.installation_id FROM platform_installation i
      WHERE i.singleton = true AND i.installation_id = $1 AND i.entity_id = $2 AND i.role = $3
      AND (SELECT max(version) FROM platform_migrations) = $4`,
    [this.identity.installationId, this.identity.entity.entityId, this.identity.role, migrations.length]);
    if (result.rowCount !== 1) throw new Error('Persistence readiness failed');
  }
  async close(): Promise<void> { await this.pool.end(); }
}
