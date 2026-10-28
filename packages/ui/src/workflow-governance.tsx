import {useEffect,useRef,useState} from 'react';
import {WorkflowDesigner} from './workflow-designer.js';
type Api=<T=any>(path:string,method?:string,body?:unknown)=>Promise<T>;
export interface WorkflowSource {moduleId:string;name:string;moduleInstallationId:string;packageDigest:string;publicationPath:string;publicationQuery?:string[]}
/** Platform governance for any signed workflow source. Definitions and screens
 * remain contributed by independently installed modules through SSDS. */
export function WorkflowGovernance({api,sources}:{api:Api;sources:WorkflowSource[]}){
 const [data,setData]=useState<any>(),[sourceId,setSourceId]=useState(''),[publications,setPublications]=useState<any[]>([]),[selectedId,setSelectedId]=useState('');
 const [detail,setDetail]=useState<any>(),[nextOffset,setNextOffset]=useState<number|null>(null);
 const [reason,setReason]=useState(''),[reference,setReference]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [events,setEvents]=useState<any>();
 const pendingSubscription=useRef<any>(null),pendingReplay=useRef(new Map<string,any>());
 const pendingInspection=useRef<{moduleId:string;publicationId:string}|null>(null);
 const pendingStart=useRef<{workflowId:string;executionId:string;input:{reference:string}}|null>(null);
 const pendingReviews=useRef(new Map<string,{reviewId:string;nodeId:string;decision:string;reason:string}>());
 const source=sources.find(s=>s.moduleId===sourceId),sourceKey=source?source.moduleId+':'+source.moduleInstallationId+':'+source.packageDigest:'';
 const selected=detail?.sourceKey===sourceKey&&detail.record?.id===selectedId?detail.record:undefined;
 function checkedDetail(value:any,owner:WorkflowSource,id:string){const record=value?.records?.[0];if(record?.id!==id||!record.definition?.graph||!record.definition.fields||typeof record.definition.fields!=='object'||Array.isArray(record.definition.fields))throw Error('The exact publication definition is unavailable. Reload before reviewing or starting work.');return{sourceKey:owner.moduleId+':'+owner.moduleInstallationId+':'+owner.packageDigest,record};}
 const refresh=async()=>{const result=await api('/v16/workflows');setData(result);const receipts=await api('/v16/workflows/event-subscriptions');setEvents(receipts);if(pendingSubscription.current&&receipts.subscriptions.some((s:any)=>s.subscription_id===pendingSubscription.current.subscriptionId)){pendingSubscription.current=null;}if(source){const publications=await api('/v3/modules/'+encodeURIComponent(source.moduleId)+'/api'+source.publicationPath);setPublications(publications.records??[]);setNextOffset(publications.nextOffset??null);if(selectedId){const detail=await api('/v3/modules/'+encodeURIComponent(source.moduleId)+'/api'+source.publicationPath+'?q='+encodeURIComponent(selectedId));setDetail(checkedDetail(detail,source,selectedId));}}if(pendingStart.current&&result.executions.some((e:any)=>e.execution_id===pendingStart.current!.executionId)){setNotice('Start confirmed in execution history: '+pendingStart.current.executionId);pendingStart.current=null;}};
 useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
 useEffect(()=>{let active=true;setPublications([]);setSelectedId(pendingInspection.current&&source&&pendingInspection.current.moduleId===source.moduleId?pendingInspection.current.publicationId:'');pendingInspection.current=null;setNextOffset(null);if(source)void api('/v3/modules/'+encodeURIComponent(source.moduleId)+'/api'+source.publicationPath).then(r=>{if(active){setPublications(r.records??[]);setNextOffset(r.nextOffset??null);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[source?.moduleId,source?.moduleInstallationId,source?.packageDigest]);
 useEffect(()=>{let active=true;setDetail(undefined);if(source&&selectedId)void api('/v3/modules/'+encodeURIComponent(source.moduleId)+'/api'+source.publicationPath+'?q='+encodeURIComponent(selectedId)).then(r=>{if(active)setDetail(checkedDetail(r,source,selectedId));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[selectedId,source?.moduleId,source?.packageDigest]);
 async function more(){if(!source||nextOffset===null||!source.publicationQuery?.includes('offset')||!source.publicationQuery.includes('limit'))return;const page=await api('/v3/modules/'+encodeURIComponent(source.moduleId)+'/api'+source.publicationPath+'?offset='+nextOffset+'&limit=20');setPublications(old=>[...old,...(page.records??[]).filter((p:any)=>!old.some(o=>o.id===p.id))]);setNextOffset(page.nextOffset??null);}
 async function act(work:()=>Promise<unknown>,message:string){setBusy(true);setError('');setNotice('');try{await work();setNotice(message);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const reviewed=selected?.executionAllowed===true&&selected?.review?.decision==='approve'&&Date.parse(selected.review.expiresAt)>Date.now();
 const pin=()=>({moduleId:source!.moduleId,moduleInstallationId:source!.moduleInstallationId,packageDigest:source!.packageDigest,publicationId:selected.id,definitionDigest:selected.definitionDigest,reviewId:selected.review.id,reviewerId:selected.review.reviewerId,reviewExpiresAt:selected.review.expiresAt});
 async function start(workflowId:string){
  if(pendingStart.current&&pendingStart.current.workflowId!==workflowId)throw Error('Resolve the unconfirmed start before starting another workflow.');
  pendingStart.current??={workflowId,executionId:crypto.randomUUID(),input:{reference:reference.trim()}};
  await api('/v16/workflows/execute','POST',pendingStart.current);pendingStart.current=null;
 }
 async function subscribe(workflowId:string){
  if(pendingSubscription.current&&pendingSubscription.current.workflowId!==workflowId)throw Error('Retry the unconfirmed subscription before subscribing to another workflow.');
  pendingSubscription.current??={workflowId,subscriptionId:crypto.randomUUID(),reason};
  await api('/v16/workflows/event-subscriptions','POST',pendingSubscription.current);pendingSubscription.current=null;
 }
 async function replay(subscriptionId:string,eventId:string){
  const key=subscriptionId+':'+eventId,body=pendingReplay.current.get(key)??{eventId,requestId:crypto.randomUUID(),reason};pendingReplay.current.set(key,body);
  await api('/v16/workflows/event-subscriptions/'+subscriptionId+'/replay','POST',body);pendingReplay.current.delete(key);
 }
 async function review(executionId:string,nodeId:string,decision:string){
  const key=executionId+':'+nodeId,old=pendingReviews.current.get(key);
  if(old&&(old.decision!==decision||old.reason!==reason))throw Error('Retry the original unconfirmed decision before changing it.');
  const body=old??{reviewId:crypto.randomUUID(),nodeId,decision,reason};pendingReviews.current.set(key,body);
  await api('/v16/workflows/executions/'+executionId+'/reviews','POST',body);pendingReviews.current.delete(key);
 }
 return <section aria-label="Business workflow governance" className="workflow-governance">
  <div className="section-heading"><h3>Business workflows</h3><button disabled={busy} onClick={()=>void act(async()=>{},'Workflow history refreshed.')}>Refresh workflow history</button></div>
  <p>Create and publish definitions in their installed module. A separate human review and Worker activation are required before a workflow can run.</p>
  {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
  {!sources.length?<p>No active installed module declares a workflow publication service.</p>:<>
   <div className="form-grid"><label>Workflow source<select aria-label="Workflow source" value={sourceId} disabled={busy} onChange={e=>{setSourceId(e.target.value);setError('');}}><option value="">Choose an installed module</option>{sources.map(s=><option value={s.moduleId} key={s.moduleId}>{s.name}</option>)}</select></label>
   <label>Published version<select aria-label="Published workflow version" value={selectedId} disabled={busy||!source} onChange={e=>setSelectedId(e.target.value)}><option value="">Choose a publication</option>{publications.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label></div>
   {nextOffset!==null&&source?.publicationQuery?.includes('offset')&&source.publicationQuery.includes('limit')?<button disabled={busy} onClick={()=>{setBusy(true);setError('');void more().catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Load older publications</button>:null}
   {source&&!publications.length?<p>No recent publications are available. Publish a definition in the module first.</p>:null}
   {selected?<>{selected.executionAllowed===false?<p role="alert">Current module configuration or contract blocks this publication. Review its definition before importing.</p>:null}<p>Review: {selected.review?.decision??'Awaiting separate review'}{selected.review?' · expires '+new Date(selected.review.expiresAt).toLocaleString():''}</p><WorkflowDesigner value={selected.definition.graph} fields={selected.definition.fields} readOnly onChange={()=>{}}/></>:null}
  </>}
  <label>Governance reason<textarea aria-label="Workflow governance reason" minLength={20} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  <button disabled={busy||!source||!reviewed||reason.trim().length<20} onClick={()=>void act(()=>api('/v16/workflows/import','POST',{publication:pin(),reason}),'Reviewed version imported. Activate it explicitly when ready.')}>Import reviewed version</button>
  <label>Run reference<input aria-label="Workflow run reference" maxLength={120} value={reference} disabled={busy||Boolean(pendingStart.current)} onChange={e=>setReference(e.target.value)}/></label>
  {pendingStart.current?<p role="status">A start is unconfirmed. Refresh history or retry the same start; its execution identity is retained.</p>:null}
  {data?.workflows.map((w:any)=><article className="request-card" key={w.workflow_id}>
   <strong>{w.definition.displayName??w.name} · version {w.version}</strong><p>{w.state}{w.state==='active'&&!w.accepting_new?' · retained for existing work':''}</p>
   <button disabled={busy||reason.trim().length<20||w.state==='active'&&w.accepting_new} onClick={()=>void act(()=>api('/v16/workflows/'+w.workflow_id+'/lifecycle','POST',{action:'activate',reason}),'Workflow activated after current publication and binding checks.')}>Activate workflow</button>
   <button disabled={busy||reason.trim().length<20||w.state!=='active'} onClick={()=>void act(()=>api('/v16/workflows/'+w.workflow_id+'/lifecycle','POST',{action:'suspend',reason}),'Workflow suspended. Existing records and effects are retained.')}>Suspend workflow</button>
   {w.definition.triggerKind==='event'?<button disabled={busy||reason.trim().length<20||w.state!=='active'||!w.accepting_new||events?.subscriptions.some((s:any)=>s.workflow_id===w.workflow_id)} onClick={()=>void act(()=>subscribe(w.workflow_id),'Event subscription approved. New authorized source events can queue executions.')}>{pendingSubscription.current?.workflowId===w.workflow_id?'Retry same subscription':'Subscribe to source events'}</button>:<button disabled={busy||w.state!=='active'||!w.accepting_new||!reference.trim()||Boolean(pendingStart.current&&pendingStart.current.workflowId!==w.workflow_id)} onClick={()=>void act(()=>start(w.workflow_id),'Workflow start accepted. Follow its progress below.')}>{pendingStart.current?.workflowId===w.workflow_id?'Retry same start':'Start workflow'}</button>}
  </article>)}
  {data&&!data.workflows.length?<p>No published versions have been imported for Worker execution.</p>:null}
  <h4>Event subscriptions and recovery</h4>
  <p>Delivery means an execution was queued, not that business work completed. Recovery retains the original provider, event and execution identities.</p>
  {events?.subscriptions.map((s:any)=><article className="request-card" key={s.subscription_id}><strong>{s.provider_id} · {s.event_name}</strong><p>{s.state} · {s.capture_error??'No reported capture failure'}</p><details><summary>Original source identity</summary><p>{s.source_module_installation_id}</p><code>{s.source_package_digest}</code></details>
   <button disabled={busy||reason.trim().length<20} onClick={()=>void act(()=>api('/v16/workflows/event-subscriptions/'+s.subscription_id+'/lifecycle','POST',{action:s.state==='active'?'suspend':'resume',reason}),'Subscription state updated. Resuming rechecks current authority; capture health updates after polling.')}>{s.state==='active'?'Suspend subscription':'Resume subscription'}</button>
   {events.deliveries.filter((d:any)=>d.subscription_id===s.subscription_id).map((d:any)=><div key={d.event_id}><p>{d.state==='delivered'?'Execution queued':d.state} · attempts {d.attempts} · {d.error_code??'No reported delivery failure'}</p><details><summary>Receipt reference</summary><code>{d.event_id}</code>{d.execution_id?<p>Execution: {d.execution_id}</p>:null}</details>
    {d.state==='dead_letter'||pendingReplay.current.has(s.subscription_id+':'+d.event_id)?<button disabled={busy||s.state!=='active'||reason.trim().length<20} onClick={()=>void act(()=>replay(s.subscription_id,d.event_id),'Original failed receipt retry accepted. Follow its execution separately.')}>{pendingReplay.current.has(s.subscription_id+':'+d.event_id)?'Retry same recovery request':'Retry failed receipt'}</button>:null}
   </div>)}
  </article>)}
  {events&&!events.subscriptions.length?<p>No source event subscriptions have been approved.</p>:null}
  <h4>Execution progress</h4>{data?.executions.map((e:any)=>{
   const w=data.workflows.find((w:any)=>w.workflow_id===e.workflow_id),publication=selected?.id===e.workflow_id&&source?.moduleId===w?.consumer_id?selected:undefined,waiting=Object.entries(e.progress??{}).filter(([,p]:any)=>p.state==='waiting');
   return <article className="request-card" key={e.execution_id}><strong>{w?.definition.displayName??'Workflow execution'}</strong><p>{e.state} · {e.error_code??'No reported failure'}</p><details><summary>Execution reference</summary><code>{e.execution_id}</code></details>
    {!publication&&w&&sources.some(s=>s.moduleId===w.consumer_id)?<button disabled={busy} onClick={()=>{if(sourceId===w.consumer_id)setSelectedId(e.workflow_id);else{pendingInspection.current={moduleId:w.consumer_id,publicationId:e.workflow_id};setSourceId(w.consumer_id);}}}>Inspect execution workflow</button>:null}
    {publication?<WorkflowDesigner value={publication.definition.graph} fields={publication.definition.fields} readOnly onChange={()=>{}} states={Object.fromEntries(Object.entries(e.progress??{}).map(([id,p]:any)=>[id,p.state]))}/>:null}
    {waiting.map(([id])=>publication?.definition.graph.nodes.find((n:any)=>n.id===id)?.kind==='approval'?<div key={id}><p>Human decision required: {publication.definition.graph.nodes.find((n:any)=>n.id===id).label}. Current permissions and separation of duties are checked by the Worker.</p>{['approve','reject'].map(decision=><button key={decision} disabled={busy||reason.trim().length<20} onClick={()=>void act(()=>review(e.execution_id,id,decision),'Human decision recorded; the Worker will recheck authority before continuing.')}>{decision==='approve'?'Approve step':'Reject step'}</button>)}</div>:null)}
    {['pending','running'].includes(e.state)?<button disabled={busy||reason.trim().length<20} onClick={()=>void act(()=>api('/v16/workflows/executions/'+e.execution_id+'/cancel','POST',{reason}),'Execution cancelled. Previously committed effects are retained.')}>Cancel execution</button>:null}
   </article>;
  })}
  {data&&!data.executions.length?<p>No executions have started.</p>:null}
 </section>;
}
