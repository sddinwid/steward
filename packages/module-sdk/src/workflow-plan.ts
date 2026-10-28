import type {WorkflowGraph,WorkflowEdge} from './workflow-graph.js';
export interface SmartGraphProgress {
  state: 'running'|'waiting'|'completed'|'skipped'|'suspended';
  selectedPorts?: WorkflowEdge['port'][];
}
export interface SmartGraphPlan {
  ready: string[];
  skip: string[];
  complete: boolean;
  suspended: boolean;
}
export function planSmartGraph(graph:WorkflowGraph,progress:Readonly<Record<string,SmartGraphProgress>>):SmartGraphPlan {
  const nodeIds=new Set(graph.nodes.map(n=>n.id));
  if(Object.keys(progress).some(id=>!nodeIds.has(id)))throw Error('WORKFLOW_PROGRESS_IDENTITY_INVALID');
  for(const [id,p] of Object.entries(progress)){
    if(!p||!['running','waiting','completed','skipped','suspended'].includes(p.state)
      ||Object.keys(p).some(k=>!['state','selectedPorts'].includes(k)))throw Error('WORKFLOW_PROGRESS_INVALID');
    const node=graph.nodes.find(n=>n.id===id)!;
    const allowed=graph.edges.filter(e=>e.from===id).map(e=>e.port);
    if(p.state==='completed'){
      if(!Array.isArray(p.selectedPorts)||new Set(p.selectedPorts).size!==p.selectedPorts.length
        ||p.selectedPorts.some(port=>!allowed.includes(port)))throw Error('WORKFLOW_PROGRESS_PORT_INVALID');
      const expected=node.kind==='completion'?0:1;
      if(p.selectedPorts.length!==expected)throw Error('WORKFLOW_PROGRESS_PORT_INVALID');
    }else if(p.selectedPorts!==undefined)throw Error('WORKFLOW_PROGRESS_PORT_INVALID');
  }
  if(Object.values(progress).some(p=>p.state==='suspended'))return{ready:[],skip:[],complete:false,suspended:true};
  const terminal=(p:SmartGraphProgress|undefined)=>p?.state==='completed'||p?.state==='skipped';
  const slots=Math.max(0,graph.limits.maxParallel-Object.values(progress).filter(p=>p.state==='running').length);
  const ready:string[]=[],skip:string[]=[];
  // Stable ID order makes duplicate workers agree. The caller still locks and
  // persists each claim before dispatch; this function is not a work queue.
  for(const node of [...graph.nodes].sort((a,b)=>a.id.localeCompare(b.id,'en'))){
    if(Object.hasOwn(progress,node.id))continue;
    const inbound=graph.edges.filter(e=>e.to===node.id);
    if(node.kind==='trigger') {if(ready.length<slots)ready.push(node.id);continue;}
    if(!inbound.every(edge=>terminal(progress[edge.from])))continue;
    const active=inbound.some(edge=>progress[edge.from]?.state==='completed'&&progress[edge.from]!.selectedPorts!.includes(edge.port));
    if(!active)skip.push(node.id);
    else if(ready.length<slots)ready.push(node.id);
  }
  return{ready,skip,complete:graph.nodes.every(node=>terminal(progress[node.id])),suspended:false};
}
