import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ModuleFormField} from '../packages/ui/dist/module-field.js';
import {workflowBindingChoices} from '../packages/ui/dist/workflow-discovery.js';
const c={capabilityId:'inventory.stock.reserve',version:'1.0.0',sensitivity:'business',operations:[{name:'reserve',permission:'provider.write',input:{type:'object'},output:{type:'object'}}]};
const b={binding_id:'binding',consumer_id:'example.automation',provider_id:'example.inventory',provider_installation_id:'installation',package_digest:'digest',capability_id:c.capabilityId,state:'approved',capability:c};
const p={moduleId:b.provider_id,installationId:b.provider_installation_id,packageDigest:b.package_digest,entityId:'entity',state:'active',configured:true,capability:c};
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
