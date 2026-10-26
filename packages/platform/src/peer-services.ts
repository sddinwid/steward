// Generic SSMA peer verification/transport primitives. These do not approve a
// binding, dispatch a business command, or loosen entity-local resolution.
import {X509Certificate,randomUUID,createHash} from 'node:crypto';
import {request} from 'node:https';
import type pg from 'pg';
import type {SignedAssertion,EnrollmentCertificate} from '@steward/contracts';
import {boundedLookup,canonical,digest,verifyPackage,validateCommand,validateCapabilityValue,resolveCapability,type PublisherTrust,type SignedModulePackage,type ModulePackageManifest,type CapabilityProvider,type CapabilityRequirement,type IntegrationCommand} from '@steward/module-sdk';
import {hash,normalizePublicKey,signAssertion,verifyAssertion} from './security/crypto.js';
import type {TrustedMaster} from './security/config.js';
import {peerOriginSchema,signedPeerProfileSchema,peerGrantSchema,peerGrantPayloadSchema,signedPeerCommandSchema,signedPeerReceiptSchema,type PeerProfilePayload,type PeerGrant,type PeerGrantPayload,type PeerCommandPayload,type PeerReceiptPayload} from './peer-service-schema.js';

const MAX_PROFILE_BYTES=1048576,MAX_COMMAND_BYTES=49152,MAX_RESPONSE_BYTES=65536;
const verifiedGrants=new WeakSet<object>();
export const PEER_COMMAND_PATH='/api/v13/peer-services/commands';
function reject(code:string):never{throw new Error(code);}
function bounded(value:unknown,max:number,code:string){if(Buffer.byteLength(canonical(value))>max)reject(code);}
function timeWindow(issuedAt:number,now:number){if(Math.abs(now-issuedAt)>30000)reject('PEER_PROOF_EXPIRED');}
function programScopedInput(schema:Record<string,unknown>){const properties=schema.properties as Record<string,any>|undefined,required=schema.required as string[]|undefined;return schema.type==='object'&&schema.additionalProperties===false&&required?.includes('programId')&&required.includes('sourceProgramId')&&properties?.programId?.type==='string'&&properties?.sourceProgramId?.type==='string';}
export function peerTlsCaFingerprint(caPem:string,now=Date.now()){
 try{if(/PRIVATE KEY/.test(caPem))reject('PEER_TLS_PIN_INVALID');const c=new X509Certificate(caPem);if(!c.ca||Date.parse(c.validFrom)>now||Date.parse(c.validTo)<=now)reject('PEER_TLS_PIN_INVALID');return createHash('sha256').update(c.raw).digest('hex');}catch{return reject('PEER_TLS_PIN_INVALID');}
}
export interface PeerProfilePins {installationId:string;entityId:string;origin:string;tlsCaPem:string;publisherTrust:PublisherTrust}
export interface VerifiedPeerProvider {moduleId:string;providerInstallationId:string;packageDigest:string;descriptor:SignedModulePackage;manifest:ModulePackageManifest;state:'active'|'inactive'|'unavailable';configuredCapabilities:string[]}
export interface VerifiedPeerProfile {profile:PeerProfilePayload;publicKey:string;tlsCaPem:string;providers:VerifiedPeerProvider[];verifiedAt:number}

/** Admin pins are supplied independently; no offered URL/CA/publisher is trusted implicitly. */
export function verifyPeerProfile(value:unknown,pins:PeerProfilePins,trustedMasters:Pick<TrustedMaster,'installationId'|'publicKey'>[],now=Date.now()):VerifiedPeerProfile{
 try{
  bounded(value,MAX_PROFILE_BYTES,'PEER_PROFILE_TOO_LARGE');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(canonical(value)))reject('PEER_PROFILE_PRIVATE_KEY');const assertion=signedPeerProfileSchema.parse(value),p=assertion.payload;
  if(p.installationId!==pins.installationId||p.entityId!==pins.entityId||p.origin!==peerOriginSchema.parse(pins.origin))reject('PEER_PROFILE_PIN_MISMATCH');
  if(p.expiresAt<=now||p.issuedAt>now+30000||p.expiresAt-p.issuedAt<=0||p.expiresAt-p.issuedAt>300000||now-p.issuedAt>300000)reject('PEER_PROFILE_EXPIRED');
  if(peerTlsCaFingerprint(pins.tlsCaPem,now)!==p.tlsCaSha256)reject('PEER_TLS_PIN_MISMATCH');
  const c=p.certificate.payload,master=trustedMasters.find(m=>m.installationId===c.issuer);if(!master)reject('PEER_ISSUER_UNTRUSTED');
  verifyAssertion(p.certificate as SignedAssertion<EnrollmentCertificate>,master.publicKey);
  const key=normalizePublicKey(p.publicKey);if(c.installationId!==p.installationId||c.entityId!==p.entityId||c.keyThumbprint!==hash(key)||c.issuedAt>now+30000)reject('PEER_CERTIFICATE_MISMATCH');
  verifyAssertion(assertion,key);
  if(new Set(p.providers.map(v=>v.moduleId)).size!==p.providers.length)reject('PEER_PROVIDER_DUPLICATE');
  const providers=p.providers.map(v=>{const descriptor=v.descriptor as SignedModulePackage,packageValue=verifyPackage(descriptor,pins.publisherTrust),m=packageValue.manifest;
   if(v.moduleId!==m.moduleId||new Set(v.configuredCapabilities).size!==v.configuredCapabilities.length||v.configuredCapabilities.some(id=>!m.smart?.provides.some(c=>c.capabilityId===id)))reject('PEER_PROVIDER_MISMATCH');
   return{moduleId:m.moduleId,providerInstallationId:v.providerInstallationId,packageDigest:digest(canonical(descriptor)),descriptor,manifest:m,state:v.state,configuredCapabilities:v.configuredCapabilities};});
  return{profile:p,publicKey:key,tlsCaPem:pins.tlsCaPem,providers,verifiedAt:now};
 }catch(e){if((e as Error).message.startsWith('PEER_'))throw e;return reject('PEER_PROFILE_INVALID');}
}

export function peerGrantDigest(value:PeerGrantPayload){return digest(canonical(peerGrantPayloadSchema.parse(value)));}
/** Cryptographic approval is necessary, never sufficient: callers also check their
 * persisted local approval/account/program relationships on every use. */
export function verifyPeerGrant(value:unknown,source:VerifiedPeerProfile,destination:VerifiedPeerProfile,now=Date.now()):PeerGrant{
 try{
  bounded(value,32768,'PEER_GRANT_TOO_LARGE');const grant=peerGrantSchema.parse(value),p=grant.payload;
  if(p.sourceInstallationId!==source.profile.installationId||p.sourceEntityId!==source.profile.entityId||p.destinationInstallationId!==destination.profile.installationId||p.destinationEntityId!==destination.profile.entityId||p.sourceInstallationId===p.destinationInstallationId)reject('PEER_GRANT_AUDIENCE_MISMATCH');
  if(p.notBefore>now||p.expiresAt<=now||p.expiresAt<=p.notBefore||p.expiresAt-p.notBefore>31*86400000||new Set(p.operations).size!==p.operations.length)reject('PEER_GRANT_EXPIRED');
  const expected=peerGrantDigest(p);for(const[side,a,key]of [['source',grant.sourceApproval,source.publicKey],['destination',grant.destinationApproval,destination.publicKey]] as const){verifyAssertion(a,key);if(a.payload.side!==side||a.payload.grantDigest!==expected||a.payload.reviewedAt>now+30000||a.payload.reviewedAt>p.expiresAt)reject('PEER_APPROVAL_MISMATCH');}
  const consumer=source.providers.find(v=>v.moduleId===p.consumerModuleId),provider=destination.providers.find(v=>v.moduleId===p.providerModuleId);
  if(!consumer||consumer.state!=='active'||consumer.providerInstallationId!==p.consumerInstallationId||consumer.packageDigest!==p.consumerPackageDigest||!provider||provider.state!=='active'||provider.providerInstallationId!==p.providerInstallationId||provider.packageDigest!==p.providerPackageDigest)reject('PEER_PROVIDER_CHANGED');
  const requirement=consumer.manifest.smart?.consumes.find(c=>c.capabilityId===p.capabilityId),capability=provider.manifest.smart?.provides.find(c=>c.capabilityId===p.capabilityId);
  if(!requirement||!capability||!provider.configuredCapabilities.includes(p.capabilityId)||p.operations.some(name=>!requirement.operations.some(o=>o.name===name)||!capability.operations.some(o=>o.name===name&&o.mode==='durable'&&o.retry==='safe'&&programScopedInput(o.input))))reject('PEER_CAPABILITY_NOT_AUTHORIZED');
  if(capability.sensitivity==='restricted'&&p.maximumSensitivity!=='restricted')reject('PEER_SENSITIVITY_EXCEEDED');
  // Explicit peer approval enters the provider's authority scope. The existing
  // resolver's entity equality check is deliberately unchanged.
  const remote:CapabilityProvider={moduleId:provider.moduleId,moduleVersion:provider.manifest.version,installationId:provider.providerInstallationId,entityId:p.destinationEntityId,packageDigest:provider.packageDigest,state:'active',configured:true,capability};
  const allowedRequirement:CapabilityRequirement={...requirement,operations:requirement.operations.filter(o=>p.operations.includes(o.name))};
  if(!resolveCapability(allowedRequirement,[remote],{entityId:p.destinationEntityId,permissions:capability.operations.filter(o=>p.operations.includes(o.name)).map(o=>o.permission)}).selected)reject('PEER_CAPABILITY_INCOMPATIBLE');
  const freeze=(v:any):any=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};freeze(grant);verifiedGrants.add(grant);return grant;
 }catch(e){if((e as Error).message.startsWith('PEER_'))throw e;return reject('PEER_GRANT_INVALID');}
}

export interface PeerCommandExpectation {sourceProgramId:string;destinationProgramId:string;purpose:string;operation:string}
function commandIdentity(p:PeerCommandPayload,grant:PeerGrant,expected:PeerCommandExpectation,now:number):IntegrationCommand{
 if(!verifiedGrants.has(grant))reject('PEER_GRANT_NOT_VERIFIED');const g=grant.payload;timeWindow(p.issuedAt,now);if(g.notBefore>now||g.expiresAt<=now)reject('PEER_GRANT_EXPIRED');
 for(const key of ['grantId','sourceInstallationId','destinationInstallationId','sourceEntityId','destinationEntityId','sourceProgramId','destinationProgramId','purpose','consumerInstallationId','consumerPackageDigest','providerInstallationId','providerPackageDigest'] as const)if(p[key]!==g[key])reject('PEER_COMMAND_SCOPE_MISMATCH');
 if(expected.sourceProgramId!==g.sourceProgramId||expected.destinationProgramId!==g.destinationProgramId||expected.purpose!==g.purpose||!g.operations.includes(expected.operation))reject('PEER_COMMAND_SCOPE_MISMATCH');
 const command=p.command as IntegrationCommand;validateCommand(command);
 if(command.sourceModuleId!==g.consumerModuleId||command.targetModuleId!==g.providerModuleId||command.capability?.capabilityId!==g.capabilityId||command.capability?.operation!==expected.operation)reject('PEER_COMMAND_IDENTITY_MISMATCH');
 if(!Object.hasOwn(command.payload,'programId')||!Object.hasOwn(command.payload,'sourceProgramId')||command.payload.programId!==g.destinationProgramId||command.payload.sourceProgramId!==g.sourceProgramId)reject('PEER_COMMAND_SCOPE_MISMATCH');
 if(['actor','actorId','accountId','permissions','role','roles','sourceInstallationId','destinationInstallationId','sourceEntityId','destinationEntityId','grantId'].some(k=>Object.hasOwn(command.payload,k)))reject('PEER_PAYLOAD_AUTHORITY_FORBIDDEN');
 return command;
}
/** A new nonce is minted for each attempt; the original command ID/sequence and
 * all program/provider/grant pins remain unchanged across retries. */
export function signPeerCommand(command:IntegrationCommand,grant:PeerGrant,key:string,expected:PeerCommandExpectation,now=Date.now()):SignedAssertion<PeerCommandPayload>{
 const g=grant.payload,payload:PeerCommandPayload={version:1,kind:'ssma-peer-command',grantId:g.grantId,sourceInstallationId:g.sourceInstallationId,destinationInstallationId:g.destinationInstallationId,sourceEntityId:g.sourceEntityId,destinationEntityId:g.destinationEntityId,sourceProgramId:g.sourceProgramId,destinationProgramId:g.destinationProgramId,purpose:g.purpose,consumerInstallationId:g.consumerInstallationId,consumerPackageDigest:g.consumerPackageDigest,providerInstallationId:g.providerInstallationId,providerPackageDigest:g.providerPackageDigest,issuedAt:now,nonce:randomUUID(),command};
 commandIdentity(payload,grant,expected,now);bounded(payload,MAX_COMMAND_BYTES,'PEER_COMMAND_TOO_LARGE');return signAssertion(payload,key);
}
export function peerDeliveryDigest(payload:PeerCommandPayload){const{issuedAt,nonce,...pinned}=payload;return digest(canonical(pinned));}
export function verifyPeerCommand(value:unknown,grant:PeerGrant,source:VerifiedPeerProfile,provider:CapabilityProvider,expected:PeerCommandExpectation,now=Date.now()):PeerCommandPayload{
 try{bounded(value,MAX_COMMAND_BYTES,'PEER_COMMAND_TOO_LARGE');const a=signedPeerCommandSchema.parse(value);verifyAssertion(a,source.publicKey);const p=a.payload,command=commandIdentity(p,grant,expected,now),g=grant.payload;
  if(source.profile.installationId!==g.sourceInstallationId||source.profile.entityId!==g.sourceEntityId||provider.moduleId!==g.providerModuleId||provider.entityId!==g.destinationEntityId||provider.installationId!==g.providerInstallationId||provider.packageDigest!==g.providerPackageDigest||provider.state!=='active'||!provider.configured)reject('PEER_PROVIDER_CHANGED');
  const op=provider.capability.operations.find(o=>o.name===expected.operation);if(!op||op.mode!=='durable'||op.retry!=='safe'||command.command!==op.command)reject('PEER_OPERATION_NOT_AUTHORIZED');validateCapabilityValue(command.payload,op.input);return p;
 }catch(e){if((e as Error).message.startsWith('PEER_'))throw e;return reject('PEER_COMMAND_INVALID');}
}
/** Use within the receiving Worker's admission transaction after proof checks.
 * Business idempotency is separately keyed by original command ID + digest. */
export async function consumePeerNonce(db:Pick<pg.PoolClient,'query'>,payload:PeerCommandPayload,now=Date.now()){
 timeWindow(payload.issuedAt,now);await db.query('DELETE FROM smart_peer_nonces WHERE expires_at<$1',[new Date(now)]);
 const r=await db.query('INSERT INTO smart_peer_nonces(source_installation_id,nonce,expires_at) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING nonce',[payload.sourceInstallationId,payload.nonce,new Date(now+60000)]);if(!r.rowCount)reject('PEER_PROOF_REPLAYED');
}
export function verifyPeerReceipt(value:unknown,request:PeerCommandPayload,destination:VerifiedPeerProfile,outputSchema:Record<string,unknown>,now=Date.now()):PeerReceiptPayload{
 try{bounded(value,MAX_RESPONSE_BYTES,'PEER_RESPONSE_TOO_LARGE');const a=signedPeerReceiptSchema.parse(value);verifyAssertion(a,destination.publicKey);const r=a.payload,c=request.command as IntegrationCommand;
  timeWindow(r.issuedAt,now);if(r.grantId!==request.grantId||r.sourceInstallationId!==request.sourceInstallationId||r.destinationInstallationId!==request.destinationInstallationId||destination.profile.installationId!==request.destinationInstallationId||destination.profile.entityId!==request.destinationEntityId||r.commandId!==c.commandId||r.commandDigest!==peerDeliveryDigest(request)||r.requestNonce!==request.nonce||r.providerInstallationId!==request.providerInstallationId||r.providerPackageDigest!==request.providerPackageDigest)reject('PEER_RECEIPT_MISMATCH');
  if(r.outcome==='delivered'){if(r.errorCode!==null||r.result===null)reject('PEER_RECEIPT_INVALID');validateCapabilityValue(r.result,outputSchema);}else if(r.errorCode===null||r.result!==null)reject('PEER_RECEIPT_INVALID');return r;
 }catch(e){if((e as Error).message.startsWith('PEER_'))throw e;return reject('PEER_RECEIPT_INVALID');}
}

/** Only a previously pinned peer origin/CA is accepted; no cookies, redirects,
 * bearer secrets, model-selected URL or arbitrary route may be forwarded. */
export async function requestPeerCommand(peer:VerifiedPeerProfile,envelope:SignedAssertion<PeerCommandPayload>,options:{timeoutMs?:number;signal?:AbortSignal}={}):Promise<unknown>{
 const timeout=options.timeoutMs??5000;if(!Number.isInteger(timeout)||timeout<100||timeout>10000)reject('PEER_DEADLINE_INVALID');if(!peerOriginSchema.safeParse(peer.profile.origin).success)reject('PEER_ORIGIN_INVALID');
 if(peerTlsCaFingerprint(peer.tlsCaPem)!==peer.profile.tlsCaSha256)reject('PEER_TLS_PIN_MISMATCH');bounded(envelope,MAX_COMMAND_BYTES,'PEER_COMMAND_TOO_LARGE');const bytes=JSON.stringify(envelope),url=new URL(PEER_COMMAND_PATH,peer.profile.origin),signal=options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout);
 return new Promise((resolve,rejectPromise)=>{const req=request(url,{method:'POST',ca:peer.tlsCaPem,rejectUnauthorized:true,lookup:boundedLookup,signal,headers:{'content-type':'application/json','content-length':Buffer.byteLength(bytes)}},res=>{const chunks:Buffer[]=[];let size=0,oversized=false;res.on('data',(part:Buffer)=>{size+=part.length;if(size>MAX_RESPONSE_BYTES){oversized=true;req.destroy(new Error('PEER_RESPONSE_TOO_LARGE'));}else chunks.push(part);});res.on('error',()=>rejectPromise(new Error(oversized?'PEER_RESPONSE_TOO_LARGE':signal.aborted?'PEER_TRANSPORT_TIMEOUT':'PEER_TRANSPORT_UNAVAILABLE')));res.on('end',()=>{if(res.statusCode!==200)return rejectPromise(new Error('PEER_REQUEST_REJECTED'));if(!String(res.headers['content-type']??'').startsWith('application/json'))return rejectPromise(new Error('PEER_RESPONSE_INVALID'));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{rejectPromise(new Error('PEER_RESPONSE_INVALID'));}});});req.on('error',e=>rejectPromise(new Error((e as Error).message==='PEER_RESPONSE_TOO_LARGE'?'PEER_RESPONSE_TOO_LARGE':signal.aborted?'PEER_TRANSPORT_TIMEOUT':'PEER_TRANSPORT_UNAVAILABLE')));req.end(bytes);});
}
