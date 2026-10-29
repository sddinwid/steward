import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateWorkflowExpression, evaluateWorkflowExpression, workflowFieldsFromSchema, type WorkflowExpression,
  type WorkflowFields, type WorkflowObservation} from '../workflow-rules.js';

const entityId = randomUUID(), now = 100000;
const fields: WorkflowFields = {
  'trigger.quantity': {type:'integer', sensitivity:'business', maxAgeMs:1000},
  'trigger.approved': {type:'boolean', sensitivity:'business', maxAgeMs:1000},
};
const source = {entityId, installationId:randomUUID(), moduleId:'example.inventory',
  moduleInstallationId:randomUUID(), packageDigest:'a'.repeat(64), streamId:'inventory', recordId:randomUUID(), revision:1};
function observation(value: number | boolean, observedAt = now): WorkflowObservation {return {value,observedAt,source};}
const quantity: WorkflowExpression = {field:'trigger.quantity'};
const literal = (n:number): WorkflowExpression => ({literal:n});
const run = (e:WorkflowExpression, values:Record<string,WorkflowObservation> = {'trigger.quantity':observation(7)}) =>
  evaluateWorkflowExpression(e, fields, values, {entityId,now});

test('declared typed rules produce exact deterministic comparisons and calculations', () => {
  assert.equal(run({op:'multiply',args:[quantity,literal(125)]}),875);
  assert.equal(run({op:'gte',args:[quantity,literal(7)]}),true);
  assert.equal(run({op:'divide',args:[literal(875),literal(7)]}),125);
  assert.equal(run({op:'not',args:[{literal:false}]}),true);
  assert.equal(run({op:'eq',args:[{literal:null},{literal:null}]}),true);
});
test('unknown fields and prototype traversal cannot enter rule evaluation', () => {
  for (const field of ['trigger.missing','trigger.__proto__.x','trigger.constructor','trigger.prototype','trigger.quantity.toString']) {
    assert.throws(()=>validateWorkflowExpression({field},fields),/WORKFLOW_FIELD/);
  }
});
test('rules reject executable, ambiguous and unbounded representations', () => {
  for (const expression of [{eval:'process.exit()'},{literal:2,field:'trigger.quantity'},
    {op:'sql',args:[literal(1),literal(2)]},{op:'add',args:[literal(1)]},
    {op:'or',args:Array(9).fill({literal:true})},{literal:{}},{literal:Infinity},{literal:1.1}]) {
    assert.throws(()=>validateWorkflowExpression(expression,fields),/WORKFLOW_/);
  }
  let deep:WorkflowExpression={literal:true};
  for(let n=0;n<14;n++)deep={op:'not',args:[deep]};
  assert.throws(()=>validateWorkflowExpression(deep,fields),/EXPRESSION_LIMIT/);
});
test('missing and stale values do not become false or zero, including short-circuit branches', () => {
  assert.throws(()=>run(quantity,{}),/VALUE_MISSING/);
  assert.throws(()=>run({op:'or',args:[{literal:true},{field:'trigger.approved'}]},{}),/VALUE_MISSING/);
  assert.throws(()=>run(quantity,{'trigger.quantity':observation(7,now-1001)}),/VALUE_STALE/);
  assert.throws(()=>run(quantity,{'trigger.quantity':observation(7,now+1)}),/VALUE_STALE/);
  assert.equal(run(quantity,{'trigger.quantity':observation(7,now-1000)}),7);
});
test('observations require full source provenance and the current legal entity', () => {
  assert.throws(()=>run(quantity,{'trigger.quantity':{...observation(7),source:{...source,entityId:randomUUID()}}}),/ENTITY_SCOPE/);
  for (const patch of [{revision:0},{revision:1.2},{recordId:''},{packageDigest:'untrusted'},{streamId:''},{moduleInstallationId:'missing'}]) {
    assert.throws(()=>run(quantity,{'trigger.quantity':{...observation(7),source:{...source,...patch}}}),/PROVENANCE_INVALID/);
  }
});
test('arithmetic rejects overflow, zero division and silent rounding', () => {
  assert.throws(()=>run({op:'add',args:[literal(Number.MAX_SAFE_INTEGER),literal(1)]}),/OVERFLOW/);
  assert.throws(()=>run({op:'multiply',args:[literal(Number.MAX_SAFE_INTEGER),literal(2)]}),/OVERFLOW/);
  assert.throws(()=>run({op:'divide',args:[literal(1),literal(0)]}),/EXACT_DIVISION/);
  assert.throws(()=>run({op:'divide',args:[literal(7),literal(2)]}),/EXACT_DIVISION/);
});
test('authoritative replication stream names preserve underscore provenance without accepting arbitrary paths', () => {
  for(const streamId of ['sales_demand','inventory_replenishment','mission_aggregates_v1','workflow-triggers']) {
    assert.equal(run(quantity,{'trigger.quantity':{...observation(7),source:{...source,streamId}}}),7);
  }
  for(const streamId of ['sales/demand','sales demand','Sales_demand','sales_demand;DROP','a_'+'b'.repeat(49)]) {
    assert.throws(()=>run(quantity,{'trigger.quantity':{...observation(7),source:{...source,streamId}}}),/PROVENANCE_INVALID/);
  }
});
test('strict types prevent coercion and policy relaxation', () => {
  assert.throws(()=>validateWorkflowExpression({op:'eq',args:[literal(1),{literal:'1'}]},fields),/TYPE_MISMATCH/);
  assert.throws(()=>run(quantity,{'trigger.quantity':observation(true)}),/TYPE_MISMATCH/);
  assert.throws(()=>validateWorkflowExpression(quantity,{'trigger.quantity':{...fields['trigger.quantity']!,maxAgeMs:Infinity}}),/FIELD_POLICY/);
  assert.throws(()=>evaluateWorkflowExpression(quantity,fields,{}, {entityId,now:NaN}),/CLOCK_INVALID/);
});
test('field selection derives only bounded declared scalar schemas',()=>{
  const policy={sensitivity:'business' as const,maxAgeMs:1000};
  const schema={type:'object',additionalProperties:false,properties:{quantity:{type:'integer'},stock:{type:'object',additionalProperties:false,properties:{available:{type:'boolean'}}}}};
  const derived=workflowFieldsFromSchema('trigger',schema,policy);
  assert.deepEqual(Object.keys(derived),['trigger.quantity','trigger.stock.available']);
  assert.equal(validateWorkflowExpression({field:'trigger.quantity'},derived),'integer');
  for(const invalid of [{...schema,additionalProperties:true},{...schema,oneOf:[]},
    {...schema,properties:{items:{type:'array',items:{type:'integer'}}}},
    {...schema,properties:{value:{$ref:'https://example.com/schema'}}}]){
    assert.throws(()=>workflowFieldsFromSchema('trigger',invalid,policy),/WORKFLOW_SCHEMA/);
  }
});


test('field discovery retains primitive constant outputs without inventing types for objects or decimals',()=>{
 const result=workflowFieldsFromSchema('notice',{type:'object',additionalProperties:false,properties:{channel:{const:'internal'},revision:{const:1},private:{const:false},missing:{const:null}},required:['channel','revision','private','missing']},{sensitivity:'business',maxAgeMs:1000});
 assert.equal(result['notice.channel']!.type,'string');assert.equal(result['notice.revision']!.type,'integer');assert.equal(result['notice.private']!.type,'boolean');assert.equal(result['notice.missing']!.type,'null');
 for(const value of [{},[],1.25])assert.throws(()=>workflowFieldsFromSchema('invalid',{type:'object',additionalProperties:false,properties:{value:{const:value}},required:['value']},{sensitivity:'business',maxAgeMs:1000}),/SCHEMA_UNSUPPORTED/);
});


test('explicit bounded-collection omission preserves scalar siblings without exposing collection elements',()=>{
 const policy={sensitivity:'business' as const,maxAgeMs:1000},schema={type:'object',additionalProperties:false,properties:{id:{type:'string'},projection:{type:'object',additionalProperties:false,properties:{status:{type:'string'},lines:{type:'array',maxItems:40,items:{type:'object',additionalProperties:false,properties:{quantity:{type:'integer'}}}}}}}};
 assert.throws(()=>workflowFieldsFromSchema('trigger',schema,policy),/SCHEMA_UNSUPPORTED/);
 const fields=workflowFieldsFromSchema('trigger',schema,policy,{omitBoundedCollections:true});assert.deepEqual(Object.keys(fields),['trigger.id','trigger.projection.status']);
 for(const array of [{type:'array',items:{type:'string'}},{type:'array',maxItems:1001,items:{type:'string'}},{type:'array',maxItems:20,items:{$ref:'https://invalid.example/schema'}},{type:'array',maxItems:20,items:{type:'object',additionalProperties:true,properties:{}}}])assert.throws(()=>workflowFieldsFromSchema('trigger',{type:'object',additionalProperties:false,properties:{items:array}},policy,{omitBoundedCollections:true}),/WORKFLOW_SCHEMA/);
 assert.throws(()=>validateWorkflowExpression({field:'trigger.projection.lines.quantity'},fields),/WORKFLOW_FIELD/);
});


test('bounded dynamic maps remain opaque while unbounded or externally resolved maps reject',()=>{
 const policy={sensitivity:'business' as const,maxAgeMs:1000},root=(map:unknown)=>({type:'object',additionalProperties:false,properties:{status:{type:'string'},received:map}});
 const fields=workflowFieldsFromSchema('trigger',root({type:'object',maxProperties:40,additionalProperties:{type:'integer'}}),policy,{omitBoundedCollections:true});assert.deepEqual(Object.keys(fields),['trigger.status']);
 for(const map of [{type:'object',additionalProperties:{type:'integer'}},{type:'object',maxProperties:40,additionalProperties:true},{type:'object',maxProperties:40,additionalProperties:{$ref:'https://invalid.example'}}])assert.throws(()=>workflowFieldsFromSchema('trigger',root(map),policy,{omitBoundedCollections:true}),/WORKFLOW_SCHEMA/);
});
