import {canonical,digest,validateCommand,validateCapabilityValue,capabilityConfigured,type IntegrationCommand,type ModulePackageManifest} from '@steward/module-sdk';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
/** Called only after the existing signed private broker control proof. Public
 * proxy requests have no way to supply these private headers. */
export function peerDeliveryHeaders(input:{command:IntegrationCommand;scope:any},manifest:ModulePackageManifest,configuration:Record<string,unknown>,installationId:string,providerInstallationId:string,packageDigest:string,entityId:string,now=Date.now()){
 const deny=():never=>{throw new Error('INTEGRATION_PEER_AUTHORITY_INVALID');};
 const c=input.command,s=input.scope;validateCommand(c);
 const ids=['sourceEntityId','sourceInstallationId','sourceProgramId','destinationEntityId','destinationInstallationId','destinationProgramId','grantId','providerInstallationId','sourceActorId','destinationActorId'];
 const keys=[...ids,'consumerModuleId','purpose','packageDigest','expiresAt'];
 if(!s||Object.keys(s).length!==keys.length||Object.keys(s).some(k=>!keys.includes(k))||ids.some(k=>typeof s[k]!=='string'||!uuid.test(s[k]))||!Number.isSafeInteger(s.expiresAt)||s.expiresAt<=now||s.expiresAt>now+31*86400000||![s.consumerModuleId,s.purpose].every(v=>typeof v==='string'&&/^[a-z][a-z0-9.-]{0,79}$/.test(v)))deny();
 if(s.destinationInstallationId!==installationId||s.destinationEntityId!==entityId||s.providerInstallationId!==providerInstallationId||s.packageDigest!==packageDigest||c.sourceModuleId!==s.consumerModuleId||c.targetModuleId!==manifest.moduleId||c.payload.programId!==s.destinationProgramId||c.payload.sourceProgramId!==s.sourceProgramId)deny();
 if(['actor','actorId','accountId','permissions','role','roles','sourceInstallationId','destinationInstallationId','sourceEntityId','destinationEntityId','grantId'].some(k=>Object.hasOwn(c.payload,k)))deny();
 const cap=manifest.smart?.provides.find(v=>v.capabilityId===c.capability?.capabilityId),op=cap?.operations.find(o=>o.name===c.capability?.operation);
 if(!cap||!op||op.mode!=='durable'||op.retry!=='safe'||op.command!==c.command||!capabilityConfigured(manifest,configuration,cap))deny();
 validateCapabilityValue(c.payload,op!.input);
 return{operation:op!,headers:{'x-steward-integration-source':c.sourceModuleId,'x-steward-installation':installationId,'x-steward-capability':cap!.capabilityId,'x-steward-peer-scope':JSON.stringify(s)}};
}
export function peerAcknowledgment(command:IntegrationCommand,outcome:{outcome:string;result:unknown;errorCode:unknown},manifest:ModulePackageManifest){
 validateCommand(command);if(command.sourceModuleId!==manifest.moduleId||!manifest.integration||!['delivered','rejected'].includes(outcome.outcome)||outcome.outcome==='delivered'&&(outcome.errorCode!==null||!outcome.result)||outcome.outcome==='rejected'&&(typeof outcome.errorCode!=='string'||!/^[A-Z_]{1,80}$/.test(outcome.errorCode)))throw new Error('INTEGRATION_PEER_RECEIPT_INVALID');
 return{commandId:command.commandId,digest:digest(canonical(command)),status:outcome.outcome,result:outcome.result,error:outcome.errorCode};
}
