import type pg from 'pg';
import {canonical,digest,validateCapabilityValue,type WorkflowObservation} from '@steward/module-sdk';
import {verifyWorkflowPublication,type VerifiedWorkflowPublication} from './workflow-authority.js';
import {verifyEventSubscription,eventExecutionId,type EventDeliveryScope} from './shared-event-delivery.js';

type Call=Parameters<typeof verifyWorkflowPublication>[2];
type Runtime=Parameters<typeof verifyWorkflowPublication>[3];
type Guard=(ids:string[])=>Promise<()=>Promise<void>>;
const requireValue=(value:unknown,code:string):void=>{if(!value)throw Error(code);};
const executionDigest=(s:any,d:any,w:any)=>digest(canonical({protocol:'steward-event-execution-v1',subscriptionId:s.subscription_id,eventId:d.event_id,eventDigest:d.digest,workflowId:w.workflow_id,publicationDigest:w.definition.publication.definitionDigest}));

function receipt(s:any,d:any,p:VerifiedWorkflowPublication,scope:EventDeliveryScope,binding:any){
 const e=d.envelope;
 requireValue(p.trigger.kind==='event'&&p.trigger.capabilityId===binding.capability_id&&p.trigger.eventName===s.event_name
  &&canonical(p.trigger.input)===canonical(s.event_schema),'WORKFLOW_EVENT_CONTRACT_NOT_DECLARED');
 requireValue(d.subscription_id===s.subscription_id&&d.source_module_installation_id===s.source_module_installation_id&&d.source_package_digest===s.source_package_digest
  &&d.digest===digest(canonical(e))&&e.eventId===d.event_id&&e.source?.installationId===scope.installationId&&e.source?.entity?.entityId===scope.entityId
  &&e.moduleId===binding.provider_id&&e.streamId===s.stream_id&&e.recordId===d.record_id&&String(e.recordRevision)===String(d.record_revision),'WORKFLOW_EVENT_RECEIPT_CHANGED');
 validateCapabilityValue(e.payload,p.trigger.input);
}

/** Called only by shared delivery, on its already locked transaction. It queues
 * the existing SSMA coordinator and original provider obligations. No external
 * effect is executed here, and a lost commit cannot create another execution. */
export async function enqueueWorkflowEvent(db:pg.PoolClient,scope:EventDeliveryScope,call:Call,runtime:Runtime,guard:Guard,s:any,d:any):Promise<string>{
 requireValue(typeof guard==='function','WORKFLOW_LIFECYCLE_GUARD_REQUIRED');
 const verified=await verifyEventSubscription(db,scope,s,false),w=verified.workflow;
 const unlock=await guard([w.consumer_id,verified.source.module_id]);
 try{
  requireValue(await runtime(verified.source.module_id,verified.source.configuration),'EVENT_SOURCE_UNAVAILABLE');
  const publication=await verifyWorkflowPublication(db,scope.trust,call,runtime,{pin:w.definition.publication,installationId:scope.installationId,entityId:scope.entityId,actorId:s.actor_id});
  await verifyEventSubscription(db,scope,s,false);receipt(s,d,publication,scope,verified.binding);
  const executionId=eventExecutionId(s.subscription_id,d.event_id),hash=executionDigest(s,d,w);
  const existing=(await db.query('SELECT * FROM smart_executions WHERE execution_id=$1',[executionId])).rows[0];
  if(existing){requireValue(existing.digest===hash&&existing.workflow_id===w.workflow_id&&existing.actor_id===s.actor_id&&existing.event_subscription_id===s.subscription_id&&existing.source_event_id===d.event_id&&canonical(existing.inputs)===canonical(d.envelope.payload),'WORKFLOW_EVENT_EXECUTION_CONFLICT');return executionId;}
  const bindingIds=[s.binding_id,...publication.graph.nodes.filter(n=>['action','notification'].includes(n.kind)).map(n=>n.bindingId!)],bindings:any[]=[],capabilities=new Map<string,string>();
  for(const id of new Set(bindingIds)){
   const binding=(await db.query("SELECT * FROM smart_bindings WHERE binding_id=$1 AND consumer_id=$2 AND entity_id=$3 AND state IN ('approved','retained')",[id,w.consumer_id,scope.entityId])).rows[0];
   requireValue(binding&&!binding.peer_grant_id&&!binding.source_program_id&&!binding.destination_program_id,'WORKFLOW_EVENT_BINDING_UNAVAILABLE');
   requireValue(!capabilities.has(binding.capability_id)||capabilities.get(binding.capability_id)===binding.binding_id,'WORKFLOW_EVENT_BINDING_CONFLICT');capabilities.set(binding.capability_id,binding.binding_id);bindings.push(binding);
  }
  await db.query("INSERT INTO smart_executions(execution_id,workflow_id,actor_id,digest,inputs,state,event_subscription_id,source_event_id) VALUES($1,$2,$3,$4,$5,'pending',$6,$7)",[executionId,w.workflow_id,s.actor_id,hash,d.envelope.payload,s.subscription_id,d.event_id]);
  for(const b of bindings)await db.query('INSERT INTO smart_obligations(consumer_id,aggregate_id,capability_id,binding_id,provider_id,package_digest,workflow_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[w.consumer_id,executionId,b.capability_id,b.binding_id,b.provider_id,b.package_digest,w.workflow_id]);
  await db.query("INSERT INTO smart_history(execution_id,workflow_id,actor_id,event,detail) VALUES($1,$2,$3,'graph_event_queued',$4)",[executionId,w.workflow_id,s.actor_id,{subscriptionId:s.subscription_id,eventId:d.event_id,streamId:s.stream_id,recordId:d.record_id,revision:d.record_revision}]);
  return executionId;
 }finally{await unlock();}
}

/** Every graph step verifies the original delivered receipt and current authority.
 * Provenance remains the source business stream/revision, not a new timestamp or
 * an Automation-owned copy of the business record. */
export async function verifyWorkflowEventExecution(db:pg.PoolClient,scope:EventDeliveryScope,runtime:Runtime,e:any,w:any,p:VerifiedWorkflowPublication):Promise<Pick<WorkflowObservation,'observedAt'|'source'>>{
 requireValue(e.event_subscription_id&&e.source_event_id,'WORKFLOW_EVENT_ADMISSION_REQUIRED');
 const s=(await db.query('SELECT * FROM smart_event_subscriptions WHERE subscription_id=$1',[e.event_subscription_id])).rows[0];
 requireValue(s?.workflow_id===w.workflow_id&&s.actor_id===e.actor_id,'WORKFLOW_EVENT_ADMISSION_REQUIRED');
 const verified=await verifyEventSubscription(db,scope,s,false),d=(await db.query("SELECT * FROM smart_event_deliveries WHERE subscription_id=$1 AND event_id=$2 AND state='delivered' AND execution_id=$3",[s.subscription_id,e.source_event_id,e.execution_id])).rows[0];
 requireValue(d&&e.execution_id===eventExecutionId(s.subscription_id,d.event_id)&&e.digest===executionDigest(s,d,w),'WORKFLOW_EVENT_RECEIPT_CHANGED');
 receipt(s,d,p,scope,verified.binding);requireValue(canonical(e.inputs)===canonical(d.envelope.payload),'WORKFLOW_EVENT_RECEIPT_CHANGED');
 requireValue(await runtime(verified.source.module_id,verified.source.configuration),'EVENT_SOURCE_UNAVAILABLE');
 const observedAt=Date.parse(d.envelope.occurredAt);requireValue(Number.isFinite(observedAt),'WORKFLOW_EVENT_SOURCE_TIME_INVALID');
 return{observedAt,source:{entityId:scope.entityId,installationId:scope.installationId,moduleId:verified.source.module_id,moduleInstallationId:s.source_module_installation_id,packageDigest:s.source_package_digest,streamId:s.stream_id,recordId:d.record_id,revision:Number(d.record_revision)}};
}
