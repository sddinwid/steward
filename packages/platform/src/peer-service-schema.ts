import {z} from 'zod';

const uuid=z.string().uuid();
const identifier=z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/).max(80);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const pem=z.string().min(40).max(16384);
const timestamp=z.number().int().nonnegative().safe();
export const peerOriginSchema=z.string().max(300).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.origin===value;}catch{return false;}},'A pinned HTTPS origin is required');
const enrollmentCertificate=z.object({version:z.literal(1),kind:z.literal('worker-enrollment'),issuer:uuid,installationId:uuid,entityId:uuid,keyThumbprint:digest,requestId:uuid,serial:uuid,issuedAt:timestamp}).strict();
export const signedEnrollmentCertificateSchema=z.object({payload:enrollmentCertificate,signature:z.string().min(40).max(256)}).strict();
const signedPackage=z.object({payload:z.unknown(),signature:z.string().min(40).max(256)}).strict();
export const peerProviderSchema=z.object({moduleId:identifier,providerInstallationId:uuid,descriptor:signedPackage,state:z.enum(['active','inactive','unavailable']),configuredCapabilities:z.array(identifier).max(20)}).strict();
export const peerProfilePayloadSchema=z.object({version:z.literal(1),kind:z.literal('ssma-peer-profile'),profileId:uuid,installationId:uuid,entityId:uuid,origin:peerOriginSchema,publicKey:pem,certificate:signedEnrollmentCertificateSchema,tlsCaSha256:digest,issuedAt:timestamp,expiresAt:timestamp,providers:z.array(peerProviderSchema).max(32)}).strict();
export const signedPeerProfileSchema=z.object({payload:peerProfilePayloadSchema,signature:z.string().min(40).max(256)}).strict();

/** This payload is only a proposal until BOTH Workers sign human approval. */
export const peerGrantPayloadSchema=z.object({version:z.literal(1),kind:z.literal('ssma-peer-grant'),grantId:uuid,
 sourceInstallationId:uuid,sourceEntityId:uuid,sourceProgramId:uuid,consumerModuleId:identifier,consumerInstallationId:uuid,consumerPackageDigest:digest,
 destinationInstallationId:uuid,destinationEntityId:uuid,destinationProgramId:uuid,providerModuleId:identifier,providerInstallationId:uuid,providerPackageDigest:digest,
 capabilityId:identifier,operations:z.array(identifier).min(1).max(12),purpose:identifier,maximumSensitivity:z.enum(['business','restricted']),
 disclosureBasis:z.enum(['synthetic-consent','documented-authority']),authorityReference:uuid,notBefore:timestamp,expiresAt:timestamp}).strict();
export const peerGrantApprovalPayloadSchema=z.object({version:z.literal(1),kind:z.literal('ssma-peer-approval'),side:z.enum(['source','destination']),grantDigest:digest,actorId:uuid,role:z.literal('local_admin'),reviewedAt:timestamp}).strict();
const approval=z.object({payload:peerGrantApprovalPayloadSchema,signature:z.string().min(40).max(256)}).strict();
export const peerGrantSchema=z.object({payload:peerGrantPayloadSchema,sourceApproval:approval,destinationApproval:approval}).strict();

/** IntegrationCommand remains unchanged; audience/program/purpose live outside it. */
export const peerCommandPayloadSchema=z.object({version:z.literal(1),kind:z.literal('ssma-peer-command'),grantId:uuid,
 sourceInstallationId:uuid,destinationInstallationId:uuid,sourceEntityId:uuid,destinationEntityId:uuid,sourceProgramId:uuid,destinationProgramId:uuid,purpose:identifier,
 consumerInstallationId:uuid,consumerPackageDigest:digest,providerInstallationId:uuid,providerPackageDigest:digest,
 issuedAt:timestamp,nonce:uuid,command:z.unknown()}).strict();
export const signedPeerCommandSchema=z.object({payload:peerCommandPayloadSchema,signature:z.string().min(40).max(256)}).strict();
export const peerReceiptPayloadSchema=z.object({version:z.literal(1),kind:z.literal('ssma-peer-receipt'),grantId:uuid,sourceInstallationId:uuid,destinationInstallationId:uuid,commandId:uuid,commandDigest:digest,requestNonce:uuid,issuedAt:timestamp,outcome:z.enum(['delivered','rejected']),result:z.record(z.string(),z.unknown()).nullable(),errorCode:z.string().regex(/^[A-Z_]{1,80}$/).nullable(),providerInstallationId:uuid,providerPackageDigest:digest}).strict();
export const signedPeerReceiptSchema=z.object({payload:peerReceiptPayloadSchema,signature:z.string().min(40).max(256)}).strict();
export type PeerProfilePayload=z.infer<typeof peerProfilePayloadSchema>;
export type PeerGrantPayload=z.infer<typeof peerGrantPayloadSchema>;
export type PeerGrant=z.infer<typeof peerGrantSchema>;
export type PeerCommandPayload=z.infer<typeof peerCommandPayloadSchema>;
export type PeerReceiptPayload=z.infer<typeof peerReceiptPayloadSchema>;
