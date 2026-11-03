import {screenDestination,screenContext} from './module-links.js';
import {configurationErrorMessage,saveModuleConfiguration,moduleInstallIntent,moduleInstallAction} from './module-configuration.js';
import {ModuleReportView} from './module-report.js';
import {workflowBindingChoices,workflowTriggerFields,workflowActionFields} from './workflow-discovery.js';
import {ModuleFormField,ModuleReferenceValue,type WorkflowFieldContext} from './module-field.js';
import {moduleFormDefaults,moduleEditValues,moduleFormBody,moduleListQuery,moduleFieldVisible,moduleReferenceFields,moduleFormCurrency,moduleHasEditableMoney,moduleReferenceCurrencyReady,loadReferenceChoices,referenceOperation,type ReferenceChoices} from './module-fields.js';
import { useEffect, useState, type FormEvent } from 'react';
import { SmartModules } from './smart-modules.js';
import { screenLabel, screenGroup, contextualScreenLabel, Money, ReadableValue, ConfigurationFields, humanize } from './presentation.js';
import type { ApiContribution, ModulePackageManifest, ScreenContribution } from '@steward/module-sdk';
const safeObject=(text:string)=>{try{return JSON.parse(text);}catch{return {};}};
/** Exact evidence hashes stay available without dominating ordinary business tables. */
export function ModuleEvidenceValue({name,value,currency}:{name:string;value:unknown;currency?:string}){
  return typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value)&&/(?:^|_)(?:digest|hash|proof)$|(?:Digest|Hash|Proof)$/.test(name)
    ? <details><summary>Evidence · {value.slice(-8)}</summary><code>{value}</code></details>
    : <ReadableValue value={value} name={name} currency={currency}/>;
}
type Api = <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;
export interface DiscoveredModule { workflowServices?:ModulePackageManifest['workflowServices']; approvalServices?:ModulePackageManifest['approvalServices']; moduleId: string; version: string; name: string; mode?:'simulator'|'live'; currency?:string; programServices?:{contractVersion:1;domain:string;syntheticOnly:true}; economicServices?:NonNullable<ModulePackageManifest['economicServices']>; api: ApiContribution[]; ui: ScreenContribution[] }
export function ModuleConsole({ api, administrator, mode = 'all', screenKey, onNavigate, currency = 'USD' }: { api: Api; administrator: boolean; mode?: 'all' | 'business' | 'administration' | 'developer'; screenKey?: string; onNavigate?: (key:string)=>void; currency?:string }) {
  const [manager, setManager] = useState<any>();
  const [modules, setModules] = useState<DiscoveredModule[]>([]);
  const [selected, setSelected] = useState(screenKey ?? '');
  useEffect(()=>{setSelected(screenKey??'');},[screenKey]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [configurations, setConfigurations] = useState<Record<string, string>>({});
  const [configurationResults,setConfigurationResults]=useState<Record<string,{error?:string;saved?:boolean}>>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [scopeAccount, setScopeAccount] = useState('');
  const [scopeModule, setScopeModule] = useState('');
  const [scopePermissions, setScopePermissions] = useState<string[]>([]);
  async function refresh() {
    const discovered = await api('/v3/modules/discovery'); setModules(discovered.modules);
    if (administrator && !screenKey) {
      const [m, a] = await Promise.all([api('/v3/modules'), api('/v3/modules/accounts')]); setManager(m); setAccounts(a.accounts);
    }
  }
  useEffect(() => { void refresh().catch(e => { setError(String(e.message).includes('Route ')?'The module runtime is not configured. Ask an operator to provision the trusted module host.':e.message); }); }, []);
  async function act(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); } catch (e) { setError((e as Error).message); } finally { await refresh().catch(e => setError(e.message)); setBusy(false); } }
  async function saveConfiguration(m:any){
    setBusy(true);setConfigurationResults(v=>({...v,[m.moduleId]:{}}));
    try{await saveModuleConfiguration(api,m.moduleId,JSON.parse(configurations['installed:'+m.moduleId]??JSON.stringify(m.configuration)));await refresh();setConfigurations(v=>{const copy={...v};delete copy['installed:'+m.moduleId];return copy;});setConfigurationResults(v=>({...v,[m.moduleId]:{saved:true}}));}
    catch(e){setConfigurationResults(v=>({...v,[m.moduleId]:{error:configurationErrorMessage((e as Error).message)}}));}
    finally{setBusy(false);}
  }
  function configuration(p: any): string {
    if (configurations[p.packageId] !== undefined) return configurations[p.packageId]!;
    const installed = manager?.installed.find((m: any) => m.moduleId === p.manifest.moduleId);
    if (installed) return JSON.stringify(installed.configuration, null, 2);
    const properties = p.manifest.configurationSchema.properties ?? {};
    return JSON.stringify(Object.fromEntries(Object.entries(properties).filter(([, value]) => Object.hasOwn(value as object, 'default')).map(([key, value]) => [key, key==='currency' ? currency : (value as any).default])), null, 2);
  }
  const installedScope = manager?.installed.find((m: any) => m.moduleId === scopeModule);
  return <div className="module-console">
    {administrator&&!screenKey&&mode==='administration'&&!manager&&!error?<section role="status">Loading Module Manager…</section>:null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {administrator && manager && !screenKey && ['all','administration'].includes(mode) ? <section><div className="section-heading"><h2>Module Manager</h2><button onClick={() => void refresh().catch(e => setError(e.message))}>Refresh modules</button></div>
      <p>Only signed packages from configured publishers can be installed. Modules run outside this Worker core.</p>
      <h3>Installed modules</h3>{manager.installed.length ? manager.installed.map((m: any) => <div className="request-card" key={m.moduleId} data-testid={`installed-${m.moduleId}`}>
        <strong>{m.manifest.name}</strong> {m.version} · <span>{m.state}</span>{m.errorCode ? <p role="alert">Installation failed: {m.errorCode}. Data was retained. Review the package and use explicit recovery below.</p> : null}
        <details><summary>Module configuration</summary><ConfigurationFields schema={m.manifest.configurationSchema} value={safeObject(configurations['installed:'+m.moduleId]??JSON.stringify(m.configuration))} onChange={v=>{setConfigurations({...configurations,['installed:'+m.moduleId]:JSON.stringify(v)});setConfigurationResults(r=>({...r,[m.moduleId]:{}}));}}/><details><summary>Advanced configuration JSON</summary><label>Installed configuration for {m.moduleId}<textarea aria-label={`Installed configuration for ${m.moduleId}`} value={configurations['installed:'+m.moduleId]??JSON.stringify(m.configuration,null,2)} onChange={e=>{setConfigurations({...configurations,['installed:'+m.moduleId]:e.target.value});setConfigurationResults(r=>({...r,[m.moduleId]:{}}));}} /></label></details>{typeof m.configuration?.mode==='string'?<p>Saved mode: <strong>{m.configuration.mode}</strong></p>:null}<p>Form changes remain unsaved until the save is confirmed.</p>{configurationResults[m.moduleId]?.error?<p role="alert" className="form-error">{configurationResults[m.moduleId]?.error}</p>:null}{configurationResults[m.moduleId]?.saved?<p role="status">Configuration saved and applied.</p>:null}<button disabled={busy} onClick={()=>void saveConfiguration(m)}>Save configuration for {m.manifest.name}</button></details>
        {['installed', 'disabled'].includes(m.state) ? <button disabled={busy} onClick={() => void act(() => api(`/v3/modules/${encodeURIComponent(m.moduleId)}/lifecycle`, 'POST', { action: 'activate' }))}>Activate {m.manifest.name}</button> : null}
        {m.state === 'active' ? <button disabled={busy} onClick={() => void act(() => api(`/v3/modules/${encodeURIComponent(m.moduleId)}/lifecycle`, 'POST', { action: 'deactivate' }))}>Deactivate {m.manifest.name}</button> : null}
      </div>) : <p>No installed module packages.</p>}
      <h3>Available modules</h3>{manager.available.length ? manager.available.map((p: any) => {const installation=manager.installed.find((m:any)=>m.moduleId===p.manifest?.moduleId);const installAction=moduleInstallAction(installation,p.manifest?.version??'');return <div className="request-card" key={p.packageId} data-testid={`package-${p.packageId}`}>
        <strong>{p.manifest?.name ?? p.packageId}</strong> {p.manifest?.version} · {p.trusted ? 'Publisher verified' : 'Untrusted'} · {p.compatible ? 'Compatible' : 'Incompatible'}
        {p.error ? <p>{p.error}</p> : null}
        {p.manifest ? <details><summary>Package details</summary><pre>{JSON.stringify(p.manifest, null, 2)}</pre><p>Image: <code>{p.imageId}</code></p></details> : null}
        {installAction.reason?<p className="muted">{installAction.reason}</p>:null}{p.trusted && p.compatible && installAction.enabled ? <><ConfigurationFields schema={p.manifest.configurationSchema} value={safeObject(configuration(p))} onChange={v=>setConfigurations({...configurations,[p.packageId]:JSON.stringify(v)})}/><details><summary>Advanced configuration JSON</summary><label>Configuration for {p.packageId}<textarea aria-label={`Configuration for ${p.packageId}`} rows={3} value={configuration(p)} onChange={e => setConfigurations({ ...configurations, [p.packageId]: e.target.value })} /></label></details>
          <button disabled={busy} onClick={() => void act(() => api('/v3/modules/install', 'POST', { packageId: p.packageId, operationId: crypto.randomUUID(), configuration: JSON.parse(configuration(p)),
            ...moduleInstallIntent(manager.installed.find((m:any)=>m.moduleId===p.manifest.moduleId),p.manifest.version) }))}>
            {installAction.label} {p.manifest.name}</button></> : null}
      </div>;}) : <p>No trusted module packages have been published.</p>}
      {manager.installed.length ? <details><summary>Module user permissions</summary><p>Local administrators manage modules. Module users receive only explicitly granted module API permissions.</p>
        <div className="form-grid"><label>Module user<select aria-label="Module user" value={scopeAccount} onChange={e => setScopeAccount(e.target.value)}><option value="">Select user</option>{accounts.filter(a => a.role === 'module_user').map(a => <option key={a.account_id} value={a.account_id}>{a.username}</option>)}</select></label>
          <label>Permission module<select aria-label="Permission module" value={scopeModule} onChange={e => { setScopeModule(e.target.value); setScopePermissions([]); }}><option value="">Select module</option>{manager.installed.map((m: any) => <option key={m.moduleId} value={m.moduleId}>{m.manifest.name}</option>)}</select></label></div>
        {Array.from(new Set<string>(installedScope?.manifest.api.map((a: ApiContribution) => a.permission) ?? [])).map(p => <label className="checkbox" key={p}><input type="checkbox" checked={scopePermissions.includes(p)} onChange={e => setScopePermissions(e.target.checked ? [...scopePermissions, p] : scopePermissions.filter(v => v !== p))} />{p}</label>)}
        <button disabled={!scopeAccount || !scopeModule || busy} onClick={() => void act(() => api('/v3/modules/permissions', 'PUT', { accountId: scopeAccount, moduleId: scopeModule, permissions: scopePermissions }))}>Save module permissions</button>
      </details> : null}
    </section> : null}
    {administrator&&['all','developer'].includes(mode)?<><SmartModules api={api}/><section><h2>Module manifests and schemas</h2>{manager?.installed.map((m:any)=><details key={m.moduleId}><summary>{m.manifest.name} {m.version}</summary><pre>{JSON.stringify(m.manifest,null,2)}</pre></details>)}</section></>:null}
    {['all','business'].includes(mode) && !screenKey ? <section><h2>Start here</h2><div className="metric-grid">{modules.flatMap(m=>m.ui.filter(s=>s.entry).map(s=>{const href=screenDestination(modules,m.moduleId,s.screenId);return href?<article key={m.moduleId+s.screenId}><h3><a href={href}>{screenLabel(m,s)}</a></h3><p>{s.entry!.description}</p><small>Open for current status and evidence.</small></article>:null;}))}</div><details><summary>All business applications</summary><p>Open an installed application. Your permissions determine available screens and actions.</p>{Array.from(new Set(modules.flatMap(m=>m.ui.filter(s=>!['Connections','Administration','Integration diagnostics'].includes(screenGroup(m,s))).map(s=>screenGroup(m,s))))).map(group=><div key={group}><h3>{group}</h3><nav className="app-links" aria-label={group}>{modules.flatMap(m=>m.ui.filter(s=>screenGroup(m,s)===group).map(s=><a key={m.moduleId+'/'+s.screenId} href={'#/business/module/'+m.moduleId+'/'+s.screenId} onClick={()=>{setSelected(m.moduleId+'/'+s.screenId);onNavigate?.(m.moduleId+'/'+s.screenId);}}>{contextualScreenLabel(modules,m,s)}</a>))}</nav></div>)}{!modules.length?<p>No business applications are available for your account. Ask a local administrator to install modules or grant permissions.</p>:null}</details></section>:null}
    {['all','business','administration','developer'].includes(mode) ? modules.flatMap(m => m.ui.filter(s => selected === m.moduleId + '/' + s.screenId && (mode==='all'||mode==='business'&&!['Connections','Administration','Integration diagnostics'].includes(screenGroup(m,s))||administrator&&mode==='administration'&&['Connections','Administration'].includes(screenGroup(m,s))||administrator&&mode==='developer'&&screenGroup(m,s)==='Integration diagnostics')).map(s => <ModuleScreen key={selected} api={api} module={m} screen={s} modules={modules} currency={m.currency??currency} />)) : null}
  </div>;
}
export function ModuleScreen({ api, module, screen, currency, modules=[module] }: { api: Api; module: DiscoveredModule; screen: ScreenContribution; currency:string; modules?:DiscoveredModule[] }) {
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState('');
  const [report,setReport]=useState<any>(); const [from,setFrom]=useState('');const [to,setTo]=useState('');
  const defaults=()=>moduleFormDefaults(screen.fields,currency);
  const [values, setValues] = useState<Record<string, any>>(defaults);
  const [query,setQuery]=useState(''); const [status,setStatus]=useState('');const [filters,setFilters]=useState({q:'',status:''}); const [loading,setLoading]=useState(Boolean(screen.listOperation&&module.api.some(a=>a.operationId===screen.listOperation)));
  const [editing, setEditing] = useState<any>();
  const [referenceChoices,setReferenceChoices]=useState<Record<string,ReferenceChoices>>({});
  const [workflowContext,setWorkflowContext]=useState<WorkflowFieldContext>({});
  const [workflowFormOpen,setWorkflowFormOpen]=useState(false);
  const hasWorkflow=screen.fields.some(f=>f.format==='workflow');
  useEffect(()=>{if(!hasWorkflow)return;let disposed=false;setWorkflowContext({approvalPermission:module.approvalServices?.reviewerPermission??'',bindings:[],discoveryLoading:true});void api('/v8/smart-modules').then(registry=>{if(!disposed)setWorkflowContext({approvalPermission:module.approvalServices?.reviewerPermission??'',bindings:workflowBindingChoices(registry,module.moduleId)});}).catch(e=>{if(!disposed)setWorkflowContext({approvalPermission:module.approvalServices?.reviewerPermission??'',bindings:[],discoveryError:(e as Error).message});});return()=>{disposed=true;};},[hasWorkflow,module.moduleId,module.version,module.approvalServices?.reviewerPermission]);
  const triggerDiscovery=hasWorkflow?module.workflowServices?.triggerDiscovery:undefined;
  const triggerSelection=triggerDiscovery?values[triggerDiscovery.selectionField]:undefined;
  const triggerKey=JSON.stringify({module:module.moduleId,version:module.version,declaration:triggerDiscovery,selection:triggerSelection,api:module.api});
  const [triggerContext,setTriggerContext]=useState<{key:string;fields:WorkflowFieldContext['fields'];error:string;loading?:boolean}>();
  useEffect(()=>{if(!triggerDiscovery)return;let disposed=false;setTriggerContext({key:triggerKey,fields:{},error:'',loading:true});
    const operation=module.api.find(a=>a.operationId===triggerDiscovery.operationId&&a.method==='GET'&&!a.path.includes(':')&&a.query?.includes('q'));
    if(!operation||typeof triggerSelection!=='string'||!triggerSelection.trim()){setTriggerContext({key:triggerKey,fields:{},error:operation?'Choose a declared trigger before designing.':'Trigger discovery is not available to this account.'});return;}
    void api('/v3/modules/'+encodeURIComponent(module.moduleId)+'/api'+operation.path+'?q='+encodeURIComponent(triggerSelection)).then(response=>{const fields=workflowTriggerFields(response,triggerSelection,triggerDiscovery.maxAgeMs);if(!disposed)setTriggerContext({key:triggerKey,fields,error:''});}).catch(error=>{if(!disposed)setTriggerContext({key:triggerKey,fields:{},error:(error as Error).message});});return()=>{disposed=true;};
  },[triggerKey]);
  function contextFor(field:typeof screen.fields[number]):WorkflowFieldContext{
    const trigger=triggerDiscovery?(triggerContext?.key===triggerKey?triggerContext:{fields:{},error:'',loading:true}):{fields:{},error:''};
    return{...workflowContext,discoveryLoading:Boolean(workflowContext.discoveryLoading||trigger.loading),fields:{...trigger.fields,...workflowActionFields(values[field.name],workflowContext.bindings??[],triggerDiscovery?.maxAgeMs??60000)},discoveryError:[workflowContext.discoveryError,trigger.error].filter(Boolean).join(' ')};
  }
  const referenceKey=JSON.stringify({module:module.moduleId,api:module.api,fields:moduleReferenceFields(screen.fields)});
  async function refreshReferences(){
    const fields=moduleReferenceFields(screen.fields);setReferenceChoices(Object.fromEntries(fields.map(({path})=>[path,{status:'loading',choices:[],truncated:false,message:''}])));
    const choices=await Promise.all(fields.map(async ({field,path})=>[path,await loadReferenceChoices(api,module.moduleId,module.api,field)] as const));setReferenceChoices(Object.fromEntries(choices));
  }
  useEffect(()=>{let disposed=false;const fields=moduleReferenceFields(screen.fields);setReferenceChoices(Object.fromEntries(fields.map(({path})=>[path,{status:'loading',choices:[],truncated:false,message:''}])));void Promise.all(fields.map(async ({field,path})=>[path,await loadReferenceChoices(api,module.moduleId,module.api,field)] as const)).then(choices=>{if(!disposed)setReferenceChoices(Object.fromEntries(choices));});return()=>{disposed=true;};},[referenceKey]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset,setOffset]=useState(0);const [nextOffset,setNextOffset]=useState<number|null>(null);
  const list = module.api.find(a => a.operationId === screen.listOperation);
  const preview = module.api.find(a=>a.operationId===screen.preview?.operationId);
  const create = module.api.find(a => a.operationId === screen.createOperation);
  const update = module.api.find(a => a.operationId === screen.updateOperation);
  const tabular=!screen.preview&&(screen.columns.length>0||Boolean(create||update||screen.actions?.length));
  const context=screenContext(screen,location.hash);
  const base = '/v3/modules/' + encodeURIComponent(module.moduleId) + '/api';
  async function refresh(background=false) {if(context.error){setError(context.error);setLoading(false);return;}if(!list){setLoading(false);return;}if(!background)setLoading(true);try { const result = await api(base + list.path+(()=>{const query=new URLSearchParams(moduleListQuery(list,{offset,q:filters.q,status:filters.status,from,to}).replace(/^\?/,''));if(context.value)query.set('recordId',context.value);return query.size?'?'+query.toString():'';})());setReport(result.report??(result.version===2?result:undefined)); setRecords(result.records??[]); setSummary(result.summary ?? '');setNextOffset(result.nextOffset??null);setError(''); } finally {setLoading(false);} }
  useEffect(() => { let disposed=false;let timer:ReturnType<typeof setTimeout>|undefined;async function poll(){try{await refresh(true);}catch(e){if(!disposed)setError((e as Error).message);}finally{if(!disposed&&screen.refreshMs)timer=setTimeout(poll,screen.refreshMs);}}void poll();return()=>{disposed=true;if(timer)clearTimeout(timer);}; }, [offset,screen.refreshMs,filters.q,filters.status]);
  const formCurrency=moduleFormCurrency(screen,values,referenceChoices,currency);
  const needsCurrency=moduleHasEditableMoney(screen.fields,values);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');if(preview){setReport(undefined);setSummary('');}
    try {
      if(!moduleReferenceCurrencyReady(screen,values,referenceChoices,currency))throw Error('Choose an authorized record and its matching currency before saving.');
      const operation = preview??(editing ? update! : create!);
      const body = moduleFormBody(screen.fields,values,referenceChoices,editing??{});
      if (editing && editing.revision !== undefined) body.revision = editing.revision;
      const result=await api(base + operation.path.replace(':id', encodeURIComponent(editing?.id ?? '')), operation.method, body);
      if(preview){setReport(result.report??(result.version===2?result:undefined));setSummary(result.summary??'');return;}
      setValues(defaults()); setEditing(undefined); setWorkflowFormOpen(false); await refresh();await refreshReferences();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section data-testid={`module-screen-${module.moduleId}`}><h2>{screenLabel(module,screen)}</h2>{module.mode?<p className="notice"><strong>{module.mode==='simulator'?'SIMULATOR — synthetic commerce':'LIVE connection — consequential actions require separate authorization'}</strong></p>:null}<p className="muted">{module.name} · {screen.preview?'Preview uses authorized application data.':'Changes are saved to this company local application.'}</p>{summary ? <p>{summary}</p> : null}{context.value||context.error?<p>{context.value?'Showing evidence for one selected order. ':''}<a href={screenDestination(modules,module.moduleId,screen.screenId)??'#'}>Show all records</a></p>:null}<nav aria-label="Related applications">{context.value?screen.rowLinks?.map(n=>{const href=screenDestination(modules,module.moduleId,n.screenId,context.value);return href?<a key={n.screenId} href={href}>{n.label}</a>:<span key={n.screenId}>{n.label} — unavailable to this account</span>;}):null}{screen.related?.map(n=>{const href=screenDestination(modules,n.moduleId,n.screenId);return href?<a key={n.moduleId+n.screenId} href={href}>{n.label}</a>:<span key={n.moduleId+n.screenId}>{n.label} — unavailable to this account</span>;})}</nav>
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {preview || create || editing && update ? <details className={hasWorkflow?"workflow-record-form":"record-form"} open={!hasWorkflow||workflowFormOpen||Boolean(editing)} onToggle={e=>{if(hasWorkflow)setWorkflowFormOpen(e.currentTarget.open);}}><summary hidden={!hasWorkflow}>{editing?"Edit workflow":"Create workflow"}</summary><form className="form-grid" onSubmit={save}>{screen.fields.filter(f=>!f.readOnly&&moduleFieldVisible(f,values)).map(f=><ModuleFormField key={f.name} workflowContext={f.format==='workflow'?contextFor(f):workflowContext} field={f} locked={Boolean(screen.currencyReference&&f.name==='currency')} value={screen.currencyReference&&f.name==='currency'&&!formCurrency?'':values[f.name]} currency={formCurrency??''} onChange={value=>setValues(old=>{const next={...old,[f.name]:value};if(f.name===screen.currencyReference&&screen.fields.some(field=>field.name==='currency'&&!field.readOnly)){const declared=referenceChoices[f.name]?.choices.find(c=>c.value===value)?.currency;if(declared)next.currency=declared;}return next;})} references={referenceChoices} reference={f.reference&&referenceOperation(module.moduleId,module.api,f)?referenceChoices[f.name]:undefined} onReload={()=>void refreshReferences()}/>)}<button disabled={busy||Boolean(screen.currencyReference&&needsCurrency&&!formCurrency)} type="submit">{preview?(screen.preview?.submitLabel??'Preview'):(editing?'Save changes':'Create record')}</button>{editing?<button type="button" onClick={()=>{setEditing(undefined);setValues(defaults());setWorkflowFormOpen(false);}}>Cancel edit</button>:null}</form></details>:null}
    {list?.query?.includes('from')&&list?.query?.includes('to')?<form className="form-grid" onSubmit={e=>{e.preventDefault();void refresh().catch(e=>setError(e.message));}}><label>From (local time)<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (exclusive, local time)<input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label><button>Apply reporting period</button></form>:null}
    <ModuleReportView report={report} currency={currency} navigation={module.ui.map(s=>({screenId:s.screenId,label:screenLabel(module,s),href:'#/'+(['Connections','Administration'].includes(screenGroup(module,s))?'administration':screenGroup(module,s)==='Integration diagnostics'?'developer':'business')+'/module/'+module.moduleId+'/'+s.screenId}))}/>
    {list&&(list.query?.includes('q')||list.query?.includes('status'))?<form className="form-grid" onSubmit={e=>{e.preventDefault();setOffset(0);setFilters({q:query,status});}}>{list.query?.includes('q')?<label>Search all records<input aria-label="Search all records" type="search" maxLength={300} value={query} onChange={e=>setQuery(e.target.value)}/></label>:null}{list.query?.includes('status')?<label>Filter by status<input aria-label="Filter by status" maxLength={120} value={status} onChange={e=>setStatus(e.target.value)}/></label>:null}<button type="submit">Apply filters</button></form>:null}
    {tabular?<>{!list?.query?.includes('q')?<label>Search this page<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>:null}<button onClick={() => void refresh().catch(e => setError(e.message))}>Refresh records</button>
    <div className="module-table"><table><thead><tr>{screen.columns.map(c => <th key={c}>{humanize(screen.fields.find(f => f.name === c)?.label ?? c).replace(/ Cents$/,'').replace(/ Id$/,' reference')}</th>)}<th>Actions</th></tr></thead><tbody>{records.filter(record=>list?.query?.includes('q')||JSON.stringify(record).toLowerCase().includes(query.toLowerCase())).map(record => <tr key={record.id}>{screen.columns.map(c => <td key={c}>{screen.fields.find(f=>f.name===c)?.reference?<ModuleReferenceValue value={record[c]} reference={referenceChoices[c]}/>:record[c]===null&&['error','warning','last_error'].includes(c)?'None':record[c]!==null&&typeof record[c]==='object'?<details><summary>Details</summary><ReadableValue value={record[c]} currency={record.currency}/></details>:(/Cents$/.test(c)||screen.fields.find(f=>f.name===c)?.format==='money')?<Money cents={record[c]} currency={record.currency??currency}/>:/status|state|ownership/i.test(c)?<span className="badge">{humanize(String(record[c]??'Unknown').toLowerCase())}</span>:typeof record[c]==='string'&&/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(record[c])?<details><summary>Reference · {record[c].slice(-8)}</summary><code>{record[c]}</code></details>:typeof record[c]==='string'&&record[c].length>120?<details><summary>Read details</summary><p className="long-cell-text">{record[c]}</p></details>:c==='error'&&typeof record[c]==='string'?humanize(record[c].toLowerCase()):<ModuleEvidenceValue value={record[c]} name={c} currency={record.currency??currency}/>}</td>)}<td>{screen.rowLinks?.map(n=>{const href=screenDestination(modules,module.moduleId,n.screenId,record[n.recordField]);return href?<p key={n.screenId}><a href={href}>{n.label}</a></p>:<p key={n.screenId}>{n.label} — record or destination unavailable</p>;})}{update?<button onClick={() => { setWorkflowFormOpen(true); setEditing(record); setValues(moduleEditValues(record,screen.fields)); }}>Edit record</button>:null}{(screen.actions??[]).map(action=>{const op=module.api.find(a=>a.operationId===action.operationId);return op&&action.availableModes&&!action.availableModes.includes(module.mode!)?<p key={op.operationId}>{action.unavailableReason}</p>:op?<button key={op.operationId} disabled={busy} onClick={()=>{if((action.confirmation||/authoriz|approve|place|confirm|submit|cancel|dispatch|production|fulfill|release/i.test(action.label))&&!window.confirm(action.confirmation??(action.label+'? Review the selected record and required approvals before continuing.')))return;setBusy(true);setError('');void api(base+op.path.replace(':id',encodeURIComponent(record.id)),op.method,{revision:record.revision,requestId:crypto.randomUUID()}).then(()=>refresh()).then(()=>refreshReferences()).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>{action.label}</button>:null;})}</td></tr>)}</tbody></table></div></>:list?<button onClick={()=>void refresh().catch(e=>setError(e.message))}>Refresh report</button>:null}
    {tabular&&list?.query?.includes('offset')?<div><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous records</button><button disabled={nextOffset===null} onClick={()=>setOffset(nextOffset!)}>Next records</button></div>:null}
    {loading?<p role="status">Loading records…</p>:tabular&&!records.length ? <p>{create?'No records yet. Create the first record using the form above.':'No records are available in this view.'}</p> : null}
  </section>;
}
