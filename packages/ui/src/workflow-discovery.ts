import {workflowFieldsFromSchema,type WorkflowFields} from '@steward/module-sdk/workflow';
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
      state,sensitivity:b.requirement?.maximumSensitivity??c?.sensitivity??'unknown',operations:Array.isArray(c?.operations)?c.operations.map((o:any)=>({name:o.name,permission:o.permission,input:o.input,output:o.output})):[]};
  });
}


/** Read-only presentation from the module's signed, authenticated discovery API.
 * Publication and execution revalidate the complete authoritative schema. */
export function workflowTriggerFields(response:unknown,selection:string,maxAgeMs:number):WorkflowFields{
 const r=response as {records?:any[]},record=r?.records?.[0];
 if(!Array.isArray(r?.records)||r.records.length!==1||record?.id!==selection||!['manual','event'].includes(record.trigger?.kind)||!['public','business','restricted'].includes(record.sensitivity))throw Error('The selected trigger contract is unavailable. Reload before designing or previewing.');
 return workflowFieldsFromSchema('trigger',record.trigger.input,{sensitivity:record.sensitivity,maxAgeMs},{omitBoundedCollections:true});
}
export function workflowActionFields(graph:unknown,bindings:WorkflowBindingChoice[],maxAgeMs:number):WorkflowFields{
 const result:Record<string,any>={},nodes=(graph as {nodes?:any[]})?.nodes;if(!Array.isArray(nodes)||nodes.length>32)return result;
 for(const node of nodes){if(!node||!['action','notification'].includes(node.kind))continue;const binding=bindings.find(b=>b.bindingId===node.bindingId&&b.state==='approved'),operation=binding?.operations.find(o=>o.name===node.operation);if(!operation||!['public','business','restricted'].includes(binding!.sensitivity))continue;
  try{Object.assign(result,workflowFieldsFromSchema(node.id,operation.output,{sensitivity:binding!.sensitivity as 'public'|'business'|'restricted',maxAgeMs},{omitBoundedCollections:true}));}catch{/* No guessed scalar fields for an unsupported result contract. */}
 }
 return result;
}
