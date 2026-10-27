import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {canonical,digest} from '@steward/module-sdk';
import {assertInstallationContinuity,assertRuntimeInstallation} from './installation-continuity.js';

const snapshot=()=>({module_id:'test.provider',operation_id:randomUUID(),descriptor:{package:'pinned'},configuration:{integrationsEnabled:true}});
test('a same-package reinstall between route selection and lifecycle locking cannot inherit original obligations',()=>{
 const selected=snapshot(),current={...selected,state:'active'};
 assert.doesNotThrow(()=>assertInstallationContinuity([selected],[current]));
 assert.throws(()=>assertInstallationContinuity([selected],[{...current,operation_id:randomUUID()}]),/INTEGRATION_PROVIDER_CHANGED/);
 const source={...snapshot(),module_id:'test.consumer'};
 assert.throws(()=>assertInstallationContinuity([source,selected],[{...source,state:'active',operation_id:randomUUID()},current]),/INTEGRATION_PROVIDER_CHANGED/);
});
test('locked continuity rejects unavailable, disabled, reconfigured or replaced packages',()=>{
 const selected=snapshot();assert.throws(()=>assertInstallationContinuity([selected],[]));
 for(const change of [{state:'inactive'},{configuration:{integrationsEnabled:false}},{descriptor:{package:'replacement'}}])assert.throws(()=>assertInstallationContinuity([selected],[{...selected,state:'active',...change}]),/INTEGRATION_PROVIDER_CHANGED/);
});
test('new runtime attestation matches locked provider identity while legacy runtimes remain supported',()=>{
 const selected=snapshot(),worker=randomUUID(),entityId=randomUUID();
 const runtime={entityId,providerIdentity:{workerInstallationId:worker,entityId,moduleId:selected.module_id,moduleInstallationId:selected.operation_id,packageDigest:digest(canonical(selected.descriptor))}};
 assert.doesNotThrow(()=>assertRuntimeInstallation(selected,runtime,worker));assert.throws(()=>assertRuntimeInstallation(selected,{...runtime,entityId:undefined,providerIdentity:{...runtime.providerIdentity,entityId:undefined}},worker),/INTEGRATION_PROVIDER_CHANGED/);assert.doesNotThrow(()=>assertRuntimeInstallation(selected,{},worker));
 for(const change of [{workerInstallationId:randomUUID()},{entityId:randomUUID()},{moduleId:'other.provider'},{moduleInstallationId:randomUUID()},{packageDigest:'0'.repeat(64)}])assert.throws(()=>assertRuntimeInstallation(selected,{...runtime,providerIdentity:{...runtime.providerIdentity,...change}},worker),/INTEGRATION_PROVIDER_CHANGED/);
});
