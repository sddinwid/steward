import {configurationErrorMessage,saveModuleConfiguration,moduleInstallIntent} from './module-configuration.js';
import {ModuleReportView} from './module-report.js';
import {ModuleFormField,ModuleReferenceValue} from './module-field.js';
import {moduleFormDefaults,moduleEditValues,moduleFormBody,moduleListQuery,moduleFieldVisible,moduleReferenceFields,moduleFormCurrency,loadReferenceChoices,referenceOperation,type ReferenceChoices} from './module-fields.js';
import { useEffect, useState, type FormEvent } from 'react';
import { SmartModules } from './smart-modules.js';
import { screenLabel, screenGroup, Money, ReadableValue, ConfigurationFields, humanize } from './presentation.js';
import type { ApiContribution, ModulePackageManifest, ScreenContribution } from '@steward/module-sdk';
const safeObject=(text:string)=>{try{return JSON.parse(text);}catch{return {};}};
type Api = <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;
export interface DiscoveredModule { moduleId: string; version: string; name: string; mode?:'simulator'|'live'; currency?:string; programServices?:{contractVersion:1;domain:string;syntheticOnly:true}; economicServices?:NonNullable<ModulePackageManifest['economicServices']>; api: ApiContribution[]; ui: ScreenContribution[] }
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
      <h3>Available modules</h3>{manager.available.length ? manager.available.map((p: any) => <div className="request-card" key={p.packageId} data-testid={`package-${p.packageId}`}>
        <strong>{p.manifest?.name ?? p.packageId}</strong> {p.manifest?.version} · {p.trusted ? 'Publisher verified' : 'Untrusted'} · {p.compatible ? 'Compatible' : 'Incompatible'}
        {p.error ? <p>{p.error}</p> : null}
        {p.manifest ? <details><summary>Package details</summary><pre>{JSON.stringify(p.manifest, null, 2)}</pre><p>Image: <code>{p.imageId}</code></p></details> : null}
        {p.trusted && p.compatible ? <><ConfigurationFields schema={p.manifest.configurationSchema} value={safeObject(configuration(p))} onChange={v=>setConfigurations({...configurations,[p.packageId]:JSON.stringify(v)})}/><details><summary>Advanced configuration JSON</summary><label>Configuration for {p.packageId}<textarea aria-label={`Configuration for ${p.packageId}`} rows={3} value={configuration(p)} onChange={e => setConfigurations({ ...configurations, [p.packageId]: e.target.value })} /></label></details>
          <button disabled={busy} onClick={() => void act(() => api('/v3/modules/install', 'POST', { packageId: p.packageId, operationId: crypto.randomUUID(), configuration: JSON.parse(configuration(p)),
            ...moduleInstallIntent(manager.installed.find((m:any)=>m.moduleId===p.manifest.moduleId),p.manifest.version) }))}>
            {manager.installed.some((m: any) => m.moduleId === p.manifest.moduleId && ['failed', 'installing'].includes(m.state)) ? 'Recover' : manager.installed.some((m: any) => m.moduleId === p.manifest.moduleId && m.version !== p.manifest.version) ? 'Upgrade to' : 'Install'} {p.manifest.name}</button></> : null}
      </div>) : <p>No trusted module packages have been published.</p>}
      {manager.installed.length ? <details><summary>Module user permissions</summary><p>Local administrators manage modules. Module users receive only explicitly granted module API permissions.</p>
        <div className="form-grid"><label>Module user<select aria-label="Module user" value={scopeAccount} onChange={e => setScopeAccount(e.target.value)}><option value="">Select user</option>{accounts.filter(a => a.role === 'module_user').map(a => <option key={a.account_id} value={a.account_id}>{a.username}</option>)}</select></label>
          <label>Permission module<select aria-label="Permission module" value={scopeModule} onChange={e => { setScopeModule(e.target.value); setScopePermissions([]); }}><option value="">Select module</option>{manager.installed.map((m: any) => <option key={m.moduleId} value={m.moduleId}>{m.manifest.name}</option>)}</select></label></div>
        {Array.from(new Set<string>(installedScope?.manifest.api.map((a: ApiContribution) => a.permission) ?? [])).map(p => <label className="checkbox" key={p}><input type="checkbox" checked={scopePermissions.includes(p)} onChange={e => setScopePermissions(e.target.checked ? [...scopePermissions, p] : scopePermissions.filter(v => v !== p))} />{p}</label>)}
        <button disabled={!scopeAccount || !scopeModule || busy} onClick={() => void act(() => api('/v3/modules/permissions', 'PUT', { accountId: scopeAccount, moduleId: scopeModule, permissions: scopePermissions }))}>Save module permissions</button>
      </details> : null}
    </section> : null}
    {administrator&&['all','developer'].includes(mode)?<><SmartModules api={api}/><section><h2>Module manifests and schemas</h2>{manager?.installed.map((m:any)=><details key={m.moduleId}><summary>{m.manifest.name} {m.version}</summary><pre>{JSON.stringify(m.manifest,null,2)}</pre></details>)}</section></>:null}
    {['all','business'].includes(mode) && !screenKey ? <section><h2>Business applications</h2><p>Open an installed application. Your permissions determine available screens and actions.</p>{Array.from(new Set(modules.flatMap(m=>m.ui.filter(s=>!['Connections','Administration','Integration diagnostics'].includes(screenGroup(m,s))).map(s=>screenGroup(m,s))))).map(group=><div key={group}><h3>{group}</h3><nav className="app-links" aria-label={group}>{modules.flatMap(m=>m.ui.filter(s=>screenGroup(m,s)===group).map(s=><a key={m.moduleId+'/'+s.screenId} href={'#/business/module/'+m.moduleId+'/'+s.screenId} onClick={()=>{setSelected(m.moduleId+'/'+s.screenId);onNavigate?.(m.moduleId+'/'+s.screenId);}}>{screenLabel(m,s)}</a>))}</nav></div>)}{!modules.length?<p>No business applications are available for your account. Ask a local administrator to install modules or grant permissions.</p>:null}</section>:null}
    {['all','business','administration','developer'].includes(mode) ? modules.flatMap(m => m.ui.filter(s => selected === m.moduleId + '/' + s.screenId && (mode==='all'||mode==='business'&&!['Connections','Administration','Integration diagnostics'].includes(screenGroup(m,s))||administrator&&mode==='administration'&&['Connections','Administration'].includes(screenGroup(m,s))||administrator&&mode==='developer'&&screenGroup(m,s)==='Integration diagnostics')).map(s => <ModuleScreen key={selected} api={api} module={m} screen={s} currency={m.currency??currency} />)) : null}
  </div>;
}
export function ModuleScreen({ api, module, screen, currency }: { api: Api; module: DiscoveredModule; screen: ScreenContribution; currency:string }) {
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState('');
  const [report,setReport]=useState<any>(); const [from,setFrom]=useState('');const [to,setTo]=useState('');
  const defaults=()=>moduleFormDefaults(screen.fields,currency);
  const [values, setValues] = useState<Record<string, any>>(defaults);
  const [query,setQuery]=useState(''); const [status,setStatus]=useState('');const [filters,setFilters]=useState({q:'',status:''}); const [loading,setLoading]=useState(Boolean(screen.listOperation&&module.api.some(a=>a.operationId===screen.listOperation)));
  const [editing, setEditing] = useState<any>();
  const [referenceChoices,setReferenceChoices]=useState<Record<string,ReferenceChoices>>({});
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
  const base = '/v3/modules/' + encodeURIComponent(module.moduleId) + '/api';
  async function refresh(background=false) {if(!list){setLoading(false);return;}if(!background)setLoading(true);try { const result = await api(base + list.path+moduleListQuery(list,{offset,q:filters.q,status:filters.status,from,to}));setReport(result.report??(result.version===2?result:undefined)); setRecords(result.records??[]); setSummary(result.summary ?? '');setNextOffset(result.nextOffset??null);setError(''); } finally {setLoading(false);} }
  useEffect(() => { let disposed=false;let timer:ReturnType<typeof setTimeout>|undefined;async function poll(){try{await refresh(true);}catch(e){if(!disposed)setError((e as Error).message);}finally{if(!disposed&&screen.refreshMs)timer=setTimeout(poll,screen.refreshMs);}}void poll();return()=>{disposed=true;if(timer)clearTimeout(timer);}; }, [offset,screen.refreshMs,filters.q,filters.status]);
  const formCurrency=moduleFormCurrency(screen,values,referenceChoices,currency);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');if(preview){setReport(undefined);setSummary('');}
    try {
      if(screen.currencyReference&&(!formCurrency||screen.fields.some(f=>f.name==='currency'&&!f.readOnly)&&values.currency!==formCurrency))throw Error('Choose an authorized record and its matching currency before saving.');
      const operation = preview??(editing ? update! : create!);
      const body = moduleFormBody(screen.fields,values,referenceChoices,editing??{});
      if (editing && editing.revision !== undefined) body.revision = editing.revision;
      const result=await api(base + operation.path.replace(':id', encodeURIComponent(editing?.id ?? '')), operation.method, body);
      if(preview){setReport(result.report??(result.version===2?result:undefined));setSummary(result.summary??'');return;}
      setValues(defaults()); setEditing(undefined); await refresh();await refreshReferences();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section data-testid={`module-screen-${module.moduleId}`}><h2>{screenLabel(module,screen)}</h2>{module.mode?<p className="notice"><strong>{module.mode==='simulator'?'SIMULATOR — synthetic commerce':'LIVE connection — consequential actions require separate authorization'}</strong></p>:null}<p className="muted">{module.name} · {screen.preview?'Preview uses authorized application data.':'Changes are saved to this company local application.'}</p>{summary ? <p>{summary}</p> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {preview || create || editing && update ? <form className="form-grid" onSubmit={save}>{screen.fields.filter(f=>!f.readOnly&&moduleFieldVisible(f,values)).map(f=><ModuleFormField key={f.name} field={f} value={values[f.name]} currency={formCurrency??''} onChange={value=>setValues(old=>{const next={...old,[f.name]:value};if(f.name===screen.currencyReference&&screen.fields.some(field=>field.name==='currency'&&!field.readOnly)){const declared=referenceChoices[f.name]?.choices.find(c=>c.value===value)?.currency;if(declared)next.currency=declared;}return next;})} references={referenceChoices} reference={f.reference&&referenceOperation(module.moduleId,module.api,f)?referenceChoices[f.name]:undefined} onReload={()=>void refreshReferences()}/>)}<button disabled={busy||Boolean(screen.currencyReference&&!formCurrency)} type="submit">{preview?(screen.preview?.submitLabel??'Preview'):(editing?'Save changes':'Create record')}</button>{editing?<button type="button" onClick={()=>{setEditing(undefined);setValues(defaults());}}>Cancel edit</button>:null}</form>:null}
    {list?.query?.includes('from')&&list?.query?.includes('to')?<form className="form-grid" onSubmit={e=>{e.preventDefault();void refresh().catch(e=>setError(e.message));}}><label>From (local time)<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (exclusive, local time)<input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label><button>Apply reporting period</button></form>:null}
    <ModuleReportView report={report} currency={currency} navigation={module.ui.map(s=>({screenId:s.screenId,label:screenLabel(module,s),href:'#/'+(['Connections','Administration'].includes(screenGroup(module,s))?'administration':screenGroup(module,s)==='Integration diagnostics'?'developer':'business')+'/module/'+module.moduleId+'/'+s.screenId}))}/>
    {list&&(list.query?.includes('q')||list.query?.includes('status'))?<form className="form-grid" onSubmit={e=>{e.preventDefault();setOffset(0);setFilters({q:query,status});}}>{list.query?.includes('q')?<label>Search all records<input aria-label="Search all records" type="search" maxLength={300} value={query} onChange={e=>setQuery(e.target.value)}/></label>:null}{list.query?.includes('status')?<label>Filter by status<input aria-label="Filter by status" maxLength={120} value={status} onChange={e=>setStatus(e.target.value)}/></label>:null}<button type="submit">Apply filters</button></form>:null}
    {tabular?<>{!list?.query?.includes('q')?<label>Search this page<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>:null}<button onClick={() => void refresh().catch(e => setError(e.message))}>Refresh records</button>
    <div className="module-table"><table><thead><tr>{screen.columns.map(c => <th key={c}>{humanize(screen.fields.find(f => f.name === c)?.label ?? c).replace(/ Cents$/,'').replace(/ Id$/,' reference')}</th>)}<th>Actions</th></tr></thead><tbody>{records.filter(record=>list?.query?.includes('q')||JSON.stringify(record).toLowerCase().includes(query.toLowerCase())).map(record => <tr key={record.id}>{screen.columns.map(c => <td key={c}>{screen.fields.find(f=>f.name===c)?.reference?<ModuleReferenceValue value={record[c]} reference={referenceChoices[c]}/>:record[c]===null&&['error','warning','last_error'].includes(c)?'None':record[c]!==null&&typeof record[c]==='object'?<details><summary>Details</summary><ReadableValue value={record[c]} currency={record.currency}/></details>:(/Cents$/.test(c)||screen.fields.find(f=>f.name===c)?.format==='money')?<Money cents={record[c]} currency={record.currency??currency}/>:/status|state|ownership/i.test(c)?<span className="badge">{humanize(String(record[c]??'Unknown').toLowerCase())}</span>:typeof record[c]==='string'&&/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(record[c])?<details><summary>Reference · {record[c].slice(-8)}</summary><code>{record[c]}</code></details>:typeof record[c]==='string'&&record[c].length>120?<details><summary>Read details</summary><p className="long-cell-text">{record[c]}</p></details>:c==='error'&&typeof record[c]==='string'?humanize(record[c].toLowerCase()):<ReadableValue value={record[c]} name={c} currency={record.currency??currency}/>}</td>)}<td>{update?<button onClick={() => { setEditing(record); setValues(moduleEditValues(record,screen.fields)); }}>Edit record</button>:null}{(screen.actions??[]).map(action=>{const op=module.api.find(a=>a.operationId===action.operationId);return op?<button key={op.operationId} disabled={busy} onClick={()=>{if((action.confirmation||/authoriz|approve|place|confirm|submit|cancel|dispatch|production|fulfill|release/i.test(action.label))&&!window.confirm(action.confirmation??(action.label+'? Review the selected record and required approvals before continuing.')))return;setBusy(true);setError('');void api(base+op.path.replace(':id',encodeURIComponent(record.id)),op.method,{revision:record.revision,requestId:crypto.randomUUID()}).then(()=>refresh()).then(()=>refreshReferences()).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>{action.label}</button>:null;})}</td></tr>)}</tbody></table></div></>:list?<button onClick={()=>void refresh().catch(e=>setError(e.message))}>Refresh report</button>:null}
    {tabular&&list?.query?.includes('offset')?<div><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous records</button><button disabled={nextOffset===null} onClick={()=>setOffset(nextOffset!)}>Next records</button></div>:null}
    {loading?<p role="status">Loading records…</p>:tabular&&!records.length ? <p>No records yet. Create the first record using the form above, if authorized.</p> : null}
  </section>;
}
