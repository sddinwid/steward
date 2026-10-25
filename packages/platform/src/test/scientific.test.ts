import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {scientificHeaders,ScientificClient} from '../scientific-client.js';
import {analyticalCapabilityCatalog} from '../analytical-capabilities.js';
test('scientific transport authentication binds method, route, timestamp, nonce and exact minimized body',()=>{
 const key=Buffer.from('x'.repeat(64)),body='{"schemaVersion":1}',nonce='1'.repeat(32),headers=scientificHeaders(key,'POST','/v1/execute',body,1234567890,nonce);
 assert.equal(headers['x-steward-signature'],createHmac('sha256',key).update('1234567890\n'+nonce+'\nPOST\n/v1/execute\n'+body).digest('hex'));
 assert.notEqual(scientificHeaders(key,'DELETE','/v1/jobs/id',body,1234567890,nonce)['x-steward-signature'],headers['x-steward-signature']);
 assert(!JSON.stringify(headers).includes('x'.repeat(64)));
});
test('optional unconfigured scientific transport fails explicitly; the existing capability remains registered',async()=>{
 await assert.rejects(new ScientificClient().analyze({},new AbortController().signal),/SCIENTIFIC_NOT_CONFIGURED/);
 assert.equal(analyticalCapabilityCatalog['steward.resource-sharing']?.engine,'typescript');
 assert.equal(analyticalCapabilityCatalog['steward.scientific.describe-series']?.resources.maximumConcurrency,2);
});
