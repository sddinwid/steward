import {validateCapabilityValue} from '@steward/module-sdk';
import {ensure,type Context,type Definition} from '@steward/business-kit';
import {moduleServiceOperations,moduleServicesCapability,moduleServiceReferenceResponse,type ModuleServiceDeclaration} from '@steward/catalog-kit/module-services';
const declarations:ModuleServiceDeclaration[]=[{"kind":"training","capabilityId":"workforce.pathways","name":"Training pathways interface"},{"kind":"employment","capabilityId":"workforce.pathways","name":"Employment pathways interface"}];
/** Signed interface metadata only: never programme rows, capacity or participants. */
export function withModuleServices(definition:Definition):Definition {
 const operation=(command:unknown)=>moduleServiceOperations.some(o=>o.name===command);
 function authorize(ctx:Context,sourceModuleId:string){const p=ctx.incomingProviderIdentity,own=ctx.providerIdentity;ensure(p&&own&&!ctx.peerScope&&p.workerInstallationId===ctx.installationId&&p.entityId===ctx.entityId&&p.moduleId===sourceModuleId&&own.workerInstallationId===ctx.installationId&&own.entityId===ctx.entityId&&ctx.config.integrationsEnabled===true,'Local governed module interface metadata unavailable',403);}
 return{...definition,authorize:async(ctx,access)=>{
  if(access.operation==='integration-receive'&&access.command&&operation(access.command.command)){
   ensure(access.command.capability?.capabilityId===moduleServicesCapability(definition.manifest.moduleId).capabilityId,'Module interface capability mismatch',403);authorize(ctx,access.command.sourceModuleId);return;
  }
  await definition.authorize?.(ctx,access);
 },receive:async(command,ctx)=>{
  if(operation(command.command)){authorize(ctx,command.sourceModuleId);try{validateCapabilityValue(command.payload,moduleServiceOperations.find(o=>o.name===command.command)!.input);}catch{ensure(false,'Invalid closed module interface metadata request',400);}return moduleServiceReferenceResponse(definition.manifest,declarations,command.command,command.payload);}
  ensure(definition.receive,'Integration operation unsupported',403);return definition.receive(command,ctx);
 }};
}
