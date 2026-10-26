import {StructuredValue} from './presentation.js';
import type {ModuleField,ReferenceChoices} from './module-fields.js';
import {unavailableReference} from './module-fields.js';

export function ModuleReferenceValue({value,reference}:{value:unknown;reference:ReferenceChoices|undefined}){
 const choice=reference?.status==='ready'?reference.choices.find(c=>c.value===value):undefined;
 return choice?<details><summary>{choice.label}</summary><code>{String(value)}</code></details>:<span className="muted">{reference?.status==='loading'?'Loading related record…':'Related record unavailable'}</span>;
}

/** Shared field presentation, driven entirely by verified module metadata. */
export function ModuleFormField({field,value,currency,onChange,reference,onReload}:{field:ModuleField;value:any;currency:string;onChange:(value:any)=>void;reference?:ReferenceChoices|undefined;onReload?:(()=>void)|undefined}){
 const label=field.label.replace(/ Cents$/,'');
 if(field.reference){const state=reference??unavailableReference(),available=state.status==='ready',present=state.choices.some(c=>c.value===value);
  return <div className="module-field"><label>{label}<select aria-label={label} required={field.required} disabled={!available||!state.choices.length} value={value??''} onChange={e=>onChange(e.target.value)}><option value="">{state.status==='loading'?'Loading authorized choices…':!available?'Choices unavailable':!state.choices.length?'No authorized records':'Select a record'}</option>{value&&!present?<option value={value} disabled>Current selection unavailable in these choices</option>:null}{state.choices.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select></label>{state.message?<small role={state.status==='unavailable'?'status':undefined}>{state.message}</small>:null}{onReload?<button type="button" onClick={onReload}>Refresh {label} choices</button>:null}</div>;
 }
 if(field.type==='json')return <div className="module-field"><StructuredValue label={field.label} name={field.name} value={value} required={field.required} onChange={onChange}/></div>;
 return <div className="module-field"><label>{label}{/Cents$/.test(field.name)?<small>Amount in {currency}</small>:null}{field.enum?<select aria-label={label} required={field.required} value={value??''} onChange={e=>onChange(e.target.value)}><option value="">Select value</option>{field.enum.map(v=><option key={v} value={v}>{v}</option>)}</select>:<input aria-label={label} type={field.type==='number'?'number':'text'} step={field.type==='number'?(/Cents$/.test(field.name)?'0.01':'any'):undefined} min={/Cents$/.test(field.name)&&field.minimum!==undefined?field.minimum/100:field.minimum} maxLength={field.maxLength} required={field.required} readOnly={Boolean(field.generate)} value={value??''} onChange={e=>onChange(e.target.value)}/>}</label>{field.generate?<small>{field.generate==='uuid'?'Generated identifier; retained when editing.':'Synthetic identifier only; retained when editing.'}</small>:null}</div>;
}
