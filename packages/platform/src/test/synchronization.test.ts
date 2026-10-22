import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataEvent, validateEvent } from '../synchronization.js';
import type { InstallationConfig } from '@steward/contracts';
const source={configVersion:1,installationId:'11111111-1111-4111-8111-111111111111',role:'worker',entity:{entityId:'22222222-2222-4222-8222-222222222222',displayName:'Source'}} as InstallationConfig;
test('durable envelopes reject malformed IDs, unsafe revisions and unsupported versions',()=>{
 const e=dataEvent(source,'33333333-3333-4333-8333-333333333333','finding.status','44444444-4444-4444-8444-444444444444',1,{status:'acknowledged'});validateEvent(e);
 for(const change of [{eventId:'invalid'},{recordRevision:0},{recordRevision:2},{payloadVersion:2},{occurredAt:'invalid'},{payload:[]},{streamId:'../escape'}])assert.throws(()=>validateEvent({...e,...change} as any));
});
