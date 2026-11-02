import test from 'node:test';import assert from 'node:assert/strict';
import {liveOperation,liveFailure} from '../modules/shopify/dist/live-recovery.js';
import {ConnectorError} from '../packages/commerce-kit/dist/index.js';
const now=Date.parse('2026-11-01T12:00:00Z'),d={status:'synced',syncedAt:new Date(now-60000).toISOString()};
test('authorized successful profile recovers transient failures with bounded persistent backoff',()=>{
 for(const code of ['CONNECTOR_UNAVAILABLE','CONNECTOR_RATE_LIMITED']){const failed={...d,status:'connection_unavailable',...liveFailure(d,new ConnectorError(code,true),'catalog',now)};assert.equal(liveOperation(failed,true,now),null);assert.equal(liveOperation(failed,true,now+60000),'catalog');assert.equal(liveOperation({...failed},true,now+60000),'catalog');assert.equal(liveOperation(failed,false,now+60000),null);const capped=liveFailure({...d,retryAttempts:100},new ConnectorError(code,true),'catalog',now);assert.equal(Date.parse(capped.nextRetryAt)-now,900000);}
});
test('unverified profiles, permanent failures and tests never enable automatic catalog reads',()=>{
 for(const code of ['SHOPIFY_AUTHENTICATION_OR_SCOPE_REJECTED','SHOPIFY_PRIVATE_CONFIGURATION_MISMATCH','SHOPIFY_STORE_IDENTITY_CHANGED','CONNECTOR_MALFORMED_RESPONSE']){const failed={...d,status:'connection_unavailable',...liveFailure(d,new ConnectorError(code),'catalog',now)};assert.equal(liveOperation(failed,true,now+99999999),null);}
 const error=new ConnectorError('CONNECTOR_UNAVAILABLE',true);for(const profile of [{}, {status:'verified'}])assert.equal(liveFailure(profile,error,'catalog',now).nextRetryAt,null);assert.equal(liveFailure(d,error,'test',now).nextRetryAt,null);assert.equal(liveOperation({status:'verified'},true,now),null);
});
test('legacy successful profile recovery and explicit manual request retain their boundaries',()=>{assert.equal(liveOperation({...d,status:'connection_unavailable',error:'CONNECTOR_UNAVAILABLE'},true,now),'catalog');assert.equal(liveOperation({requestedOperation:'test'},false,now),'test');assert.equal(liveOperation({...d,syncedAt:new Date(now).toISOString()},true,now+59999),null);});
