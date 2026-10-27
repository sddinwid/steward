import {canonical,digest} from '@steward/module-sdk';

interface InstallationSnapshot {module_id:string;operation_id:string;descriptor:unknown;configuration:unknown}
/** Called after lifecycle locks: identical package/configuration does not make a
 * replacement installation the provider originally selected for an obligation. */
export function assertInstallationContinuity(selected:InstallationSnapshot[],current:(InstallationSnapshot&{state:string})[]){
 for(const old of selected){
  const live=current.find(row=>row.module_id===old.module_id);
  if(!live||live.state!=='active'||live.operation_id!==old.operation_id||canonical(live.descriptor)!==canonical(old.descriptor)||canonical(live.configuration)!==canonical(old.configuration))throw Error('INTEGRATION_PROVIDER_CHANGED');
 }
}
/** Legacy runtimes have no providerIdentity. New runtimes must attest the same
 * installed operation/package as the locked metadata, before any delivery. */
export function assertRuntimeInstallation(selected:InstallationSnapshot,runtime:Record<string,any>,workerInstallationId:string){
 const p=runtime.providerIdentity;if(p===undefined)return;
 if(!p||typeof runtime.entityId!=='string'||!runtime.entityId||p.workerInstallationId!==workerInstallationId||p.moduleId!==selected.module_id||p.moduleInstallationId!==selected.operation_id||p.packageDigest!==digest(canonical(selected.descriptor))||p.entityId!==runtime.entityId)throw Error('INTEGRATION_PROVIDER_CHANGED');
}
