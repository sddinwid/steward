import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModuleFormField} from '../packages/ui/dist/module-field.js';
import {applicationApiTarget} from '../packages/ui/dist/api-routing.js';
import {workflowBindingChoices,workflowTriggerFields,workflowActionFields} from '../packages/ui/dist/workflow-discovery.js';
const c={capabilityId:'inventory.stock.reserve',version:'1.0.0',sensitivity:'business',operations:[{name:'reserve',permission:'provider.write',input:{type:'object'},output:{type:'object'}}]};
const b={binding_id:'binding',consumer_id:'example.automation',provider_id:'example.inventory',provider_installation_id:'installation',package_digest:'digest',capability_id:c.capabilityId,state:'approved',capability:c};
const p={moduleId:b.provider_id,installationId:b.provider_installation_id,packageDigest:b.package_digest,entityId:'entity',state:'active',configured:true,capability:c};

test('application routing sends installed workflow operations to v16 rather than nesting them under authentication v2',()=>{
 for(const route of ['/v16/workflows','/v16/workflows/import','/v16/workflows/execute','/v16/workflows/event-subscriptions','/v16/workflows/executions/example/reviews'])assert.deepEqual(applicationApiTarget(route),{url:'/api'+route,timeoutMs:90000});
 for(const version of [3,4,5,8,13,14,15])assert.deepEqual(applicationApiTarget('/v'+version+'/records?q=exact%20value'),{url:'/api/v'+version+'/records?q=exact%20value',timeoutMs:90000});
 for(const route of ['/auth/login','/auth/session','/worker/status','/v160/workflows'])assert.deepEqual(applicationApiTarget(route),{url:'/api/v2'+route,timeoutMs:15000});
});
test('workflow discovery presents only this consumer and current original provider identity',()=>{
 const registry={entityId:'entity',providers:[p],bindings:[b,{...b,consumer_id:'another.consumer'}]};
 assert.equal(workflowBindingChoices(registry,b.consumer_id).length,1);
 assert.equal(workflowBindingChoices(registry,b.consumer_id)[0].state,'approved');
 for(const patch of [{installationId:'replacement'},{packageDigest:'changed'},{entityId:'other'}])assert.equal(workflowBindingChoices({...registry,providers:[{...p,...patch}]},b.consumer_id)[0].state,'provider changed');
 assert.equal(workflowBindingChoices({...registry,providers:[{...p,configured:false}]},b.consumer_id)[0].state,'configuration required');
 assert.equal(workflowBindingChoices({...registry,bindings:[{...b,state:'disabled'}]},b.consumer_id)[0].state,'disabled');
 assert.throws(()=>workflowBindingChoices({},b.consumer_id),/incomplete/);
});
test('generic module field renders workflow metadata without loading domain-specific screens',()=>{
 const markup=renderToStaticMarkup(createElement(ModuleFormField,{field:{name:'graph',label:'Graph',type:'json',format:'workflow',required:true},value:undefined,currency:'USD',onChange:()=>{}}));
 assert.match(markup,/Workflow designer/);assert.match(markup,/Use starter workflow/);assert.doesNotMatch(markup,/<script/);
});

test('trigger field discovery rejects missing, ambiguous and unsupported contracts',()=>{
 const record={id:'declared',sensitivity:'business',trigger:{kind:'event',input:{type:'object',additionalProperties:false,properties:{count:{type:'integer'}},required:['count']}}};
 assert.equal(workflowTriggerFields({records:[record]},'declared',60000)['trigger.count'].type,'integer');
 for(const response of [{},{records:[]},{records:[record,record]},{records:[{...record,id:'other'}]},{records:[{...record,sensitivity:'private'}]},{records:[{...record,trigger:{...record.trigger,input:{type:'object'}}}]}])assert.throws(()=>workflowTriggerFields(response,'declared',60000));
});
test('action output choices require current approved bindings and supported declared output schemas',()=>{
 const capability={...c,operations:[{...c.operations[0],output:{type:'object',additionalProperties:false,properties:{count:{type:'integer'}},required:['count']}}]},registry={entityId:'entity',providers:[{...p,capability}],bindings:[{...b,capability}]},graph={nodes:[{id:'first',kind:'action',bindingId:b.binding_id,operation:'reserve'}]};
 assert.equal(workflowActionFields(graph,workflowBindingChoices(registry,b.consumer_id),60000)['first.count'].type,'integer');
 for(const altered of [{...registry,bindings:[{...b,state:'revoked',capability}]},{...registry,providers:[{...p,capability,installationId:'replaced'}]}])assert.deepEqual(workflowActionFields(graph,workflowBindingChoices(altered,b.consumer_id),60000),{});
 assert.deepEqual(workflowActionFields({nodes:[{...graph.nodes[0],operation:'undeclared'}]},workflowBindingChoices(registry,b.consumer_id),60000),{});
});

import {WorkflowDesigner} from '../packages/ui/dist/workflow-designer.js';
test('capability loading is announced as progress, while actual discovery failures remain alerts',()=>{
 const props={value:{graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Start'},{id:'complete',kind:'completion',label:'Complete'}],edges:[{from:'start',to:'complete',port:'next'}],limits:{elapsedMs:600000,maxParallel:1,maxActions:16}},onChange:()=>{},bindings:[],fields:{}};
 const loading=renderToStaticMarkup(createElement(WorkflowDesigner,{...props,discoveryLoading:true}));
 assert.match(loading,/role="status"/);assert.doesNotMatch(loading,/role="alert"/);
 assert.match(loading,/<button[^>]*disabled=""[^>]*>Run synthetic dry-run/);
 const failure=renderToStaticMarkup(createElement(WorkflowDesigner,{...props,discoveryError:'Discovery unavailable'}));
 assert.match(failure,/role="alert"/);assert.match(failure,/Discovery unavailable/);
});
