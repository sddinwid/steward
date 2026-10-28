import {useId,useState} from 'react';
import {inspectWorkflowGraph,type WorkflowGraph,type WorkflowNode,type WorkflowEdge,type WorkflowFields} from '@steward/module-sdk/workflow';

export interface WorkflowBindingChoice {
  bindingId:string;provider:string;capability:string;contractVersion:string;
  state:string;sensitivity:string;operations:{name:string;permission:string;input:unknown;output:unknown}[];
}
const initial=():WorkflowGraph=>({graphVersion:1,nodes:[{id:'start',kind:'trigger',label:'Start'},
  {id:'complete',kind:'completion',label:'Complete'}],edges:[{from:'start',to:'complete',port:'next'}],
  limits:{elapsedMs:600000,maxParallel:1,maxActions:16}});
const names:Record<WorkflowNode['kind'],string>={trigger:'Trigger',condition:'Condition',action:'Action',approval:'Approval',wait:'Wait',branch:'Parallel branch',join:'Join',notification:'Notification',completion:'Completion'};
const kinds=Object.keys(names) as WorkflowNode['kind'][];

/** A generic data-only SSDS field. No provider code/assets are loaded. Choices
 * must come from authenticated signed-registry discovery, never graph contents. */
export function WorkflowDesigner({value,onChange,readOnly=false,fields={},bindings=[],discoveryError='',states={}}:{
  value:unknown;onChange:(graph:WorkflowGraph)=>void;readOnly?:boolean;fields?:WorkflowFields;
  bindings?:WorkflowBindingChoice[];discoveryError?:string;states?:Record<string,string>;
}){
  const instanceId=useId(),[selected,setSelected]=useState(''),[kind,setKind]=useState<WorkflowNode['kind']>('action');
  const [from,setFrom]=useState(''),[to,setTo]=useState(''),[port,setPort]=useState<WorkflowEdge['port']>('next');
  const [error,setError]=useState('');
  let decoded:unknown=value;
  try{if(typeof value==='string')decoded=value?JSON.parse(value):undefined;}catch{/* Preserve invalid supplied text; no silent replacement on save. */}
  const candidate=decoded as WorkflowGraph|undefined;
  const validShape=!!candidate&&candidate.graphVersion===1&&!!candidate.limits&&Array.isArray(candidate.nodes)&&candidate.nodes.length<=32&&candidate.nodes.every(n=>!!n&&typeof n.id==='string'&&typeof n.label==='string'&&kinds.includes(n.kind))&&Array.isArray(candidate.edges)&&candidate.edges.length<=64&&candidate.edges.every(e=>!!e&&typeof e.from==='string'&&typeof e.to==='string'&&typeof e.port==='string');
  const graph=validShape?decoded as WorkflowGraph:initial();
  const issues=inspectWorkflowGraph(graph,fields),node=graph.nodes.find(n=>n.id===selected);
  const change=(next:WorkflowGraph)=>{if(!readOnly){setError('');onChange(next);}};
  const edit=(patch:Partial<WorkflowNode>)=>node&&change({...graph,nodes:graph.nodes.map(n=>n.id===node.id?{...n,...patch}:n)});
  const chosenBinding=bindings.find(b=>b.bindingId===node?.bindingId);
  function add(){
    if(graph.nodes.length>=32){setError('A workflow can contain at most 32 nodes.');return;}
    const id='node-'+crypto.randomUUID().slice(0,8);
    const next:WorkflowNode={id,kind,label:names[kind],...(kind==='condition'?{condition:{literal:true}}:{}),
      ...(kind==='action'||kind==='notification'?{bindingId:'',operation:'',inputs:{}}:{}),
      ...(kind==='wait'?{waitMs:1000}:{}),...(kind==='approval'?{approverPermission:'steward.automation.approve',separateInitiator:true,expiresAfterMs:60000}:{})};
    change({...graph,nodes:[...graph.nodes,next]});setSelected(id);
  }
  const fieldId=instanceId.replaceAll(':','');
  if(!validShape&&value)return <p role="alert" className="form-error">The saved graph could not be read. It has not been replaced. Reload the record before editing.</p>;
  return <section className="module-object workflow-designer" aria-label="Workflow designer">
    <h3>Workflow designer</h3><p className="muted">Connect steps, inspect their contracts, and validate before publication. Discovery does not authorize an action.</p>
    {!validShape&&value?<p role="alert" className="form-error">The saved graph could not be read. It has not been replaced. Reload the record before editing.</p>:null}
    {!validShape&&!readOnly?<p>This starter graph is not saved. <button type="button" onClick={()=>change(initial())}>Use starter workflow</button></p>:null}
    {discoveryError?<p role="alert" className="form-error">Capability discovery unavailable: {discoveryError}</p>:null}
    {error?<p role="alert" className="form-error">{error}</p>:null}
    <div style={{overflowX:'auto',maxWidth:'100%'}}><svg viewBox={`0 0 800 ${Math.max(100,Math.ceil(graph.nodes.length/3)*100)}`} style={{width:'100%',minWidth:420,maxHeight:650}} role="img" aria-labelledby={fieldId+'-title'}>
      <title id={fieldId+'-title'}>Workflow connections. Select a step in the keyboard-accessible list below to edit it.</title>
      {graph.edges.map((edge,i)=>{const a=graph.nodes.findIndex(n=>n.id===edge.from),b=graph.nodes.findIndex(n=>n.id===edge.to);return a>=0&&b>=0?<line key={i} x1={135+(a%3)*265} y1={45+Math.floor(a/3)*100} x2={135+(b%3)*265} y2={45+Math.floor(b/3)*100} stroke="currentColor" strokeWidth="2"/>:null;})}
      {graph.nodes.map((n,i)=><g key={n.id}><rect x={5+(i%3)*265} y={15+Math.floor(i/3)*100} width="250" height="60" rx="8" fill="var(--surface, white)" stroke="currentColor" strokeWidth={n.id===selected?3:1}/><text x={15+(i%3)*265} y={40+Math.floor(i/3)*100} fill="currentColor" fontSize="14">{n.label.slice(0,26)}</text><text x={15+(i%3)*265} y={60+Math.floor(i/3)*100} fill="currentColor" fontSize="12">{names[n.kind]} {states[n.id]??''}</text></g>)}
    </svg></div>
    <ol aria-label="Workflow steps">{graph.nodes.map(n=><li key={n.id}><button type="button" aria-pressed={selected===n.id} onClick={()=>setSelected(n.id)}>{n.label} · {names[n.kind]}</button> {states[n.id]?<span role="status">{states[n.id]}</span>:null}<small> {n.id}</small></li>)}</ol>
    {!readOnly?<div className="form-grid"><label>New step type<select value={kind} onChange={e=>setKind(e.target.value as WorkflowNode['kind'])}>{kinds.map(k=><option key={k} value={k}>{names[k]}</option>)}</select></label><button type="button" onClick={add} disabled={graph.nodes.length>=32}>Add step</button></div>:null}
    {node?<fieldset className="module-object"><legend>{names[node.kind]} configuration</legend><label>Step label<input maxLength={120} value={node.label} readOnly={readOnly} onChange={e=>edit({label:e.target.value})}/></label>
      {node.kind==='action'||node.kind==='notification'?<>
        <label>Approved capability binding<select disabled={readOnly} value={node.bindingId??''} onChange={e=>edit({bindingId:e.target.value,operation:'',inputs:{}})}><option value="">Select a reviewed binding</option>{node.bindingId&&!chosenBinding?<option value={node.bindingId} disabled>Existing binding unavailable — review required</option>:null}{bindings.map(b=><option key={b.bindingId} value={b.bindingId} disabled={b.state!=='approved'}>{b.provider} · {b.capability} · {b.state}</option>)}</select></label>
        <label>Operation<select aria-label="Operation" disabled={readOnly||!chosenBinding} value={node.operation??''} onChange={e=>edit({operation:e.target.value})}><option value="">Select an operation</option>{chosenBinding?.operations.map(o=><option key={o.name}>{o.name}</option>)}</select></label>
        {chosenBinding?<details><summary>Signed contract and required permissions</summary><p>{chosenBinding.contractVersion} · {chosenBinding.sensitivity}</p><pre>{JSON.stringify(chosenBinding.operations.find(o=>o.name===node.operation)??chosenBinding.operations,null,2)}</pre></details>:<p>No approved provider selected. Establish a binding in Smart Modules administration.</p>}
        <label>Input mappings (data-only expressions)<textarea key={node.id+'-inputs'} readOnly={readOnly} defaultValue={JSON.stringify(node.inputs??{},null,2)} onChange={e=>{if(readOnly)return;try{const inputs=JSON.parse(e.target.value);if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw Error();e.target.setCustomValidity('');edit({inputs});}catch{e.target.setCustomValidity('Enter a JSON object of declarative input mappings.');setError('Input mappings must be valid JSON data. No script expressions are allowed.');}}}/></label>
      </>:null}
      {node.kind==='condition'?<><label>Condition (data-only rule)<textarea key={node.id+'-condition'} readOnly={readOnly} defaultValue={JSON.stringify(node.condition,null,2)} onChange={e=>{if(readOnly)return;try{const condition=JSON.parse(e.target.value);e.target.setCustomValidity('');edit({condition});}catch{e.target.setCustomValidity('Enter a valid declarative JSON rule.');setError('Enter a valid declarative rule. JavaScript and SQL are not supported.');}}}/></label><details><summary>Authorized fields</summary>{Object.entries(fields).map(([name,f])=><p key={name}>{name} · {f.type} · {f.sensitivity} · maximum age {f.maxAgeMs/1000}s</p>)}</details></>:null}
      {node.kind==='wait'?<label>Wait duration (milliseconds)<input type="number" min={1} max={graph.limits.elapsedMs} value={node.waitMs??''} readOnly={readOnly} onChange={e=>edit({waitMs:Number(e.target.value)})}/></label>:null}
      {node.kind==='approval'?<><label>Approver permission<input value={node.approverPermission??''} readOnly={readOnly} onChange={e=>edit({approverPermission:e.target.value})}/></label><label>Approval expires after (milliseconds)<input type="number" min={1000} max={graph.limits.elapsedMs} value={node.expiresAfterMs??''} readOnly={readOnly} onChange={e=>edit({expiresAfterMs:Number(e.target.value)})}/></label><label><input type="checkbox" checked={node.separateInitiator??true} disabled={readOnly} onChange={e=>edit({separateInitiator:e.target.checked})}/>Require a different person from the initiator</label></>:null}
      {!readOnly?<button type="button" onClick={()=>{change({...graph,nodes:graph.nodes.filter(n=>n.id!==node.id),edges:graph.edges.filter(e=>e.from!==node.id&&e.to!==node.id)});setSelected('');}}>Remove selected step and its connections</button>:null}
    </fieldset>:null}
    <h4>Connections</h4><ul>{graph.edges.map((edge,i)=><li key={i}>{edge.from} → {edge.to} ({edge.port}) {!readOnly?<button type="button" onClick={()=>change({...graph,edges:graph.edges.filter((_,index)=>index!==i)})}>Remove connection {i+1}</button>:null}</li>)}</ul>
    {!readOnly?<div className="form-grid"><label>From step<select value={from} onChange={e=>setFrom(e.target.value)}><option value="">Choose</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label><label>Outcome<select value={port} onChange={e=>setPort(e.target.value as WorkflowEdge['port'])}>{['next','true','false','approved','rejected','expired','lane'].map(p=><option key={p}>{p}</option>)}</select></label><label>To step<select value={to} onChange={e=>setTo(e.target.value)}><option value="">Choose</option>{graph.nodes.map(n=><option key={n.id} value={n.id}>{n.label}</option>)}</select></label><button type="button" disabled={!from||!to||from===to||graph.edges.length>=64} onClick={()=>change({...graph,edges:[...graph.edges,{from,to,port}]})}>Connect steps</button></div>:null}
    <details><summary>Validation ({issues.length} issues)</summary>{issues.length?<ul>{issues.map((i,n)=><li key={n}>{i.nodeId?i.nodeId+': ':''}{i.code.replace('WORKFLOW_','').toLowerCase().replaceAll('_',' ')}</li>)}</ul>:<p>Graph structure is valid. Publication still requires server-side contract and authority checks.</p>}</details>
  </section>;
}
