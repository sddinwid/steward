import {useState} from 'react';
import {previewWorkflow,type WorkflowGraph,type WorkflowFields,type WorkflowPreviewScenario,type WorkflowPreviewResult,type WorkflowScalar} from '@steward/module-sdk/workflow';
import type {WorkflowBindingChoice} from './workflow-designer.js';

export function WorkflowPreview({graph,fields,bindings,disabled=false}:{graph:WorkflowGraph;fields:WorkflowFields;bindings:WorkflowBindingChoice[];disabled?:boolean}){
 const [values,setValues]=useState<Record<string,string>>({}),[outcomes,setOutcomes]=useState<WorkflowPreviewScenario['outcomes']>({}),[approvals,setApprovals]=useState<WorkflowPreviewScenario['approvals']>({});
 const [review,setReview]=useState<{key:string;result?:WorkflowPreviewResult;error?:string}>();
 const key=JSON.stringify({graph,fields,bindings,values,outcomes,approvals,disabled}),current=review?.key===key?review:undefined;
 function run(){if(disabled)return;try{
  const samples:Record<string,WorkflowScalar>={};
  for(const [name,field]of Object.entries(fields))if(Object.hasOwn(values,name)){
   const text=values[name]!;if(text===''&&field.type!=='string')continue;
   if(field.type==='integer'){if(!/^-?\d+$/.test(text)||!Number.isSafeInteger(Number(text)))throw Error('Enter a safe whole number for '+name);samples[name]=Number(text);}
   else if(field.type==='boolean'){if(!['true','false'].includes(text))throw Error('Choose true or false for '+name);samples[name]=text==='true';}
   else if(field.type==='null')samples[name]=null;else samples[name]=text;
  }
  const selectedOutcomes=Object.fromEntries(Object.entries(outcomes).filter(([id])=>graph.nodes.some(n=>n.id===id))) as WorkflowPreviewScenario['outcomes'];
  const selectedApprovals=Object.fromEntries(Object.entries(approvals).filter(([id])=>graph.nodes.some(n=>n.id===id))) as WorkflowPreviewScenario['approvals'];
  setReview({key,result:previewWorkflow(graph,fields,bindings,{values:samples,outcomes:selectedOutcomes,approvals:selectedApprovals})});
 }catch(error){setReview({key,error:(error as Error).message});}}
 return <details className="module-object"><summary>Synthetic dry-run</summary>
  <p>This local preview calls no providers, changes no business records and records no approvals. It tests paths using your explicit assumptions. Runtime authority, provider responses, durability and real timing require installed execution verification.</p>
  <div className="form-grid">{Object.entries(fields).map(([name,field])=><label key={name}>Synthetic value: {name}{field.type==='boolean'||field.type==='null'?<select value={values[name]??''} onChange={e=>setValues({...values,[name]:e.target.value})}><option value="">Not supplied</option>{(field.type==='boolean'?['true','false']:['null']).map(v=><option key={v}>{v}</option>)}</select>:<input value={values[name]??''} placeholder="Not supplied" inputMode={field.type==='integer'?'numeric':'text'} onChange={e=>setValues({...values,[name]:e.target.value})}/>}</label>)}</div>
  <div className="form-grid">{graph.nodes.filter(n=>['action','notification'].includes(n.kind)).map(n=><label key={n.id}>Synthetic outcome: {n.label}<select value={outcomes[n.id]??''} onChange={e=>setOutcomes({...outcomes,[n.id]:e.target.value as WorkflowPreviewScenario['outcomes'][string]})}><option value="">Choose an assumption</option><option value="succeeded">Assume success</option><option value="failed">Assume rejection or failure</option><option value="timeout">Assume timeout</option></select></label>)}</div>
  <div className="form-grid">{graph.nodes.filter(n=>n.kind==='approval').map(n=><label key={n.id}>Synthetic decision: {n.label}<select value={approvals[n.id]??''} onChange={e=>setApprovals({...approvals,[n.id]:e.target.value as WorkflowPreviewScenario['approvals'][string]})}><option value="">Choose an assumption</option><option value="approved">Assume approval</option><option value="rejected">Assume rejection</option><option value="expired">Assume expiry</option></select></label>)}</div>
  <button type="button" disabled={disabled} onClick={run}>Run synthetic dry-run</button>{disabled?<p>Resolve editor or discovery errors before previewing the draft.</p>:null}
  {review&&!current?<p role="status">Definition or assumptions changed. Run the preview again.</p>:null}
  {current?.error?<p role="alert">Preview could not run: {current.error}</p>:null}
  {current?.result?<div aria-live="polite"><p>Synthetic result: {current.result.status} · virtual elapsed time {current.result.elapsedMs} ms</p><ol>{current.result.steps.map((s,i)=><li key={i}>{graph.nodes.find(n=>n.id===s.nodeId)?.label??s.nodeId}: {s.outcome} — {s.detail}</li>)}</ol></div>:null}
 </details>;
}
