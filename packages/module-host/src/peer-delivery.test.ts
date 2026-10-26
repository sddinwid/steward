import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {canonical,digest,type IntegrationCommand,type ModulePackageManifest} from '@steward/module-sdk';
import {peerDeliveryHeaders,peerAcknowledgment} from './peer-delivery.js';

function fixture(){
 const worker=randomUUID(),provider=randomUUID(),entity=randomUUID(),source=randomUUID(),sourceProgram=randomUUID(),destinationProgram=randomUUID();
 const input={type:'object',additionalProperties:false,required:['programId','sourceProgramId'],properties:{programId:{type:'string'},sourceProgramId:{type:'string'}}};
 const manifest={moduleId:'test.provider',smart:{prerequisites:{configuration:{}},provides:[{capabilityId:'test.service',configuration:{integrationsEnabled:true},operations:[{name:'request',command:'service.request',input,output:{type:'object'},mode:'durable',retry:'safe'}]}]},integration:{acknowledgmentPath:'/integration-ack'}} as unknown as ModulePackageManifest;
 const command:IntegrationCommand={protocol:'steward-module-integration-v1',commandId:randomUUID(),aggregateId:randomUUID(),sequence:1,version:1,sourceModuleId:'test.consumer',targetModuleId:'test.provider',command:'service.request',occurredAt:new Date().toISOString(),payload:{sourceProgramId:sourceProgram,programId:destinationProgram},capability:{capabilityId:'test.service',operation:'request'}};
 const scope={sourceEntityId:randomUUID(),sourceInstallationId:source,sourceProgramId:sourceProgram,destinationEntityId:entity,destinationInstallationId:worker,destinationProgramId:destinationProgram,consumerModuleId:'test.consumer',purpose:'synthetic.service',grantId:randomUUID(),providerInstallationId:provider,packageDigest:'a'.repeat(64),expiresAt:Date.now()+60000,sourceActorId:randomUUID(),destinationActorId:randomUUID()};
 const deliver=(s:any=scope,c:IntegrationCommand=command,configuration={integrationsEnabled:true})=>peerDeliveryHeaders({scope:s,command:c},manifest,configuration,worker,provider,'a'.repeat(64),entity);
 return{worker,provider,entity,manifest,command,scope,deliver};
}
test('private peer delivery binds exact enrolled identity and installed package',()=>{
 const f=fixture(),r=f.deliver();assert.equal(r.headers['x-steward-installation'],f.worker);assert.equal(JSON.parse(r.headers['x-steward-peer-scope']).destinationActorId,f.scope.destinationActorId);
 for(const key of ['destinationEntityId','destinationInstallationId','providerInstallationId','destinationProgramId','sourceProgramId'])assert.throws(()=>f.deliver({...f.scope,[key]:randomUUID()}),/INTEGRATION_PEER_AUTHORITY_INVALID/);
 assert.throws(()=>f.deliver({...f.scope,packageDigest:'b'.repeat(64)}),/INTEGRATION_PEER_AUTHORITY_INVALID/);
});
test('private scope rejects extra fields, expired approvals and payload authority',()=>{
 const f=fixture();for(const s of [{...f.scope,permissions:['admin']},{...f.scope,expiresAt:Date.now()-1},{...f.scope,sourceActorId:'admin'},{...f.scope,purpose:'unsafe?route'}])assert.throws(()=>f.deliver(s),/INTEGRATION_PEER_AUTHORITY_INVALID/);
 assert.throws(()=>f.deliver(f.scope,{...f.command,payload:{...f.command.payload,actorId:randomUUID()}}),/INTEGRATION_PEER_AUTHORITY_INVALID/);
});
test('private delivery checks declared safe durable operation and current configuration',()=>{
 const f=fixture();assert.throws(()=>f.deliver(f.scope,f.command,{integrationsEnabled:false}),/INTEGRATION_PEER_AUTHORITY_INVALID/);
 assert.throws(()=>f.deliver(f.scope,{...f.command,command:'unapproved.operation'}),/INTEGRATION_PEER_AUTHORITY_INVALID/);
 assert.throws(()=>f.deliver(f.scope,{...f.command,payload:{...f.command.payload,arbitrary:'data'}}),/CAPABILITY_SCHEMA_MISMATCH/);
});
test('remote acknowledgment preserves original source command digest, never routed digest',()=>{
 const f=fixture(),m={...f.manifest,moduleId:f.command.sourceModuleId};
 const ack=peerAcknowledgment(f.command,{outcome:'delivered',result:{status:'requested'},errorCode:null},m);
 assert.equal(ack.digest,digest(canonical(f.command)));assert.equal(ack.commandId,f.command.commandId);
 assert.throws(()=>peerAcknowledgment(f.command,{outcome:'delivered',result:null,errorCode:null},m),/INTEGRATION_PEER_RECEIPT_INVALID/);
 assert.throws(()=>peerAcknowledgment(f.command,{outcome:'rejected',result:null,errorCode:'raw text or secret'},m),/INTEGRATION_PEER_RECEIPT_INVALID/);
});
