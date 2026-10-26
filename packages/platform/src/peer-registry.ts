import type pg from 'pg';
import type {SignedAssertion} from '@steward/contracts';
import type {IntegrationCommand,CapabilityProvider} from '@steward/module-sdk';
import type {TrustedMaster} from './security/config.js';
import type {VerifiedPeerProfile,PeerProfilePins} from './peer-services.js';
import type {PeerGrant,PeerGrantPayload,PeerCommandPayload} from './peer-service-schema.js';
import {peerGrantPayloadSchema,peerGrantSchema,signedPeerCommandSchema} from './peer-service-schema.js';
import {verifyPeerProfile,verifyPeerGrant,peerGrantDigest,verifyPeerCommand,consumePeerNonce,peerDeliveryDigest,requestPeerCommand,verifyPeerReceipt} from './peer-services.js';
import {canonical,digest,validateCommand,validateCapabilityValue} from '@steward/module-sdk';
import {verifyAssertion,validUuid} from './security/crypto.js';
import {randomUUID} from 'node:crypto';
import {transaction,audit} from './security/store.js';

export interface PeerLocalActor {account_id:string;role:string}
export interface PeerQueueInput {command:IntegrationCommand;wireCommand?:IntegrationCommand;bindingId:string;workflowId?:string|null;grantId:string}
export interface PeerDeliveryOutcome {outcome:'delivered'|'rejected';result:Record<string,unknown>|null;errorCode:string|null}
export interface PeerAttestedScope {
 sourceEntityId:string;sourceInstallationId:string;sourceProgramId:string;
 destinationEntityId:string;destinationInstallationId:string;destinationProgramId:string;
 consumerModuleId:string;purpose:string;grantId:string;providerInstallationId:string;packageDigest:string;
 expiresAt:number;sourceActorId:string;destinationActorId:string;
}
export interface PeerRegistryDependencies {
 localProfile():Promise<VerifiedPeerProfile>;
 signLocal<T extends object>(payload:T):Promise<SignedAssertion<T>>;
 trustedMasters():Promise<Pick<TrustedMaster,'installationId'|'publicKey'>[]>;
 assertLocalAuthority(actorId:string,moduleId:string,programId:string,side:'source'|'destination'):Promise<void>;
 /** Existing SSMA binding + workflow + immutable consumer pins, every attempt. */
 resolveGovernedRoute(input:PeerQueueInput,grant:PeerGrant,phase:'queue'|'dispatch'):Promise<{actorId:string}>;
 /** Private broker peer.deliver; uncertain failures MUST throw, never reject. */
 deliverLocal(input:{command:IntegrationCommand;scope:PeerAttestedScope;provider:CapabilityProvider}):Promise<PeerDeliveryOutcome>;
 /** Private broker peer.acknowledge using ORIGINAL command ID/digest. */
 acknowledgeLocal(input:{command:IntegrationCommand;outcome:PeerDeliveryOutcome}):Promise<void>;
 now?:()=>number;
}

function deny(code:string):never{throw Object.assign(new Error(code),{statusCode:403});}
function localAdmin(actor:PeerLocalActor){if(actor.role!=='local_admin'||!validUuid(actor.account_id))deny('PEER_LOCAL_ADMIN_REQUIRED');}
const safeError=(e:unknown)=>/^PEER_[A-Z_]{1,72}$/.test((e as Error)?.message)?(e as Error).message:'PEER_OPERATION_UNAVAILABLE';
function noPrivate(value:unknown){if(/PRIVATE KEY/i.test(canonical(value)))deny('PEER_PRIVATE_KEY_FORBIDDEN');}
function actorFor(g:PeerGrant,side:'source'|'destination'){return side==='source'?g.sourceApproval.payload.actorId:g.destinationApproval.payload.actorId;}
function expected(g:PeerGrant,c:IntegrationCommand){return{sourceProgramId:g.payload.sourceProgramId,destinationProgramId:g.payload.destinationProgramId,purpose:g.payload.purpose,operation:c.capability?.operation??''};}
function providerFor(p:VerifiedPeerProfile,g:PeerGrant):CapabilityProvider{
 const v=p.providers.find(v=>v.moduleId===g.payload.providerModuleId),capability=v?.manifest.smart?.provides.find(c=>c.capabilityId===g.payload.capabilityId);
 if(!v||!capability)deny('PEER_PROVIDER_CHANGED');
 return{moduleId:v.moduleId,moduleVersion:v.manifest.version,installationId:v.providerInstallationId,entityId:p.profile.entityId,packageDigest:v.packageDigest,state:v.state,configured:v.configuredCapabilities.includes(capability.capabilityId),capability};
}
function scopeFor(g:PeerGrant):PeerAttestedScope{const p=g.payload;return{sourceEntityId:p.sourceEntityId,sourceInstallationId:p.sourceInstallationId,sourceProgramId:p.sourceProgramId,destinationEntityId:p.destinationEntityId,destinationInstallationId:p.destinationInstallationId,destinationProgramId:p.destinationProgramId,consumerModuleId:p.consumerModuleId,purpose:p.purpose,grantId:p.grantId,providerInstallationId:p.providerInstallationId,packageDigest:p.providerPackageDigest,expiresAt:p.expiresAt,sourceActorId:g.sourceApproval.payload.actorId,destinationActorId:g.destinationApproval.payload.actorId};}

/** No public route may call queue directly. Existing governed SSMA routes are the
 * sole source of its binding/workflow IDs, rechecked by resolveGovernedRoute. */
export function createPeerRegistry(pool:pg.Pool,deps:PeerRegistryDependencies){
 const now=()=>deps.now?.()??Date.now();
 async function imported(id:string){
  const row=(await pool.query("SELECT * FROM smart_peers WHERE installation_id=$1 AND state='approved'",[id])).rows[0];if(!row)deny('PEER_NOT_APPROVED');
  // A profile is a point-in-time human-imported snapshot, not a heartbeat. Verify
  // its original import timestamp, retain all pins, and check local provider state
  // authoritatively again on every inbound command.
  return verifyPeerProfile(row.profile,row.pins,await deps.trustedMasters(),Number(row.verified_at));
 }
 async function profiles(p:PeerGrantPayload){const local=await deps.localProfile(),id=local.profile.installationId;
  if(id!==p.sourceInstallationId&&id!==p.destinationInstallationId)deny('PEER_GRANT_AUDIENCE_MISMATCH');
  return{local,side:(id===p.sourceInstallationId?'source':'destination') as 'source'|'destination',source:id===p.sourceInstallationId?local:await imported(p.sourceInstallationId),destination:id===p.destinationInstallationId?local:await imported(p.destinationInstallationId)};
 }
 async function authority(actorId:string,p:PeerGrantPayload,side:'source'|'destination'){await deps.assertLocalAuthority(actorId,side==='source'?p.consumerModuleId:p.providerModuleId,side==='source'?p.sourceProgramId:p.destinationProgramId,side);}
 async function grant(id:string,requiredSide?:'source'|'destination'){
  if(!validUuid(id))deny('PEER_GRANT_NOT_APPROVED');const row=(await pool.query("SELECT * FROM smart_peer_grants WHERE grant_id=$1 AND state='approved'",[id])).rows[0];if(!row)deny('PEER_GRANT_NOT_APPROVED');
  const parsed=peerGrantSchema.parse(row.signed_grant),p=await profiles(parsed.payload);if(row.local_side!==p.side||(requiredSide&&p.side!==requiredSide))deny('PEER_GRANT_AUDIENCE_MISMATCH');
  const verified=verifyPeerGrant(parsed,p.source,p.destination,now());if(row.grant_digest!==peerGrantDigest(verified.payload)||row.local_actor_id!==actorFor(verified,p.side))deny('PEER_APPROVAL_MISMATCH');
  await authority(row.local_actor_id,verified.payload,p.side);return{grant:verified,...p};
 }
 async function importProfile(actor:PeerLocalActor,value:unknown,pins:PeerProfilePins){
  localAdmin(actor);noPrivate(pins);noPrivate(value);
  const keys=['installationId','entityId','origin','tlsCaPem','publisherTrust','transport'];if(Object.keys(pins).some(k=>!keys.includes(k)))deny('PEER_PINS_INVALID');
  const verified=verifyPeerProfile(value,pins,await deps.trustedMasters(),now()),local=await deps.localProfile();if(verified.profile.installationId===local.profile.installationId)deny('PEER_SELF_IMPORT_FORBIDDEN');
  await transaction(pool,async db=>{await db.query('SELECT pg_advisory_xact_lock(130013)');
   const old=(await db.query('SELECT * FROM smart_peers WHERE installation_id=$1',[pins.installationId])).rows[0];
   if(old?.state==='revoked')deny('PEER_REVOKED_REIMPORT_FORBIDDEN');
   if(old&&(canonical(old.pins)!==canonical(pins)||old.profile.payload.publicKey!==verified.profile.publicKey))deny('PEER_PIN_ROTATION_NOT_SUPPORTED');
   await db.query("INSERT INTO smart_peers(installation_id,entity_id,profile,pins,verified_at,imported_by,state) VALUES($1,$2,$3,$4,$5,$6,'approved') ON CONFLICT(installation_id) DO UPDATE SET entity_id=excluded.entity_id,profile=excluded.profile,pins=excluded.pins,verified_at=excluded.verified_at,imported_by=excluded.imported_by,updated_at=now()",[pins.installationId,pins.entityId,value,pins,verified.verifiedAt,actor.account_id]);
   await db.query("UPDATE smart_peer_providers SET state='unavailable' WHERE peer_installation_id=$1",[pins.installationId]);
   for(const p of verified.providers)await db.query('INSERT INTO smart_peer_providers(peer_installation_id,module_id,provider_installation_id,package_digest,descriptor,state,configured_capabilities) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(peer_installation_id,module_id,provider_installation_id,package_digest) DO UPDATE SET state=excluded.state,configured_capabilities=excluded.configured_capabilities',[pins.installationId,p.moduleId,p.providerInstallationId,p.packageDigest,p.descriptor,p.state,JSON.stringify(p.configuredCapabilities)]);
   await audit(db,actor.account_id,'smart.peer_imported',pins.installationId,{entityId:pins.entityId,providers:verified.providers.length});
  });return{installationId:pins.installationId,providers:verified.providers};
 }
 async function proposeGrant(actor:PeerLocalActor,value:unknown){localAdmin(actor);noPrivate(value);const p=peerGrantPayloadSchema.parse(value),v=await profiles(p);if(v.side!=='source')deny('PEER_SOURCE_APPROVAL_REQUIRED');await authority(actor.account_id,p,'source');
  return{payload:p,sourceApproval:await deps.signLocal({version:1 as const,kind:'ssma-peer-approval' as const,side:'source' as const,grantDigest:peerGrantDigest(p),actorId:actor.account_id,role:'local_admin' as const,reviewedAt:now()})};
 }
 async function countersignGrant(actor:PeerLocalActor,value:{payload:PeerGrantPayload;sourceApproval:PeerGrant['sourceApproval']}){localAdmin(actor);noPrivate(value);const p=peerGrantPayloadSchema.parse(value.payload),v=await profiles(p);if(v.side!=='destination')deny('PEER_DESTINATION_APPROVAL_REQUIRED');
  verifyAssertion(value.sourceApproval,v.source.publicKey);if(value.sourceApproval.payload.side!=='source'||value.sourceApproval.payload.grantDigest!==peerGrantDigest(p))deny('PEER_APPROVAL_MISMATCH');await authority(actor.account_id,p,'destination');
  const signed={payload:p,sourceApproval:value.sourceApproval,destinationApproval:await deps.signLocal({version:1 as const,kind:'ssma-peer-approval' as const,side:'destination' as const,grantDigest:peerGrantDigest(p),actorId:actor.account_id,role:'local_admin' as const,reviewedAt:now()})};await approveGrant(actor,signed);return signed;
 }
 async function approveGrant(actor:PeerLocalActor,value:unknown){localAdmin(actor);noPrivate(value);const parsed=peerGrantSchema.parse(value),v=await profiles(parsed.payload),g=verifyPeerGrant(parsed,v.source,v.destination,now());if(actorFor(g,v.side)!==actor.account_id)deny('PEER_APPROVAL_ACTOR_MISMATCH');await authority(actor.account_id,g.payload,v.side);const hash=peerGrantDigest(g.payload);
  await transaction(pool,async db=>{await db.query('SELECT pg_advisory_xact_lock(130013)');const old=(await db.query('SELECT * FROM smart_peer_grants WHERE grant_id=$1',[g.payload.grantId])).rows[0];if(old&&(old.grant_digest!==hash||canonical(old.signed_grant)!==canonical(g)||old.state!=='approved'))deny('PEER_GRANT_ID_REUSED');
   await db.query("INSERT INTO smart_peer_grants(grant_id,signed_grant,grant_digest,local_side,local_actor_id,peer_installation_id,state) VALUES($1,$2,$3,$4,$5,$6,'approved') ON CONFLICT DO NOTHING",[g.payload.grantId,g,hash,v.side,actor.account_id,v.side==='source'?g.payload.destinationInstallationId:g.payload.sourceInstallationId]);await audit(db,actor.account_id,'smart.peer_grant_approved',g.payload.grantId,{side:v.side});
  });return{grantId:g.payload.grantId};
 }
 async function revokePeer(actor:PeerLocalActor,id:string){localAdmin(actor);await transaction(pool,async db=>{await db.query("UPDATE smart_peers SET state='revoked',updated_at=now() WHERE installation_id=$1",[id]);await db.query("UPDATE smart_peer_grants SET state='revoked',updated_at=now() WHERE peer_installation_id=$1",[id]);await audit(db,actor.account_id,'smart.peer_revoked',id);});}
 async function revokeGrant(actor:PeerLocalActor,id:string){localAdmin(actor);await transaction(pool,async db=>{await db.query("UPDATE smart_peer_grants SET state='revoked',updated_at=now() WHERE grant_id=$1",[id]);await audit(db,actor.account_id,'smart.peer_grant_revoked',id);});}
 async function providers(){return(await pool.query("SELECT p.* FROM smart_peer_providers p JOIN smart_peers w ON w.installation_id=p.peer_installation_id WHERE w.state='approved' ORDER BY p.peer_installation_id,p.module_id,p.package_digest LIMIT 200")).rows;}
 async function queue(input:PeerQueueInput){const v=await grant(input.grantId,'source'),route=await deps.resolveGovernedRoute(input,v.grant,'queue');await authority(route.actorId,v.grant.payload,'source');validateCommand(input.command);const wire=input.wireCommand??input.command;validateCommand(wire);
  // The existing SSMA router may resequence across capabilities and select a
  // provider target; every other original envelope field remains unchanged.
  const normalize=(c:IntegrationCommand)=>{const{sequence,targetModuleId,command,...rest}=c;return rest;};
  if(canonical(normalize(wire))!==canonical(normalize(input.command)))deny('PEER_ORIGINAL_COMMAND_CHANGED');
  const proof=await proofFor(wire,v);const routedDigest=peerDeliveryDigest(proof.payload);
  await transaction(pool,async db=>{await db.query('SELECT pg_advisory_xact_lock(130014)');const old=(await db.query('SELECT * FROM smart_peer_deliveries WHERE command_id=$1',[wire.commandId])).rows[0];if(old&&(old.routed_digest!==routedDigest||canonical(old.original_command)!==canonical(input.command)||old.binding_id!==input.bindingId||(old.workflow_id??null)!==(input.workflowId??null)||old.actor_id!==route.actorId))deny('PEER_COMMAND_ID_REUSED');
   await db.query("INSERT INTO smart_peer_deliveries(command_id,grant_id,binding_id,workflow_id,actor_id,original_command,wire_command,routed_digest,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending') ON CONFLICT DO NOTHING",[wire.commandId,input.grantId,input.bindingId,input.workflowId??null,route.actorId,input.command,wire,routedDigest]);
  });return{commandId:wire.commandId};
 }
 async function proofFor(command:IntegrationCommand,v:Awaited<ReturnType<typeof grant>>){
  const g=v.grant.payload,payload:PeerCommandPayload={version:1,kind:'ssma-peer-command',grantId:g.grantId,sourceInstallationId:g.sourceInstallationId,destinationInstallationId:g.destinationInstallationId,sourceEntityId:g.sourceEntityId,destinationEntityId:g.destinationEntityId,sourceProgramId:g.sourceProgramId,destinationProgramId:g.destinationProgramId,purpose:g.purpose,consumerInstallationId:g.consumerInstallationId,consumerPackageDigest:g.consumerPackageDigest,providerInstallationId:g.providerInstallationId,providerPackageDigest:g.providerPackageDigest,issuedAt:now(),nonce:randomUUID(),command};
  const proof=await deps.signLocal(payload);verifyPeerCommand(proof,v.grant,v.source,providerFor(v.destination,v.grant),expected(v.grant,command),now());return proof;
 }
 async function retry(id:string,e:unknown){await pool.query("UPDATE smart_peer_deliveries SET state=CASE WHEN result IS NULL THEN 'pending' ELSE 'ack_pending' END,error_code=$2,lease_until=NULL,next_attempt_at=now()+make_interval(secs=>LEAST(60,power(2,LEAST(attempts,6))::integer)),updated_at=now() WHERE command_id=$1",[id,safeError(e)]);}
 async function processOutgoing(limit=4){if(!Number.isInteger(limit)||limit<1||limit>20)deny('PEER_BATCH_INVALID');let completed=0;
  for(let n=0;n<limit;n++){
   const row=await transaction(pool,async db=>{const r=(await db.query("SELECT * FROM smart_peer_deliveries WHERE ((state IN ('pending','ack_pending') AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now())) OR (state='delivering' AND lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!r)return null;await db.query("UPDATE smart_peer_deliveries SET state='delivering',lease_until=now()+interval '30 seconds',attempts=attempts+1,updated_at=now() WHERE command_id=$1",[r.command_id]);return r;});if(!row)break;
   try{
    const input:PeerQueueInput={command:row.original_command,wireCommand:row.wire_command,bindingId:row.binding_id,workflowId:row.workflow_id,grantId:row.grant_id},v=await grant(row.grant_id,'source');
    const governed=await deps.resolveGovernedRoute(input,v.grant,'dispatch');if(governed.actorId!==row.actor_id)deny('PEER_APPROVAL_ACTOR_MISMATCH');await authority(governed.actorId,v.grant.payload,'source');
    let outcome:PeerDeliveryOutcome=row.result;
    if(!outcome){const proof=await proofFor(row.wire_command,v);if(peerDeliveryDigest(proof.payload)!==row.routed_digest)deny('PEER_ROUTE_CHANGED');
     const response=await requestPeerCommand(v.destination,proof),provider=providerFor(v.destination,v.grant),op=provider.capability.operations.find(o=>o.name===row.wire_command.capability?.operation);if(!op)deny('PEER_OPERATION_NOT_AUTHORIZED');
     const receipt=verifyPeerReceipt(response,proof.payload,v.destination,op.output,now());outcome={outcome:receipt.outcome,result:receipt.result,errorCode:receipt.errorCode};
     // Persist before source ACK: lost local ACK must never resubmit externally.
     await pool.query("UPDATE smart_peer_deliveries SET state='ack_pending',result=$2,error_code=NULL,updated_at=now() WHERE command_id=$1",[row.command_id,outcome]);
    }
    await deps.acknowledgeLocal({command:row.original_command,outcome});
    await pool.query('UPDATE smart_peer_deliveries SET state=$2,lease_until=NULL,error_code=$3,updated_at=now() WHERE command_id=$1',[row.command_id,outcome.outcome,outcome.errorCode]);completed++;
   }catch(e){await retry(row.command_id,e);}
  }return{completed};
 }
 async function receive(value:unknown){
  const parsed=signedPeerCommandSchema.parse(value),v=await grant(parsed.payload.grantId,'destination'),command=parsed.payload.command as IntegrationCommand,provider=providerFor(v.local,v.grant);
  const payload=verifyPeerCommand(value,v.grant,v.source,provider,expected(v.grant,command),now()),deliveryDigest=peerDeliveryDigest(payload);
  // Commit the proof nonce independently. Even uncertain application outcomes
  // require a new signed attempt; the durable original command ID is retained.
  await transaction(pool,async db=>{await consumePeerNonce(db,payload,now());await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[payload.sourceInstallationId+':'+command.commandId]);const old=(await db.query('SELECT * FROM smart_peer_inbox WHERE source_installation_id=$1 AND command_id=$2',[payload.sourceInstallationId,command.commandId])).rows[0];if(old&&old.delivery_digest!==deliveryDigest)deny('PEER_COMMAND_ID_REUSED');
   await db.query("INSERT INTO smart_peer_inbox(source_installation_id,command_id,grant_id,delivery_digest,state) VALUES($1,$2,$3,$4,'pending') ON CONFLICT DO NOTHING",[payload.sourceInstallationId,command.commandId,payload.grantId,deliveryDigest]);
  });
  const outcome=await transaction(pool,async db=>{
   const row=(await db.query('SELECT * FROM smart_peer_inbox WHERE source_installation_id=$1 AND command_id=$2 FOR UPDATE',[payload.sourceInstallationId,command.commandId])).rows[0];if(row.state!=='pending')return row.result as PeerDeliveryOutcome;
   // Recheck local approval immediately before handing off. No Master runtime
   // dependency is involved. Module-owned inbox supplies final idempotency.
   const current=await grant(payload.grantId,'destination');const result=await deps.deliverLocal({command,scope:scopeFor(current.grant),provider:providerFor(current.local,current.grant)});
   const op=provider.capability.operations.find(o=>o.name===command.capability?.operation);if(!op)deny('PEER_OPERATION_NOT_AUTHORIZED');
   if(result.outcome==='delivered'){if(result.result===null||result.errorCode!==null)deny('PEER_RESULT_INVALID');validateCapabilityValue(result.result,op.output);}else if(result.outcome!=='rejected'||result.result!==null||typeof result.errorCode!=='string'||!/^PEER_[A-Z_]{1,72}$/.test(result.errorCode))deny('PEER_RESULT_INVALID');
   if(Buffer.byteLength(canonical(result))>60000)deny('PEER_RESPONSE_TOO_LARGE');await db.query('UPDATE smart_peer_inbox SET state=$3,result=$4,updated_at=now() WHERE source_installation_id=$1 AND command_id=$2',[payload.sourceInstallationId,command.commandId,result.outcome,result]);return result;
  });
  // Cached business results get a NEW proof bound to this attempt's nonce.
  return deps.signLocal({version:1 as const,kind:'ssma-peer-receipt' as const,grantId:payload.grantId,sourceInstallationId:payload.sourceInstallationId,destinationInstallationId:payload.destinationInstallationId,commandId:command.commandId,commandDigest:deliveryDigest,requestNonce:payload.nonce,issuedAt:now(),outcome:outcome.outcome,result:outcome.result,errorCode:outcome.errorCode,providerInstallationId:payload.providerInstallationId,providerPackageDigest:payload.providerPackageDigest});
 }
 return{importProfile,proposeGrant,countersignGrant,approveGrant,revokePeer,revokeGrant,providers,grant,queue,processOutgoing,receive};
}
