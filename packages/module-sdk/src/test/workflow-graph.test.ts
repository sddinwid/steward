import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {inspectWorkflowGraph,validateWorkflowGraph,type WorkflowGraph} from '../workflow-graph.js';

function base():WorkflowGraph{return{graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Manual start'},
  {id:'reserve',kind:'action',label:'Reserve through approved Inventory',bindingId:randomUUID(),operation:'reserve',inputs:{quantity:{literal:2}}},
  {id:'done',kind:'completion',label:'Complete'}],edges:[{from:'start',to:'reserve',port:'next'},{from:'reserve',to:'done',port:'next'}],
  limits:{elapsedMs:60000,maxParallel:2,maxActions:10}};}
test('a bounded graph retains binding references without granting authority',()=>{
  const graph=base();assert.deepEqual(inspectWorkflowGraph(graph,{}),[]);validateWorkflowGraph(graph,{});
  assert.ok(graph.nodes[1]!.bindingId); // Existence/authority are not claimed by structural validation.
});
test('conditional branches require both outcomes and declared Boolean evidence',()=>{
  const graph=base();graph.nodes[1]={id:'reserve',kind:'condition',label:'Available?',condition:{field:'trigger.available'}};
  graph.nodes.push({id:'exception',kind:'completion',label:'Unavailable'});
  graph.edges[1]={from:'reserve',to:'done',port:'true'};graph.edges.push({from:'reserve',to:'exception',port:'false'});
  const fields={'trigger.available':{type:'boolean' as const,sensitivity:'business' as const,maxAgeMs:1000}};
  assert.deepEqual(inspectWorkflowGraph(graph,fields),[]);
  assert.ok(inspectWorkflowGraph(graph,{}).some(i=>i.code==='WORKFLOW_CONDITION_INVALID'));
  graph.edges.pop();assert.ok(inspectWorkflowGraph(graph,fields).some(i=>i.code==='WORKFLOW_OUTBOUND_INVALID'));
});
test('approvals require explicit rejection and expiry paths and bounded policy',()=>{
  const graph=base();graph.nodes[1]={id:'reserve',kind:'approval',label:'Human review',approverPermission:'steward.automation.approve',separateInitiator:true,expiresAfterMs:30000};
  graph.nodes.push({id:'rejected',kind:'completion',label:'Rejected'},{id:'expired',kind:'completion',label:'Expired'});
  graph.edges[1]={from:'reserve',to:'done',port:'approved'};
  graph.edges.push({from:'reserve',to:'rejected',port:'rejected'},{from:'reserve',to:'expired',port:'expired'});
  assert.deepEqual(inspectWorkflowGraph(graph,{}),[]);
  graph.nodes[1]!.approverPermission='example.independent-module.review';assert.deepEqual(inspectWorkflowGraph(graph,{}),[]);
  graph.nodes[1]!.expiresAfterMs=60001;assert.ok(inspectWorkflowGraph(graph,{}).some(i=>i.code==='WORKFLOW_APPROVAL_INVALID'));
});
test('bounded parallel branch and explicit join validate without implicit provider selection',()=>{
  const graph=base();graph.nodes=[{id:'start',kind:'trigger',label:'Start'},{id:'fork',kind:'branch',label:'Parallel'},
    {id:'left',kind:'wait',label:'Wait',waitMs:10},{id:'right',kind:'wait',label:'Wait',waitMs:20},
    {id:'join',kind:'join',label:'Join'},{id:'done',kind:'completion',label:'Done'}];
  graph.edges=[{from:'start',to:'fork',port:'next'},{from:'fork',to:'left',port:'lane'},{from:'fork',to:'right',port:'lane'},
    {from:'left',to:'join',port:'next'},{from:'right',to:'join',port:'next'},{from:'join',to:'done',port:'next'}];
  assert.deepEqual(inspectWorkflowGraph(graph,{}),[]);
  graph.limits.maxParallel=1;assert.ok(inspectWorkflowGraph(graph,{}).some(i=>i.code==='WORKFLOW_PARALLEL_LIMIT'));
});
test('cycles, disconnected nodes and duplicate identities are rejected',()=>{
  const cycle=base();cycle.edges[1]={from:'reserve',to:'start',port:'next'};
  assert.ok(inspectWorkflowGraph(cycle,{}).some(i=>i.code==='WORKFLOW_CYCLE'));
  const disconnected=base();disconnected.nodes.push({id:'orphan',kind:'completion',label:'Orphan'});
  assert.ok(inspectWorkflowGraph(disconnected,{}).some(i=>i.code==='WORKFLOW_UNREACHABLE_NODE'));
  const duplicate=base();duplicate.nodes.push({...duplicate.nodes[1]!});
  assert.ok(inspectWorkflowGraph(duplicate,{}).some(i=>i.code==='WORKFLOW_NODE_DUPLICATE'));
});
test('executable extra fields and irrelevant node configuration cannot be hidden',()=>{
  const graph=base();(graph.nodes[1] as unknown as Record<string,unknown>).script='fetch("https://example.com")';
  assert.ok(inspectWorkflowGraph(graph,{}).some(i=>i.code==='WORKFLOW_NODE_INVALID'));
  const extra=base();extra.nodes[0]!.bindingId=randomUUID();
  assert.ok(inspectWorkflowGraph(extra,{}).some(i=>i.code==='WORKFLOW_NODE_FIELDS_INVALID'));
});
test('notification effects require an explicit approved-provider binding reference',()=>{
  const graph=base();graph.nodes[1]!.kind='notification';delete graph.nodes[1]!.bindingId;
  assert.ok(inspectWorkflowGraph(graph,{}).some(i=>i.code==='WORKFLOW_ACTION_INVALID'));
});
test('budget, malformed input, missing completion and action limits fail closed',()=>{
  for(const value of [null,[],{}, {...base(),graphVersion:2},{...base(),nodes:Array(33).fill(base().nodes[0])}])assert.throws(()=>validateWorkflowGraph(value,{}));
  const graph=base();graph.limits.elapsedMs=Infinity;assert.ok(inspectWorkflowGraph(graph,{}).some(i=>i.code==='WORKFLOW_LIMITS_INVALID'));
  const input=base();input.nodes[1]!.inputs={quantity:{field:'private.case'}};
  assert.ok(inspectWorkflowGraph(input,{}).some(i=>i.code==='WORKFLOW_INPUT_EXPRESSION_INVALID'));
});
test('structured action mappings remain data-only and the entire graph has a byte budget',()=>{
 const graph=base();graph.nodes[1]!.inputs={lines:{array:[{object:{sku:{literal:'SYNTHETIC-SKU'},quantity:{literal:2}}}]}};
 assert.deepEqual(inspectWorkflowGraph(graph,{}),[]);
 const oversized=base();oversized.nodes[1]!.label='x'.repeat(70000);
 assert.deepEqual(inspectWorkflowGraph(oversized,{}),[{code:'WORKFLOW_GRAPH_SIZE_LIMIT'}]);
});
