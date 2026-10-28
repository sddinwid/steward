import type pg from 'pg';
import {canonical,digest,verifyPackage,resolveCapability,capabilityConfigured,consumerCapabilityConfigured,validateWorkflowInput,validateCapabilityValue,type PublisherTrust,type WorkflowPublicationReference,type WorkflowGraph} from '@steward/module-sdk';
import type {InstallationConfig} from '@steward/contracts';
import type {Authentication,SecureApp} from './security/auth.js';
import {fail} from './security/crypto.js';
import {transaction} from './security/store.js';
import type {createModuleBroker} from './module-broker.js';
type Broker=Awaited<ReturnType<typeof createModuleBroker>>;
const uuid={type:'string',format:'uuid'},hash={type:'string',pattern:'^[a-f0-9]{64}$'},identifier={type:'string',pattern:'^[a-z][a-z0-9.-]{0,79}$'},reason={type:'string',minLength:20,maxLength:2000};
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,required,properties});
const pinSchema=object({moduleId:identifier,moduleInstallationId:uuid,packageDigest:hash,publicationId:uuid,definitionDigest:hash,reviewId:uuid,reviewerId:uuid,reviewExpiresAt:{type:'string',format:'date-time'}});
const params={params:object({id:uuid})};
/** Graph admission extends the same SSMA tables and broker. No separate registry,
 * mutable source definition, permission service or provider transport is added. */
export async function workflowRoutes(app:SecureApp,pool:pg.Pool,auth:Authentication,identity:InstallationConfig,broker:Broker,trust:()=>Promise<PublisherTrust>){
 const admin=async(req:Parameters<Authentication['session']>[0],mutate=false)=>{const a=await auth.session(req,mutate);if(a.role!=='local_admin')fail(403,'Worker-local workflow administrator required');return a;};
 const entity=async()=>((await pool.query("SELECT entity_id FROM local_enrollment WHERE singleton AND state='enrolled'")).rows[0]?.entity_id??identity.entity.entityId);
 const trusted=(descriptor:Parameters<typeof verifyPackage>[0],publishers:PublisherTrust)=>{try{return verifyPackage(descriptor,publishers).manifest;}catch{fail(409,'Module package signature is not trusted');}};
 async function publication(pin:WorkflowPublicationReference,actorId:string){
  const source=(await pool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[pin.moduleId])).rows[0];
  if(!source||source.operation_id!==pin.moduleInstallationId||digest(canonical(source.descriptor))!==pin.packageDigest)fail(409,'Workflow source changed; review its original installation and package');
  const manifest=trusted(source.descriptor,await trust());if(!manifest.workflowServices)fail(409,'Module does not declare a publication service');
  const response=await broker('workflow.verify',source.descriptor,source.configuration,{publication:pin,actorId});
  if(response.status!==200||!response.value?.publication){const code=response.value?.error;fail(409,typeof code==='string'&&/^WORKFLOW_[A-Z_]+$/.test(code)?code:'Workflow publication or current review unavailable');}
  const definition=response.value.publication;
  if(definition.consumerId!==pin.moduleId||digest(canonical(definition))!==pin.definitionDigest)fail(409,'Workflow publication changed');
  return{source,manifest,definition,pin};
 }
 async function bindings(db:pg.PoolClient,verified:Awaited<ReturnType<typeof publication>>){
  const {source,manifest,definition}=verified,graph:WorkflowGraph=definition.graph,rows:any[]=[],byCapability=new Map<string,string>(),checked=new Set<string>();
  const currentTrust=await trust(),entityId=await entity();
  const currentSource=(await db.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[manifest.moduleId])).rows[0];
  if(!currentSource||currentSource.operation_id!==source.operation_id||canonical(currentSource.descriptor)!==canonical(source.descriptor)||canonical(currentSource.configuration)!==canonical(source.configuration))fail(409,'Workflow source changed during admission');
  if(!Object.entries(manifest.smart?.prerequisites.configuration??{}).every(([key,value])=>source.configuration[key]===value))fail(409,'Consumer configuration prerequisite is not satisfied');
  const actionNodes:any[]=graph.nodes.filter(n=>['action','notification'].includes(n.kind));
  if(definition.trigger.kind==='event'){
   const eventBinding=(await db.query("SELECT binding_id FROM smart_bindings WHERE consumer_id=$1 AND capability_id=$2 AND state='approved'",[manifest.moduleId,definition.trigger.capabilityId])).rows;
   if(eventBinding.length!==1)fail(409,'Event trigger requires one explicitly approved source binding');
   actionNodes.push({kind:'event',bindingId:eventBinding[0].binding_id});
  }
  for(const node of actionNodes){
   const binding=(await db.query("SELECT * FROM smart_bindings WHERE binding_id=$1 AND consumer_id=$2 AND state='approved'",[node.bindingId,manifest.moduleId])).rows[0];
   if(!binding||binding.entity_id!==entityId||binding.peer_grant_id||binding.source_program_id||binding.destination_program_id)fail(409,'Graph action requires an approved local entity binding; scoped peer workflows retain their existing governed path');
   if(byCapability.has(binding.capability_id)&&byCapability.get(binding.capability_id)!==binding.binding_id)fail(409,'One capability must retain one provider binding throughout an execution');byCapability.set(binding.capability_id,binding.binding_id);
   const target=(await db.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[binding.provider_id])).rows[0];
   if(!target||target.operation_id!==binding.provider_installation_id||digest(canonical(target.descriptor))!==binding.package_digest)fail(409,'Provider identity changed; review its binding');
   if(!(await db.query("SELECT 1 FROM security_accounts WHERE account_id=$1 AND enabled AND role='local_admin'",[binding.actor_id])).rowCount)fail(403,'Binding approver authority was revoked');
   const provider=trusted(target.descriptor,currentTrust),requirement=manifest.smart?.consumes.find(r=>r.capabilityId===binding.capability_id),capability=provider.smart?.provides.find(p=>p.capabilityId===binding.capability_id);
   if(provider.programServices||provider.economicServices)fail(403,'Scoped service providers require their existing programme governance path');
   if(!requirement||!capability||canonical(requirement)!==canonical(binding.requirement)||!consumerCapabilityConfigured(manifest,source.configuration,requirement))fail(409,'Signed consumer requirement or configuration changed');
   const candidate={moduleId:provider.moduleId,moduleVersion:provider.version,installationId:target.operation_id,entityId,packageDigest:binding.package_digest,state:'active' as const,configured:capabilityConfigured(provider,target.configuration,capability),capability};
   if(!resolveCapability(requirement,[candidate],{entityId,permissions:capability.operations.map(o=>o.permission)}).selected)fail(409,'Provider is not compatible with the signed requirement');
   if(node.kind==='event'){
    const event=capability.events.find(e=>e.name===definition.trigger.eventName);
    if(!event?.streamId||canonical(event.schema)!==canonical(definition.trigger.input))fail(409,'Event source does not declare the exact authorized stream schema');
   }else{
    const operation=capability.operations.find(o=>o.name===node.operation);if(!operation)fail(409,'Operation is not declared by the selected provider');
    try{validateWorkflowInput({object:node.inputs!},operation.input,definition.fields);}catch{fail(422,'Workflow input mapping does not match its bound provider schema');}
   }
   if(!checked.has(target.module_id)){const health=await broker('inspect',target.descriptor,target.configuration);if(health.status!==200)fail(409,'Bound provider is unavailable');checked.add(target.module_id);}
   rows.push(binding);
  }
  const now=new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime();if(Date.parse(verified.pin.reviewExpiresAt)<=now)fail(409,'Workflow publication review expired during admission');
  return rows;
 }
 const history=(db:pg.PoolClient,workflowId:string,actorId:string,event:string,detail:unknown,executionId?:string)=>db.query('INSERT INTO smart_history(workflow_id,actor_id,event,detail,execution_id) VALUES($1,$2,$3,$4,$5)',[workflowId,actorId,event,detail,executionId??null]);
 app.post<{Body:{workflowId:string;subscriptionId:string;reason:string}}>('/api/v16/workflows/event-subscriptions',{schema:{body:object({workflowId:uuid,subscriptionId:uuid,reason})}},async req=>{
  const actor=await admin(req,true),w=(await pool.query("SELECT * FROM smart_workflows WHERE workflow_id=$1 AND state='active' AND accepting_new",[req.body.workflowId])).rows[0];
  if(w?.definition.format!=='module-graph-v1')fail(409,'Active module workflow required');
  const source=(await pool.query("SELECT * FROM module_installations WHERE module_id=$1 AND state='active'",[w.consumer_id])).rows[0];if(!source)fail(409,'Workflow source unavailable');trusted(source.descriptor,await trust());
  const result=await broker('workflow.subscribe',source.descriptor,source.configuration,{...req.body,actorId:actor.account_id});
  if(result.status!==200){const code=result.value?.error;fail(result.status===503?503:409,typeof code==='string'&&/^(EVENT|WORKFLOW)_[A-Z_]+$/.test(code)?code:'Event subscription admission unavailable');}
  return result.value;
 });
 async function recoverEvent(subscriptionId:string,actorId:string,request:Record<string,unknown>){
  const source=(await pool.query('SELECT m.* FROM smart_event_subscriptions s JOIN smart_workflows w USING(workflow_id) JOIN module_installations m ON m.module_id=w.consumer_id WHERE s.subscription_id=$1',[subscriptionId])).rows[0];if(!source)fail(404,'Event subscription not found');trusted(source.descriptor,await trust());
  const result=await broker('workflow.recover',source.descriptor,source.configuration,{...request,subscriptionId,actorId});
  if(result.status!==200){const code=result.value?.error;fail(result.status===503?503:409,typeof code==='string'&&/^(EVENT|WORKFLOW)_[A-Z_]+$/.test(code)?code:'Event subscription recovery unavailable');}
  return result.value;
 }
 app.post<{Params:{id:string};Body:{action:'suspend'|'resume';reason:string}}>('/api/v16/workflows/event-subscriptions/:id/lifecycle',{schema:{...params,body:object({action:{type:'string',enum:['suspend','resume']},reason})}},async req=>{
  const actor=await admin(req,true);if(req.body.action==='resume')return recoverEvent(req.params.id,actor.account_id,req.body);
  return transaction(pool,async db=>{
   const s=(await db.query('SELECT * FROM smart_event_subscriptions WHERE subscription_id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!s)fail(404,'Event subscription not found');if(s.state==='suspended')return{state:'suspended',replayed:true};
   await db.query("UPDATE smart_event_subscriptions SET state='suspended',updated_at=clock_timestamp() WHERE subscription_id=$1",[s.subscription_id]);
   await db.query("INSERT INTO smart_event_history(subscription_id,actor_id,action,detail) VALUES($1,$2,'subscription_suspended',$3)",[s.subscription_id,actor.account_id,{reason:req.body.reason,code:'OPERATOR_SUSPENDED'}]);return{state:'suspended',replayed:false};
  });
 });
 app.post<{Params:{id:string};Body:{eventId:string;requestId:string;reason:string}}>('/api/v16/workflows/event-subscriptions/:id/replay',{schema:{...params,body:object({eventId:uuid,requestId:uuid,reason})}},async req=>{
  const actor=await admin(req,true);return recoverEvent(req.params.id,actor.account_id,{...req.body,action:'replay'});
 });
 app.get('/api/v16/workflows/event-subscriptions',async req=>{
  await admin(req);return{
   subscriptions:(await pool.query('SELECT s.subscription_id,s.workflow_id,s.binding_id,s.binding_revision,s.source_module_installation_id,s.source_package_digest,s.event_name,s.stream_id,s.state,s.capture_error,s.capture_checked_at,s.created_at,b.provider_id,b.capability_id,w.accepting_new FROM smart_event_subscriptions s JOIN smart_bindings b USING(binding_id) JOIN smart_workflows w USING(workflow_id) ORDER BY s.created_at DESC LIMIT 100')).rows,
   deliveries:(await pool.query('SELECT subscription_id,event_id,record_id,record_revision,state,attempts,execution_id,error_code,next_attempt_at,created_at,updated_at FROM smart_event_deliveries ORDER BY created_at DESC LIMIT 100')).rows,
   counts:(await pool.query('SELECT state,count(*)::integer count FROM smart_event_deliveries GROUP BY state ORDER BY state')).rows,history:(await pool.query('SELECT subscription_id,event_id,actor_id,action,detail,created_at FROM smart_event_history ORDER BY id DESC LIMIT 100')).rows};
 });
 app.post<{Body:{publication:WorkflowPublicationReference;reason:string}}>('/api/v16/workflows/import',{schema:{body:object({publication:pinSchema,reason})}},async req=>{
  const actor=await admin(req,true),pin=req.body.publication,verified=await publication(pin,actor.account_id);
  return transaction(pool,async db=>{
   await db.query('SELECT pg_advisory_xact_lock(8080001)');await bindings(db,verified);
   const definition={format:'module-graph-v1',publication:pin,sourceWorkflowId:verified.definition.workflowId,displayName:verified.definition.name,...(verified.definition.trigger.kind==='event'?{triggerKind:'event',eventCapabilityId:verified.definition.trigger.capabilityId,eventName:verified.definition.trigger.eventName}:{})},existing=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1',[pin.publicationId])).rows[0];
   if(existing){if(canonical(existing.definition)!==canonical(definition)||existing.consumer_id!==pin.moduleId)fail(409,'Publication identity already has a different immutable projection');return{workflowId:existing.workflow_id,state:existing.state,replayed:true};}
   await db.query("INSERT INTO smart_workflows(workflow_id,name,version,consumer_id,definition,state,actor_id,reason) VALUES($1,$2,$3,$4,$5,'proposed',$6,$7)",[pin.publicationId,pin.moduleId+':'+verified.definition.workflowId,verified.definition.version,pin.moduleId,definition,actor.account_id,req.body.reason]);
   await history(db,pin.publicationId,actor.account_id,'graph_imported',{definitionDigest:pin.definitionDigest,reviewId:pin.reviewId});return{workflowId:pin.publicationId,state:'proposed',replayed:false};
  });
 });
 app.post<{Params:{id:string};Body:{action:'activate'|'suspend';reason:string}}>('/api/v16/workflows/:id/lifecycle',{schema:{...params,body:object({action:{type:'string',enum:['activate','suspend']},reason})}},async req=>{
  const actor=await admin(req,true),found=(await pool.query('SELECT * FROM smart_workflows WHERE workflow_id=$1',[req.params.id])).rows[0];if(found?.definition.format!=='module-graph-v1')fail(404,'Module graph not found');
  const verified=req.body.action==='activate'?await publication(found.definition.publication,actor.account_id):null;
  return transaction(pool,async db=>{
   await db.query('SELECT pg_advisory_xact_lock(8080001)');const w=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(canonical(w.definition)!==canonical(found.definition))fail(409,'Workflow projection changed');
   if(verified){await bindings(db,verified);await db.query("UPDATE smart_workflows SET accepting_new=false WHERE consumer_id=$1 AND definition->>'sourceWorkflowId'=$2 AND state='active' AND workflow_id<>$3",[w.consumer_id,w.definition.sourceWorkflowId,w.workflow_id]);}
   const state=verified?'active':'suspended';await db.query('UPDATE smart_workflows SET state=$1,accepting_new=$2,reason=$3,updated_at=now() WHERE workflow_id=$4',[state,Boolean(verified),req.body.reason,w.workflow_id]);
   await history(db,w.workflow_id,actor.account_id,'graph_'+state,{reason:req.body.reason});return{state};
  });
 });
 app.post<{Body:{workflowId:string;executionId:string;input:Record<string,unknown>}}>('/api/v16/workflows/execute',{schema:{body:object({workflowId:uuid,executionId:uuid,input:{type:'object',maxProperties:32}})}},async req=>{
  const actor=await admin(req,true),b=req.body,found=(await pool.query('SELECT * FROM smart_workflows WHERE workflow_id=$1',[b.workflowId])).rows[0];if(found?.definition.format!=='module-graph-v1')fail(404,'Module graph not found');
  const verified=await publication(found.definition.publication,actor.account_id);if(verified.definition.trigger.kind!=='manual')fail(409,'Event workflows require governed source delivery, not a manual start');try{validateCapabilityValue(b.input,verified.definition.trigger.input);}catch{fail(422,'Manual trigger input does not match the published schema');}
  return transaction(pool,async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['workflow-execution:'+b.executionId]);
   const w=(await db.query('SELECT * FROM smart_workflows WHERE workflow_id=$1 FOR UPDATE',[b.workflowId])).rows[0];if(w.state!=='active'||!w.accepting_new)fail(409,'Workflow is not accepting new executions');
   const pinned=await bindings(db,verified),hash=digest(canonical(b)),existing=(await db.query('SELECT * FROM smart_executions WHERE execution_id=$1',[b.executionId])).rows[0];
   if(existing){if(existing.digest!==hash||existing.actor_id!==actor.account_id)fail(409,'Execution identity was reused');return{executionId:b.executionId,state:existing.state,replayed:true};}
   await db.query("INSERT INTO smart_executions(execution_id,workflow_id,actor_id,digest,inputs,state) VALUES($1,$2,$3,$4,$5,'pending')",[b.executionId,b.workflowId,actor.account_id,hash,b.input]);
   for(const binding of pinned)await db.query('INSERT INTO smart_obligations(consumer_id,aggregate_id,capability_id,binding_id,provider_id,package_digest) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[w.consumer_id,b.executionId,binding.capability_id,binding.binding_id,binding.provider_id,binding.package_digest]);
   await history(db,w.workflow_id,actor.account_id,'graph_queued',{publicationId:w.definition.publication.publicationId},b.executionId);return{executionId:b.executionId,state:'pending',replayed:false};
  });
 });
 app.post<{Params:{id:string};Body:{reason:string}}>('/api/v16/workflows/executions/:id/cancel',{schema:{...params,body:object({reason})}},async req=>{
  const actor=await admin(req,true);return transaction(pool,async db=>{
   const row=(await db.query("SELECT e.*,w.definition FROM smart_executions e JOIN smart_workflows w USING(workflow_id) WHERE execution_id=$1 FOR UPDATE OF e",[req.params.id])).rows[0];if(row?.definition.format!=='module-graph-v1')fail(404,'Graph execution not found');if(row.state==='completed')fail(409,'Completed effects cannot be cancelled or rolled back');
   await db.query("UPDATE smart_executions SET state='suspended',error_code='WORKFLOW_CANCELLED',updated_at=now() WHERE execution_id=$1",[row.execution_id]);await history(db,row.workflow_id,actor.account_id,'graph_cancelled',{reason:req.body.reason,priorEffectsRetained:true},row.execution_id);return{state:'suspended',errorCode:'WORKFLOW_CANCELLED',priorEffectsRetained:true};
  });
 });
 app.get('/api/v16/workflows',async req=>{
  await admin(req);
  return{workflows:(await pool.query("SELECT workflow_id,name,version,consumer_id,definition,state,accepting_new,created_at,updated_at FROM smart_workflows WHERE definition->>'format'='module-graph-v1' ORDER BY created_at DESC LIMIT 100")).rows,
   executions:(await pool.query("SELECT e.execution_id,e.workflow_id,e.state,e.error_code,e.created_at,e.updated_at,e.graph_state->'progress' progress,e.graph_state->'enteredAt' entered_at FROM smart_executions e JOIN smart_workflows w USING(workflow_id) WHERE w.definition->>'format'='module-graph-v1' ORDER BY e.created_at DESC LIMIT 100")).rows};
 });
 app.post<{Params:{id:string};Body:{reviewId:string;nodeId:string;decision:'approve'|'reject'|'revoke';reason:string}}>('/api/v16/workflows/executions/:id/reviews',{schema:{...params,body:object({reviewId:uuid,nodeId:{type:'string',pattern:'^[a-z][a-z0-9-]{0,47}$'},decision:{type:'string',enum:['approve','reject','revoke']},reason})}},async req=>{
  const actor=await auth.session(req,true),b=req.body,found=(await pool.query('SELECT e.*,w.definition,w.consumer_id FROM smart_executions e JOIN smart_workflows w USING(workflow_id) WHERE execution_id=$1',[req.params.id])).rows[0];
  if(found?.definition.format!=='module-graph-v1')fail(404,'Graph execution not found');
  const verified=await publication(found.definition.publication,actor.account_id),node=(verified.definition.graph as WorkflowGraph).nodes.find(n=>n.id===b.nodeId);
  if(!node||node.kind!=='approval'||node.approverPermission!==verified.manifest.approvalServices?.reviewerPermission)fail(403,'Declared human approval permission required');
  return transaction(pool,async db=>{
   await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['workflow-review:'+b.reviewId]);
   const e=(await db.query('SELECT * FROM smart_executions WHERE execution_id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!(await db.query("SELECT 1 FROM security_accounts a WHERE a.account_id=$1 AND enabled AND (role='local_admin' OR role='module_user' AND EXISTS(SELECT 1 FROM module_permissions mp WHERE mp.account_id=a.account_id AND mp.module_id=$2 AND mp.permission=$3))",[actor.account_id,found.consumer_id,node.approverPermission])).rowCount)fail(403,'Current step-review permission required');
   if(node.separateInitiator&&actor.account_id===e.actor_id)fail(403,'A separate authorized human must review this step');
   const existing=(await db.query('SELECT * FROM smart_graph_reviews WHERE review_id=$1',[b.reviewId])).rows[0];
   if(existing){if(existing.execution_id!==e.execution_id||existing.node_id!==b.nodeId||existing.actor_id!==actor.account_id||existing.decision!==b.decision||existing.reason!==b.reason)fail(409,'Review identity was reused');return{reviewId:b.reviewId,replayed:true};}
   if(!['pending','running'].includes(e.state))fail(409,'Execution is no longer waiting for actionable decisions');
   const progress=e.graph_state?.progress?.[b.nodeId],entered=e.graph_state?.enteredAt?.[b.nodeId],now=new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime();
   if(b.decision==='revoke'){if(progress?.state!=='completed'||!e.graph_state.decisions[b.nodeId])fail(409,'There is no accepted step approval to revoke');}
   else if(progress?.state!=='waiting'||!Number.isSafeInteger(entered)||now<entered||now>=entered+node.expiresAfterMs!)fail(409,'Approval step is not currently waiting or has expired');
   await db.query('INSERT INTO smart_graph_reviews(review_id,execution_id,node_id,actor_id,permission,decision,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[b.reviewId,e.execution_id,b.nodeId,actor.account_id,node.approverPermission,b.decision,b.reason]);
   await db.query('UPDATE smart_executions SET next_attempt_at=now() WHERE execution_id=$1',[e.execution_id]);await history(db,e.workflow_id,actor.account_id,'graph_step_reviewed',{nodeId:b.nodeId,decision:b.decision,reason:b.reason},e.execution_id);return{reviewId:b.reviewId,replayed:false};
  });
 });

}
