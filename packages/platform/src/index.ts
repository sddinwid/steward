import type { StewardRole } from '@steward/contracts';
import { loadConfig } from './config.js';
import { PostgresDatabase } from './database.js';
import { createServer } from './server.js';
export { createServer } from './server.js';
export { parseConfig, loadConfig } from './config.js';
export { PostgresDatabase } from './database.js';
export type { PlatformDatabase } from './database.js';
export type { PlatformModule } from './modules.js';

export async function start(role: StewardRole): Promise<void> {
  let database: PostgresDatabase | undefined;
  try {
    const config = await loadConfig(role);
    database = new PostgresDatabase(config.database, config.installation);
    await database.migrate();
    const app = createServer(config.installation, database);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        const timeout = setTimeout(() => process.exit(1), 10000).unref();
        void app.close().then(() => { clearTimeout(timeout); process.exit(0); }, () => process.exit(1));
      });
    }
    await app.listen({ host: config.host, port: config.port });
  } catch {
    // Intentionally avoid serializing connection/config errors that could contain secrets.
    console.error('Startup failed: check configuration, database connectivity, schema version, and installation identity.');
    await database?.close();
    process.exitCode = 1;
  }
}
