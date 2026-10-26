import assert from 'node:assert/strict';

// Acceptance orchestration metadata only. The Worker APIs remain the authority
// for actual grants, binding supersession and workflow approval.
export function supersedeNewWorkEntries(entries,newKey,priorKeys,reviewedAt=new Date().toISOString()){
 assert(Array.isArray(priorKeys)&&priorKeys.length<=12,'Bounded explicit prior approval keys required');
 const next=entries[newKey];assert(next?.bindingApproved,'Approve the exact new binding before excluding prior new-work steps');
 const tuple=['sourceInstallationId','sourceEntityId','sourceProgramId','consumerModuleId','destinationInstallationId','destinationEntityId','destinationProgramId','providerModuleId','capabilityId','purpose'];
 const previous=[];for(const key of priorKeys){assert(typeof key==='string'&&key!==newKey,'A new approval cannot supersede itself');const old=entries[key];if(!old)continue;
  assert(tuple.every(field=>old.payload[field]===next.payload[field]),'New-work supersession cannot cross a consumer, programme, provider or purpose');
  assert(!old.supersededForNewWork||(old.supersededForNewWork.byKey===newKey||priorKeys.includes(old.supersededForNewWork.byKey)),'Historical new-work supersession cannot be reassigned');previous.push(old);
 }
 for(const old of previous)old.supersededForNewWork??={byKey:newKey,bindingId:next.bindingId,reviewedAt};
 return previous.length;
}
