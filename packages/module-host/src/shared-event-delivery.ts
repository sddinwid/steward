import type pg from 'pg';
import {canonical,digest,verifyPackage,resolveCapability,capabilityConfigured,consumerCapabilityConfigured,validateCapabilityValue,type PublisherTrust} from '@steward/module-sdk';
import type {SharedEventCapture} from './shared-event-capture.js';

const requireValue=(value:unknown,code:string):void=>{if(!value)throw Error(code);};
type Db=Pick<pg.PoolClient,'query'>;
export interface EventDeliveryScope {installationId:string;entityId:string;trust:PublisherTrust}

/** Reuses approved SSMA bindings, signed consumer event requirements and current
 * accounts. A discovered event, or a receipt, does not grant execution authority. */
export async function verifyEventSubscription(db:Db,scope:EventDeliveryScope,subscription:any){
 const s=subscription;
 const binding=(await db.query("SELECT * FROM smart_bindings WHERE binding_id=$1 AND state='approved'",[s.binding_id])).rows[0];
 requireValue(binding&&binding.entity_id===scope.entityId&&!binding.peer_grant_id&&!binding.source_program_id&&!binding.destination_program_id,'EVENT_BINDING_UNAVAILABLE');
 requireValue(binding.revision===s.binding_revision&&binding.provider_installation_id===s.source_module_installation_id&&binding.package_digest===s.source_package_digest,'EVENT_BINDING_CHANGED');
 for(const actor of [s.actor_id,binding.actor_id])requireValue((await db.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[actor])).rowCount,'EVENT_APPROVER_REVOKED');
 const rows=(await db.query('SELECT * FROM module_installations WHERE module_id=ANY($1::text[])',[ [binding.consumer_id,binding.provider_id] ])).rows;
 const source=rows.find(r=>r.module_id===binding.provider_id),consumer=rows.find(r=>r.module_id===binding.consumer_id);
 requireValue(source?.state==='active'&&consumer?.state==='active','EVENT_MODULE_UNAVAILABLE');
 requireValue(source.operation_id===binding.provider_installation_id&&digest(canonical(source.descriptor))===binding.package_digest
  &&consumer.operation_id===s.consumer_installation_id&&digest(canonical(consumer.descriptor))===s.consumer_package_digest,'EVENT_PACKAGE_CHANGED');
 const provider=verifyPackage(source.descriptor,scope.trust).manifest,receiver=verifyPackage(consumer.descriptor,scope.trust).manifest;
 requireValue(!provider.programServices&&!provider.economicServices&&!receiver.programServices&&!receiver.economicServices,'EVENT_SCOPED_DISCLOSURE_REQUIRED');
 const requirement=receiver.smart?.consumes.find(r=>r.capabilityId===binding.capability_id),capability=provider.smart?.provides.find(c=>c.capabilityId===binding.capability_id);
 requireValue(requirement&&capability&&canonical(requirement)===canonical(binding.requirement),'EVENT_REQUIREMENT_CHANGED');
 requireValue(consumerCapabilityConfigured(receiver,consumer.configuration,requirement!),'EVENT_CONSUMER_CONFIGURATION_REQUIRED');
 const event=capability!.events.find(e=>e.name===s.event_name);
 requireValue(event?.streamId===s.stream_id&&canonical(event?.schema)===canonical(s.event_schema)
  &&requirement!.events.some(e=>e.name===s.event_name&&canonical(e.schema)===canonical(s.event_schema)),'EVENT_SCHEMA_NOT_AUTHORIZED');
 requireValue(resolveCapability(requirement!,[{moduleId:provider.moduleId,moduleVersion:provider.version,installationId:source.operation_id,entityId:scope.entityId,packageDigest:binding.package_digest,state:'active',configured:capabilityConfigured(provider,source.configuration,capability!),capability:capability!}],{entityId:scope.entityId,permissions:capability!.operations.map(o=>o.permission)}).selected,'EVENT_PROVIDER_INCOMPATIBLE');
 const workflow=(await db.query("SELECT * FROM smart_workflows WHERE workflow_id=$1 AND state='active' AND accepting_new",[s.workflow_id])).rows[0];
 requireValue(workflow?.consumer_id===consumer.module_id&&workflow.definition?.format==='module-graph-v1','EVENT_WORKFLOW_UNAVAILABLE');
 requireValue(workflow.definition.publication.moduleInstallationId===s.consumer_installation_id&&workflow.definition.publication.packageDigest===s.consumer_package_digest,'EVENT_WORKFLOW_SOURCE_CHANGED');
 return{binding,source,consumer,workflow};
}

/** Fan-out commits before the source-outbox local ACK. Replayed capture is a
 * digest-checked no-op; source event identity/revision conflicts never overwrite. */
export async function persistSharedEventDeliveries(pool:pg.Pool,scope:EventDeliveryScope,events:SharedEventCapture[]){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  for(const event of events){
   const e=event.envelope;
   requireValue(e.source?.installationId===scope.installationId&&e.source?.entity?.entityId===scope.entityId
    &&event.digest===digest(canonical(e)),'EVENT_SCOPE_INVALID');
   const subscriptions=(await db.query("SELECT s.* FROM smart_event_subscriptions s JOIN smart_bindings b USING(binding_id) WHERE s.state='active' AND b.provider_id=$1 AND s.stream_id=$2 AND s.created_at<=$3 ORDER BY s.subscription_id FOR UPDATE OF s",[e.moduleId,e.streamId,event.sourceCreatedAt])).rows;
   for(const s of subscriptions){
    const {source,binding}=await verifyEventSubscription(db,scope,s);
    requireValue(source.operation_id===event.sourceModuleInstallationId&&binding.package_digest===event.sourcePackageDigest,'EVENT_SOURCE_CHANGED');
    validateCapabilityValue(e.payload,s.event_schema);
    const previous=(await db.query('SELECT * FROM smart_event_deliveries WHERE subscription_id=$1 AND (event_id=$2 OR (record_id=$3 AND record_revision=$4))',[s.subscription_id,e.eventId,e.recordId,e.recordRevision])).rows[0];
    if(previous){requireValue(previous.event_id===e.eventId&&previous.digest===event.digest,'EVENT_IDENTITY_CONFLICT');continue;}
    await db.query("INSERT INTO smart_event_deliveries(subscription_id,event_id,digest,source_module_installation_id,source_package_digest,record_id,record_revision,envelope,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending')",[s.subscription_id,e.eventId,event.digest,event.sourceModuleInstallationId,event.sourcePackageDigest,e.recordId,e.recordRevision,e]);
    await db.query("INSERT INTO smart_event_history(subscription_id,event_id,action,detail) VALUES($1,$2,'captured',$3)",[s.subscription_id,e.eventId,{sourceModuleInstallationId:event.sourceModuleInstallationId,streamId:e.streamId,recordId:e.recordId,revision:e.recordRevision}]);
   }
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

/** Delivery callback must enqueue the existing SSMA execution and obligations on
 * THIS transaction, revalidating the exact publication before returning. It must
 * not execute external effects. No successful receipt is replayed as new work. */
export async function deliverSharedEvent(pool:pg.Pool,scope:EventDeliveryScope,
 enqueue:(db:pg.PoolClient,subscription:any,event:any)=>Promise<string>):Promise<boolean>{
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  // Lock subscription first to serialize causal order for every record in it.
  const s=(await db.query("SELECT s.* FROM smart_event_subscriptions s WHERE s.state='active' AND EXISTS(SELECT 1 FROM smart_event_deliveries d WHERE d.subscription_id=s.subscription_id AND d.state='pending' AND d.next_attempt_at<=now() AND NOT EXISTS(SELECT 1 FROM smart_event_deliveries earlier WHERE earlier.subscription_id=d.subscription_id AND earlier.record_id=d.record_id AND earlier.record_revision<d.record_revision AND earlier.state IN ('pending','dead_letter'))) ORDER BY s.created_at,s.subscription_id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
  if(!s){await db.query('COMMIT');return false;}
  const d=(await db.query("SELECT * FROM smart_event_deliveries d WHERE subscription_id=$1 AND state='pending' AND next_attempt_at<=now() AND NOT EXISTS(SELECT 1 FROM smart_event_deliveries earlier WHERE earlier.subscription_id=d.subscription_id AND earlier.record_id=d.record_id AND earlier.record_revision<d.record_revision AND earlier.state IN ('pending','dead_letter')) ORDER BY created_at,record_revision,event_id FOR UPDATE LIMIT 1",[s.subscription_id])).rows[0];
  if(!d){await db.query('COMMIT');return false;}
  await db.query('SAVEPOINT event_attempt');
  try{
   await verifyEventSubscription(db,scope,s);
   requireValue(d.source_module_installation_id===s.source_module_installation_id&&d.source_package_digest===s.source_package_digest&&d.digest===digest(canonical(d.envelope)),'EVENT_RECEIPT_CHANGED');
   const cursor=(await db.query('SELECT revision FROM smart_event_cursors WHERE subscription_id=$1 AND record_id=$2',[s.subscription_id,d.record_id])).rows[0];
   if(cursor&&BigInt(cursor.revision)>=BigInt(d.record_revision)){
    await db.query("UPDATE smart_event_deliveries SET state='superseded',error_code='EVENT_REVISION_SUPERSEDED',updated_at=clock_timestamp() WHERE subscription_id=$1 AND event_id=$2",[s.subscription_id,d.event_id]);
    await db.query("INSERT INTO smart_event_history(subscription_id,event_id,action,detail) VALUES($1,$2,'superseded','{}')",[s.subscription_id,d.event_id]);
   }else{
    validateCapabilityValue(d.envelope.payload,s.event_schema);
    const execution=await enqueue(db,s,d);
    requireValue((await db.query('SELECT 1 FROM smart_executions WHERE execution_id=$1 AND workflow_id=$2',[execution,s.workflow_id])).rowCount,'EVENT_EXECUTION_MISSING');
    await db.query("UPDATE smart_event_deliveries SET state='delivered',execution_id=$3,attempts=attempts+1,error_code=NULL,updated_at=clock_timestamp() WHERE subscription_id=$1 AND event_id=$2",[s.subscription_id,d.event_id,execution]);
    await db.query('INSERT INTO smart_event_cursors(subscription_id,record_id,revision) VALUES($1,$2,$3) ON CONFLICT(subscription_id,record_id) DO UPDATE SET revision=excluded.revision',[s.subscription_id,d.record_id,d.record_revision]);
    await db.query("INSERT INTO smart_event_history(subscription_id,event_id,action,detail) VALUES($1,$2,'delivered',$3)",[s.subscription_id,d.event_id,{executionId:execution}]);
   }
  }catch(error){
   await db.query('ROLLBACK TO SAVEPOINT event_attempt');
   const raw=error instanceof Error?error.message:'',code=/^(EVENT|WORKFLOW)_[A-Z_]{1,100}$/.test(raw)?raw:'EVENT_DELIVERY_UNAVAILABLE';
   const state=Number(d.attempts)+1>=5?'dead_letter':'pending';
   await db.query("UPDATE smart_event_deliveries SET state=$3,attempts=attempts+1,error_code=$4,next_attempt_at=clock_timestamp()+least(30,power(2,attempts))*interval '1 second',updated_at=clock_timestamp() WHERE subscription_id=$1 AND event_id=$2",[s.subscription_id,d.event_id,state,code]);
   await db.query("INSERT INTO smart_event_history(subscription_id,event_id,action,detail) VALUES($1,$2,$3,$4)",[s.subscription_id,d.event_id,state==='dead_letter'?'dead_letter':'retry',{code}]);
  }
  await db.query('COMMIT');return true;
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

/** Explicit retry of a failed receipt, not reinvention of its event or execution.
 * Current authority is mandatory and the original payload/identity is retained. */
export async function replaySharedEvent(pool:pg.Pool,scope:EventDeliveryScope,request:{subscriptionId:string;eventId:string;actorId:string;reason:string}){
 requireValue(typeof request.reason==='string'&&request.reason.trim().length>=20&&request.reason.length<=2000,'EVENT_REPLAY_REASON_REQUIRED');
 const db=await pool.connect();try{
  await db.query('BEGIN');
  requireValue((await db.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[request.actorId])).rowCount,'EVENT_REPLAY_AUTHORITY_REQUIRED');
  const s=(await db.query("SELECT * FROM smart_event_subscriptions WHERE subscription_id=$1 AND state='active' FOR UPDATE",[request.subscriptionId])).rows[0];requireValue(s,'EVENT_SUBSCRIPTION_UNAVAILABLE');
  await verifyEventSubscription(db,scope,s);
  const result=await db.query("UPDATE smart_event_deliveries SET state='pending',attempts=0,next_attempt_at=clock_timestamp(),error_code=NULL,updated_at=clock_timestamp() WHERE subscription_id=$1 AND event_id=$2 AND state='dead_letter' RETURNING event_id",[request.subscriptionId,request.eventId]);
  requireValue(result.rowCount===1,'EVENT_REPLAY_REQUIRES_DEAD_LETTER');
  await db.query("INSERT INTO smart_event_history(subscription_id,event_id,actor_id,action,detail) VALUES($1,$2,$3,'replay_requested',$4)",[request.subscriptionId,request.eventId,request.actorId,{reason:request.reason}]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
