import {validateWorkflowExpression, type WorkflowExpression, type WorkflowFields} from './workflow-rules.js';
import {validateWorkflowValueShape,type WorkflowInputValue} from './workflow-values.js';

export interface WorkflowNode {
  id: string;
  kind: 'trigger'|'condition'|'action'|'approval'|'wait'|'branch'|'join'|'notification'|'completion';
  label: string;
  /** Binding and operation are mandatory for action and provider-backed notification. */
  bindingId?: string;
  operation?: string;
  inputs?: Record<string, WorkflowInputValue>;
  condition?: WorkflowExpression;
  waitMs?: number;
  approverPermission?: string;
  separateInitiator?: boolean;
  expiresAfterMs?: number;
}
export interface WorkflowEdge { from: string; to: string; port: 'next'|'true'|'false'|'approved'|'rejected'|'expired'|'lane'; }
export interface WorkflowGraph {
  graphVersion: 1;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  limits: { elapsedMs: number; maxParallel: number; maxActions: number };
}
export interface WorkflowGraphIssue { code: string; nodeId?: string; }
const id = /^[a-z][a-z0-9-]{0,47}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = ['trigger','condition','action','approval','wait','branch','join','notification','completion'];
const ports = ['next','true','false','approved','rejected','expired','lane'];
const closed = (value:unknown, keys:string[]): value is Record<string,any> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key=>keys.includes(key));

/** Structural validation only. Publication additionally checks signed provider
 * schemas, bindings, permissions, installation identity and module ownership. */
export function inspectWorkflowGraph(value:unknown, fields:WorkflowFields): WorkflowGraphIssue[] {
  const issues:WorkflowGraphIssue[]=[];
  try{if(new TextEncoder().encode(JSON.stringify(value)).length>65536)return[{code:'WORKFLOW_GRAPH_SIZE_LIMIT'}];}catch{return[{code:'WORKFLOW_GRAPH_INVALID'}];}
  const issue=(code:string,nodeId?:string)=>issues.push({code,...(nodeId?{nodeId}:{})});
  if(!closed(value,['graphVersion','nodes','edges','limits']) || value.graphVersion!==1
    || !Array.isArray(value.nodes)||value.nodes.length<2||value.nodes.length>32
    || !Array.isArray(value.edges)||value.edges.length>64
    || !closed(value.limits,['elapsedMs','maxParallel','maxActions']))return[{code:'WORKFLOW_GRAPH_INVALID'}];
  const limits=value.limits;
  if(!Number.isSafeInteger(limits.elapsedMs)||limits.elapsedMs<1000||limits.elapsedMs>31*86400000
    ||!Number.isSafeInteger(limits.maxParallel)||limits.maxParallel<1||limits.maxParallel>4
    ||!Number.isSafeInteger(limits.maxActions)||limits.maxActions<1||limits.maxActions>24)issue('WORKFLOW_LIMITS_INVALID');
  const nodes = new Map<string,WorkflowNode>();
  for(const raw of value.nodes){
    if(!closed(raw,['id','kind','label','bindingId','operation','inputs','condition','waitMs','approverPermission','separateInitiator','expiresAfterMs'])
      ||typeof raw.id!=='string'||!id.test(raw.id)||!kinds.includes(raw.kind)
      ||typeof raw.label!=='string'||raw.label.trim().length<1||raw.label.length>120){issue('WORKFLOW_NODE_INVALID');continue;}
    const n=raw as unknown as WorkflowNode;
    if(nodes.has(n.id)){issue('WORKFLOW_NODE_DUPLICATE',n.id);continue;}
    nodes.set(n.id,n);
    const optional=Object.keys(raw).filter(key=>!['id','kind','label'].includes(key));
    const allowed = n.kind==='action'||n.kind==='notification'?['bindingId','operation','inputs']
      :n.kind==='condition'?['condition']:n.kind==='wait'?['waitMs']
      :n.kind==='approval'?['approverPermission','separateInitiator','expiresAfterMs']:[];
    if(optional.some(key=>!allowed.includes(key)))issue('WORKFLOW_NODE_FIELDS_INVALID',n.id);
    if(n.kind==='action'||n.kind==='notification'){
      if(typeof n.bindingId!=='string'||!uuid.test(n.bindingId)||typeof n.operation!=='string'
        ||!/^[a-z][a-z0-9.-]{0,79}$/.test(n.operation)||!closed(n.inputs,Object.keys(n.inputs??{}))
        ||Object.keys(n.inputs??{}).length>32)issue('WORKFLOW_ACTION_INVALID',n.id);
      else for(const [field,expression] of Object.entries(n.inputs!)){
        if(!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field)||['constructor','prototype','__proto__'].includes(field))issue('WORKFLOW_INPUT_FIELD_INVALID',n.id);
        try{validateWorkflowValueShape(expression,fields);}catch{issue('WORKFLOW_INPUT_EXPRESSION_INVALID',n.id);}
      }
    }
    if(n.kind==='condition')try{if(validateWorkflowExpression(n.condition,fields)!=='boolean')issue('WORKFLOW_CONDITION_BOOLEAN_REQUIRED',n.id);}catch{issue('WORKFLOW_CONDITION_INVALID',n.id);}
    if(n.kind==='wait'&&(!Number.isSafeInteger(n.waitMs)||n.waitMs!<1||n.waitMs!>limits.elapsedMs))issue('WORKFLOW_WAIT_INVALID',n.id);
    if(n.kind==='approval'&&(typeof n.approverPermission!=='string'||!/^steward\.automation\.[a-z.-]{1,60}$/.test(n.approverPermission)
      ||typeof n.separateInitiator!=='boolean'||!Number.isSafeInteger(n.expiresAfterMs)||n.expiresAfterMs!<1000||n.expiresAfterMs!>limits.elapsedMs))issue('WORKFLOW_APPROVAL_INVALID',n.id);
  }
  const incoming=new Map<string,WorkflowEdge[]>(),outgoing=new Map<string,WorkflowEdge[]>(),edgeKeys=new Set<string>();
  for(const raw of value.edges){
    if(!closed(raw,['from','to','port'])||!nodes.has(raw.from)||!nodes.has(raw.to)||raw.from===raw.to||!ports.includes(raw.port)){
      issue('WORKFLOW_EDGE_INVALID');continue;
    }
    const edge=raw as unknown as WorkflowEdge,key=edge.from+':'+edge.port+':'+edge.to;
    if(edgeKeys.has(key))issue('WORKFLOW_EDGE_DUPLICATE',edge.from);
    edgeKeys.add(key);
    incoming.set(edge.to,[...(incoming.get(edge.to)??[]),edge]);outgoing.set(edge.from,[...(outgoing.get(edge.from)??[]),edge]);
  }
  const triggers=[...nodes.values()].filter(n=>n.kind==='trigger');
  if(triggers.length!==1)issue('WORKFLOW_SINGLE_TRIGGER_REQUIRED');
  if(![...nodes.values()].some(n=>n.kind==='completion'))issue('WORKFLOW_COMPLETION_REQUIRED');
  if([...nodes.values()].filter(n=>n.kind==='action'||n.kind==='notification').length>limits.maxActions)issue('WORKFLOW_ACTION_LIMIT');
  for(const n of nodes.values()){
    const ins=incoming.get(n.id)??[],outs=outgoing.get(n.id)??[];
    if(n.kind==='trigger'?ins.length!==0:n.kind==='join'?ins.length<2:ins.length!==1)issue('WORKFLOW_INBOUND_INVALID',n.id);
    const expected=n.kind==='condition'?['true','false']:n.kind==='approval'?['approved','rejected','expired']:n.kind==='completion'?[]:['next'];
    if(n.kind==='branch'){
      if(outs.length<2||outs.length>limits.maxParallel||outs.some(e=>e.port!=='lane'))issue('WORKFLOW_PARALLEL_LIMIT',n.id);
    }else if(outs.length!==expected.length||expected.some(port=>outs.filter(e=>e.port===port).length!==1))issue('WORKFLOW_OUTBOUND_INVALID',n.id);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  function walk(nodeId:string){
    if(visiting.has(nodeId)){issue('WORKFLOW_CYCLE',nodeId);return;}
    if(visited.has(nodeId))return;
    visiting.add(nodeId);for(const edge of outgoing.get(nodeId)??[])walk(edge.to);
    visiting.delete(nodeId);visited.add(nodeId);
  }
  if(triggers.length===1)walk(triggers[0]!.id);
  if(visited.size!==nodes.size)issue('WORKFLOW_UNREACHABLE_NODE');
  // Every path must terminate. No dangling control paths are accepted.
  for(const n of nodes.values())if(n.kind!=='completion'&&!(outgoing.get(n.id)?.length))issue('WORKFLOW_UNTERMINATED_PATH',n.id);
  return issues;
}

export function validateWorkflowGraph(value:unknown,fields:WorkflowFields): asserts value is WorkflowGraph {
  const issues=inspectWorkflowGraph(value,fields);
  if(issues.length)throw new Error(issues.map(i=>i.code+(i.nodeId?':'+i.nodeId:'')).join('; '));
}
