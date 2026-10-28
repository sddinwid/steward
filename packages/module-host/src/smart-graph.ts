import {digest, type WorkflowGraph, type WorkflowEdge} from '@steward/module-sdk';

/** Pure scheduling support for the existing SSMA coordinator. It performs no
 * I/O, grants no authority, and cannot issue an operation. Persisted transitions
 * and provider effects belong to the existing locked coordinator transaction. */
export {planSmartGraph,type SmartGraphProgress,type SmartGraphPlan} from '@steward/module-sdk';
/** Leave no operation a longer transport deadline than the remaining graph
 * budget. An uncertain timed-out effect still uses the issuance journal. */
export function graphCallTimeout(startedAt:number,elapsedMs:number,now=Date.now()):number{
  if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(now)||!Number.isSafeInteger(elapsedMs)
    ||startedAt<0||now<startedAt||elapsedMs<1||elapsedMs>31*86400000||now-startedAt>=elapsedMs)throw Error('WORKFLOW_TIME_BUDGET');
  return Math.min(4000,elapsedMs-(now-startedAt));
}
export function graphCommandId(executionId:string,nodeId:string):string {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(executionId)
    || !/^[a-z][a-z0-9-]{0,47}$/.test(nodeId))throw Error('WORKFLOW_COMMAND_IDENTITY_INVALID');
  const h=digest('steward-smart-graph-node-v1:'+executionId.toLowerCase()+':'+nodeId);
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
