import type {WorkflowBindingChoice} from './workflow-designer.js';

/** Presentation of the existing authenticated registry only. This is not a
 * resolver or an authority decision. The server revalidates every operation. */
export function workflowBindingChoices(registry:unknown,consumerId:string):WorkflowBindingChoice[]{
  const r=registry as {providers?:any[];bindings?:any[];entityId?:string};
  if(!r||!Array.isArray(r.providers)||!Array.isArray(r.bindings)||typeof r.entityId!=='string')throw Error('The signed capability registry response is incomplete.');
  return r.bindings.filter(b=>b.consumer_id===consumerId).map(b=>{
    const p=r.providers!.find(p=>p.moduleId===b.provider_id&&p.installationId===b.provider_installation_id&&p.packageDigest===b.package_digest&&p.entityId===r.entityId&&p.capability?.capabilityId===b.capability_id);
    const state=b.state!=='approved'?b.state:!p?'provider changed':p.state!=='active'?p.state:!p.configured?'configuration required':'approved';
    const c=p?.capability??b.capability;
    return{bindingId:b.binding_id,provider:b.provider_id,capability:b.capability_id,contractVersion:c?.version??'unknown',
      state,sensitivity:c?.sensitivity??'unknown',operations:Array.isArray(c?.operations)?c.operations.map((o:any)=>({name:o.name,permission:o.permission,input:o.input,output:o.output})):[]};
  });
}
