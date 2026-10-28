import type pg from 'pg';
import {evaluateWorkflowExpression,validateCapabilityValue,type WorkflowObservation,type WorkflowNode} from '@steward/module-sdk';
import {planSmartGraph,type SmartGraphProgress} from './smart-graph.js';
import type {VerifiedWorkflowPublication} from './workflow-authority.js';

export interface GraphExecutionState {
  progress:Record<string,SmartGraphProgress>;
  enteredAt:Record<string,number>;
  decisions:Record<string,string>;
  observations:Record<string,WorkflowObservation>;
}
type Execution={execution_id:string;actor_id:string;created_at:Date;inputs:unknown;graph_state:GraphExecutionState|null};
type Context={entityId:string;installationId:string;moduleInstallationId:string;packageDigest:string};
const fail=(code:string):never=>{throw Error(code);};
export async function persistGraphState(db:pg.PoolClient,id:string,state:GraphExecutionState){
  if(Buffer.byteLength(JSON.stringify(state))>262144)fail('WORKFLOW_STATE_SIZE_LIMIT');
  await db.query('UPDATE smart_executions SET graph_state=$1,updated_at=now() WHERE execution_id=$2',[state,id]);
}
/** Control-node extension of the locked SSMA coordinator. No provider call is
 * made here; actions return to its existing authorization and issuance path. */
export async function prepareGraphStep(db:pg.PoolClient,e:Execution,publication:VerifiedWorkflowPublication,scope:Context):Promise<{state:GraphExecutionState;node:WorkflowNode;index:number;now:number}|null>{
  const now=new Date((await db.query('SELECT clock_timestamp() AS now')).rows[0].now).getTime(),started=new Date(e.created_at).getTime();
  if(!Number.isFinite(started)||started>now||now-started>=publication.graph.limits.elapsedMs)fail('WORKFLOW_TIME_BUDGET');
  const state:GraphExecutionState=e.graph_state??{progress:{},enteredAt:{},decisions:{},observations:{}};
  if(!e.graph_state){
    validateCapabilityValue(e.inputs,publication.trigger.input);
    for(const [field,policy] of Object.entries(publication.fields)){
      if(!field.startsWith('trigger.'))continue;
      const value=field.split('.').slice(1).reduce<any>((v,key)=>v?.[key],e.inputs);
      if(value===undefined)continue;
      const observation:WorkflowObservation={value,observedAt:started,source:{entityId:scope.entityId,installationId:scope.installationId,moduleId:publication.consumerId,moduleInstallationId:scope.moduleInstallationId,packageDigest:scope.packageDigest,streamId:'workflow-triggers',recordId:e.execution_id,revision:1}};
      evaluateWorkflowExpression({field},{[field]:policy},{[field]:observation},{entityId:scope.entityId,now});state.observations[field]=observation;
    }
  }
  // A previously accepted approval is not a perpetual permission grant.
  for(const [nodeId,reviewId] of Object.entries(state.decisions)){
    const node=publication.graph.nodes.find(n=>n.id===nodeId);
    if(!node||node.kind!=='approval')fail('WORKFLOW_APPROVAL_STATE_INVALID');
    const current=(await db.query('SELECT * FROM smart_graph_reviews WHERE execution_id=$1 AND node_id=$2 ORDER BY created_at DESC,review_id DESC LIMIT 1',[e.execution_id,nodeId])).rows[0];
    if(!current||current.review_id!==reviewId||current.decision!=='approve')fail('WORKFLOW_STEP_APPROVAL_REVOKED');
    await verifyDecision(db,current,node!,e,publication.consumerId,state.enteredAt[nodeId]!,now);
  }
  const plan=planSmartGraph(publication.graph,state.progress);
  if(plan.suspended)fail('WORKFLOW_NODE_REQUIRES_RECONCILIATION');
  for(const id of plan.skip)state.progress[id]={state:'skipped'};
  if(plan.complete){await db.query("UPDATE smart_executions SET state='completed',error_code=NULL,updated_at=now() WHERE execution_id=$1",[e.execution_id]);return null;}
  const outstanding=publication.graph.nodes.filter(n=>['running','waiting'].includes(state.progress[n.id]?.state??''));
  const node=outstanding.find(n=>n.kind==='action'||n.kind==='notification')??outstanding.find(n=>{
    if(n.kind==='wait')return now>=state.enteredAt[n.id]!+n.waitMs!;
    return false;
  })??publication.graph.nodes.find(n=>plan.ready.includes(n.id))??outstanding.find(n=>n.kind==='approval');
  if(!node){await persistGraphState(db,e.execution_id,state);await db.query("UPDATE smart_executions SET next_attempt_at=now()+interval '1 second' WHERE execution_id=$1",[e.execution_id]);return null;}
  const entered=state.enteredAt[node.id]??now;
  if(!Number.isSafeInteger(entered)||entered<started||entered>now)fail('WORKFLOW_NODE_CLOCK_INVALID');
  state.enteredAt[node.id]=entered;
  let port:'next'|'true'|'false'|'lane'|'approved'|'rejected'|'expired'|undefined;
  switch(node.kind){
    case 'action':case 'notification':
      state.progress[node.id]={state:'running'};
      await persistGraphState(db,e.execution_id,state);
      return{state,node,index:publication.graph.nodes.findIndex(n=>n.id===node.id),now};
    case 'trigger':case 'join':port='next';break;
    case 'branch':port='lane';break;
    case 'condition':port=evaluateWorkflowExpression(node.condition!,publication.fields,state.observations,{entityId:scope.entityId,now})===true?'true':'false';break;
    case 'completion':break;
    case 'wait':
      if(now<entered+node.waitMs!){state.progress[node.id]={state:'waiting'};await persistGraphState(db,e.execution_id,state);await db.query("UPDATE smart_executions SET next_attempt_at=now()+interval '1 second' WHERE execution_id=$1",[e.execution_id]);return null;}
      port='next';break;
    case 'approval':{
      const decision=(await db.query('SELECT * FROM smart_graph_reviews WHERE execution_id=$1 AND node_id=$2 ORDER BY created_at DESC,review_id DESC LIMIT 1',[e.execution_id,node.id])).rows[0];
      if(now>=entered+node.expiresAfterMs!)port='expired';
      else if(decision){
        await verifyDecision(db,decision,node,e,publication.consumerId,entered,now);
        if(decision.decision==='revoke')fail('WORKFLOW_STEP_APPROVAL_REVOKED');
        port=decision.decision==='approve'?'approved':'rejected';
        if(port==='approved')state.decisions[node.id]=decision.review_id;
      }else{state.progress[node.id]={state:'waiting'};await persistGraphState(db,e.execution_id,state);await db.query("UPDATE smart_executions SET next_attempt_at=now()+interval '1 second' WHERE execution_id=$1",[e.execution_id]);return null;}
      break;
    }
  }
  state.progress[node.id]={state:'completed',selectedPorts:port?[port]:[]};
  await persistGraphState(db,e.execution_id,state);
  await db.query("INSERT INTO smart_history(execution_id,workflow_id,actor_id,event,detail) SELECT execution_id,workflow_id,actor_id,'graph_node_completed',$2 FROM smart_executions WHERE execution_id=$1",[e.execution_id,{nodeId:node.id,kind:node.kind,port:port??null}]);
  await db.query("UPDATE smart_executions SET state='pending',next_attempt_at=now(),error_code=NULL WHERE execution_id=$1",[e.execution_id]);
  return null;
}
async function verifyDecision(db:pg.PoolClient,decision:any,node:WorkflowNode,e:Execution,moduleId:string,entered:number,now:number){
  const decided=new Date(decision.created_at).getTime();
  if(!Number.isSafeInteger(entered)||!Number.isFinite(decided)||decided<entered||decided>now||now>=entered+node.expiresAfterMs!
    ||decision.permission!==node.approverPermission||node.separateInitiator&&decision.actor_id===e.actor_id)fail('WORKFLOW_STEP_APPROVAL_INVALID');
  if(!(await db.query("SELECT 1 FROM security_accounts a WHERE a.account_id=$1 AND enabled AND (role='local_admin' OR role='module_user' AND EXISTS(SELECT 1 FROM module_permissions mp WHERE mp.account_id=a.account_id AND mp.module_id=$2 AND mp.permission=$3))",[decision.actor_id,moduleId,node.approverPermission])).rowCount)fail('WORKFLOW_STEP_APPROVER_REVOKED');
}
