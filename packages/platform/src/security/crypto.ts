import { createHash, createPrivateKey, createPublicKey, randomBytes, scrypt, sign, timingSafeEqual, verify } from 'node:crypto';
import type { EnrollmentGrant, SignedAssertion } from '@steward/contracts';

export function fail(statusCode: number, message: string): never { throw Object.assign(new Error(message), { statusCode }); }
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
export function validUuid(value: unknown): value is string { return typeof value === 'string' && new RegExp(uuidPattern).test(value); }
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort().map(k => JSON.stringify(k) + ':' + canonical(object[k])).join(',') + '}';
}
export function publicKey(privatePem: string): string {
  const key = createPrivateKey(privatePem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Expected Ed25519 key');
  return createPublicKey(key).export({ format: 'pem', type: 'spki' }).toString();
}
export function normalizePublicKey(pem: string): string {
  const key = createPublicKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') fail(400, 'Unsupported Worker key');
  return key.export({ format: 'pem', type: 'spki' }).toString();
}
export function signAssertion<T>(payload: T, key: string): SignedAssertion<T> {
  return { payload, signature: sign(null, Buffer.from(canonical(payload)), key).toString('base64url') };
}
export function verifyAssertion<T>(assertion: SignedAssertion<T>, key: string): T {
  try {
    if (!assertion || typeof assertion.signature !== 'string' || !verify(null, Buffer.from(canonical(assertion.payload)), key, Buffer.from(assertion.signature, 'base64url'))) throw new Error();
    return assertion.payload;
  } catch { return fail(403, 'Invalid signature'); }
}
export function validateGrant(assertion: SignedAssertion<EnrollmentGrant>, key: string, expected: { issuer: string; installationId: string; entityId: string; keyThumbprint: string; requestId: string }, now = Date.now()): EnrollmentGrant {
  const g = verifyAssertion(assertion, key);
  if (g.version !== 1 || g.kind !== 'enrollment-grant' || g.issuer !== expected.issuer || g.audience !== expected.installationId ||
      g.entityId !== expected.entityId || g.keyThumbprint !== expected.keyThumbprint || g.requestId !== expected.requestId ||
      !validUuid(g.grantId) || !Number.isSafeInteger(g.notBefore) || !Number.isSafeInteger(g.expiresAt) ||
      g.notBefore > now || g.expiresAt <= now || g.expiresAt - g.notBefore > 10 * 60_000 ||
      canonical(g.capabilities) !== canonical(['worker.enroll'])) fail(403, 'Enrollment grant does not match this request');
  return g;
}
async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (e, key) => e ? reject(e) : resolve(key)));
}
export async function passwordHash(password: string): Promise<string> {
  if (password.length < 16 || password.length > 256) throw new Error('Password must contain 16 to 256 characters');
  const salt = token();
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function checkPassword(password: string, encoded: string): Promise<boolean> {
  const [version, salt, digest] = encoded.split('$');
  const expected = Buffer.from(digest ?? '', 'hex');
  if (version !== 'scrypt-v1' || !salt || expected.length !== 64 || password.length > 256) return false;
  return timingSafeEqual(await derive(password, salt), expected);
}
