import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateWorkflowInput,materializeWorkflowInput,type WorkflowInputValue} from '../workflow-values.js';
import type {WorkflowObservation,WorkflowFields} from '../workflow-rules.js';
const schema={type:'object',additionalProperties:false,required:['orderId','lines'],properties:{orderId:{type:'string',minLength:1,maxLength:36},lines:{type:'array',minItems:1,maxItems:40,items:{type:'object',additionalProperties:false,required:['sku','quantity'],properties:{sku:{type:'string',minLength:1,maxLength:80},quantity:{type:'integer',minimum:1,maximum:1000}}}}}};
const entityId=randomUUID(),orderId=randomUUID(),fields:WorkflowFields={'trigger.quantity':{type:'integer',sensitivity:'business',maxAgeMs:1000}};
const value:WorkflowInputValue={object:{orderId:{literal:orderId},lines:{array:[{object:{sku:{literal:'SYNTHETIC-SKU'},quantity:{field:'trigger.quantity'}}}]}}};
const observation:WorkflowObservation={value:2,observedAt:1000,source:{entityId,installationId:randomUUID(),moduleId:'fixture.inventory',moduleInstallationId:randomUUID(),packageDigest:'a'.repeat(64),streamId:'stock',recordId:randomUUID(),revision:1}};
test('bounded input assembly preserves provider-owned nested schemas and source evidence',()=>{
 validateWorkflowInput(value,schema,fields);
 assert.deepEqual(materializeWorkflowInput(value,schema,fields,{'trigger.quantity':observation},{entityId,now:1000}),{orderId,lines:[{sku:'SYNTHETIC-SKU',quantity:2}]});
 assert.throws(()=>materializeWorkflowInput(value,schema,fields,{'trigger.quantity':observation},{entityId,now:2001}),/STALE/);
});
test('missing, excess, forged and oversized input mappings fail before execution',()=>{
 for(const candidate of [{object:{}},{object:{orderId:{literal:orderId},lines:{array:[]}}},
  {object:{orderId:{literal:orderId},lines:{array:Array(41).fill({object:{sku:{literal:'x'},quantity:{literal:1}}})}}},
  {object:{orderId:{literal:orderId},lines:{array:[{object:{sku:{literal:'x'},quantity:{literal:1},execute:{literal:'code'}}}]}}}])assert.throws(()=>validateWorkflowInput(candidate,schema,fields),/WORKFLOW_INPUT/);
 const malicious=JSON.parse('{"object":{"__proto__":{"literal":1}}}');assert.throws(()=>validateWorkflowInput(malicious,schema,fields),/FIELD_INVALID/);
});
test('input schema type, literal constraints and required fields are enforced without coercion',()=>{
 assert.throws(()=>validateWorkflowInput({literal:'2'},{type:'integer'},fields),/TYPE_MISMATCH/);
 assert.throws(()=>validateWorkflowInput({literal:-1},{type:'integer',minimum:0},fields),/LITERAL_INVALID/);
 assert.throws(()=>validateWorkflowInput({literal:'EUR'},{type:'string',enum:['USD']},fields),/LITERAL_INVALID/);
 assert.throws(()=>validateWorkflowInput(value,{...schema,oneOf:[]},fields),/SCHEMA_UNSUPPORTED/);
});
