import {evaluateWorkflowExpression,validateWorkflowExpression,type WorkflowExpression,type WorkflowFields,type WorkflowObservation} from './workflow-rules.js';

/** Bounded assembly of provider inputs. Collection sizes are explicit; this does
 * not add loops, scripts, unrestricted record copying or a workflow data store. */
export type WorkflowInputValue = WorkflowExpression | {object:Record<string,WorkflowInputValue>} | {array:WorkflowInputValue[]};
export type WorkflowJsonValue = string|number|boolean|null|WorkflowJsonValue[]|{[key:string]:WorkflowJsonValue};
const ownObject=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const field=/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const safeKey=(key:string)=>field.test(key)&&!['__proto__','constructor','prototype'].includes(key);
function requireInput(condition:unknown,code:string):asserts condition{if(!condition)throw Error(code);}

export function validateWorkflowValueShape(value:unknown,fields:WorkflowFields):asserts value is WorkflowInputValue{
 let count=0;
 function visit(v:unknown,depth:number):void{
  requireInput(++count<=256&&depth<=8,'WORKFLOW_INPUT_LIMIT');requireInput(ownObject(v),'WORKFLOW_INPUT_INVALID');
  if(Object.hasOwn(v,'object')){requireInput(Object.keys(v).length===1&&ownObject(v.object),'WORKFLOW_INPUT_OBJECT_REQUIRED');requireInput(Object.keys(v.object).length<=32&&Object.keys(v.object).every(safeKey),'WORKFLOW_INPUT_FIELD_INVALID');for(const child of Object.values(v.object))visit(child,depth+1);}
  else if(Object.hasOwn(v,'array')){requireInput(Object.keys(v).length===1&&Array.isArray(v.array)&&v.array.length<=40,'WORKFLOW_INPUT_ARRAY_LIMIT');for(const child of v.array)visit(child,depth+1);}
  else validateWorkflowExpression(v,fields);
 }
 visit(value,0);
}

/** Verify each mapping against the chosen signed operation schema. Runtime
 * values still pass the provider's complete schema after materialization. */
export function validateWorkflowInput(value:unknown,schema:Record<string,any>,fields:WorkflowFields):asserts value is WorkflowInputValue{
  validateWorkflowValueShape(value,fields);
  let count=0;
  function visit(v:unknown,s:Record<string,any>,depth:number):void{
    requireInput(++count<=256&&depth<=8,'WORKFLOW_INPUT_LIMIT');
    requireInput(ownObject(v)&&!!s&&typeof s==='object'&&!Array.isArray(s),'WORKFLOW_INPUT_INVALID');
    requireInput(!Object.keys(s).some(k=>['$ref','$async','oneOf','anyOf','allOf','if','then','else'].includes(k)),'WORKFLOW_INPUT_SCHEMA_UNSUPPORTED');
    if(Object.hasOwn(v,'object')){
      requireInput(Object.keys(v).length===1&&ownObject(v.object)&&s.type==='object'&&s.additionalProperties===false&&ownObject(s.properties),'WORKFLOW_INPUT_OBJECT_REQUIRED');
      const keys=Object.keys(v.object);requireInput(keys.length<=32&&keys.every(safeKey),'WORKFLOW_INPUT_FIELD_INVALID');
      requireInput(Array.isArray(s.required??[])&&(s.required??[]).every((key:unknown)=>typeof key==='string'&&Object.hasOwn(v.object as object,key)),'WORKFLOW_INPUT_REQUIRED_FIELD');
      for(const [key,child]of Object.entries(v.object)){
        requireInput(Object.hasOwn(s.properties,key),'WORKFLOW_INPUT_FIELD_NOT_DECLARED');
        const childSchema=s.properties[key];requireInput(ownObject(childSchema),'WORKFLOW_INPUT_SCHEMA_INVALID');
        visit(child,childSchema,depth+1);
      }
      return;
    }
    if(Object.hasOwn(v,'array')){
      requireInput(Object.keys(v).length===1&&Array.isArray(v.array)&&s.type==='array'&&ownObject(s.items),'WORKFLOW_INPUT_ARRAY_REQUIRED');
      requireInput(v.array.length<=40&&v.array.length>=(s.minItems??0)&&v.array.length<=(s.maxItems??40),'WORKFLOW_INPUT_ARRAY_LIMIT');
      for(const child of v.array)visit(child,s.items,depth+1);return;
    }
    const type=validateWorkflowExpression(v,fields);requireInput(type===s.type,'WORKFLOW_INPUT_TYPE_MISMATCH');
    if(Object.hasOwn(v,'literal')){
      const literal=v.literal;
      requireInput(!Object.hasOwn(s,'const')||literal===s.const,'WORKFLOW_INPUT_LITERAL_INVALID');
      requireInput(!s.enum||Array.isArray(s.enum)&&s.enum.includes(literal),'WORKFLOW_INPUT_LITERAL_INVALID');
      if(typeof literal==='number')requireInput(literal>=(s.minimum??Number.MIN_SAFE_INTEGER)&&literal<=(s.maximum??Number.MAX_SAFE_INTEGER),'WORKFLOW_INPUT_LITERAL_INVALID');
      if(typeof literal==='string')requireInput(literal.length>=(s.minLength??0)&&literal.length<=(s.maxLength??1024),'WORKFLOW_INPUT_LITERAL_INVALID');
    }
  }
  visit(value,schema,0);
}

export function materializeWorkflowInput(value:WorkflowInputValue,schema:Record<string,any>,fields:WorkflowFields,
  observations:Readonly<Record<string,WorkflowObservation>>,scope:{entityId:string;now:number}):WorkflowJsonValue{
  validateWorkflowInput(value,schema,fields);
  function materialize(v:WorkflowInputValue):WorkflowJsonValue{
    if('object'in v)return Object.fromEntries(Object.entries(v.object).map(([key,child])=>[key,materialize(child)]));
    if('array'in v)return v.array.map(materialize);
    return evaluateWorkflowExpression(v,fields,observations,scope);
  }
  return materialize(value);
}
