import { readFile } from 'node:fs/promises';
import type { InstallationConfig, StewardRole } from '@steward/contracts';

export const RELEASE = '0.1.0';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseConfig(value: unknown, expectedRole: StewardRole): InstallationConfig {
  if (!value || typeof value !== 'object') throw new Error('Invalid installation configuration');
  const c = value as Record<string, unknown>;
  const entity = c.entity as Record<string, unknown> | undefined;
  if (c.configVersion !== 1 || c.role !== expectedRole ||
      typeof c.installationId !== 'string' || !uuid.test(c.installationId) ||
      !entity || typeof entity.entityId !== 'string' || !uuid.test(entity.entityId) ||
      typeof entity.displayName !== 'string' || !entity.displayName.trim() || entity.displayName.length > 120 ||
      Object.keys(c).some(k => !['configVersion', 'role', 'installationId', 'entity'].includes(k)) ||
      Object.keys(entity).some(k => !['entityId', 'displayName'].includes(k))) {
    throw new Error('Invalid installation configuration or role mismatch');
  }
  const config = structuredClone(value) as InstallationConfig;
  // PostgreSQL returns UUIDs in lowercase; keep comparisons stable for valid
  // configuration files that use uppercase UUID characters.
  config.installationId = config.installationId.toLowerCase() as InstallationConfig['installationId'];
  config.entity.entityId = config.entity.entityId.toLowerCase() as InstallationConfig['entity']['entityId'];
  return config;
}
export interface RuntimeConfig {
  installation: InstallationConfig;
  port: number;
  host: string;
  database: { host: string; port: number; database: string; user: string; password: string; ssl: false | { rejectUnauthorized: true; ca: string } };
}
function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value?.trim()) throw new Error(`Missing required setting: ${key}`);
  return value;
}
function port(value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(n) || n < 1 || n > 65535) throw new Error('Invalid port');
  return n;
}
export async function loadConfig(role: StewardRole, env = process.env): Promise<RuntimeConfig> {
  const installation = parseConfig(JSON.parse(await readFile(required(env, 'INSTALLATION_CONFIG_FILE'), 'utf8')), role);
  const password = (await readFile(required(env, 'DB_PASSWORD_FILE'), 'utf8')).trim();
  if (password.length < 24) throw new Error('Database secret must contain at least 24 characters');
  const sslMode = env.DB_SSL_MODE ?? 'verify-full';
  if (!['disable', 'verify-full'].includes(sslMode)) throw new Error('DB_SSL_MODE must be disable or verify-full');
  return {
    installation, port: port(env.PORT ?? '3000'), host: env.HOST ?? '127.0.0.1',
    database: { host: required(env, 'DB_HOST'), port: port(env.DB_PORT ?? '5432'),
      database: required(env, 'DB_NAME'), user: required(env, 'DB_USER'), password,
      ssl: sslMode === 'disable' ? false : { rejectUnauthorized: true, ca: await readFile(required(env, 'DB_CA_FILE'), 'utf8') } }
  };
}
