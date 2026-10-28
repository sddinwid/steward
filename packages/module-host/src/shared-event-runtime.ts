import type pg from 'pg';
import {captureSharedEvents} from './shared-event-capture.js';
import {persistSharedEventDeliveries,deliverSharedEvent,type EventDeliveryScope} from './shared-event-delivery.js';
import {enqueueWorkflowEvent} from './workflow-event-execution.js';
import {verifyWorkflowPublication} from './workflow-authority.js';

type Call=Parameters<typeof verifyWorkflowPublication>[2];
type Runtime=Parameters<typeof verifyWorkflowPublication>[3];
type Guard=(ids:string[])=>Promise<()=>Promise<void>>;
type Source=(installed:any)=>Promise<{pool:pg.Pool;close:()=>Promise<void>}>;

/** Bounded extension of the existing Worker host loop. It reads the same source
 * outboxes, stores governed subscriber receipts, then queues the same coordinator.
 * There is no Master dependency, new network listener or separate event bus. */
export async function pollSharedEventRuntime(pool:pg.Pool,scope:EventDeliveryScope,call:Call,runtime:Runtime,guard:Guard,source:Source){
 const providers=(await pool.query("SELECT m.*,min(s.created_at) capture_from,array_agg(DISTINCT s.stream_id) stream_ids,array_agg(DISTINCT w.consumer_id) consumers FROM module_installations m JOIN smart_bindings b ON b.provider_id=m.module_id JOIN smart_event_subscriptions s USING(binding_id) JOIN smart_workflows w USING(workflow_id) WHERE s.state='active' AND b.state='approved' AND w.state='active' AND w.accepting_new GROUP BY m.module_id HAVING min(s.capture_next_at)<=now() ORDER BY min(s.capture_next_at),m.module_id LIMIT 3")).rows;
 const result={sources:providers.length,captured:0,deliveryAttempts:0};
 for(const provider of providers){
  let opened:Awaited<ReturnType<Source>>|undefined,unlock:(()=>Promise<void>)|undefined;
  try{
   unlock=await guard([provider.module_id,...provider.consumers]);
   if(provider.state!=='active'||!await runtime(provider.module_id,provider.configuration))throw Error('EVENT_SOURCE_UNAVAILABLE');
   opened=await source(provider);
   result.captured+=await captureSharedEvents(opened.pool,{descriptor:provider.descriptor,trust:scope.trust,installationId:scope.installationId,entityId:scope.entityId,moduleInstallationId:provider.operation_id,streamIds:provider.stream_ids,from:new Date(provider.capture_from)},events=>persistSharedEventDeliveries(pool,scope,events));
   await pool.query("UPDATE smart_event_subscriptions s SET capture_error=NULL,capture_checked_at=clock_timestamp(),capture_next_at=clock_timestamp()+interval '1 second' FROM smart_bindings b WHERE s.binding_id=b.binding_id AND b.provider_id=$1 AND s.state='active'",[provider.module_id]);
  }catch(error){
   const raw=error instanceof Error?error.message:'',code=/^(EVENT|WORKFLOW)_[A-Z_]{1,100}$/.test(raw)?raw:'EVENT_CAPTURE_UNAVAILABLE';
   await pool.query("UPDATE smart_event_subscriptions s SET capture_error=$2,capture_checked_at=clock_timestamp(),capture_next_at=clock_timestamp()+interval '5 seconds' FROM smart_bindings b WHERE s.binding_id=b.binding_id AND b.provider_id=$1 AND s.state='active'",[provider.module_id,code]);
  }finally{try{await opened?.close();}finally{await unlock?.();}}
 }
 for(let i=0;i<3;i++){
  if(!await deliverSharedEvent(pool,scope,(db,s,d)=>enqueueWorkflowEvent(db,scope,call,runtime,guard,s,d)))break;
  result.deliveryAttempts++;
 }
 return result;
}
