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
