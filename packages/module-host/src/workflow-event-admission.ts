import type pg from 'pg';
import {canonical,verifyPackage} from '@steward/module-sdk';
import {verifyWorkflowPublication} from './workflow-authority.js';
import {verifyEventSubscription,replaySharedEventOnClient,type EventDeliveryScope} from './shared-event-delivery.js';

type Call=Parameters<typeof verifyWorkflowPublication>[2];
type Runtime=Parameters<typeof verifyWorkflowPublication>[3];
type Guard=(ids:string[])=>Promise<()=>Promise<void>>;
const requireValue=(value:unknown,code:string):void=>{if(!value)throw Error(code);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Subscriber admission is a Worker governance decision over the same signed
 * publication and approved SSMA binding. Neither the source event nor a module
 * can invent a subscription, reviewer, schema, provider or execution authority. */
export async function registerWorkflowSubscription(pool:pg.Pool,scope:EventDeliveryScope,call:Call,runtimeMatches:Runtime,guard:Guard,
 request:{workflowId:string;subscriptionId:string;actorId:string;consumerId:string;reason:string}){
 requireValue([request.workflowId,request.subscriptionId,request.actorId].every(v=>uuid.test(v))&&typeof request.reason==='string'&&request.reason.trim().length>=20&&request.reason.length<=2000,'EVENT_SUBSCRIPTION_REQUEST_INVALID');
 requireValue(typeof guard==='function','WORKFLOW_LIFECYCLE_GUARD_REQUIRED');
 const db=await pool.connect();let unlock:(()=>Promise<void>)|undefined;
 try{
  await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(8080002)');
  const w=(await db.query("SELECT * FROM smart_workflows WHERE workflow_id=$1 AND state='active' AND accepting_new FOR UPDATE",[request.workflowId])).rows[0];
  requireValue(w?.consumer_id===request.consumerId&&w.definition?.format==='module-graph-v1','EVENT_WORKFLOW_UNAVAILABLE');
  const publication=await verifyWorkflowPublication(db,scope.trust,call,runtimeMatches,{pin:w.definition.publication,actorId:request.actorId,installationId:scope.installationId,entityId:scope.entityId});
  requireValue(publication.trigger.kind==='event','WORKFLOW_EVENT_TRIGGER_REQUIRED');
  if(publication.trigger.kind!=='event')throw Error('WORKFLOW_EVENT_TRIGGER_REQUIRED');
  const trigger=publication.trigger;
  const bindings=(await db.query("SELECT * FROM smart_bindings WHERE consumer_id=$1 AND capability_id=$2 AND state='approved' AND entity_id=$3 FOR SHARE",[w.consumer_id,trigger.capabilityId,scope.entityId])).rows;
  requireValue(bindings.length===1,'EVENT_SOURCE_BINDING_REQUIRED');const binding=bindings[0];
  unlock=await guard([w.consumer_id,binding.provider_id]);
  await verifyWorkflowPublication(db,scope.trust,call,runtimeMatches,{pin:w.definition.publication,actorId:request.actorId,installationId:scope.installationId,entityId:scope.entityId});
  const provider=(await db.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[binding.provider_id])).rows[0];
  requireValue(provider&&await runtimeMatches(provider.module_id,provider.configuration),'EVENT_SOURCE_UNAVAILABLE');
  const manifest=verifyPackage(provider.descriptor,scope.trust).manifest,event=manifest.smart?.provides.find(c=>c.capabilityId===trigger.capabilityId)?.events.find(e=>e.name===trigger.eventName);
  requireValue(event?.streamId&&canonical(event.schema)===canonical(trigger.input),'EVENT_SCHEMA_NOT_AUTHORIZED');
  const s={subscription_id:request.subscriptionId,workflow_id:w.workflow_id,binding_id:binding.binding_id,binding_revision:binding.revision,
   source_module_installation_id:binding.provider_installation_id,source_package_digest:binding.package_digest,
   consumer_installation_id:w.definition.publication.moduleInstallationId,consumer_package_digest:w.definition.publication.packageDigest,
   event_name:trigger.eventName,stream_id:event!.streamId,event_schema:trigger.input,actor_id:request.actorId,state:'active',reason:request.reason};
  await verifyEventSubscription(db,scope,s);
  const previous=(await db.query('SELECT * FROM smart_event_subscriptions WHERE subscription_id=$1 OR (workflow_id=$2 AND binding_id=$3 AND event_name=$4)',[s.subscription_id,s.workflow_id,s.binding_id,s.event_name])).rows;
  if(previous.length){requireValue(previous.length===1&&Object.entries(s).every(([k,v])=>canonical(previous[0][k])===canonical(v)),'EVENT_SUBSCRIPTION_IDENTITY_CONFLICT');await db.query('COMMIT');return{subscriptionId:s.subscription_id,replayed:true};}
  requireValue(Number((await db.query("SELECT count(*) n FROM smart_event_subscriptions s JOIN smart_workflows w USING(workflow_id) WHERE s.state='active' AND w.state='active' AND w.accepting_new")).rows[0].n)<100,'EVENT_SUBSCRIPTION_LIMIT');
  await db.query('INSERT INTO smart_event_subscriptions(subscription_id,workflow_id,binding_id,binding_revision,source_module_installation_id,source_package_digest,consumer_installation_id,consumer_package_digest,event_name,stream_id,event_schema,actor_id,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[s.subscription_id,s.workflow_id,s.binding_id,s.binding_revision,s.source_module_installation_id,s.source_package_digest,s.consumer_installation_id,s.consumer_package_digest,s.event_name,s.stream_id,s.event_schema,s.actor_id,s.state,s.reason]);
  await db.query("INSERT INTO smart_event_history(subscription_id,actor_id,action,detail) VALUES($1,$2,'subscription_approved',$3)",[s.subscription_id,s.actor_id,{publicationId:w.definition.publication.publicationId,bindingId:s.binding_id,bindingRevision:s.binding_revision,sourcePackageDigest:s.source_package_digest,reason:s.reason}]);
  await db.query('COMMIT');return{subscriptionId:s.subscription_id,replayed:false};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{try{if(unlock)await unlock();}finally{db.release();}}
}

/** Recovery never changes a subscription's actor, binding, package, publication
 * or retained payload. New authority requires a new separately admitted intent. */
export async function recoverWorkflowSubscription(pool:pg.Pool,scope:EventDeliveryScope,call:Call,runtime:Runtime,guard:Guard,
 request:{subscriptionId:string;consumerId:string;actorId:string;reason:string;action:'resume'|'replay';eventId?:string;requestId?:string}){
 requireValue(uuid.test(request.subscriptionId)&&uuid.test(request.actorId)&&typeof request.reason==='string'&&request.reason.trim().length>=20&&request.reason.length<=2000
  &&['resume','replay'].includes(request.action)&&(request.action!=='replay'||typeof request.eventId==='string'&&uuid.test(request.eventId)&&typeof request.requestId==='string'&&uuid.test(request.requestId)),'EVENT_RECOVERY_REQUEST_INVALID');
 requireValue(typeof guard==='function','WORKFLOW_LIFECYCLE_GUARD_REQUIRED');
 const db=await pool.connect();let unlock:(()=>Promise<void>)|undefined;
 try{
  await db.query('BEGIN');
  requireValue((await db.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[request.actorId])).rowCount,'EVENT_RECOVERY_AUTHORITY_REQUIRED');
  const s=(await db.query('SELECT * FROM smart_event_subscriptions WHERE subscription_id=$1 FOR UPDATE',[request.subscriptionId])).rows[0];requireValue(s,'EVENT_SUBSCRIPTION_UNAVAILABLE');
  const w=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1',[s.workflow_id])).rows[0],binding=(await db.query('SELECT * FROM smart_bindings WHERE binding_id=$1',[s.binding_id])).rows[0];
  requireValue(w?.consumer_id===request.consumerId&&binding,'EVENT_WORKFLOW_UNAVAILABLE');
  unlock=await guard([w.consumer_id,binding.provider_id]);
  const publication=await verifyWorkflowPublication(db,scope.trust,call,runtime,{pin:w.definition.publication,actorId:s.actor_id,installationId:scope.installationId,entityId:scope.entityId});
  requireValue(publication.trigger.kind==='event'&&publication.trigger.capabilityId===binding.capability_id&&publication.trigger.eventName===s.event_name&&canonical(publication.trigger.input)===canonical(s.event_schema),'WORKFLOW_EVENT_CONTRACT_NOT_DECLARED');
  const verified=await verifyEventSubscription(db,scope,{...s,state:'active'},false);
  requireValue(await runtime(verified.source.module_id,verified.source.configuration),'EVENT_SOURCE_UNAVAILABLE');
  await verifyWorkflowPublication(db,scope.trust,call,runtime,{pin:w.definition.publication,actorId:s.actor_id,installationId:scope.installationId,entityId:scope.entityId});
  await verifyEventSubscription(db,scope,{...s,state:'active'},false);
  requireValue((await db.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[request.actorId])).rowCount,'EVENT_RECOVERY_AUTHORITY_REQUIRED');
  let result;
  if(request.action==='resume'){
   result={state:'active',replayed:s.state==='active'};
   if(s.state!=='active'){
    await db.query("UPDATE smart_event_subscriptions SET state='active',capture_next_at=clock_timestamp(),updated_at=clock_timestamp() WHERE subscription_id=$1",[s.subscription_id]);
    await db.query("INSERT INTO smart_event_history(subscription_id,actor_id,action,detail) VALUES($1,$2,'subscription_resumed',$3)",[s.subscription_id,request.actorId,{reason:request.reason,originalActorId:s.actor_id}]);
   }
  }else result=await replaySharedEventOnClient(db,scope,{subscriptionId:s.subscription_id,eventId:request.eventId!,actorId:request.actorId,reason:request.reason,requestId:request.requestId!});
  await db.query('COMMIT');return result;
 }catch(error){await db.query('ROLLBACK');throw error;}finally{try{await unlock?.();}finally{db.release();}}
}
