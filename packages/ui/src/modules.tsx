import { useEffect, useState, type FormEvent } from 'react';
import type { ApiContribution, ModulePackageManifest, ScreenContribution } from '@steward/module-sdk';
type Api = <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;
interface DiscoveredModule { moduleId: string; version: string; name: string; api: ApiContribution[]; ui: ScreenContribution[] }
export function ModuleConsole({ api, administrator }: { api: Api; administrator: boolean }) {
  const [manager, setManager] = useState<any>();
  const [modules, setModules] = useState<DiscoveredModule[]>([]);
  const [selected, setSelected] = useState('');
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
  useEffect(() => { void refresh().catch(e => { if (!String(e.message).includes('Route ')) setError(e.message); }); }, []);
  async function act(work: () => Promise<unknown>) { setBusy(true); setError(''); try { await work(); } catch (e) { setError((e as Error).message); } finally { await refresh().catch(e => setError(e.message)); setBusy(false); } }
  function configuration(p: any): string {
    if (configurations[p.packageId] !== undefined) return configurations[p.packageId]!;
    const installed = manager?.installed.find((m: any) => m.moduleId === p.manifest.moduleId);
    if (installed) return JSON.stringify(installed.configuration, null, 2);
    const properties = p.manifest.configurationSchema.properties ?? {};
    return JSON.stringify(Object.fromEntries(Object.entries(properties).filter(([, value]) => Object.hasOwn(value as object, 'default')).map(([key, value]) => [key, (value as any).default])), null, 2);
  }
  const installedScope = manager?.installed.find((m: any) => m.moduleId === scopeModule);
  return <div className="module-console">
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {administrator && manager ? <section><div className="section-heading"><h2>Module Manager</h2><button onClick={() => void refresh().catch(e => setError(e.message))}>Refresh modules</button></div>
      <p>Only signed packages from configured publishers can be installed. Modules run outside this Worker core.</p>
      <h3>Installed modules</h3>{manager.installed.length ? manager.installed.map((m: any) => <div className="request-card" key={m.moduleId} data-testid={`installed-${m.moduleId}`}>
        <strong>{m.manifest.name}</strong> {m.version} · <span>{m.state}</span>{m.errorCode ? <p role="alert">Installation failed: {m.errorCode}. Data was retained. Review the package and use explicit recovery below.</p> : null}
        <details><summary>Module configuration</summary><label>Installed configuration for {m.moduleId}<textarea aria-label={`Installed configuration for ${m.moduleId}`} value={configurations['installed:'+m.moduleId]??JSON.stringify(m.configuration,null,2)} onChange={e=>setConfigurations({...configurations,['installed:'+m.moduleId]:e.target.value})} /></label><button disabled={busy} onClick={()=>void act(()=>api(`/v3/modules/${encodeURIComponent(m.moduleId)}/configuration`,'PUT',{configuration:JSON.parse(configurations['installed:'+m.moduleId]??JSON.stringify(m.configuration))}))}>Save configuration for {m.manifest.name}</button></details>
        {['installed', 'disabled'].includes(m.state) ? <button disabled={busy} onClick={() => void act(() => api(`/v3/modules/${encodeURIComponent(m.moduleId)}/lifecycle`, 'POST', { action: 'activate' }))}>Activate {m.manifest.name}</button> : null}
        {m.state === 'active' ? <button disabled={busy} onClick={() => void act(() => api(`/v3/modules/${encodeURIComponent(m.moduleId)}/lifecycle`, 'POST', { action: 'deactivate' }))}>Deactivate {m.manifest.name}</button> : null}
      </div>) : <p>No installed module packages.</p>}
      <h3>Available modules</h3>{manager.available.length ? manager.available.map((p: any) => <div className="request-card" key={p.packageId} data-testid={`package-${p.packageId}`}>
        <strong>{p.manifest?.name ?? p.packageId}</strong> {p.manifest?.version} · {p.trusted ? 'Publisher verified' : 'Untrusted'} · {p.compatible ? 'Compatible' : 'Incompatible'}
        {p.error ? <p>{p.error}</p> : null}
        {p.manifest ? <details><summary>Package details</summary><pre>{JSON.stringify(p.manifest, null, 2)}</pre><p>Image: <code>{p.imageId}</code></p></details> : null}
        {p.trusted && p.compatible ? <><label>Configuration for {p.packageId}<textarea aria-label={`Configuration for ${p.packageId}`} rows={3} value={configuration(p)} onChange={e => setConfigurations({ ...configurations, [p.packageId]: e.target.value })} /></label>
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
    {modules.length ? <section><h2>Module navigation</h2><nav aria-label="Module navigation">{modules.flatMap(m => m.ui.map(s => <button key={m.moduleId + '/' + s.screenId} onClick={() => setSelected(m.moduleId + '/' + s.screenId)}>{s.navigationLabel}</button>))}</nav></section> : null}
    {modules.flatMap(m => m.ui.filter(s => selected === m.moduleId + '/' + s.screenId).map(s => <ModuleScreen key={selected} api={api} module={m} screen={s} />))}
  </div>;
}
function ModuleScreen({ api, module, screen }: { api: Api; module: DiscoveredModule; screen: ScreenContribution }) {
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState('');
  const [values, setValues] = useState<Record<string, any>>({});
  const [editing, setEditing] = useState<any>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [offset,setOffset]=useState(0);const [nextOffset,setNextOffset]=useState<number|null>(null);
  const list = module.api.find(a => a.operationId === screen.listOperation)!;
  const create = module.api.find(a => a.operationId === screen.createOperation);
  const update = module.api.find(a => a.operationId === screen.updateOperation);
  const base = '/v3/modules/' + encodeURIComponent(module.moduleId) + '/api';
  async function refresh() { const result = await api(base + list.path+(list.query?.includes('offset')?`?limit=20&offset=${offset}`:'')); setRecords(result.records); setSummary(result.summary ?? '');setNextOffset(result.nextOffset??null); }
  useEffect(() => { void refresh().catch(e => setError(e.message)); }, [offset]);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const operation = editing ? update! : create!;
      const body = Object.fromEntries(screen.fields.filter(f => !f.readOnly).map(f => [f.name, f.type === 'number' ? Number(values[f.name]) : f.type==='json'?JSON.parse(typeof values[f.name]==='string'?values[f.name]:JSON.stringify(values[f.name]??null)):values[f.name] ?? '']));
      if (editing && editing.revision !== undefined) body.revision = editing.revision;
      await api(base + operation.path.replace(':id', encodeURIComponent(editing?.id ?? '')), operation.method, body);
      setValues({}); setEditing(undefined); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section data-testid={`module-screen-${module.moduleId}`}><h2>{screen.title}</h2>{summary ? <p>{summary}</p> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {create || editing && update ? <form className="form-grid" onSubmit={save}>{screen.fields.filter(f => !f.readOnly).map(f => <label key={f.name}>{f.label}{f.type==='json'?<textarea aria-label={f.label} required={f.required} rows={5} value={typeof values[f.name]==='string'?values[f.name]:values[f.name]===undefined?'':JSON.stringify(values[f.name],null,2)} onChange={e=>setValues({...values,[f.name]:e.target.value})}/>:f.enum?<select aria-label={f.label} required={f.required} value={values[f.name]??''} onChange={e=>setValues({...values,[f.name]:e.target.value})}><option value="">Select value</option>{f.enum.map(v=><option key={v} value={v}>{v}</option>)}</select>:<input aria-label={f.label} type={f.type === 'number' ? 'number' : 'text'} step={f.type === 'number' ? 'any' : undefined} min={f.minimum} maxLength={f.maxLength} required={f.required} value={values[f.name] ?? ''} onChange={e => setValues({ ...values, [f.name]: e.target.value })} />}</label>)}<button disabled={busy} type="submit">{editing ? 'Save changes' : 'Create record'}</button>{editing ? <button type="button" onClick={() => { setEditing(undefined); setValues({}); }}>Cancel edit</button> : null}</form> : null}
    <button onClick={() => void refresh().catch(e => setError(e.message))}>Refresh records</button>
    <div className="module-table"><table><thead><tr>{screen.columns.map(c => <th key={c}>{screen.fields.find(f => f.name === c)?.label ?? c}</th>)}<th>Actions</th></tr></thead><tbody>{records.map(record => <tr key={record.id}>{screen.columns.map(c => <td key={c}>{typeof record[c]==='object'?<details><summary>Details</summary><pre>{JSON.stringify(record[c],null,2)}</pre></details>:String(record[c] ?? '')}</td>)}<td>{update?<button onClick={() => { setEditing(record); setValues(record); }}>Edit record</button>:null}{(screen.actions??[]).map(action=>{const op=module.api.find(a=>a.operationId===action.operationId);return op?<button key={op.operationId} disabled={busy} onClick={()=>{setBusy(true);setError('');void api(base+op.path.replace(':id',encodeURIComponent(record.id)),op.method,{revision:record.revision,requestId:crypto.randomUUID()}).then(refresh).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>{action.label}</button>:null;})}</td></tr>)}</tbody></table></div>
    {list.query?.includes('offset')?<div><button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-20))}>Previous records</button><button disabled={nextOffset===null} onClick={()=>setOffset(nextOffset!)}>Next records</button></div>:null}
    {!records.length ? <p>No records yet.</p> : null}
  </section>;
}
