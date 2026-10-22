import type { StewardRole } from '@steward/contracts';
import { loadConfig } from './config.js';
import { PostgresDatabase } from './database.js';
import { createServer } from './server.js';
import { loadSecurityConfig } from './security/config.js';
import { createSecureServer } from './security/server.js';
export { createServer } from './server.js';
export { parseConfig, loadConfig } from './config.js';
export { PostgresDatabase } from './database.js';
export type { PlatformDatabase } from './database.js';
export type { PlatformModule } from './modules.js';

export async function start(role: StewardRole): Promise<void> {
  let database: PostgresDatabase | undefined;
  const servers: { close(): Promise<void> }[] = [];
  try {
    const config = await loadConfig(role);
    database = new PostgresDatabase(config.database, config.installation);
    await database.migrate();
    const security = process.env.STEWARD_SECURITY_FILE ? await loadSecurityConfig(process.env.STEWARD_SECURITY_FILE) : undefined;
    const app = createServer(config.installation, database, true, security?.config.publicOrigin);
    servers.push(app);
    const secureApp = security ? await createSecureServer(config.installation, database, security.config, security.key) : undefined;
    if (secureApp) servers.push(secureApp);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        const timeout = setTimeout(() => process.exit(1), 10000).unref();
        void (async () => { await secureApp?.close(); await app.close(); })().then(() => { clearTimeout(timeout); process.exit(0); }, () => process.exit(1));
      });
    }
    await app.listen({ host: config.host, port: config.port });
    if (secureApp) await secureApp.listen({ host: config.host, port: 3443 });
  } catch {
    // Intentionally avoid serializing connection/config errors that could contain secrets.
    console.error('Startup failed: check configuration, database connectivity, schema version, and installation identity.');
    for (const server of servers.reverse()) { try { await server.close(); } catch { /* Continue closing local resources. */ } }
    if (!servers.length) await database?.close();
    process.exitCode = 1;
  }
}
