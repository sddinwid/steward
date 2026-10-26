import type pg from 'pg';
import {readFile} from 'node:fs/promises';
import {X509Certificate,randomUUID} from 'node:crypto';
import {canonical,digest,verifyPackage,capabilityConfigured} from '@steward/module-sdk';
import type {PublisherTrust} from '@steward/module-sdk';
import type {InstallationConfig} from '@steward/contracts';
import type {SecurityConfig} from './security/config.js';
import type {Authentication,SecureApp} from './security/auth.js';
import type {createModuleBroker} from './module-broker.js';
import {publicKey,signAssertion,fail} from './security/crypto.js';
import {verifyPeerProfile,peerTlsCaFingerprint,PEER_COMMAND_PATH} from './peer-services.js';
import type {PeerProfilePayload} from './peer-service-schema.js';
import {peerGrantSchema,peerGrantPayloadSchema} from './peer-service-schema.js';
import {createPeerRegistry} from './peer-registry.js';
import {programAuthority,dispatchAuthority} from './program-authority.js';

export async function peerServiceRoutes(app:SecureApp,pool:pg.Pool,auth:Authentication,identity:InstallationConfig,key:string,security:SecurityConfig,broker:Awaited<ReturnType<typeof createModuleBroker>>,trust:()=>Promise<PublisherTrust>){
 const assertProgram=programAuthority(pool,broker,trust);
 const assertDispatch=dispatchAuthority(pool,broker,trust);
 async function ownProfile(){
  const enrolled=(await pool.query("SELECT * FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0];
  if(!enrolled)fail(409,'Worker enrollment is required before approving peer services');
  const leaf=new X509Certificate(await readFile(security.tlsCertFile));let caPem:string|undefined;
  for(const file of [...new Set([...(security.tlsCaFile?[security.tlsCaFile]:[]),...security.trustedMasters.map(m=>m.caFile)])]){
   const candidate=await readFile(file,'utf8');try{const ca=new X509Certificate(candidate);if(leaf.checkHost(new URL(security.publicOrigin).hostname)&&leaf.verify(ca.publicKey)){peerTlsCaFingerprint(candidate);caPem=candidate;break;}}catch{/* A Master trust file need not be this Worker's issuer. */}
  }
  if(!caPem)fail(409,'Worker public TLS issuer CA must be configured in an operator trust profile and must verify the Worker certificate');
  const publisherTrust=await trust(),providers:PeerProfilePayload['providers']=[];
  for(const row of (await pool.query('SELECT * FROM module_installations ORDER BY module_id')).rows){
   try{const manifest=verifyPackage(row.descriptor,publisherTrust).manifest;if(!manifest.smart)continue;
    providers.push({moduleId:row.module_id,providerInstallationId:row.operation_id,descriptor:row.descriptor,state:row.state==='active'?'active':'inactive',configuredCapabilities:manifest.smart.provides.filter(c=>capabilityConfigured(manifest,row.configuration,c)).map(c=>c.capabilityId)});
   }catch{/* Unverified packages are not discoverable. */}
  }
  const now=Date.now(),payload:PeerProfilePayload={version:1,kind:'ssma-peer-profile',profileId:randomUUID(),installationId:identity.installationId,entityId:enrolled.entity_id,origin:security.publicOrigin,publicKey:publicKey(key),certificate:enrolled.certificate,tlsCaSha256:peerTlsCaFingerprint(caPem),issuedAt:now,expiresAt:now+300000,providers};
  const assertion=signAssertion(payload,key),pins={installationId:identity.installationId,entityId:enrolled.entity_id,origin:security.publicOrigin,tlsCaPem:caPem,publisherTrust};
  return{assertion,pins,verified:verifyPeerProfile(assertion,pins,security.trustedMasters,now)};
 }
 const peers=createPeerRegistry(pool,{
  localProfile:async()=> (await ownProfile()).verified,signLocal:async payload=>signAssertion(payload,key),trustedMasters:async()=>security.trustedMasters,
  assertLocalAuthority:async(actor,module,programme)=>assertProgram(actor,module,programme),
  resolveGovernedRoute:async(input,grant)=>{
   const r=(await pool.query(`SELECT r.*,b.actor_id,b.state binding_state,b.consumer_id binding_consumer,b.provider_id binding_provider,
     b.source_program_id,b.destination_program_id,b.purpose,b.expires_at,b.peer_installation_id binding_peer,b.peer_grant_id binding_grant,
     b.provider_installation_id,b.package_digest binding_package,w.state workflow_state,w.scope_program_id,w.definition,
     c.operation_id consumer_installation,c.descriptor consumer_descriptor,c.state consumer_state
     FROM smart_routes r JOIN smart_bindings b ON b.binding_id=r.binding_id JOIN smart_workflows w ON w.workflow_id=r.workflow_id
     JOIN module_installations c ON c.module_id=r.consumer_id WHERE r.command_id=$1`,[input.command.commandId])).rows[0];
   const g=grant.payload;
   if(!r||!['approved','retained'].includes(r.binding_state)||r.workflow_state!=='active'||r.consumer_state!=='active'||r.binding_id!==input.bindingId||r.workflow_id!==input.workflowId||r.peer_grant_id!==input.grantId||r.binding_grant!==g.grantId||r.binding_peer!==g.destinationInstallationId||r.peer_installation_id!==g.destinationInstallationId||r.binding_consumer!==g.consumerModuleId||r.binding_provider!==g.providerModuleId||r.source_program_id!==g.sourceProgramId||r.scope_program_id!==g.sourceProgramId||r.destination_program_id!==g.destinationProgramId||r.purpose!==g.purpose||new Date(r.expires_at).getTime()!==g.expiresAt||r.provider_installation_id!==g.providerInstallationId||r.binding_package!==g.providerPackageDigest||r.consumer_installation!==g.consumerInstallationId||digest(canonical(r.consumer_descriptor))!==g.consumerPackageDigest||r.digest!==digest(canonical(input.command))||canonical(r.original_envelope)!==canonical(input.command)||canonical(r.envelope)!==canonical(input.wireCommand??input.command)||!r.definition.steps.some((s:any)=>s.bindingId===r.binding_id&&s.operation===input.command.capability?.operation))fail(403,'Governed peer route is not approved or its pinned identity changed');
   verifyPackage(r.consumer_descriptor,await trust());await assertProgram(r.actor_id,g.consumerModuleId,g.sourceProgramId);
   await assertDispatch(r.actor_id,input.command,{sourceProgramId:g.sourceProgramId,destinationProgramId:g.destinationProgramId,destinationInstallationId:g.destinationInstallationId,destinationEntityId:g.destinationEntityId,providerModuleId:g.providerModuleId});
   return{actorId:r.actor_id};
  },
  deliverLocal:async({command,scope,provider})=>{
   const row=(await pool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[provider.moduleId])).rows[0];
   if(!row||row.operation_id!==provider.installationId||digest(canonical(row.descriptor))!==provider.packageDigest)throw new Error('PEER_PROVIDER_CHANGED');
   const result=await broker('peer.deliver',row.descriptor,row.configuration,{command,scope});
   if(result.status>=200&&result.status<300)return{outcome:'delivered',result:result.value,errorCode:null};
   if([400,403,409,422].includes(result.status))return{outcome:'rejected',result:null,errorCode:'PEER_COMMAND_REJECTED'};
   throw new Error('PEER_LOCAL_RUNTIME_UNAVAILABLE');
  },
  acknowledgeLocal:async({command,outcome})=>{
   const row=(await pool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[command.sourceModuleId])).rows[0];if(!row)throw new Error('PEER_SOURCE_UNAVAILABLE');
   const route=(await pool.query('SELECT provider_id,peer_grant_id FROM smart_routes WHERE command_id=$1',[command.commandId])).rows[0];
   const grant=(await pool.query('SELECT signed_grant FROM smart_peer_grants WHERE grant_id=$1',[route?.peer_grant_id])).rows[0]?.signed_grant?.payload;
   if(!grant)throw new Error('PEER_APPROVAL_UNAVAILABLE');
   const acknowledged=outcome.outcome==='delivered'?{...outcome,result:{...outcome.result,_steward:{providerModuleId:grant.providerModuleId,providerInstallationId:grant.providerInstallationId,packageDigest:grant.providerPackageDigest,destinationEntityId:grant.destinationEntityId,destinationInstallationId:grant.destinationInstallationId,destinationProgramId:grant.destinationProgramId,sourceProgramId:grant.sourceProgramId,grantId:grant.grantId}}}:outcome;
   const result=await broker('peer.acknowledge',row.descriptor,row.configuration,{command,outcome:acknowledged});if(result.status<200||result.status>=300)throw new Error('PEER_ACK_UNAVAILABLE');
   await pool.query('UPDATE smart_routes SET state=$2,error_code=$3,attempts=attempts+1,updated_at=now() WHERE command_id=$1',[command.commandId,outcome.outcome,outcome.errorCode]);
  }
 });
 async function admin(req:Parameters<Authentication['session']>[0],mutate=false){const actor=await auth.session(req,mutate);if(actor.role!=='local_admin')fail(403,'Worker-local Smart Modules administrator required');return actor;}
 const base='/api/v13/peer-services';
 app.get(base,async req=>{await admin(req);return{
  peers:(await pool.query('SELECT installation_id,entity_id,state,verified_at,updated_at FROM smart_peers ORDER BY installation_id')).rows,
  grants:(await pool.query('SELECT grant_id,local_side,local_actor_id,peer_installation_id,state,approved_at FROM smart_peer_grants ORDER BY approved_at DESC LIMIT 100')).rows,
  deliveries:(await pool.query('SELECT command_id,binding_id,workflow_id,state,attempts,error_code,created_at,updated_at FROM smart_peer_deliveries ORDER BY created_at DESC LIMIT 100')).rows};});
 app.get(base+'/profile',async req=>{await admin(req);const p=await ownProfile();return{profile:p.assertion,publicPins:p.pins,notice:'Independently verify the destination identity, CA and publisher fingerprints before importing. Snapshot is not a runtime health assertion.'};});
 app.post<{Body:{profile:unknown;pins:any}}>(base+'/peers',{bodyLimit:1048576},async req=>{const a=await admin(req,true);return peers.importProfile(a,req.body.profile,req.body.pins);});
 app.post<{Body:unknown}>(base+'/grants/propose',{bodyLimit:65536},async req=>peers.proposeGrant(await admin(req,true),req.body));
 app.post<{Body:{payload:unknown;sourceApproval:unknown}}>(base+'/grants/countersign',{bodyLimit:65536},async req=>peers.countersignGrant(await admin(req,true),{payload:peerGrantPayloadSchema.parse(req.body.payload),sourceApproval:peerGrantSchema.shape.sourceApproval.parse(req.body.sourceApproval)}));
 app.post<{Body:unknown}>(base+'/grants/approve',{bodyLimit:65536},async req=>peers.approveGrant(await admin(req,true),req.body));
 app.post<{Params:{id:string}}>(base+'/peers/:id/revoke',async req=>{await peers.revokePeer(await admin(req,true),req.params.id);return{revoked:true};});
 app.post<{Params:{id:string}}>(base+'/grants/:id/revoke',async req=>{await peers.revokeGrant(await admin(req,true),req.params.id);return{revoked:true};});
 app.post<{Body:unknown}>(PEER_COMMAND_PATH,{bodyLimit:49152},async(req,reply)=>{
  await auth.rateLimit('peer-ingress:'+identity.installationId+':'+req.ip,120);
  try{return await peers.receive(req.body);}catch(e){const code=(e as Error).message;if(/^PEER_[A-Z_]+$/.test(code))return reply.code(code.includes('UNAVAILABLE')?503:403).send({error:code});return reply.code(400).send({error:'PEER_COMMAND_INVALID'});}
 });
 let busy=false;const timer=setInterval(()=>{if(busy)return;busy=true;void(async()=>{
  const routes=(await pool.query("SELECT * FROM smart_routes WHERE peer_installation_id IS NOT NULL AND state='pending' ORDER BY created_at LIMIT 8")).rows;
  for(const r of routes)try{await peers.queue({command:r.original_envelope,wireCommand:r.envelope,bindingId:r.binding_id,workflowId:r.workflow_id,grantId:r.peer_grant_id});}catch{await pool.query("UPDATE smart_routes SET attempts=attempts+1,error_code='INTEGRATION_PEER_APPROVAL_UNAVAILABLE',updated_at=now() WHERE command_id=$1",[r.command_id]);}
  await peers.processOutgoing(4);
 })().catch(()=>{}).finally(()=>{busy=false;});},1000).unref();
 app.addHook('onClose',async()=>clearInterval(timer));return{peers,assertProgram};
}
