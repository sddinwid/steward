import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Server } from 'node:https';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { audit } from './store.js';
import { checkPassword, fail, hash, passwordHash, token } from './crypto.js';
export type SecureApp = FastifyInstance<Server>;
export interface Account { account_id: string; username: string; role: string }
type Request = Pick<FastifyRequest, 'headers' | 'ip' | 'method'>;
export function authentication(app: SecureApp, pool: pg.Pool, publicOrigin: string) {
  // Per-process dummy hash has identical work cost to a real password, including for unknown accounts.
  const dummy = passwordHash(token());
  const actors = new WeakMap<object, string>();
  function origin(request: Request) {
    if (request.headers.origin !== publicOrigin) fail(403, 'Origin is not trusted');
    if (!request.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON is required');
  }
  async function rateLimit(bucket: string, limit: number) {
    const row = await pool.query(`INSERT INTO security_rate_limits(bucket,hits,reset_at) VALUES($1,1,now()+interval '1 minute')
      ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN security_rate_limits.reset_at<now() THEN 1 ELSE security_rate_limits.hits+1 END,
      reset_at=CASE WHEN security_rate_limits.reset_at<now() THEN now()+interval '1 minute' ELSE security_rate_limits.reset_at END RETURNING hits`, [hash(bucket)]);
    if (row.rows[0].hits > limit) fail(429, 'Too many attempts; retry later');
  }
  async function session(request: Request, mutate = false): Promise<Account> {
    const raw = request.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('__Host-steward='))?.slice('__Host-steward='.length);
    if (!raw || raw.length > 128) fail(401, 'Administrator sign-in required');
    const result = await pool.query(`SELECT a.account_id,a.username,a.role,s.csrf_hash FROM security_sessions s
      JOIN security_accounts a ON a.account_id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.enabled`, [hash(raw)]);
    const account = result.rows[0];
    if (!account) fail(401, 'Administrator sign-in required');
    actors.set(request, account.account_id);
    if (mutate) {
      origin(request);
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || hash(csrf) !== account.csrf_hash) fail(403, 'Invalid CSRF token');
    }
    return { account_id: account.account_id, username: account.username, role: account.role };
  }
  app.post<{ Body: { username: string; password: string } }>('/api/v2/auth/login', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['username', 'password'], properties: {
      username: { type: 'string', minLength: 1, maxLength: 80 }, password: { type: 'string', minLength: 1, maxLength: 256 }
    } } }
  }, async (request, reply) => {
    origin(request);
    await rateLimit(`login-ip:${request.ip}`, 20);
    await rateLimit(`login-account:${request.body.username.toLowerCase()}`, 5);
    const result = await pool.query('SELECT * FROM security_accounts WHERE username=$1', [request.body.username.toLowerCase()]);
    const account = result.rows[0];
    const valid = await checkPassword(request.body.password, account?.password_hash ?? await dummy);
    if (!valid || !account?.enabled) {
      await audit(pool, null, 'auth.login_failed', null);
      fail(401, 'Invalid administrator credentials');
    }
    const sid = token();
    const csrf = hash('steward-csrf:' + sid);
    await pool.query('DELETE FROM security_sessions WHERE expires_at<now()');
    await pool.query('INSERT INTO security_sessions(token_hash,account_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval \'30 minutes\')', [hash(sid), account.account_id, hash(csrf)]);
    await audit(pool, account.account_id, 'auth.login', null);
    reply.header('Set-Cookie', `__Host-steward=${sid}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=1800`);
    return { account: { account_id: account.account_id, username: account.username, role: account.role }, csrfToken: csrf };
  });
  app.get('/api/v2/auth/session', async request => {
    const account = await session(request);
    const sid = request.headers.cookie!.split(';').map(v => v.trim()).find(v => v.startsWith('__Host-steward='))!.slice('__Host-steward='.length);
    const csrf = hash('steward-csrf:' + sid);
    return { account, csrfToken: csrf };
  });
  app.post('/api/v2/auth/logout', async (request, reply) => {
    await session(request, true);
    const sid = request.headers.cookie!.split(';').map(v => v.trim()).find(v => v.startsWith('__Host-steward='))!.slice('__Host-steward='.length);
    await pool.query('DELETE FROM security_sessions WHERE token_hash=$1', [hash(sid)]);
    reply.header('Set-Cookie', '__Host-steward=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');
    return { signedOut: true };
  });
  return { session, origin, rateLimit, actor: (request: object) => actors.get(request) ?? null };
}
export async function createAccount(pool: pg.Pool, username: string, password: string, role: string) {
  if (!/^[a-z0-9._@-]{3,80}$/.test(username) || !['registry_admin', 'enrollment_admin', 'viewer', 'local_admin'].includes(role)) throw new Error('Invalid account settings');
  const encoded = await passwordHash(password);
  const id = randomUUID();
  await pool.query('INSERT INTO security_accounts(account_id,username,password_hash,role) VALUES($1,$2,$3,$4)', [id, username, encoded, role]);
  await audit(pool, id, 'account.created', id, { role });
  return id;
}
export type Authentication = ReturnType<typeof authentication>;
