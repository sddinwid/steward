import type pg from 'pg';
import {atLeast,canonical,digest,verifyPackage,resolveCapability,capabilityInboundEnabled,capabilityOutboundEnabled,type ModulePackageManifest,type PublisherTrust,type SignedModulePackage} from '@steward/module-sdk';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
/** Read-only current registry facts. This is neither a binding nor a workflow grant,
 * and makes no assertion that a provider's external service is reachable. */
export async function installedProviderHeaders(db:Pick<pg.Pool,'query'>,consumer:ModulePackageManifest,configuration:Record<string,unknown>,trust:PublisherTrust):Promise<Record<string,string>>{
 if(!atLeast(consumer.minimumPlatformVersion,'0.15.0')||!consumer.smart?.consumes.length)return{};
 const rows=(await db.query("SELECT i.module_id,i.version,i.state,i.configuration,i.operation_id,i.descriptor,e.entity_id FROM module_installations i CROSS JOIN local_enrollment e WHERE e.singleton AND e.state='enrolled' AND i.state='active' ORDER BY i.module_id LIMIT 65")).rows;
 const providers:string[][]=[];let complete=rows.length<=64;
 if(complete)for(const row of rows){
  if(!uuid.test(row.operation_id)||!uuid.test(row.entity_id)){complete=false;break;}
  let payload:SignedModulePackage['payload'];try{payload=verifyPackage(row.descriptor,trust);}catch{continue;}
  if(row.state!=='active'||payload.manifest.moduleId!==row.module_id||payload.manifest.version!==row.version)continue;
  for(const requirement of consumer.smart.consumes){
   if(!capabilityOutboundEnabled(consumer,configuration,requirement.capabilityId))continue;
   const capability=payload.manifest.smart?.provides.find(c=>c.capabilityId===requirement.capabilityId);if(!capability)continue;
   const identity={moduleId:row.module_id,moduleVersion:row.version,installationId:row.operation_id,entityId:row.entity_id,packageDigest:digest(canonical(row.descriptor)),state:'active' as const,configured:capabilityInboundEnabled(payload.manifest,row.configuration,capability.capabilityId),capability};
   if(resolveCapability(requirement,[identity],{entityId:row.entity_id,permissions:capability.operations.map(o=>o.permission)}).selected)providers.push([capability.capabilityId,row.module_id,row.operation_id,identity.packageDigest,digest(canonical(row.configuration))]);
  }
 }
 if(providers.length>12)complete=false;
 let value={v:1,issuedAt:Date.now(),complete,providers:complete?providers:[]};
 if(Buffer.byteLength(JSON.stringify(value))>4096)value={...value,complete:false,providers:[]};
 return{'x-steward-installed-providers':JSON.stringify(value)};
}
