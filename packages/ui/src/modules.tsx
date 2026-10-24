import { useEffect, useState, type FormEvent } from 'react';
import { SmartModules } from './smart-modules.js';
import { screenLabel, screenGroup, Money, ReadableValue, StructuredValue, ConfigurationFields, humanize } from './presentation.js';
import type { ApiContribution, ModulePackageManifest, ScreenContribution } from '@steward/module-sdk';
const safeObject=(text:string)=>{try{return JSON.parse(text);}catch{return {};}};
type Api = <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;
export interface DiscoveredModule { moduleId: string; version: string; name: string; mode?:'simulator'|'live'; currency?:string; api: ApiContribution[]; ui: ScreenContribution[] }
export function ModuleConsole({ api, administrator, mode = 'all', screenKey, onNavigate, currency = 'USD' }: { api: Api; administrator: boolean; mode?: 'all' | 'business' | 'administration' | 'developer'; screenKey?: string; onNavigate?: (key:string)=>void; currency?:string }) {
  const [manager, setManager] = useState<any>();
  const [modules, setModules] = useState<DiscoveredModule[]>([]);
  const [selected, setSelected] = useState(screenKey ?? '');
  useEffect(()=>{setSelected(screenKey??'');},[screenKey]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [configurations, setConfigurations] = useState<Record<string, string>>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [scopeAccount, setScopeAccount] = useState('');
  const [scopeModule, setScopeModule] = useState('');
  const [scopePermissions, setScopePermissions] = useState<string[]>([]);
  async function refresh() {
    const discovered = await api('/v3/modules/discovery'); setModules(discovered.modules);
    if (administrator) {
      const [m, a] = await Promise.all([api('/v3/modules'), api('/v3/modules/accounts')]); setManager(m); setAccounts(a.accounts);
    }
  }
  useEffect(() => { void refresh().catch(e => { setError(String(e.message).includes('Route ')?'The module runtime is not configured. Ask an operator to provision the trusted module host.':e.message); }); }, []);
  async function act(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); } catch (e) { setError((e as Error).message); } finally { await refresh().catch(e => setError(e.message)); setBusy(false); } }
  function configuration(p: any): string {
    if (configurations[p.packageId] !== undefined) return configurations[p.packageId]!;
    const installed = manager?.installed.find((m: any) => m.moduleId === p.manifest.moduleId);
    if (installed) return JSON.stringify(installed.configuration, null, 2);
    const properties = p.manifest.configurationSchema.properties ?? {};
    return JSON.stringify(Object.fromEntries(Object.entries(properties).filter(([, value]) => Object.hasOwn(value as object, 'default')).map(([key, value]) => [key, key==='currency' ? currency : (value as any).default])), null, 2);
  }
  const installedScope = manager?.installed.find((m: any) => m.moduleId === scopeModule);
  return <div className="module-console">
    {administrator&&mode==='administration'&&!manager&&!error?<section role="status">Loading Module Manager…</section>:null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {administrator && manager && ['all','administration'].includes(mode) ? <section><div className="section-heading"><h2>Module Manager</h2><button onClick={() => void refresh().catch(e => setError(e.message))}>Refresh modules</button></div>
      <p>Only signed packages from configured publishers can be installed. Modules run outside this Worker core.</p>
      <h3>Installed modules</h3>{manager.installed.length ? manager.installed.map((m: any) => <div className="request-card" key={m.moduleId} data-testid={`installed-${m.moduleId}`}>
        <strong>{m.manifest.name}</strong> {m.version} · <span>{m.state}</span>{m.errorCode ? <p role="alert">Installation failed: {m.errorCode}. Data was retained. Review the package and use explicit recovery below.</p> : null}
        <details><summary>Module configuration</summary><ConfigurationFields schema={m.manifest.configurationSchema} value={safeObject(configurations['installed:'+m.moduleId]??JSON.stringify(m.configuration))} onChange={v=>setConfigurations({...configurations,['installed:'+m.moduleId]:JSON.stringify(v)})}/><details><summary>Advanced configuration JSON</summary><label>Installed configuration for {m.moduleId}<textarea aria-label={`Installed configuration for ${m.moduleId}`} value={configurations['installed:'+m.moduleId]??JSON.stringify(m.configuration,null,2)} onChange={e=>setConfigurations({...configurations,['installed:'+m.moduleId]:e.target.value})} /></label></details><button disabled={busy} onClick={()=>void act(()=>api(`/v3/modules/${encodeURIComponent(m.moduleId)}/configuration`,'PUT',{configuration:JSON.parse(configurations['installed:'+m.moduleId]??JSON.stringify(m.configuration))}))}>Save configuration for {m.manifest.name}</button></details>
        {['installed', 'disabled'].includes(m.state) ? <button disabled={busy} onClick={() => void act(() => api(`/v3/modules/${encodeURIComponent(m.moduleId)}/lifecycle`, 'POST', { action: 'activate' }))}>Activate {m.manifest.name}</button> : null}
        {m.state === 'active' ? <button disabled={busy} onClick={() => void act(() => api(`/v3/modules/${encodeURIComponent(m.moduleId)}/lifecycle`, 'POST', { action: 'deactivate' }))}>Deactivate {m.manifest.name}</button> : null}
      </div>) : <p>No installed module packages.</p>}
      <h3>Available modules</h3>{manager.available.length ? manager.available.map((p: any) => <div className="request-card" key={p.packageId} data-testid={`package-${p.packageId}`}>
        <strong>{p.manifest?.name ?? p.packageId}</strong> {p.manifest?.version} · {p.trusted ? 'Publisher verified' : 'Untrusted'} · {p.compatible ? 'Compatible' : 'Incompatible'}
        {p.error ? <p>{p.error}</p> : null}
        {p.manifest ? <details><summary>Package details</summary><pre>{JSON.stringify(p.manifest, null, 2)}</pre><p>Image: <code>{p.imageId}</code></p></details> : null}
        {p.trusted && p.compatible ? <><ConfigurationFields schema={p.manifest.configurationSchema} value={safeObject(configuration(p))} onChange={v=>setConfigurations({...configurations,[p.packageId]:JSON.stringify(v)})}/><details><summary>Advanced configuration JSON</summary><label>Configuration for {p.packageId}<textarea aria-label={`Configuration for ${p.packageId}`} rows={3} value={configuration(p)} onChange={e => setConfigurations({ ...configurations, [p.packageId]: e.target.value })} /></label></details>
          <button disabled={busy} onClick={() => void act(() => api('/v3/modules/install', 'POST', { packageId: p.packageId, operationId: crypto.randomUUID(), configuration: JSON.parse(configuration(p)),
            upgrade: manager.installed.some((m: any) => m.moduleId === p.manifest.moduleId && m.version !== p.manifest.version && !['failed','installing'].includes(m.state)),
            ...(manager.installed.some((m: any) => m.moduleId === p.manifest.moduleId && ['failed', 'installing'].includes(m.state)) ? { recover: true } : {}) }))}>
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
    {['all','business'].includes(mode) && !screenKey ? <section><h2>Business applications</h2><p>Open an installed application. Your permissions determine available screens and actions.</p>{Array.from(new Set(modules.flatMap(m=>m.ui.filter(s=>!['Connections','Integration diagnostics'].includes(screenGroup(m,s))).map(s=>screenGroup(m,s))))).map(group=><div key={group}><h3>{group}</h3><nav className="app-links" aria-label={group}>{modules.flatMap(m=>m.ui.filter(s=>screenGroup(m,s)===group).map(s=><a key={m.moduleId+'/'+s.screenId} href={'#/business/module/'+m.moduleId+'/'+s.screenId} onClick={()=>{setSelected(m.moduleId+'/'+s.screenId);onNavigate?.(m.moduleId+'/'+s.screenId);}}>{screenLabel(m,s)}</a>))}</nav></div>)}{!modules.length?<p>No business applications are available for your account. Ask a local administrator to install modules or grant permissions.</p>:null}</section>:null}
    {['all','business','administration','developer'].includes(mode) ? modules.flatMap(m => m.ui.filter(s => selected === m.moduleId + '/' + s.screenId && (mode==='all'||mode==='business'&&!['Connections','Integration diagnostics'].includes(screenGroup(m,s))||administrator&&mode==='administration'&&screenGroup(m,s)==='Connections'||administrator&&mode==='developer'&&screenGroup(m,s)==='Integration diagnostics')).map(s => <ModuleScreen key={selected} api={api} module={m} screen={s} currency={m.currency??currency} />)) : null}
  </div>;
}
export function ModuleScreen({ api, module, screen, currency }: { api: Api; module: DiscoveredModule; screen: ScreenContribution; currency:string }) {
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState('');
  const [report,setReport]=useState<any>(); const [from,setFrom]=useState('');const [to,setTo]=useState('');
  const [values, setValues] = useState<Record<string, any>>({currency});
  const [query,setQuery]=useState(''); const [loading,setLoading]=useState(true);
  const [editing, setEditing] = useState<any>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset,setOffset]=useState(0);const [nextOffset,setNextOffset]=useState<number|null>(null);
  const list = module.api.find(a => a.operationId === screen.listOperation)!;
  const create = module.api.find(a => a.operationId === screen.createOperation);
  const update = module.api.find(a => a.operationId === screen.updateOperation);
  const base = '/v3/modules/' + encodeURIComponent(module.moduleId) + '/api';
  async function refresh() {setLoading(true);try { const params=new URLSearchParams();if(list.query?.includes('offset')){params.set('limit','20');params.set('offset',String(offset));}if(from&&list.query?.includes('from'))params.set('from',new Date(from).toISOString());if(to&&list.query?.includes('to'))params.set('to',new Date(to).toISOString());const result = await api(base + list.path+(params.size?'?'+params.toString():''));setReport(result.report); setRecords(result.records??[]); setSummary(result.summary ?? '');setNextOffset(result.nextOffset??null);setError(''); } finally {setLoading(false);} }
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, [offset]);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const operation = editing ? update! : create!;
      const body = Object.fromEntries(screen.fields.filter(f => !f.readOnly).map(f => [f.name, f.type === 'number' ? (/Cents$/.test(f.name)?Math.round(Number(values[f.name])*100):Number(values[f.name])) : f.type==='json'?JSON.parse(typeof values[f.name]==='string'?values[f.name]:JSON.stringify(values[f.name]??[])):values[f.name] ?? '']));
      if (editing && editing.revision !== undefined) body.revision = editing.revision;
      await api(base + operation.path.replace(':id', encodeURIComponent(editing?.id ?? '')), operation.method, body);
      setValues({currency}); setEditing(undefined); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section data-testid={`module-screen-${module.moduleId}`}><h2>{screenLabel(module,screen)}</h2>{module.mode?<p className="notice"><strong>{module.mode==='simulator'?'SIMULATOR — synthetic commerce':'LIVE connection — consequential actions require separate authorization'}</strong></p>:null}<p className="muted">{module.name} · Changes are saved to this company’s local application.</p>{summary ? <p>{summary}</p> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {create || editing && update ? <form className="form-grid" onSubmit={save}>{screen.fields.filter(f=>!f.readOnly).map(f=><div className="module-field" key={f.name}>{f.type==='json'?<StructuredValue label={f.label} name={f.name} value={values[f.name]} required={f.required} onChange={v=>setValues({...values,[f.name]:v})}/>:<label>{f.label.replace(/ Cents$/,'')}{/Cents$/.test(f.name)?<small>Amount in {values.currency??currency}</small>:null}{f.enum?<select aria-label={f.label.replace(/ Cents$/,'')} required={f.required} value={values[f.name]??''} onChange={e=>setValues({...values,[f.name]:e.target.value})}><option value="">Select value</option>{f.enum.map(v=><option key={v} value={v}>{v}</option>)}</select>:<input aria-label={f.label.replace(/ Cents$/,'')} type={f.type==='number'?'number':'text'} step={f.type==='number'?(/Cents$/.test(f.name)?'0.01':'any'):undefined} min={/Cents$/.test(f.name)&&f.minimum!==undefined?f.minimum/100:f.minimum} maxLength={f.maxLength} required={f.required} value={values[f.name]??''} onChange={e=>setValues({...values,[f.name]:e.target.value})}/>}</label>}</div>)}<button disabled={busy} type="submit">{editing?'Save changes':'Create record'}</button>{editing?<button type="button" onClick={()=>{setEditing(undefined);setValues({currency});}}>Cancel edit</button>:null}</form>:null}
    {list.query?.includes('from')&&list.query?.includes('to')?<form className="form-grid" onSubmit={e=>{e.preventDefault();void refresh().catch(e=>setError(e.message));}}><label>From (local time)<input type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (exclusive, local time)<input type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label><button>Apply reporting period</button></form>:null}
    {report?.version===1&&Array.isArray(report.groups)?report.groups.map((g:any)=><article className="entity-card" key={g.currency}><h3>{g.currency} � Commerce overview</h3><div className="metric-grid">{[['Gross sales',g.grossSalesCents],['Booked merchandise revenue',g.bookedRevenueCents],['Recognized revenue',g.recognizedRevenueCents],['Average order value',g.averageOrderValueCents],['Refunds',g.refundCents],['Production expenses',g.productionCostCents],['Shipping expenses',g.shippingCostCents],['Contribution margin � '+g.marginBasis,g.contributionMarginCents]].map(([label,value])=><article key={label}><span>{label}</span><strong><Money cents={value} currency={g.currency}/></strong></article>)}</div><p>{g.orderVolume} orders � {g.canceledOrders} canceled � {g.refundedOrders} with refunds � {g.completeMarginOrders} with complete margin evidence</p><details><summary>Product and SKU performance</summary><ReadableValue value={g.products} currency={g.currency}/></details></article>):null}
    <label>Search this page<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><button onClick={() => void refresh().catch(e => setError(e.message))}>Refresh records</button>
    <div className="module-table"><table><thead><tr>{screen.columns.map(c => <th key={c}>{humanize(screen.fields.find(f => f.name === c)?.label ?? c).replace(/ Cents$/,'').replace(/ Id$/,' reference')}</th>)}<th>Actions</th></tr></thead><tbody>{records.filter(record=>JSON.stringify(record).toLowerCase().includes(query.toLowerCase())).map(record => <tr key={record.id}>{screen.columns.map(c => <td key={c}>{record[c]!==null&&typeof record[c]==='object'?<details><summary>Details</summary><ReadableValue value={record[c]} currency={record.currency}/></details>:/Cents$/.test(c)?<Money cents={record[c]} currency={record.currency??currency}/>:/status|state|ownership/i.test(c)?<span className="badge">{humanize(String(record[c]??'Unknown').toLowerCase())}</span>:typeof record[c]==='string'&&/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(record[c])?<details><summary>Reference · {record[c].slice(-8)}</summary><code>{record[c]}</code></details>:c==='error'&&typeof record[c]==='string'?humanize(record[c].toLowerCase()):<ReadableValue value={record[c]} name={c} currency={record.currency??currency}/>}</td>)}<td>{update?<button onClick={() => { setEditing(record); setValues(Object.fromEntries(Object.entries(record).map(([k,v])=>[k,/Cents$/.test(k)&&typeof v==='number'?v/100:v]))); }}>Edit record</button>:null}{(screen.actions??[]).map(action=>{const op=module.api.find(a=>a.operationId===action.operationId);return op?<button key={op.operationId} disabled={busy} onClick={()=>{if(/authoriz|approve|place|confirm|submit|cancel|dispatch|production|fulfill|release/i.test(action.label)&&!window.confirm(action.label+'? Review the selected record and required approvals before continuing.'))return;setBusy(true);setError('');void api(base+op.path.replace(':id',encodeURIComponent(record.id)),op.method,{revision:record.revision,requestId:crypto.randomUUID()}).then(refresh).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>{action.label}</button>:null;})}</td></tr>)}</tbody></table></div>
    {list.query?.includes('offset')?<div><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous records</button><button disabled={nextOffset===null} onClick={()=>setOffset(nextOffset!)}>Next records</button></div>:null}
    {loading?<p role="status">Loading records…</p>:!records.length ? <p>No records yet. Create the first record using the form above, if authorized.</p> : null}
  </section>;
}
