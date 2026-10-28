import {useState} from 'react';
import type {WorkflowExpression,WorkflowFields} from '@steward/module-sdk/workflow';

export function WorkflowConditionBuilder({fields,onChange,disabled}:{fields:WorkflowFields;onChange:(condition:WorkflowExpression)=>void;disabled:boolean}){
 const [field,setField]=useState(''),[operator,setOperator]=useState('eq'),[value,setValue]=useState(''),[error,setError]=useState('');
 const type=fields[field]?.type,operators=type==='integer'?['eq','ne','lt','lte','gt','gte']:['eq','ne'];
 const labels:Record<string,string>={eq:'equals',ne:'does not equal',lt:'is less than',lte:'is at most',gt:'is greater than',gte:'is at least'};
 function apply(){try{if(!fields[field]||!operators.includes(operator))throw Error('Select an authorized field and comparison.');let literal:string|number|boolean|null=value;
  if(type==='integer'){if(!/^-?\d+$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('Enter a safe whole number.');literal=Number(value);}
  if(type==='boolean'){if(!['true','false'].includes(value))throw Error('Choose true or false.');literal=value==='true';}
  if(type==='null')literal=null;
  onChange({op:operator as 'eq',args:[{field},{literal}]});setError('');
 }catch(e){setError((e as Error).message);}}
 return <fieldset disabled={disabled}><legend>Build a field comparison</legend><div className="form-grid">
  <label>Condition field<select aria-label="Condition field" value={field} onChange={e=>{setField(e.target.value);setOperator('eq');setValue('');}}><option value="">Select an authorized field</option>{Object.entries(fields).map(([name,policy])=><option key={name} value={name}>{name} · {policy.type}</option>)}</select></label>
  <label>Comparison<select aria-label="Comparison" value={operator} onChange={e=>setOperator(e.target.value)}>{operators.map(op=><option key={op} value={op}>{labels[op]}</option>)}</select></label>
  <label>Comparison value{type==='boolean'?<select value={value} onChange={e=>setValue(e.target.value)}><option value="">Choose</option><option>true</option><option>false</option></select>:type==='null'?<input readOnly value="null"/>:<input value={value} inputMode={type==='integer'?'numeric':'text'} onChange={e=>setValue(e.target.value)}/>}</label>
  <button type="button" disabled={!field} onClick={apply}>Apply comparison</button></div>
  {error?<p role="alert">{error}</p>:null}<p className="muted">This replaces the selected condition in the draft. Advanced Boolean and arithmetic rules remain available below.</p>
 </fieldset>;
}
