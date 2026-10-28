import {validateWorkflowGraph,type WorkflowGraph,type WorkflowEdge} from './workflow-graph.js';
import {planSmartGraph,type SmartGraphProgress} from './workflow-plan.js';
import {evaluateWorkflowExpression,type WorkflowFields,type WorkflowObservation,type WorkflowScalar} from './workflow-rules.js';
import {materializeWorkflowInput} from './workflow-values.js';

export interface WorkflowPreviewScenario {
 values:Record<string,WorkflowScalar>;
 outcomes:Record<string,'succeeded'|'failed'|'timeout'>;
 approvals:Record<string,'approved'|'rejected'|'expired'>;
}
export interface WorkflowPreviewBinding {
 bindingId:string;state:string;operations:{name:string;input:unknown}[];
}
export interface WorkflowPreviewResult {
 mode:'synthetic';status:'preview-completed'|'blocked'|'failed';elapsedMs:number;
 steps:{nodeId:string;outcome:string;detail:string}[];
}
/** A pure preview, never a source of execution authority. It uses the same DAG
 * planner and expressions as the coordinator. All provider outcomes and human
 * decisions must be explicitly supplied synthetic assumptions; no I/O is accepted. */
export function previewWorkflow(graph:WorkflowGraph,fields:WorkflowFields,bindings:WorkflowPreviewBinding[],scenario:WorkflowPreviewScenario):WorkflowPreviewResult{
 validateWorkflowGraph(graph,fields);
 if(!scenario||typeof scenario!=='object'||!scenario.values||!scenario.outcomes||!scenario.approvals
   ||Object.keys(scenario).some(k=>!['values','outcomes','approvals'].includes(k))
   ||[scenario.values,scenario.outcomes,scenario.approvals].some(v=>typeof v!=='object'||Array.isArray(v))
   ||Object.keys(scenario.values).some(k=>!Object.hasOwn(fields,k))
   ||Object.keys(scenario.outcomes).some(k=>!graph.nodes.some(n=>n.id===k&&['action','notification'].includes(n.kind)))
   ||Object.keys(scenario.approvals).some(k=>!graph.nodes.some(n=>n.id===k&&n.kind==='approval'))
   ||JSON.stringify(scenario).length>65536)throw Error('WORKFLOW_PREVIEW_SCENARIO_INVALID');
 const result:WorkflowPreviewResult={mode:'synthetic',status:'blocked',elapsedMs:0,steps:[]};
 const progress:Record<string,SmartGraphProgress>={},observations:Record<string,WorkflowObservation>={};
 const identity='00000000-0000-4000-8000-000000000001';
 const capture=(prefix:string)=>{for(const [field,value]of Object.entries(scenario.values))if(field.startsWith(prefix+'.')){
   observations[field]={value,observedAt:result.elapsedMs,source:{entityId:identity,installationId:identity,moduleId:'example.workflow-preview',moduleInstallationId:identity,packageDigest:'0'.repeat(64),streamId:'synthetic-preview',recordId:identity,revision:1}};
   evaluateWorkflowExpression({field},fields,observations,{entityId:identity,now:result.elapsedMs});
 }};
 capture('trigger');
 for(let iteration=0;iteration<128;iteration++){
  if(result.elapsedMs>=graph.limits.elapsedMs){result.steps.push({nodeId:'',outcome:'blocked',detail:'Synthetic elapsed-time budget exhausted'});return result;}
  const plan=planSmartGraph(graph,progress);
  for(const id of plan.skip){progress[id]={state:'skipped'};result.steps.push({nodeId:id,outcome:'skipped',detail:'Unselected synthetic path'});}
  if(plan.complete){result.status='preview-completed';return result;}
  if(!plan.ready.length&&!plan.skip.length)return result;
  let elapsed=0;
  for(const id of plan.ready){
   const node=graph.nodes.find(n=>n.id===id)!;let port:WorkflowEdge['port']|undefined,detail='Synthetic control transition';
   try{
    switch(node.kind){
     case 'trigger':case 'join':port='next';break;
     case 'branch':port='lane';break;
     case 'completion':break;
     case 'condition':port=evaluateWorkflowExpression(node.condition!,fields,observations,{entityId:identity,now:result.elapsedMs})===true?'true':'false';detail='Rule evaluated using synthetic values';break;
     case 'wait':elapsed=Math.max(elapsed,node.waitMs!);port='next';detail='Virtual delay; no real timer scheduled';break;
     case 'approval':{
      const decision=scenario.approvals[id];if(decision!=='approved'&&decision!=='rejected'&&decision!=='expired')throw Error('Choose an explicit synthetic approval outcome');
      port=decision;detail='Assumed '+decision+'; no human authorization recorded';if(decision==='expired')elapsed=Math.max(elapsed,node.expiresAfterMs!);break;
     }
     case 'action':case 'notification':{
      const binding=bindings.find(b=>b.bindingId===node.bindingId&&b.state==='approved'),operation=binding?.operations.find(o=>o.name===node.operation);
      if(!operation)throw Error('A current reviewed binding and operation are required for this preview');
      materializeWorkflowInput({object:node.inputs!},operation.input as Record<string,unknown>,fields,observations,{entityId:identity,now:result.elapsedMs});
      const outcome=scenario.outcomes[id];if(outcome!=='succeeded'&&outcome!=='failed'&&outcome!=='timeout')throw Error('Choose an explicit synthetic provider outcome');
      if(outcome!=='succeeded'){result.status='failed';result.steps.push({nodeId:id,outcome,detail:'Assumed provider '+outcome+'; no provider was called or retried'});return result;}
      capture(id);port='next';detail='Assumed success; provider output and side effects were not verified';break;
     }
    }
    progress[id]={state:'completed',selectedPorts:port?[port]:[]};result.steps.push({nodeId:id,outcome:port??'completion',detail});
   }catch(error){result.steps.push({nodeId:id,outcome:'blocked',detail:(error as Error).message});return result;}
  }
  result.elapsedMs+=elapsed;
 }
 return result;
}
