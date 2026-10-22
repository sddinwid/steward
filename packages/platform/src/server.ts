import Fastify, { type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import type { InstallationConfig, PlatformOverview } from '@steward/contracts';
import type { PlatformDatabase } from './database.js';
import { RELEASE } from './config.js';

export function createServer(installation: InstallationConfig, database: PlatformDatabase, logger = true, administrationOrigin?: string) {
  const app = Fastify({ logger: logger ? { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] } : false,
    bodyLimit: 16384, requestTimeout: 10000, connectionTimeout: 10000 });
  app.register(helmet);
  app.get('/health', async () => ({ status: 'ok', role: installation.role, release: RELEASE }));
  app.get('/ready', async (_request, reply) => {
    try { await database.check(); return { status: 'ready', role: installation.role }; }
    catch { return reply.code(503).send({ status: 'not_ready', dependency: 'database' }); }
  });
  app.get('/api/v1/platform', async (): Promise<PlatformOverview> => ({
    release: RELEASE, installation: structuredClone(installation), modules: [],
    ...(administrationOrigin ? { administrationOrigin } : {}),
    extensions: { enrollment: administrationOrigin ? 'available' : 'not_implemented', mcp: 'not_implemented', analytics: 'not_implemented', synchronization: 'not_implemented' }
  }));
  app.setErrorHandler((error, request, reply) => {
    const failure = error as Partial<FastifyError>;
    request.log.error({ code: failure.code ?? 'INTERNAL_ERROR' }, 'Request failed');
    reply.code(failure.statusCode && failure.statusCode >= 400 && failure.statusCode < 500 ? failure.statusCode : 500).send({ error: 'Request failed' });
  });
  app.addHook('onClose', async () => database.close());
  return app;
}
