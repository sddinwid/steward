import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {type WorkflowGraph} from '@steward/module-sdk';
import {planSmartGraph,graphCommandId,type SmartGraphProgress} from './smart-graph.js';
const graph:WorkflowGraph={graphVersion:1,limits:{elapsedMs:60000,maxParallel:2,maxActions:4},nodes:[
  {id:'start',kind:'trigger',label:'Start'}, {id:'condition',kind:'condition',label:'Choose',condition:{literal:true}},
  {id:'yes',kind:'wait',label:'Yes',waitMs:10},{id:'no',kind:'wait',label:'No',waitMs:10},
  {id:'join',kind:'join',label:'Join'},{id:'done',kind:'completion',label:'Done'}],edges:[
  {from:'start',to:'condition',port:'next'},{from:'condition',to:'yes',port:'true'},{from:'condition',to:'no',port:'false'},
  {from:'yes',to:'join',port:'next'},{from:'no',to:'join',port:'next'},{from:'join',to:'done',port:'next'}]};
const completed=(...ports:NonNullable<SmartGraphProgress['selectedPorts']>):SmartGraphProgress=>({state:'completed',selectedPorts:ports});
test('graph scheduling follows selected conditions and joins settle skipped paths',()=>{
  assert.deepEqual(planSmartGraph(graph,{}).ready,['start']);
  const state:Record<string,SmartGraphProgress>={start:completed('next'),condition:completed('true')};
  assert.deepEqual(planSmartGraph(graph,state),{ready:['yes'],skip:['no'],complete:false,suspended:false});
  state.yes=completed('next');assert.deepEqual(planSmartGraph(graph,state).ready,[]);
  state.no={state:'skipped'};assert.deepEqual(planSmartGraph(graph,state).ready,['join']);
  state.join=completed('next');assert.deepEqual(planSmartGraph(graph,state).ready,['done']);
  state.done=completed();assert.equal(planSmartGraph(graph,state).complete,true);
});
test('waiting and suspended nodes cannot be blindly retried by graph scheduling',()=>{
  const state={start:completed('next'),condition:completed('true'),yes:{state:'waiting' as const},no:{state:'skipped' as const}};
  assert.deepEqual(planSmartGraph(graph,state).ready,[]);
  assert.deepEqual(planSmartGraph(graph,{...state,yes:{state:'suspended'}}),{ready:[],skip:[],complete:false,suspended:true});
});
test('graph command identity is stable across restarts, reordering and case; different nodes never reuse it',()=>{
  const execution=randomUUID(),first=graphCommandId(execution,'yes');
  assert.equal(first,graphCommandId(execution.toUpperCase(),'yes'));
  assert.notEqual(first,graphCommandId(execution,'no'));
  assert.notEqual(first,graphCommandId(randomUUID(),'yes'));
  assert.throws(()=>graphCommandId('not-an-id','yes'));
});
test('corrupt or foreign progress fails closed before scheduling effects',()=>{
  for(const state of [{foreign:completed()}, {start:completed('true')}, {start:completed('next','next')},
    {start:{state:'running',selectedPorts:['next']}}, {start:{state:'completed'}}]){
    assert.throws(()=>planSmartGraph(graph,state as Record<string,SmartGraphProgress>),/WORKFLOW_PROGRESS/);
  }
});
test('bounded parallel lanes consume available slots and preserve deterministic ordering',()=>{
  const fork:WorkflowGraph={...graph,nodes:graph.nodes.map(n=>n.id==='condition'?{id:n.id,kind:'branch',label:'Fork'}:n),
    edges:graph.edges.map(e=>e.from==='condition'?{...e,port:'lane'}:e)};
  const state={start:completed('next'),condition:completed('lane')};
  assert.deepEqual(planSmartGraph(fork,state).ready,['no','yes']);
  assert.deepEqual(planSmartGraph({...fork,limits:{...fork.limits,maxParallel:1}},state).ready,['no']);
  assert.deepEqual(planSmartGraph({...fork,limits:{...fork.limits,maxParallel:1}},{...state,no:{state:'running'}}).ready,[]);
});
