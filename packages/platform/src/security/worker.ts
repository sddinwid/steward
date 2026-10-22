import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { InstallationConfig, EnrollmentCertificate, SignedAssertion, EnrollmentGrant } from '@steward/contracts';
import type { SecureApp, Authentication } from './auth.js';
import type { SecurityConfig, TrustedMaster } from './config.js';
import type { WorkerProof } from './master.js';
import { audit, transaction } from './store.js';
import { fail, hash, publicKey, signAssertion, validateGrant, verifyAssertion, uuidPattern } from './crypto.js';

export async function masterRequest(profile: TrustedMaster, pathname: string, body?: unknown): Promise<Record<string, any>> {
  const ca = await readFile(profile.caFile, 'utf8');
  const url = new URL(pathname, profile.apiUrl);
  if (url.origin !== profile.apiUrl || url.protocol !== 'https:') throw new Error('Untrusted destination');
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = httpsRequest(url, { method: data ? 'POST' : 'GET', ca, rejectUnauthorized: true, timeout: 3000,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {} }, res => {
      let response = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { response += chunk; if (response.length > 65536) req.destroy(new Error('Master response too large')); });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(Object.assign(new Error('Master request rejected'), { statusCode: res.statusCode }));
        try { resolve(JSON.parse(response)); } catch { reject(new Error('Invalid Master response')); }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Master connection timed out')));
    req.on('error', reject);
    req.end(data);
  });
}
export async function workerRoutes(app: SecureApp, pool: pg.Pool, auth: Authentication, installation: InstallationConfig, key: string, security: SecurityConfig) {
  const workerPublicKey = publicKey(key);
  const thumbprint = hash(workerPublicKey);
  let available: boolean | null = null;
  let busy = false;
  async function local(request: Parameters<Authentication['session']>[0], mutate = false) {
    const account = await auth.session(request, mutate);
    if (account.role !== 'local_admin') fail(403, 'Local administrator required');
    return account;
  }
  function profile(id: string) {
    const p = security.trustedMasters.find(p => p.profileId === id);
    if (!p) fail(400, 'Master profile is not trusted; an operator must install its trust bundle');
    return p;
  }
  function certificate(assertion: SignedAssertion<EnrollmentCertificate>, trusted: TrustedMaster, row: any) {
    const c = verifyAssertion(assertion, trusted.publicKey);
    if (c.kind !== 'worker-enrollment' || c.version !== 1 || c.issuer !== trusted.installationId || c.installationId !== installation.installationId ||
        c.keyThumbprint !== thumbprint || c.requestId !== row.request_id || c.entityId !== row.entity_id) throw new Error('Enrollment certificate mismatch');
    return c;
  }
  const stored = (await pool.query('SELECT * FROM local_enrollment WHERE singleton')).rows[0];
  if (stored?.state === 'enrolled') certificate(stored.certificate, profile(stored.profile_id), stored);
  async function proof(trusted: TrustedMaster, operation: WorkerProof['operation'], row: any, extra = {}) {
    const payload: WorkerProof = { protocol: 'steward-enrollment-v1', operation, installationId: installation.installationId,
      publicKey: workerPublicKey, requestId: row.request_id, nonce: randomUUID(), issuedAt: Date.now(), ...extra };
    return masterRequest(trusted, '/api/v2/enrollment/proof', signAssertion(payload, key));
  }
  async function synchronize() {
    if (busy) return;
    busy = true;
    try {
      const row = (await pool.query('SELECT * FROM local_enrollment WHERE singleton')).rows[0];
      if (!row) return;
      const trusted = profile(row.profile_id);
      const identity = await masterRequest(trusted, '/api/v2/master/identity');
      if (identity.installationId !== trusted.installationId || identity.publicKey !== trusted.publicKey || identity.protocol !== 'steward-enrollment-v1') throw new Error('Master identity pin mismatch');
      available = true;
      if (row.state !== 'pending' || !row.request_id) return;
      let response = await proof(trusted, 'start', row);
      if (response.status === 'approved') {
        const grant = response.grant as SignedAssertion<EnrollmentGrant>;
        validateGrant(grant, trusted.publicKey, { issuer: trusted.installationId, installationId: installation.installationId,
          entityId: response.entityId, keyThumbprint: thumbprint, requestId: row.request_id });
        response = await proof(trusted, 'redeem', row, { entityId: response.entityId, grant });
      }
      const state = response.status === 'enrolled' ? 'enrolled' : response.status === 'rejected' ? 'rejected' : response.status === 'expired' ? 'expired' : 'pending';
      if (state === 'enrolled') certificate(response.certificate, trusted, { ...row, entity_id: response.entityId });
      await transaction(pool, async sql => {
        await sql.query(`UPDATE local_enrollment SET state=$1,user_code=$2,entity_id=$3,entity_name=$4,certificate=$5,updated_at=now() WHERE singleton AND request_id=$6`,
          [state, response.userCode, response.entityId, response.entityName, state === 'enrolled' ? response.certificate : null, row.request_id]);
        if (state === 'enrolled') await audit(sql, null, 'enrollment.persisted', row.request_id, { entityId: response.entityId, masterInstallationId: trusted.installationId });
      });
    } catch { available = false; }
    finally { busy = false; }
  }
  app.get('/api/v2/worker/status', async () => {
    const row = (await pool.query('SELECT * FROM local_enrollment WHERE singleton')).rows[0];
    const trusted = row ? profile(row.profile_id) : undefined;
    return { enrollmentState: row?.state ?? 'unenrolled', status: available === false ? 'connection_unavailable' : row?.state ?? 'unenrolled',
      masterAvailable: available, installationId: installation.installationId, keyThumbprint: thumbprint,
      entityId: row?.entity_id ?? null, entityName: row?.entity_name ?? null, requestId: row?.request_id ?? null,
      userCode: row?.user_code ?? null, verificationUri: row?.user_code && trusted ? `${trusted.browserUrl}/?authorize=${row.user_code}` : null,
      profileId: row?.profile_id ?? null,
      profiles: security.trustedMasters.map(p => ({ profileId: p.profileId, browserUrl: p.browserUrl, installationId: p.installationId, signingKeyThumbprint: hash(p.publicKey) })) };
  });
  app.put<{ Body: { profileId: string } }>('/api/v2/worker/connection', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['profileId'], properties: { profileId: { type: 'string', minLength: 1, maxLength: 80 } }
  } } }, async request => {
    const actor = await local(request, true);
    profile(request.body.profileId);
    await transaction(pool, async sql => {
      const row = (await sql.query('SELECT * FROM local_enrollment WHERE singleton FOR UPDATE')).rows[0];
      if (row && row.state !== 'unenrolled' && row.profile_id !== request.body.profileId) fail(409, 'Cannot change Master during or after enrollment');
      await sql.query(`INSERT INTO local_enrollment(singleton,profile_id,state) VALUES(true,$1,'unenrolled') ON CONFLICT(singleton) DO UPDATE SET profile_id=excluded.profile_id`, [request.body.profileId]);
      await audit(sql, actor.account_id, 'connection.configured', request.body.profileId);
    });
    available = null;
    void synchronize();
    return { configured: true };
  });
  app.post<{ Body: { requestId: string } }>('/api/v2/worker/start', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['requestId'], properties: { requestId: { type: 'string', pattern: uuidPattern } }
  } } }, async request => {
    const actor = await local(request, true);
    await transaction(pool, async sql => {
      const row = (await sql.query('SELECT * FROM local_enrollment WHERE singleton FOR UPDATE')).rows[0];
      if (!row) fail(409, 'Select a trusted Master first');
      if (row.request_id === request.body.requestId) return;
      if (row.state === 'enrolled' || row.state === 'pending') fail(409, 'Existing enrollment request is already active');
      await sql.query("UPDATE local_enrollment SET request_id=$1,state='pending',user_code=NULL,entity_id=NULL,entity_name=NULL,certificate=NULL WHERE singleton", [request.body.requestId]);
      await audit(sql, actor.account_id, 'enrollment.started', request.body.requestId);
    });
    void synchronize();
    return { status: 'pending', requestId: request.body.requestId };
  });
  const interval = setInterval(() => void synchronize(), 3000).unref();
  void synchronize();
  app.addHook('onClose', async () => { clearInterval(interval); });
}
