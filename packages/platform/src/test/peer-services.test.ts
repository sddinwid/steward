import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type pg from 'pg';
import type {EnrollmentCertificate} from '@steward/contracts';
import {canonical,digest,signPackage,resolveCapability,INTEGRATION_PROTOCOL,type ModulePackageManifest,type CapabilityContract,type CapabilityRequirement,type IntegrationCommand,type CapabilityProvider} from '@steward/module-sdk';
import {hash,signAssertion} from '../security/crypto.js';
import {peerTlsCaFingerprint,verifyPeerProfile,peerGrantDigest,verifyPeerGrant,signPeerCommand,verifyPeerCommand,peerDeliveryDigest,consumePeerNonce,verifyPeerReceipt,requestPeerCommand,type VerifiedPeerProfile} from '../peer-services.js';
import type {PeerProfilePayload,PeerGrantPayload,PeerGrant,PeerReceiptPayload} from '../peer-service-schema.js';

// This fixture generates its own short-lived key/certificate, never reads an
// operator deployment and never prints key material. No private PEM is embedded.
const directory=await mkdtemp(path.join(tmpdir(),'steward-peer-security-'));
const openssl=process.env.STEWARD_OPENSSL??(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
await writeFile(path.join(directory,'openssl.cnf'),'[req]\ndistinguished_name=dn\n[dn]\n');
execFileSync(openssl,['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,digitalSignature,keyCertSign,cRLSign','-keyout',path.join(directory,'ca-key.pem'),'-out',path.join(directory,'ca-cert.pem')],{stdio:'pipe',env:{...process.env,OPENSSL_CONF:path.join(directory,'openssl.cnf'),MSYS_NO_PATHCONV:'1'}});
const ca=await readFile(path.join(directory,'ca-cert.pem'),'utf8'),tlsKey=await readFile(path.join(directory,'ca-key.pem'),'utf8');
execFileSync(openssl,['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-days','2','-subj','/CN=Untrusted test CA','-addext','basicConstraints=critical,CA:TRUE','-keyout',path.join(directory,'untrusted-key.pem'),'-out',path.join(directory,'untrusted-cert.pem')],{stdio:'pipe',env:{...process.env,OPENSSL_CONF:path.join(directory,'openssl.cnf'),MSYS_NO_PATHCONV:'1'}});
const untrustedCa=await readFile(path.join(directory,'untrusted-cert.pem'),'utf8');
after(async()=>{assert(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});});
const pair=()=>{const p=generateKeyPairSync('ed25519');return{key:p.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKey:p.publicKey.export({type:'spki',format:'pem'}).toString()};};
const input={type:'object',additionalProperties:false,required:['referralId','programId','sourceProgramId'],properties:{programId:{type:'string'},sourceProgramId:{type:'string'},referralId:{type:'string',maxLength:40}}},output={type:'object',additionalProperties:false,required:['status'],properties:{status:{type:'string',enum:['requested']}}};
const capability:CapabilityContract={capabilityId:'services.placement',contract:'steward.placement',version:'1.0.0',operations:[{name:'request',command:'placement.request',input,output,permission:'example.provider.manage',mode:'durable',idempotency:'required',retry:'safe'}],events:[],sensitivity:'restricted',scope:'entity',ownership:'provider'};
const requirement:CapabilityRequirement={capabilityId:capability.capabilityId,contract:capability.contract,minimumVersion:'1.0.0',maximumMajor:1,operations:[{name:'request',input,output}],events:[],maximumSensitivity:'restricted',optional:false};
function manifest(id:string,provider:boolean):ModulePackageManifest{return{manifestVersion:1,sdkVersion:1,moduleId:id,version:'1.0.0',name:'Synthetic peer fixture',description:'Isolated protocol verification',minimumPlatformVersion:'0.13.0',dependencies:[],requiredPermissions:['storage.own-database'],api:[{operationId:'report',method:'GET',path:'/report',permission:id+'.manage'}],ui:[],configurationSchema:{type:'object',additionalProperties:false,properties:{}},persistence:{isolation:'dedicated-database',schemaVersion:1,migrations:[{version:1,sha256:'a'.repeat(64)}],destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[],integration:{version:1,outboxPath:'/integration-outbox',inboxPath:'/integration-inbox',acknowledgmentPath:'/integration-ack',peers:[]},smart:{version:1,provides:provider?[capability]:[],consumes:provider?[]:[requirement],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}}};}
function fixture(origin='https://receiver.localhost:9443'){
 const now=Date.now(),master=pair(),sourceKey=pair(),destinationKey=pair(),publisher=pair(),issuer=randomUUID(),sourceId=randomUUID(),destinationId=randomUUID(),sourceEntity=randomUUID(),destinationEntity=randomUUID(),consumerId=randomUUID(),providerId=randomUUID();
 const trust={publishers:[{publisherId:'fixture-publisher',publicKey:publisher.publicKey}]},masters=[{installationId:issuer,publicKey:master.publicKey}];
 function profile(id:string,entityId:string,keys:ReturnType<typeof pair>,url:string,isProvider:boolean){const descriptor=signPackage({formatVersion:1,publisherId:'fixture-publisher',imageId:'sha256:'+'a'.repeat(64),manifest:manifest(isProvider?'example.provider':'example.consumer',isProvider)},publisher.key);const certificate=signAssertion<EnrollmentCertificate>({version:1,kind:'worker-enrollment',issuer,installationId:id,entityId,keyThumbprint:hash(keys.publicKey),requestId:randomUUID(),serial:randomUUID(),issuedAt:now-1000},master.key);const payload:PeerProfilePayload={version:1,kind:'ssma-peer-profile',profileId:randomUUID(),installationId:id,entityId,origin:url,publicKey:keys.publicKey,certificate,tlsCaSha256:peerTlsCaFingerprint(ca),issuedAt:now,expiresAt:now+300000,providers:[{moduleId:descriptor.payload.manifest.moduleId,providerInstallationId:isProvider?providerId:consumerId,descriptor,state:'active',configuredCapabilities:isProvider?[capability.capabilityId]:[]}]};const assertion=signAssertion(payload,keys.key),pins={installationId:id,entityId,origin:url,tlsCaPem:ca,publisherTrust:trust};return{assertion,pins,verified:verifyPeerProfile(assertion,pins,masters,now)};}
 const source=profile(sourceId,sourceEntity,sourceKey,'https://source.localhost:9443',false),destination=profile(destinationId,destinationEntity,destinationKey,origin,true);
 const grantPayload:PeerGrantPayload={version:1,kind:'ssma-peer-grant',grantId:randomUUID(),sourceInstallationId:sourceId,sourceEntityId:sourceEntity,sourceProgramId:randomUUID(),consumerModuleId:'example.consumer',consumerInstallationId:consumerId,consumerPackageDigest:source.verified.providers[0]!.packageDigest,destinationInstallationId:destinationId,destinationEntityId:destinationEntity,destinationProgramId:randomUUID(),providerModuleId:'example.provider',providerInstallationId:providerId,providerPackageDigest:destination.verified.providers[0]!.packageDigest,capabilityId:capability.capabilityId,operations:['request'],purpose:'housing-placement',maximumSensitivity:'restricted',disclosureBasis:'synthetic-consent',authorityReference:randomUUID(),notBefore:now-1000,expiresAt:now+86400000};
 const approve=(payload:PeerGrantPayload):PeerGrant=>({payload,sourceApproval:signAssertion({version:1 as const,kind:'ssma-peer-approval' as const,side:'source' as const,grantDigest:peerGrantDigest(payload),actorId:randomUUID(),role:'local_admin' as const,reviewedAt:now},sourceKey.key),destinationApproval:signAssertion({version:1 as const,kind:'ssma-peer-approval' as const,side:'destination' as const,grantDigest:peerGrantDigest(payload),actorId:randomUUID(),role:'local_admin' as const,reviewedAt:now},destinationKey.key)});
 const grant=verifyPeerGrant(approve(grantPayload),source.verified,destination.verified,now),expected={sourceProgramId:grantPayload.sourceProgramId,destinationProgramId:grantPayload.destinationProgramId,purpose:grantPayload.purpose,operation:'request'};
 const command:IntegrationCommand={protocol:INTEGRATION_PROTOCOL,commandId:randomUUID(),sourceModuleId:'example.consumer',targetModuleId:'example.provider',command:'placement.request',version:1,aggregateId:randomUUID(),sequence:1,occurredAt:new Date(now).toISOString(),payload:{referralId:randomUUID(),programId:grantPayload.destinationProgramId,sourceProgramId:grantPayload.sourceProgramId},capability:{capabilityId:capability.capabilityId,operation:'request'}};
 const provider:CapabilityProvider={moduleId:'example.provider',moduleVersion:'1.0.0',installationId:providerId,entityId:destinationEntity,packageDigest:grantPayload.providerPackageDigest,state:'active',configured:true,capability};
 return{now,master,publisher,sourceKey,destinationKey,source,destination,masters,trust,grantPayload,approve,grant,expected,command,provider};
}

test('peer profiles verify existing enrollment identity, explicit HTTPS/CA pins and signed installed packages',()=>{
 const f=fixture();assert.equal(f.source.verified.profile.installationId,f.source.assertion.payload.installationId);assert.equal(f.destination.verified.providers[0]!.packageDigest,digest(canonical(f.destination.assertion.payload.providers[0]!.descriptor)));
 assert.throws(()=>verifyPeerProfile(f.source.assertion,{...f.source.pins,origin:'http://source.localhost:9443'},f.masters,f.now),/PEER_PROFILE_INVALID/);
 assert.throws(()=>verifyPeerProfile(f.source.assertion,{...f.source.pins,installationId:randomUUID()},f.masters,f.now),/PIN_MISMATCH/);
 assert.throws(()=>verifyPeerProfile(f.source.assertion,f.source.pins,[],f.now),/ISSUER_UNTRUSTED/);
 assert.throws(()=>verifyPeerProfile(f.source.assertion,f.source.pins,f.masters,f.now+300001),/PROFILE_EXPIRED/);
 assert.throws(()=>verifyPeerProfile({...f.source.assertion,payload:{...f.source.assertion.payload,entityId:randomUUID()}},f.source.pins,f.masters,f.now),/PIN_MISMATCH/);
 assert.throws(()=>verifyPeerProfile(f.source.assertion,{...f.source.pins,publisherTrust:{publishers:[]}},f.masters,f.now),/PROFILE_INVALID/);
 assert.throws(()=>verifyPeerProfile(signAssertion({...f.source.assertion.payload,publicKey:f.sourceKey.key},f.sourceKey.key),f.source.pins,f.masters,f.now),/PROFILE_PRIVATE_KEY/);
 assert.throws(()=>peerTlsCaFingerprint(ca+'\n'+tlsKey),/TLS_PIN_INVALID/);
});

test('profile signature/key/certificate changes, provider tampering and auto-substitution are rejected',()=>{
 const f=fixture(),p=f.destination.assertion.payload;
 assert.throws(()=>verifyPeerProfile(signAssertion(p,pair().key),f.destination.pins,f.masters,f.now),/PROFILE_INVALID/);
 assert.throws(()=>verifyPeerProfile(signAssertion({...p,publicKey:pair().publicKey},f.destinationKey.key),f.destination.pins,f.masters,f.now),/CERTIFICATE_MISMATCH/);
 assert.throws(()=>verifyPeerProfile(signAssertion({...p,tlsCaSha256:'f'.repeat(64)},f.destinationKey.key),f.destination.pins,f.masters,f.now),/TLS_PIN_MISMATCH/);
 const altered=structuredClone(p);altered.providers[0]!.descriptor.payload=(altered.providers[0]!.descriptor.payload as any);(altered.providers[0]!.descriptor.payload as any).manifest.version='2.0.0';
 assert.throws(()=>verifyPeerProfile(signAssertion(altered,f.destinationKey.key),f.destination.pins,f.masters,f.now),/PROFILE_INVALID/);
 const changed={...f.grantPayload,providerInstallationId:randomUUID()};assert.throws(()=>verifyPeerGrant(f.approve(changed),f.source.verified,f.destination.verified,f.now),/PROVIDER_CHANGED/);
 const changedPackage={...f.grantPayload,providerPackageDigest:'f'.repeat(64)};assert.throws(()=>verifyPeerGrant(f.approve(changedPackage),f.source.verified,f.destination.verified,f.now),/PROVIDER_CHANGED/);
});

test('two-sided approvals bind exact programs, consumers, operation, purpose and a finite lifetime; entity-only resolver remains unchanged',()=>{
 const f=fixture();assert.equal(resolveCapability(requirement,[f.provider],{entityId:f.source.verified.profile.entityId,permissions:['example.provider.manage']}).selected,null);
 const noDestination={...f.approve(f.grantPayload),destinationApproval:f.approve(f.grantPayload).sourceApproval};assert.throws(()=>verifyPeerGrant(noDestination,f.source.verified,f.destination.verified,f.now),/GRANT_INVALID/);
 const changed={...f.approve(f.grantPayload),payload:{...f.grantPayload,purpose:'other-purpose'}};assert.throws(()=>verifyPeerGrant(changed,f.source.verified,f.destination.verified,f.now),/APPROVAL_MISMATCH/);
 assert.throws(()=>verifyPeerGrant(f.approve({...f.grantPayload,expiresAt:f.now-1}),f.source.verified,f.destination.verified,f.now),/GRANT_EXPIRED/);
 assert.throws(()=>verifyPeerGrant(f.approve({...f.grantPayload,expiresAt:f.now+32*86400000}),f.source.verified,f.destination.verified,f.now),/GRANT_EXPIRED/);
 assert.throws(()=>verifyPeerGrant(f.approve({...f.grantPayload,operations:['approve-production']}),f.source.verified,f.destination.verified,f.now),/CAPABILITY_NOT_AUTHORIZED/);
 assert.throws(()=>verifyPeerGrant(f.approve({...f.grantPayload,maximumSensitivity:'business'}),f.source.verified,f.destination.verified,f.now),/SENSITIVITY_EXCEEDED/);
});

test('durable attempts rotate nonce while retaining original command/delivery identity and exact immutable provider pins',()=>{
 const f=fixture(),first=signPeerCommand(f.command,f.grant,f.sourceKey.key,f.expected,f.now),retry=signPeerCommand(f.command,f.grant,f.sourceKey.key,f.expected,f.now+1000);
 assert.notEqual(first.payload.nonce,retry.payload.nonce);assert.equal((retry.payload.command as IntegrationCommand).commandId,f.command.commandId);assert.equal(peerDeliveryDigest(first.payload),peerDeliveryDigest(retry.payload));
 assert.equal(verifyPeerCommand(first,f.grant,f.source.verified,f.provider,f.expected,f.now).grantId,f.grantPayload.grantId);
 assert.throws(()=>verifyPeerCommand(signAssertion({...first.payload,destinationProgramId:randomUUID()},f.sourceKey.key),f.grant,f.source.verified,f.provider,f.expected,f.now),/SCOPE_MISMATCH/);
 for(const payload of [{...f.command.payload,programId:randomUUID()},{...f.command.payload,sourceProgramId:randomUUID()}])assert.throws(()=>verifyPeerCommand(signAssertion({...first.payload,command:{...f.command,payload}},f.sourceKey.key),f.grant,f.source.verified,f.provider,f.expected,f.now),/SCOPE_MISMATCH/);
 assert.throws(()=>verifyPeerCommand(signAssertion({...first.payload,command:{...f.command,payload:{...f.command.payload,actorId:randomUUID()}}},f.sourceKey.key),f.grant,f.source.verified,f.provider,f.expected,f.now),/PAYLOAD_AUTHORITY_FORBIDDEN/);
 assert.throws(()=>verifyPeerCommand(first,f.grant,f.source.verified,{...f.provider,packageDigest:'f'.repeat(64)},f.expected,f.now),/PROVIDER_CHANGED/);
 assert.throws(()=>verifyPeerCommand(first,f.grant,f.source.verified,{...f.provider,state:'unavailable'},f.expected,f.now),/PROVIDER_CHANGED/);
 assert.throws(()=>verifyPeerCommand(first,f.grant,f.source.verified,f.provider,{...f.expected,purpose:'another-purpose'},f.now),/SCOPE_MISMATCH/);
 assert.throws(()=>verifyPeerCommand(first,f.grant,f.source.verified,f.provider,f.expected,f.now+30001),/PROOF_EXPIRED/);
 const expiredAttempt=signAssertion({...first.payload,issuedAt:f.grantPayload.expiresAt+1},f.sourceKey.key);assert.throws(()=>verifyPeerCommand(expiredAttempt,f.grant,f.source.verified,f.provider,f.expected,f.grantPayload.expiresAt+1),/GRANT_EXPIRED/);
 assert.throws(()=>signPeerCommand(f.command,JSON.parse(JSON.stringify(f.grant)),f.sourceKey.key,f.expected,f.now),/GRANT_NOT_VERIFIED/);
});

test('legacy capability schemas without explicit source/destination program fields cannot be approved remotely',()=>{
 const f=fixture(),legacy={type:'object',additionalProperties:false,required:['referralId'],properties:{referralId:{type:'string',maxLength:40}}};
 const change=(peer:typeof f.source,keys:ReturnType<typeof pair>,provider:boolean)=>{const payload=structuredClone(peer.assertion.payload),d=payload.providers[0]!.descriptor as any;if(provider)d.payload.manifest.smart.provides[0].operations[0].input=legacy;else d.payload.manifest.smart.consumes[0].operations[0].input=legacy;payload.providers[0]!.descriptor=signPackage(d.payload,f.publisher.key);return verifyPeerProfile(signAssertion(payload,keys.key),peer.pins,f.masters,f.now);};
 const source=change(f.source,f.sourceKey,false),destination=change(f.destination,f.destinationKey,true),proposal={...f.grantPayload,consumerPackageDigest:source.providers[0]!.packageDigest,providerPackageDigest:destination.providers[0]!.packageDigest};
 assert.throws(()=>verifyPeerGrant(f.approve(proposal),source,destination,f.now),/CAPABILITY_NOT_AUTHORIZED/);
});

test('receiver rejects undeclared payloads, forged signatures, incorrect operations and reused nonces without logging case values',async()=>{
 const f=fixture(),proof=signPeerCommand(f.command,f.grant,f.sourceKey.key,f.expected,f.now);
 assert.throws(()=>verifyPeerCommand(signAssertion(proof.payload,pair().key),f.grant,f.source.verified,f.provider,f.expected,f.now),/COMMAND_INVALID/);
 assert.throws(()=>verifyPeerCommand(signAssertion({...proof.payload,command:{...f.command,payload:{...f.command.payload,referralId:'opaque',caseNotes:'restricted'}}},f.sourceKey.key),f.grant,f.source.verified,f.provider,f.expected,f.now),/COMMAND_INVALID/);
 assert.throws(()=>verifyPeerCommand(signAssertion({...proof.payload,command:{...f.command,command:'placement.approve'}},f.sourceKey.key),f.grant,f.source.verified,f.provider,f.expected,f.now),/OPERATION_NOT_AUTHORIZED/);
 const seen=new Set<string>(),queries:string[]=[];const db={query:async(sql:string,args:any[])=>{queries.push(sql);if(sql.startsWith('DELETE'))return{rowCount:0};const key=args[0]+':'+args[1];if(seen.has(key))return{rowCount:0};seen.add(key);return{rowCount:1};}} as unknown as Pick<pg.PoolClient,'query'>;
 await consumePeerNonce(db,proof.payload,f.now);await assert.rejects(consumePeerNonce(db,proof.payload,f.now),/PROOF_REPLAYED/);await consumePeerNonce(db,signPeerCommand(f.command,f.grant,f.sourceKey.key,f.expected,f.now).payload,f.now);assert(queries.every(q=>!q.includes('restricted')));
});

function receipt(f:ReturnType<typeof fixture>,request:ReturnType<typeof signPeerCommand>){const p:PeerReceiptPayload={version:1,kind:'ssma-peer-receipt',grantId:f.grantPayload.grantId,sourceInstallationId:f.grantPayload.sourceInstallationId,destinationInstallationId:f.grantPayload.destinationInstallationId,commandId:f.command.commandId,commandDigest:peerDeliveryDigest(request.payload),requestNonce:request.payload.nonce,issuedAt:Date.now(),outcome:'delivered',result:{status:'requested'},errorCode:null,providerInstallationId:f.grantPayload.providerInstallationId,providerPackageDigest:f.grantPayload.providerPackageDigest};return signAssertion(p,f.destinationKey.key);}
test('signed receipts cannot switch provider, command, grant or retry nonce and must conform to approved output schema',()=>{
 const f=fixture(),r=signPeerCommand(f.command,f.grant,f.sourceKey.key,f.expected),valid=receipt(f,r);assert.equal(verifyPeerReceipt(valid,r.payload,f.destination.verified,output).result?.status,'requested');
 for(const replacement of [{providerInstallationId:randomUUID()},{requestNonce:randomUUID()},{commandDigest:'f'.repeat(64)},{result:{status:'requested',caseNotes:'restricted'}}])assert.throws(()=>verifyPeerReceipt(signAssertion({...valid.payload,...replacement},f.destinationKey.key),r.payload,f.destination.verified,output),/PEER_/);
 assert.throws(()=>verifyPeerReceipt(signAssertion(valid.payload,f.sourceKey.key),r.payload,f.destination.verified,output),/RECEIPT_INVALID/);
});

test('actual pinned HTTPS transport validates certificates, bounds bodies/deadlines, rejects redirects and sends no operator cookies',async()=>{
 let mode='success',f:ReturnType<typeof fixture>,seenHeaders:Record<string,unknown>={};const server=createServer({key:tlsKey,cert:ca},(req,res)=>{seenHeaders=req.headers;let raw='';req.on('data',part=>raw+=part);req.on('end',()=>{if(mode==='timeout')return;if(mode==='redirect'){res.writeHead(302,{location:'https://untrusted.invalid'}).end();return;}if(mode==='large'){res.writeHead(200,{'content-type':'application/json'}).end('x'.repeat(70000));return;}if(mode==='malformed'){res.writeHead(200,{'content-type':'application/json'}).end('{');return;}const envelope=JSON.parse(raw);res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(receipt(f,envelope)));});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address==='object');f=fixture('https://127.0.0.1:'+address.port);
 try{const command=signPeerCommand(f.command,f.grant,f.sourceKey.key,f.expected);const result=await requestPeerCommand(f.destination.verified,command);assert.equal(verifyPeerReceipt(result,command.payload,f.destination.verified,output).outcome,'delivered');assert.equal(seenHeaders.cookie,undefined);assert.equal(seenHeaders.authorization,undefined);const badTrust:VerifiedPeerProfile={...f.destination.verified,tlsCaPem:untrustedCa,profile:{...f.destination.verified.profile,tlsCaSha256:peerTlsCaFingerprint(untrustedCa)}};await assert.rejects(requestPeerCommand(badTrust,command),/TRANSPORT_UNAVAILABLE/);mode='redirect';await assert.rejects(requestPeerCommand(f.destination.verified,command),/REQUEST_REJECTED/);mode='malformed';await assert.rejects(requestPeerCommand(f.destination.verified,command),/RESPONSE_INVALID/);mode='large';await assert.rejects(requestPeerCommand(f.destination.verified,command),/RESPONSE_TOO_LARGE/);mode='timeout';await assert.rejects(requestPeerCommand(f.destination.verified,command,{timeoutMs:150}),/TRANSPORT_TIMEOUT/);await assert.rejects(requestPeerCommand(f.destination.verified,command,{timeoutMs:10001}),/DEADLINE_INVALID/);
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
