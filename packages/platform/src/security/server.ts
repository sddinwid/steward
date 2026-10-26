import { workspaceRoutes } from '../workspace.js';
import { mcpRoutes } from '../mcp.js';
import { analystRoutes } from '../analyst.js';
import {scientificRoutes} from '../scientific.js';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { readFile } from 'node:fs/promises';
import type { InstallationConfig } from '@steward/contracts';
import type { PostgresDatabase } from '../database.js';
import { authentication } from './auth.js';
import type { SecurityConfig } from './config.js';
import { masterRoutes } from './master.js';
import { workerRoutes } from './worker.js';
import { audit } from './store.js';
import { moduleRoutes } from '../module-manager.js';
import { synchronizationRoutes } from '../synchronization.js';
import {missionMasterRoutes} from '../mission-routes.js';

export async function createSecureServer(installation: InstallationConfig, database: PostgresDatabase, security: SecurityConfig, key: string) {
  const app = Fastify({ https: { key: await readFile(security.tlsKeyFile), cert: await readFile(security.tlsCertFile), minVersion: 'TLSv1.3' },
    logger: false, disableRequestLogging: true, bodyLimit: 16384, requestTimeout: 10000, connectionTimeout: 10000 });
  await app.register(helmet);
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.setErrorHandler((error, _request, reply) => {
    const failure = error as { statusCode?: number; code?: string; message?: string };
    const status = failure.code === '23505' ? 409 : failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500 ? failure.statusCode : 500;
    return reply.code(status).send({ error: status >= 500 ? 'Service request failed' : failure.code === '23505' ? 'Identity or request already exists' : failure.message ?? 'Request rejected' });
  });
  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode >= 400) {
      try { await audit(database.pool, auth.actor(request), 'security.denied', request.routeOptions.url ?? null, { status: reply.statusCode }); } catch { /* The request never succeeds if its transaction failed. */ }
    }
  });
  const auth = authentication(app, database.pool, security.publicOrigin);
  if (installation.role === 'master') {masterRoutes(app, database.pool, auth, installation, key, security.publicOrigin);await missionMasterRoutes(app,database.pool,auth,installation);}
  else {
    await workerRoutes(app, database.pool, auth, installation, key, security);
    if (process.env.STEWARD_MODULES_FILE) await moduleRoutes(app, database.pool, auth, installation, key, process.env.STEWARD_MODULES_FILE,security);
  }
  workspaceRoutes(app,database.pool,auth,installation);
  await synchronizationRoutes(app,database.pool,auth,installation,key,security);
  if(installation.role==='master')await scientificRoutes(app,database.pool,auth,security.publicOrigin);
  await mcpRoutes(app,database.pool,auth,installation,security.publicOrigin);
  if(installation.role==='master') await analystRoutes(app,database.pool,auth,security);
  return app;
}
