import test from 'node:test';
import assert from 'node:assert/strict';
import {previewWorkflow,type WorkflowPreviewScenario} from '../workflow-preview.js';
import type {WorkflowGraph} from '../workflow-graph.js';
const bindingId='00000000-0000-4000-8000-000000000001';
const binding={bindingId,state:'approved',operations:[{name:'reserve',input:{type:'object',additionalProperties:false,properties:{quantity:{type:'integer',minimum:1}},required:['quantity']}}]};
const action={id:'act',kind:'action' as const,label:'Synthetic action',bindingId,operation:'reserve',inputs:{quantity:{literal:2}}};
const graph=():WorkflowGraph=>({graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Start'},action,{id:'done',kind:'completion',label:'Done'}],edges:[{from:'start',to:'act',port:'next'},{from:'act',to:'done',port:'next'}],limits:{elapsedMs:10000,maxParallel:1,maxActions:4}});
const scenario=():WorkflowPreviewScenario=>({values:{},outcomes:{act:'succeeded'},approvals:{}});
test('preview requires explicit provider assumptions and never mutates the graph or scenario',()=>{
 const g=graph(),s=scenario(),before=JSON.stringify({g,s});assert.equal(previewWorkflow(g,{},[binding],s).status,'preview-completed');assert.equal(JSON.stringify({g,s}),before);
 const missing=previewWorkflow(g,{},[binding],{...s,outcomes:{}});assert.equal(missing.status,'blocked');assert.match(missing.steps.at(-1)!.detail,/explicit synthetic/);
 for(const outcome of ['failed','timeout'] as const)assert.equal(previewWorkflow(g,{},[binding],{...s,outcomes:{act:outcome}}).status,'failed');
});
test('preview rejects missing or unreviewed bindings and invalid input mapping contracts',()=>{
 assert.equal(previewWorkflow(graph(),{},[],scenario()).status,'blocked');
 assert.equal(previewWorkflow(graph(),{},[{...binding,state:'disabled'}],scenario()).status,'blocked');
 const g=graph();g.nodes[1]={...action,inputs:{quantity:{literal:-1}}};assert.match(previewWorkflow(g,{},[binding],scenario()).steps.at(-1)!.detail,/LITERAL_INVALID/);
});
test('preview evaluates typed synthetic conditions and skips unselected provider actions',()=>{
 const g=graph();g.nodes.splice(1,0,{id:'choose',kind:'condition',label:'Choose',condition:{op:'gt',args:[{field:'trigger.quantity'},{literal:3}]}});g.nodes.push({id:'join',kind:'join',label:'Join'});g.edges=[{from:'start',to:'choose',port:'next'},{from:'choose',to:'act',port:'true'},{from:'choose',to:'join',port:'false'},{from:'act',to:'join',port:'next'},{from:'join',to:'done',port:'next'}];
 const fields={'trigger.quantity':{type:'integer' as const,sensitivity:'business' as const,maxAgeMs:5000}};
 const result=previewWorkflow(g,fields,[binding],{values:{'trigger.quantity':2},outcomes:{},approvals:{}});assert.equal(result.status,'preview-completed');assert(result.steps.some(s=>s.nodeId==='act'&&s.outcome==='skipped'));
 assert.equal(previewWorkflow(g,fields,[binding],{values:{},outcomes:{},approvals:{}}).status,'blocked');
 assert.throws(()=>previewWorkflow(g,fields,[binding],{values:{'trigger.quantity':'2'},outcomes:{},approvals:{}}),/TYPE_MISMATCH/);
});
test('preview approval requires an explicit assumption and virtual expiry is not authorization',()=>{
 const g=graph();g.nodes.splice(1,0,{id:'review',kind:'approval',label:'Review',approverPermission:'example.approve',separateInitiator:true,expiresAfterMs:1000});g.nodes.push({id:'declined',kind:'completion',label:'Declined'},{id:'expired',kind:'completion',label:'Expired'});g.edges=[{from:'start',to:'review',port:'next'},{from:'review',to:'act',port:'approved'},{from:'review',to:'declined',port:'rejected'},{from:'review',to:'expired',port:'expired'},{from:'act',to:'done',port:'next'}];
 assert.equal(previewWorkflow(g,{},[binding],scenario()).status,'blocked');
 const result=previewWorkflow(g,{},[binding],{...scenario(),approvals:{review:'expired'}});assert.equal(result.status,'preview-completed');assert.equal(result.elapsedMs,1000);assert(result.steps.some(s=>s.nodeId==='act'&&s.outcome==='skipped'));
});
test('preview uses bounded parallel planning and waits for both synthetic branches before a join',()=>{
 const g=graph();g.limits.maxParallel=2;g.nodes=[g.nodes[0]!,{id:'fork',kind:'branch',label:'Fork'},action,{...action,id:'other'},{id:'join',kind:'join',label:'Join'},g.nodes[2]!];g.edges=[{from:'start',to:'fork',port:'next'},{from:'fork',to:'act',port:'lane'},{from:'fork',to:'other',port:'lane'},{from:'act',to:'join',port:'next'},{from:'other',to:'join',port:'next'},{from:'join',to:'done',port:'next'}];
 const result=previewWorkflow(g,{},[binding],{...scenario(),outcomes:{act:'succeeded',other:'succeeded'}});assert.equal(result.status,'preview-completed');assert(result.steps.findIndex(s=>s.nodeId==='join')>result.steps.findIndex(s=>s.nodeId==='other'));
 const partial=previewWorkflow(g,{},[binding],scenario());assert.equal(partial.status,'blocked');assert(!partial.steps.some(s=>s.nodeId==='join'));
});
test('preview refuses unrecognized fields and stops at its virtual elapsed-time budget',()=>{
 assert.throws(()=>previewWorkflow(graph(),{},[binding],{...scenario(),values:{'other.private':'secret'}}),/SCENARIO_INVALID/);
 const g=graph();g.nodes[1]={id:'wait',kind:'wait',label:'Wait',waitMs:10000};g.edges=[{from:'start',to:'wait',port:'next'},{from:'wait',to:'done',port:'next'}];const result=previewWorkflow(g,{},[],{values:{},outcomes:{},approvals:{}});assert.equal(result.status,'blocked');assert.match(result.steps.at(-1)!.detail,/budget/);
});
