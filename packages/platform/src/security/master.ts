import { randomBytes, randomUUID } from 'node:crypto';
import type { InstallationConfig, EnrollmentGrant, EnrollmentCertificate, SignedAssertion } from '@steward/contracts';
import type pg from 'pg';
import type { Authentication, SecureApp } from './auth.js';
import { audit, authorized, transaction } from './store.js';
import { canonical, fail, hash, normalizePublicKey, publicKey, signAssertion, validateGrant, validUuid, verifyAssertion, uuidPattern } from './crypto.js';

export interface WorkerProof {
  protocol: 'steward-enrollment-v1';
  operation: 'start' | 'poll' | 'redeem';
  installationId: string;
  publicKey: string;
  requestId: string;
  nonce: string;
  issuedAt: number;
  entityId?: string;
  grant?: SignedAssertion<EnrollmentGrant>;
}
const idSchema = { type: 'string', pattern: uuidPattern };
export function masterRoutes(app: SecureApp, pool: pg.Pool, auth: Authentication, installation: InstallationConfig, key: string, browserOrigin: string) {
  const signingPublicKey = publicKey(key);
  async function registry(request: Parameters<Authentication['session']>[0], mutate = false) {
    const account = await auth.session(request, mutate);
    if (account.role !== 'registry_admin') fail(403, 'Registry administrator required');
    return account;
  }
  app.get('/api/v2/master/identity', async () => ({ installationId: installation.installationId, publicKey: signingPublicKey, protocol: 'steward-enrollment-v1' }));
  app.get('/api/v2/entities', async request => {
    const account = await auth.session(request);
    const rows = account.role === 'registry_admin'
      ? await pool.query('SELECT * FROM legal_entities ORDER BY name,entity_id')
      : await pool.query('SELECT e.* FROM legal_entities e JOIN entity_authorizations s USING(entity_id) WHERE s.account_id=$1 ORDER BY e.name,e.entity_id', [account.account_id]);
    return { entities: rows.rows.map(e => ({ entityId: e.entity_id, name: e.name, classification: e.classification, enrollmentEligible: e.enrollment_eligible })) };
  });
  const entitySchema = { type: 'object', additionalProperties: false, required: ['entityId', 'name', 'classification', 'enrollmentEligible'], properties: {
    entityId: idSchema, name: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' }, classification: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' }, enrollmentEligible: { type: 'boolean' }
  } };
  app.put<{ Body: { entityId: string; name: string; classification: string; enrollmentEligible: boolean } }>('/api/v2/entities', { schema: { body: entitySchema } }, async request => {
    const actor = await registry(request, true);
    const e = request.body;
    await transaction(pool, async sql => {
      await sql.query(`INSERT INTO legal_entities(entity_id,name,classification,enrollment_eligible) VALUES($1,$2,$3,$4)
        ON CONFLICT(entity_id) DO UPDATE SET name=excluded.name,classification=excluded.classification,enrollment_eligible=excluded.enrollment_eligible`, [e.entityId, e.name.trim(), e.classification.trim(), e.enrollmentEligible]);
      await audit(sql, actor.account_id, 'entity.saved', e.entityId, { enrollmentEligible: e.enrollmentEligible });
    });
    return { entity: e };
  });
  app.get('/api/v2/accounts', async request => {
    await registry(request);
    return { accounts: (await pool.query('SELECT account_id,username,role,enabled FROM security_accounts ORDER BY username')).rows,
      authorizations: (await pool.query('SELECT account_id,entity_id FROM entity_authorizations')).rows };
  });
  app.put<{ Body: { accountId: string; entityId: string; allowed: boolean } }>('/api/v2/authorizations', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['accountId', 'entityId', 'allowed'], properties: { accountId: idSchema, entityId: idSchema, allowed: { type: 'boolean' } }
  } } }, async request => {
    const actor = await registry(request, true);
    const { accountId, entityId, allowed } = request.body;
    await transaction(pool, async sql => {
      const a = (await sql.query('SELECT role FROM security_accounts WHERE account_id=$1 AND enabled', [accountId])).rows[0];
      if (!a || !['registry_admin', 'enrollment_admin'].includes(a.role)) fail(403, 'Account cannot authorize enrollment');
      if (!(await sql.query('SELECT entity_id FROM legal_entities WHERE entity_id=$1', [entityId])).rowCount) fail(404, 'Unknown legal entity');
      if (allowed) await sql.query('INSERT INTO entity_authorizations(account_id,entity_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [accountId, entityId]);
      else await sql.query('DELETE FROM entity_authorizations WHERE account_id=$1 AND entity_id=$2', [accountId, entityId]);
      await audit(sql, actor.account_id, allowed ? 'scope.granted' : 'scope.revoked', entityId, { accountId });
    });
    return { allowed };
  });
  app.get('/api/v2/audit', async request => {
    await registry(request);
    return { records: (await pool.query('SELECT audit_id,actor_id,action,target_id,detail,occurred_at FROM security_audit ORDER BY audit_id DESC LIMIT 200')).rows };
  });
  app.get('/api/v2/enrollment/requests', async request => {
    const actor = await auth.session(request);
    return { requests: (await pool.query(`SELECT r.request_id,r.installation_id,r.entity_id,r.status,r.user_code,r.expires_at,e.name,c.key_thumbprint
      FROM enrollment_requests r JOIN worker_candidates c USING(installation_id) LEFT JOIN legal_entities e USING(entity_id)
      WHERE r.entity_id IN (SELECT entity_id FROM entity_authorizations WHERE account_id=$1) ORDER BY r.created_at DESC LIMIT 100`, [actor.account_id])).rows };
  });
  app.get<{ Params: { code: string } }>('/api/v2/enrollment/authorize/:code', async request => {
    const actor = await auth.session(request);
    const r = (await pool.query(`SELECT r.request_id,r.installation_id,r.status,r.expires_at,c.key_thumbprint
      FROM enrollment_requests r JOIN worker_candidates c USING(installation_id) WHERE user_code=$1 AND expires_at>now()`, [request.params.code])).rows[0];
    if (!r) fail(404, 'Unknown or expired authorization code');
    const entities = await pool.query(`SELECT e.entity_id,e.name,e.classification FROM legal_entities e JOIN entity_authorizations s USING(entity_id)
      WHERE s.account_id=$1 AND e.enrollment_eligible ORDER BY e.name`, [actor.account_id]);
    return { request: r, entities: entities.rows };
  });
  app.post<{ Body: { code: string; entityId: string } }>('/api/v2/enrollment/authorize', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['code', 'entityId'], properties: { code: { type: 'string', minLength: 12, maxLength: 32 }, entityId: idSchema }
  } } }, async request => {
    const actor = await auth.session(request, true);
    return transaction(pool, async sql => {
      const r = (await sql.query('SELECT * FROM enrollment_requests WHERE user_code=$1 FOR UPDATE', [request.body.code])).rows[0];
      if (!r || new Date(r.expires_at).getTime() <= Date.now()) fail(410, 'Authorization request expired');
      await authorized(sql, actor.account_id, request.body.entityId);
      if (r.status !== 'authorizing') {
        if (r.entity_id === request.body.entityId && r.requested_by === actor.account_id && ['pending', 'approved', 'enrolled'].includes(r.status)) return { status: r.status };
        fail(409, 'Request is already bound to another entity or administrator');
      }
      await sql.query("UPDATE enrollment_requests SET entity_id=$1,requested_by=$2,status='pending' WHERE request_id=$3", [request.body.entityId, actor.account_id, r.request_id]);
      await audit(sql, actor.account_id, 'enrollment.requested', r.request_id, { entityId: request.body.entityId });
      return { status: 'pending' };
    });
  });
  app.post<{ Body: { requestId: string; entityId: string; decision: 'approve' | 'reject' } }>('/api/v2/enrollment/decision', { schema: { body: {
    type: 'object', additionalProperties: false, required: ['requestId', 'entityId', 'decision'], properties: { requestId: idSchema, entityId: idSchema, decision: { type: 'string', enum: ['approve', 'reject'] } }
  } } }, async request => {
    const actor = await auth.session(request, true);
    const b = request.body;
    return transaction(pool, async sql => {
      const r = (await sql.query(`SELECT r.*,c.key_thumbprint FROM enrollment_requests r JOIN worker_candidates c USING(installation_id)
        WHERE request_id=$1 FOR UPDATE OF r`, [b.requestId])).rows[0];
      if (!r) fail(404, 'Unknown enrollment request');
      if (r.entity_id !== b.entityId) fail(403, 'Wrong legal entity');
      await authorized(sql, actor.account_id, b.entityId);
      await authorized(sql, r.requested_by, b.entityId);
      if (r.status === (b.decision === 'approve' ? 'approved' : 'rejected') || (b.decision === 'approve' && r.status === 'enrolled')) return { status: r.status };
      if (r.status !== 'pending' || new Date(r.expires_at).getTime() <= Date.now()) fail(409, 'Enrollment request cannot be decided');
      const grant = b.decision === 'approve' ? signAssertion<EnrollmentGrant>({ version: 1, kind: 'enrollment-grant', issuer: installation.installationId,
        audience: r.installation_id, entityId: b.entityId, keyThumbprint: r.key_thumbprint, requestId: r.request_id,
        grantId: randomUUID(), notBefore: Date.now(), expiresAt: Date.now() + 600_000, capabilities: ['worker.enroll'] }, key) : null;
      const status = b.decision === 'approve' ? 'approved' : 'rejected';
      await sql.query('UPDATE enrollment_requests SET status=$1,decided_by=$2,authorization_grant=$3 WHERE request_id=$4', [status, actor.account_id, grant, r.request_id]);
      await audit(sql, actor.account_id, `enrollment.${status}`, r.request_id, { entityId: b.entityId });
      return { status };
    });
  });
  // Backchannel only: every operation requires a fresh, signed, time-bounded proof.
  app.post<{ Body: SignedAssertion<WorkerProof> }>('/api/v2/enrollment/proof', async request => {
    await auth.rateLimit(`proof:${request.ip}`, 120);
    const proof = request.body;
    const p = proof?.payload;
    if (!p || p.protocol !== 'steward-enrollment-v1' || !['start', 'poll', 'redeem'].includes(p.operation) ||
        !validUuid(p.installationId) || !validUuid(p.requestId) || !validUuid(p.nonce) ||
        typeof p.publicKey !== 'string' || p.publicKey.length > 200 || !Number.isSafeInteger(p.issuedAt) || Math.abs(Date.now() - p.issuedAt) > 60_000) fail(400, 'Invalid Worker proof');
    const workerKey = normalizePublicKey(p.publicKey);
    verifyAssertion(proof, workerKey);
    return transaction(pool, async sql => {
      await sql.query('DELETE FROM enrollment_nonces WHERE expires_at<now()');
      const nonce = await sql.query('INSERT INTO enrollment_nonces(installation_id,nonce,expires_at) VALUES($1,$2,now()+interval \'5 minutes\') ON CONFLICT DO NOTHING', [p.installationId, p.nonce]);
      if (!nonce.rowCount) fail(409, 'Replayed Worker proof');
      if (p.operation === 'start') {
        await sql.query(`INSERT INTO worker_candidates(installation_id,public_key,key_thumbprint) VALUES($1,$2,$3) ON CONFLICT(installation_id) DO NOTHING`, [p.installationId, workerKey, hash(workerKey)]);
      }
      const candidate = (await sql.query('SELECT * FROM worker_candidates WHERE installation_id=$1 FOR UPDATE', [p.installationId])).rows[0];
      if (!candidate || candidate.public_key !== workerKey) fail(409, 'Installation identity is already bound to a different key');
      if (p.operation === 'start') {
        await sql.query("UPDATE enrollment_requests SET status='expired',authorization_grant=NULL WHERE installation_id=$1 AND expires_at<now() AND status IN ('authorizing','pending','approved')", [p.installationId]);
        const existing = (await sql.query('SELECT * FROM enrollment_requests WHERE request_id=$1', [p.requestId])).rows[0];
        if (existing && existing.installation_id !== p.installationId) fail(409, 'Idempotency identity mismatch');
        if (!existing) {
          const active = await sql.query("SELECT request_id FROM enrollment_requests WHERE installation_id=$1 AND status IN ('authorizing','pending','approved','enrolled')", [p.installationId]);
          if (active.rowCount) fail(409, 'Installation already has an active or completed enrollment');
          const code = randomBytes(9).toString('hex').toUpperCase();
          await sql.query("INSERT INTO enrollment_requests(request_id,installation_id,user_code,status,expires_at) VALUES($1,$2,$3,'authorizing',now()+interval '15 minutes')", [p.requestId, p.installationId, code]);
          await audit(sql, null, 'enrollment.started', p.requestId, { installationId: p.installationId, keyThumbprint: hash(workerKey) });
        }
      }
      const r = (await sql.query('SELECT r.*,e.name FROM enrollment_requests r LEFT JOIN legal_entities e USING(entity_id) WHERE request_id=$1 AND installation_id=$2 FOR UPDATE OF r', [p.requestId, p.installationId])).rows[0];
      if (!r) fail(404, 'Unknown enrollment request');
      if (new Date(r.expires_at).getTime() <= Date.now() && !['enrolled', 'rejected'].includes(r.status)) {
        await sql.query("UPDATE enrollment_requests SET status='expired',authorization_grant=NULL WHERE request_id=$1", [p.requestId]);
        r.status = 'expired'; r.authorization_grant = null;
      }
      if (p.operation === 'redeem') {
        if (!p.grant || !p.entityId || p.entityId !== r.entity_id) fail(403, 'Wrong legal entity or missing grant');
        // Validate even an idempotent retry; a stale replay is never a new authorization.
        validateGrant(p.grant, signingPublicKey, { issuer: installation.installationId, installationId: p.installationId, entityId: r.entity_id, keyThumbprint: candidate.key_thumbprint, requestId: p.requestId });
        if (!r.authorization_grant || canonical(r.authorization_grant.payload) !== canonical(p.grant.payload) || r.authorization_grant.signature !== p.grant.signature) fail(403, 'Grant was not issued for this request');
        if (r.status !== 'approved' && r.status !== 'enrolled') fail(409, 'Enrollment has not been approved');
        await authorized(sql, r.requested_by, r.entity_id);
        await authorized(sql, r.decided_by, r.entity_id);
        if (r.status !== 'enrolled') {
          const certificate = signAssertion<EnrollmentCertificate>({ version: 1, kind: 'worker-enrollment', issuer: installation.installationId,
            installationId: p.installationId, entityId: r.entity_id, keyThumbprint: candidate.key_thumbprint, requestId: p.requestId, serial: randomUUID(), issuedAt: Date.now() }, key);
          await sql.query('INSERT INTO enrolled_workers(installation_id,entity_id,key_thumbprint,request_id,certificate) VALUES($1,$2,$3,$4,$5)', [p.installationId, r.entity_id, candidate.key_thumbprint, p.requestId, certificate]);
          await sql.query("UPDATE enrollment_requests SET status='enrolled',certificate=$1 WHERE request_id=$2", [certificate, p.requestId]);
          await audit(sql, r.decided_by, 'enrollment.completed', p.requestId, { entityId: r.entity_id, installationId: p.installationId });
          r.status = 'enrolled'; r.certificate = certificate;
        }
      }
      return { status: r.status, requestId: r.request_id, userCode: r.user_code, entityId: r.entity_id, entityName: r.name,
        verificationUri: `${browserOrigin}/?authorize=${r.user_code}`, expiresAt: r.expires_at,
        ...(r.status === 'approved' ? { grant: r.authorization_grant } : {}), ...(r.status === 'enrolled' ? { certificate: r.certificate } : {}) };
    });
  });
}
