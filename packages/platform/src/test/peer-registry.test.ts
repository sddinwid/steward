import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';
import {canonical,digest,signPackage,type ModulePackageManifest,type CapabilityContract,type IntegrationCommand} from '@steward/module-sdk';
import {hash,signAssertion} from '../security/crypto.js';
import {verifyPeerProfile,peerTlsCaFingerprint,signPeerCommand} from '../peer-services.js';
import {createPeerRegistry,type PeerRegistryDependencies,type PeerQueueInput} from '../peer-registry.js';
import {peerRegistryMigration} from '../peer-migration.js';
import type {PeerGrantPayload,PeerProfilePayload} from '../peer-service-schema.js';

test('durable peer registry: bilateral authority, governed routing, real HTTPS retries, immutable pins and restart recovery',async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),'steward-peer-ledger-'));await chmod(directory,0o700);const container='steward-peer-tests-'+randomUUID();
 const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const openssl=process.env.STEWARD_OPENSSL??(process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
 const config=path.join(directory,'openssl.cnf');await writeFile(config,'[req]\ndistinguished_name=dn\n[dn]\n');
 const pools:pg.Pool[]=[];let admin:pg.Pool|undefined;const server=createServer();let destination:ReturnType<typeof createPeerRegistry>;
 try{
  execFileSync(openssl,['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE','-keyout',path.join(directory,'ca-key.pem'),'-out',path.join(directory,'ca.pem')],{stdio:'pipe',env:{...process.env,OPENSSL_CONF:config,MSYS_NO_PATHCONV:'1'}});
  const ca=await readFile(path.join(directory,'ca.pem'),'utf8'),tlsKey=await readFile(path.join(directory,'ca-key.pem'),'utf8');server.setSecureContext({key:tlsKey,cert:ca});
  server.on('request',(req,res)=>{const parts:Buffer[]=[];req.on('data',part=>parts.push(part));req.on('end',()=>{void destination.receive(JSON.parse(Buffer.concat(parts).toString())).then(result=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));}).catch(()=>{res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"PEER_UNAVAILABLE"}');});});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='https://127.0.0.1:'+(server.address() as any).port;
  const password=randomBytes(32).toString('base64url'),secret=path.join(directory,'postgres.env');await writeFile(secret,'POSTGRES_PASSWORD='+password+'\n',{mode:0o600});
  docker(['run','--rm','-d','--name',container,'--env-file',secret,'-p','127.0.0.1::5432','postgres:17.10-alpine']);const port=Number(JSON.parse(docker(['inspect',container]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort);
  const dbConfig={host:'127.0.0.1',port,user:'postgres',password,connectionTimeoutMillis:1000};admin=new pg.Pool({...dbConfig,database:'postgres'});for(let n=0;;n++){try{await admin.query('SELECT 1');break;}catch(e){if(n>=30)throw e;await delay(500);}}
  for(const name of ['peer_source','peer_destination']){await admin.query('CREATE DATABASE '+name);const pool=new pg.Pool({...dbConfig,database:name});pools.push(pool);await pool.query(peerRegistryMigration);await pool.query('CREATE TABLE security_audit(actor_id uuid,action text,target_id text,detail jsonb); CREATE TABLE business_effects(command_id uuid PRIMARY KEY)');}
  const sourcePool=pools[0]!,destinationPool=pools[1]!;
  const pair=()=>{const p=generateKeyPairSync('ed25519');return{key:p.privateKey.export({type:'pkcs8',format:'pem'}).toString(),publicKey:p.publicKey.export({type:'spki',format:'pem'}).toString()};};
  const master=pair(),publisher=pair(),sourceKey=pair(),destinationKey=pair(),issuer=randomUUID(),sourceId=randomUUID(),destinationId=randomUUID(),sourceEntity=randomUUID(),destinationEntity=randomUUID(),consumerId=randomUUID(),providerId=randomUUID(),sourceActor={account_id:randomUUID(),role:'local_admin'},destinationActor={account_id:randomUUID(),role:'local_admin'};
  const input={type:'object',additionalProperties:false,required:['programId','sourceProgramId','reference'],properties:{programId:{type:'string'},sourceProgramId:{type:'string'},reference:{type:'string'}}},output={type:'object',additionalProperties:false,required:['status'],properties:{status:{type:'string',enum:['accepted']}}};
  const capability:CapabilityContract={capabilityId:'services.placement',contract:'steward.placement',version:'1.0.0',operations:[{name:'request',command:'placement.request',input,output,permission:'example.provider.manage',mode:'durable',idempotency:'required',retry:'safe'}],events:[],sensitivity:'restricted',scope:'entity',ownership:'provider'};
  const manifest=(provider:boolean):ModulePackageManifest=>({manifestVersion:1,sdkVersion:1,moduleId:provider?'example.provider':'example.consumer',version:'1.0.0',name:'Synthetic peer fixture',description:'Native PostgreSQL peer ledger verification',minimumPlatformVersion:'0.13.0',dependencies:[],requiredPermissions:['storage.own-database'],api:[{operationId:'report',method:'GET',path:'/report',permission:provider?'example.provider.manage':'example.consumer.manage'}],ui:[],configurationSchema:{type:'object',additionalProperties:false,properties:{}},persistence:{isolation:'dedicated-database',schemaVersion:1,migrations:[{version:1,sha256:'a'.repeat(64)}],destructiveRollback:false},integrationEvents:[],analyticalCapabilities:[],integration:{version:1,outboxPath:'/integration-outbox',inboxPath:'/integration-inbox',acknowledgmentPath:'/integration-ack',peers:[]},smart:{version:1,provides:provider?[capability]:[],consumes:provider?[]:[{capabilityId:capability.capabilityId,contract:capability.contract,minimumVersion:'1.0.0',maximumMajor:1,operations:[{name:'request',input,output}],events:[],maximumSensitivity:'restricted',optional:false}],prerequisites:{configuration:{},requiresActive:true,requiresHealthy:true}}});
  const trust={publishers:[{publisherId:'fixture',publicKey:publisher.publicKey}]},masters=[{installationId:issuer,publicKey:master.publicKey}];
  const profile=(provider:boolean)=>{const now=Date.now(),id=provider?destinationId:sourceId,entity=provider?destinationEntity:sourceEntity,keys=provider?destinationKey:sourceKey,descriptor=signPackage({formatVersion:1,publisherId:'fixture',imageId:'sha256:'+'a'.repeat(64),manifest:manifest(provider)},publisher.key);
   const payload:PeerProfilePayload={version:1,kind:'ssma-peer-profile',profileId:randomUUID(),installationId:id,entityId:entity,origin:provider?origin:'https://source.localhost:44999',publicKey:keys.publicKey,certificate:signAssertion({version:1 as const,kind:'worker-enrollment' as const,issuer,installationId:id,entityId:entity,keyThumbprint:hash(keys.publicKey),requestId:randomUUID(),serial:randomUUID(),issuedAt:now-1000},master.key),tlsCaSha256:peerTlsCaFingerprint(ca),issuedAt:now,expiresAt:now+300000,providers:[{moduleId:descriptor.payload.manifest.moduleId,providerInstallationId:provider?providerId:consumerId,descriptor,state:'active',configuredCapabilities:provider?[capability.capabilityId]:[]}]};const assertion=signAssertion(payload,keys.key),pins={installationId:id,entityId:entity,origin:payload.origin,tlsCaPem:ca,publisherTrust:trust};return{assertion,pins,verified:verifyPeerProfile(assertion,pins,masters,now)};};
  const s=profile(false),d=profile(true),sourceProgram=randomUUID(),destinationProgram=randomUUID();let sourceAuthority=true,destinationAuthority=true,workflowApproved=true,uncertain=true,ackFailure=true,deliverCalls=0,ackCalls=0;
  const governed=new Map<string,PeerQueueInput>();
  const dependencies=(provider:boolean):PeerRegistryDependencies=>({localProfile:async()=>provider?d.verified:s.verified,signLocal:async payload=>signAssertion(payload,provider?destinationKey.key:sourceKey.key),trustedMasters:async()=>masters,
   assertLocalAuthority:async(actor,module,program,side)=>{assert.equal(side,provider?'destination':'source');if(actor!==(provider?destinationActor:sourceActor).account_id||module!==(provider?'example.provider':'example.consumer')||program!==(provider?destinationProgram:sourceProgram)||!(provider?destinationAuthority:sourceAuthority))throw new Error('PEER_PROGRAM_AUTHORITY_REQUIRED');},
   resolveGovernedRoute:async input=>{if(provider||!workflowApproved||canonical(input)!==canonical(governed.get(input.command.commandId)))throw new Error('PEER_WORKFLOW_NOT_APPROVED');return{actorId:sourceActor.account_id};},
   deliverLocal:async({command,scope})=>{deliverCalls++;assert.equal(scope.sourceEntityId,sourceEntity);assert.equal(scope.destinationActorId,destinationActor.account_id);await destinationPool.query('INSERT INTO business_effects(command_id) VALUES($1) ON CONFLICT DO NOTHING',[command.commandId]);if(uncertain){uncertain=false;throw new Error('Transport failed after durable module commit');}return{outcome:'delivered',result:{status:'accepted'},errorCode:null};},
   acknowledgeLocal:async()=>{ackCalls++;if(ackFailure){ackFailure=false;throw new Error('Lost source acknowledgment');}}
  });
  let source=createPeerRegistry(sourcePool,dependencies(false));destination=createPeerRegistry(destinationPool,dependencies(true));
  const p:PeerGrantPayload={version:1,kind:'ssma-peer-grant',grantId:randomUUID(),sourceInstallationId:sourceId,sourceEntityId:sourceEntity,sourceProgramId:sourceProgram,consumerModuleId:'example.consumer',consumerInstallationId:consumerId,consumerPackageDigest:s.verified.providers[0]!.packageDigest,destinationInstallationId:destinationId,destinationEntityId:destinationEntity,destinationProgramId:destinationProgram,providerModuleId:'example.provider',providerInstallationId:providerId,providerPackageDigest:d.verified.providers[0]!.packageDigest,capabilityId:capability.capabilityId,operations:['request'],purpose:'housing-placement',maximumSensitivity:'restricted',disclosureBasis:'synthetic-consent',authorityReference:randomUUID(),notBefore:Date.now()-1000,expiresAt:Date.now()+86400000};
  await t.test('Explicit peer pins and programme authority are required for bilateral human approval',async()=>{
   await assert.rejects(source.importProfile({...sourceActor,role:'local_user'},d.assertion,d.pins),/LOCAL_ADMIN/);
   await assert.rejects(source.importProfile(sourceActor,d.assertion,{...d.pins,publisherTrust:{publishers:[{publisherId:'fixture',publicKey:publisher.key}]}}),/PRIVATE_KEY/);
   await source.importProfile(sourceActor,d.assertion,d.pins);await destination.importProfile(destinationActor,s.assertion,s.pins);
   sourceAuthority=false;await assert.rejects(source.proposeGrant(sourceActor,p),/PROGRAM_AUTHORITY/);sourceAuthority=true;
   const proposal=await source.proposeGrant(sourceActor,p);destinationAuthority=false;await assert.rejects(destination.countersignGrant(destinationActor,proposal),/PROGRAM_AUTHORITY/);destinationAuthority=true;
   const signed=await destination.countersignGrant(destinationActor,proposal);await assert.rejects(source.approveGrant({...sourceActor,account_id:randomUUID()},signed),/ACTOR_MISMATCH/);await source.approveGrant(sourceActor,signed);await source.approveGrant(sourceActor,signed);
  });
  const original:IntegrationCommand={protocol:'steward-module-integration-v1',commandId:randomUUID(),sourceModuleId:'example.consumer',targetModuleId:'example.provider',command:'placement.request',version:1,aggregateId:randomUUID(),sequence:4,occurredAt:new Date().toISOString(),payload:{programId:destinationProgram,sourceProgramId:sourceProgram,reference:'SYNREF-PRIVATE'},capability:{capabilityId:capability.capabilityId,operation:'request'}};
  const route:PeerQueueInput={command:original,wireCommand:{...original,sequence:1},bindingId:randomUUID(),workflowId:randomUUID(),grantId:p.grantId};governed.set(original.commandId,route);
  await t.test('Only the persisted SSMA binding/workflow can queue exact original and resequenced wire commands',async()=>{
   workflowApproved=false;await assert.rejects(source.queue(route),/WORKFLOW_NOT_APPROVED/);workflowApproved=true;await source.queue(route);await source.queue(route);
   const changed={...route,wireCommand:{...route.wireCommand!,payload:{...original.payload,reference:'CHANGED'}}};governed.set(original.commandId,changed);await assert.rejects(source.queue(changed),/ORIGINAL_COMMAND_CHANGED/);governed.set(original.commandId,route);
   assert.equal((await sourcePool.query('SELECT count(*)::int n FROM smart_peer_deliveries')).rows[0].n,1);
  });
  await t.test('Uncertain receive commit and lost source ACK recover across registry restart without duplicate business effects',async()=>{
   assert.equal((await source.processOutgoing()).completed,0);assert.equal(deliverCalls,1);
   await sourcePool.query('UPDATE smart_peer_deliveries SET next_attempt_at=now()');source=createPeerRegistry(sourcePool,dependencies(false));destination=createPeerRegistry(destinationPool,dependencies(true));
   assert.equal((await source.processOutgoing()).completed,0);assert.equal(deliverCalls,2);assert.equal(ackCalls,1);
   assert.equal((await sourcePool.query('SELECT state FROM smart_peer_deliveries')).rows[0].state,'ack_pending');
   await sourcePool.query('UPDATE smart_peer_deliveries SET next_attempt_at=now()');assert.equal((await source.processOutgoing()).completed,1);assert.equal(deliverCalls,2);assert.equal(ackCalls,2);
   assert.equal((await destinationPool.query('SELECT count(*)::int n FROM business_effects')).rows[0].n,1);
   assert.equal((await destinationPool.query('SELECT count(*)::int n FROM smart_peer_nonces')).rows[0].n,2);
   assert.equal((await sourcePool.query('SELECT state FROM smart_peer_deliveries')).rows[0].state,'delivered');
  });
  await t.test('Replay proofs, changed commands, revoked authority and pin rotation are rejected without new effects',async()=>{
   const v=await source.grant(p.grantId),expected={sourceProgramId:sourceProgram,destinationProgramId:destinationProgram,purpose:p.purpose,operation:'request'};
   const proof=signPeerCommand(route.wireCommand!,v.grant,sourceKey.key,expected);await destination.receive(proof);await assert.rejects(destination.receive(proof),/PROOF_REPLAYED/);assert.equal(deliverCalls,2);
   const changed=signPeerCommand({...route.wireCommand!,payload:{...original.payload,reference:'CHANGED'}},v.grant,sourceKey.key,expected);await assert.rejects(destination.receive(changed),/COMMAND_ID_REUSED/);
   destinationAuthority=false;await assert.rejects(destination.receive(signPeerCommand(route.wireCommand!,v.grant,sourceKey.key,expected)),/PROGRAM_AUTHORITY/);destinationAuthority=true;
   await assert.rejects(source.importProfile(sourceActor,d.assertion,{...d.pins,transport:'direct'}),/PIN_ROTATION_NOT_SUPPORTED/);
   await source.revokeGrant(sourceActor,p.grantId);await assert.rejects(source.grant(p.grantId),/GRANT_NOT_APPROVED/);await destination.revokePeer(destinationActor,sourceId);await assert.rejects(destination.importProfile(destinationActor,s.assertion,s.pins),/REVOKED_REIMPORT/);
   assert.equal((await destinationPool.query('SELECT count(*)::int n FROM business_effects')).rows[0].n,1);
  });
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));for(const pool of pools)await pool.end();await admin?.end();try{docker(['rm','-f',container]);}catch{}assert(path.resolve(directory).startsWith(path.resolve(tmpdir())+path.sep));await rm(directory,{recursive:true,force:true});}
});
