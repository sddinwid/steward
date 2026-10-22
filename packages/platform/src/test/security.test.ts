import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import type { EnrollmentGrant } from '@steward/contracts';
import { canonical, checkPassword, hash, passwordHash, publicKey, signAssertion, validateGrant, verifyAssertion } from '../security/crypto.js';

function key() { return generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(); }
test('passwords use salted memory-hard hashes and reject weak credentials', async () => {
  await assert.rejects(passwordHash('too-short'));
  const password = 'test-only-' + randomUUID();
  const first = await passwordHash(password);
  const second = await passwordHash(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await checkPassword(password, first), true);
  assert.equal(await checkPassword('incorrect-password', first), false);
});
test('signed assertions are canonical, domain bound, and reject altered payloads or keys', () => {
  const privateKey = key();
  const assertion = signAssertion({ protocol: 'steward-enrollment-v1', nonce: randomUUID() }, privateKey);
  assert.deepEqual(verifyAssertion(assertion, publicKey(privateKey)), assertion.payload);
  assert.throws(() => verifyAssertion({ ...assertion, payload: { ...assertion.payload, protocol: 'different-domain' } }, publicKey(privateKey)));
  assert.throws(() => verifyAssertion(assertion, publicKey(key())));
  assert.equal(canonical({ b: 1, a: { z: false, y: 3 } }), canonical({ a: { y: 3, z: false }, b: 1 }));
});
test('time-limited grants enforce issuer, audience, entity, key, request, lifetime and capabilities', () => {
  const privateKey = key();
  const now = Date.now();
  const expected = { issuer: randomUUID(), installationId: randomUUID(), entityId: randomUUID(), keyThumbprint: hash(publicKey(key())), requestId: randomUUID() };
  const payload: EnrollmentGrant = { version: 1, kind: 'enrollment-grant', issuer: expected.issuer, audience: expected.installationId,
    entityId: expected.entityId, keyThumbprint: expected.keyThumbprint, requestId: expected.requestId, grantId: randomUUID(), notBefore: now - 1000, expiresAt: now + 300000, capabilities: ['worker.enroll'] };
  const validate = (p: EnrollmentGrant) => validateGrant(signAssertion(p, privateKey), publicKey(privateKey), expected, now);
  assert.equal(validate(payload).entityId, expected.entityId);
  for (const changes of [{ issuer: randomUUID() }, { audience: randomUUID() }, { entityId: randomUUID() }, { keyThumbprint: 'wrong-key' },
    { requestId: randomUUID() }, { notBefore: now + 1 }, { expiresAt: now }, { expiresAt: now + 700000 }, { capabilities: [] }]) {
    assert.throws(() => validate({ ...payload, ...changes } as EnrollmentGrant));
  }
});
