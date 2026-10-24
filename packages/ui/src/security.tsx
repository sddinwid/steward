import { ExecutiveOverview, Findings, CompanySettings } from './workspaces.js';
import { PresentationContext, screenGroup, screenLabel } from './presentation.js';
import type { DiscoveredModule } from './modules.js';
import { AnalystWorkspace } from './analyst.js';
import { BusinessConsole } from './business.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { LegalEntity, StewardRole } from '@steward/contracts';
import { ModuleConsole } from './modules.js';
type Account = { account_id: string; username: string; role: string };
type Api = <T = any>(path: string, method?: string, body?: unknown) => Promise<T>;

export function SecurityConsole({ role }: { role: StewardRole }) {
  const [account, setAccount] = useState<Account>();
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [route,setRoute]=useState(location.hash.slice(1)||(new URLSearchParams(location.search).has('authorize')?'/business/authorization':'/business/overview'));
  const [profile,setProfile]=useState<any>();const [discovered,setDiscovered]=useState<DiscoveredModule[]>([]);
  useEffect(()=>{const changed=()=>setRoute(location.hash.slice(1)||'/business/overview');addEventListener('hashchange',changed);return()=>removeEventListener('hashchange',changed);},[]);
  const csrf = useRef('');
  const api: Api = async (path, method = 'GET', body) => {
    const versioned = /^\/v(?:3|4|5|8)\//.test(path);
    const response = await fetch(versioned ? `/api${path}` : `/api/v2${path}`, { method, credentials: 'same-origin', cache: 'no-store',
      headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-csrf-token': csrf.current },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(versioned ? 90000 : 15000) });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? 'Request failed');
    return value;
  };
  useEffect(() => { void api('/auth/session').then(v => { csrf.current = v.csrfToken; setAccount(v.account); }).catch(() => {}); }, []);
  async function login(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { const value = await api('/auth/login', 'POST', { username, password }); csrf.current = value.csrfToken; setAccount(value.account); }
    catch (e) { setError((e as Error).message); }
    finally { setPassword(''); setBusy(false); }
  }
  const report = (e: unknown) => setError((e as Error).message);
  const administrator=account?.role===(role==='worker'?'local_admin':'registry_admin');
  const technical=administrator;const analytics=role==='master'&&['registry_admin','enrollment_admin'].includes(account?.role??'');
  useEffect(()=>{if(!account){setProfile(undefined);setDiscovered([]);return;}void api('/workspace/profile').then(setProfile).catch(report);if(role==='worker')void api('/v3/modules/discovery').then(v=>setDiscovered(v.modules)).catch(report);},[account,route]);
  const workspace=route.split('/')[1]??'business';const page=route.split('/')[2]??'overview';
  const screenKey=route.startsWith('/business/module/')||route.startsWith('/administration/module/')||route.startsWith('/developer/module/')?route.split('/').slice(3).join('/'):undefined;
  const title=screenKey?discovered.flatMap(m=>m.ui.filter(s=>m.moduleId+'/'+s.screenId===screenKey).map(s=>screenLabel(m,s)))[0]??'Application unavailable':({overview:role==='master'?'Executive Overview':'Business Overview',companies:'Companies & Relationships',findings:'Findings & Alerts',analyst:'AI Analyst',history:'Investigation History',reports:'Reports',opportunities:'Analytics & Opportunities',modules:'Module Manager',settings:'Company & Localization',enrollment:'Master Connection & Enrollment',diagnostics:'Developer Diagnostics'} as Record<string,string>)[page]??'Administration';
  const selectedGroup=screenKey?discovered.flatMap(m=>m.ui.filter(s=>m.moduleId+'/'+s.screenId===screenKey).map(s=>screenGroup(m,s)))[0]:undefined;
  const canonicalWorkspace=selectedGroup==='Connections'?'administration':selectedGroup==='Integration diagnostics'?'developer':'business';
  const denied=workspace==='administration'&&!administrator||workspace==='developer'&&!technical||!!screenKey&&!!selectedGroup&&workspace!==canonicalWorkspace;
  const nav=(href:string,label:string)=><a key={href} href={'#'+href} aria-current={route===href?'page':undefined}>{label}</a>;
  return <PresentationContext.Provider value={{locale:profile?.preferences?.locale??'en-US',baseCurrency:profile?.preferences?.baseCurrency}}><div className="shell application-shell security-console">
    <aside><a className="brand" href="#/business/overview">S<span>STEWARD</span></a><p className="installation-label">{role==='master'?'Master Steward':'Worker Steward'}</p>{account?<><nav aria-label="Workspaces" className="workspace-switcher">{nav('/business/overview',role==='master'?'Executive':'Business')}{administrator?nav('/administration/'+(role==='master'?'companies':'modules'),'Administration'):null}{technical?nav('/developer/diagnostics','Developer'):null}</nav><nav aria-label="Application navigation"><div className="nav-label">{workspace.toUpperCase()}</div>{workspace==='business'?<>{nav('/business/overview',role==='master'?'Executive Overview':'Business Overview')}{role==='master'&&analytics?<>{nav('/business/companies','Companies & Relationships')}{nav('/business/opportunities','Analytics & Opportunities')}{nav('/business/reports','Reports')}{nav('/business/analyst','AI Analyst')}{nav('/business/history','Investigation History')}</>:null}{role==='worker'?Array.from(new Set(discovered.flatMap(m=>m.ui.map(s=>screenGroup(m,s))))).filter(g=>!['Connections','Integration diagnostics'].includes(g)).map(g=><details key={g} open><summary>{g}</summary>{discovered.flatMap(m=>m.ui.filter(s=>screenGroup(m,s)===g).map(s=>nav('/business/module/'+m.moduleId+'/'+s.screenId,screenLabel(m,s))))}</details>):null}{role==='worker'||analytics?nav('/business/findings','Findings & Alerts'):null}</>:workspace==='administration'&&administrator?<>{role==='master'?nav('/administration/companies','Companies, Users & Enrollment'):<>{nav('/administration/modules','Modules & User Permissions')}{nav('/administration/enrollment','Master Connection & Enrollment')}{discovered.flatMap(m=>m.ui.filter(s=>screenGroup(m,s)==='Connections').map(s=>nav('/administration/module/'+m.moduleId+'/'+s.screenId,screenLabel(m,s))))}</>}{nav('/administration/settings','Company & Localization')}</>:workspace==='developer'&&technical?<>{nav('/developer/diagnostics','Capabilities & Workflows')}{nav('/developer/synchronization','Synchronization & Evidence')}{discovered.flatMap(m=>m.ui.filter(s=>screenGroup(m,s)==='Integration diagnostics').map(s=>nav('/developer/module/'+m.moduleId+'/'+s.screenId,screenLabel(m,s))))}</>:null}</nav></>:<p>Sign in to your company workspace.</p>}</aside>
    <main><header><span>{profile?.name??(role==='master'?'Master Steward':'Worker Steward')}</span>{account?<span>{account.username} · <button onClick={()=>void api('/auth/logout','POST',{}).then(()=>{csrf.current='';setAccount(undefined);}).catch(report)}>Sign out</button></span>:<span>Secure company sign-in</span>}</header><div className="content"><p className="eyebrow">{role==='master'?'MASTER STEWARD':'WORKER STEWARD'} / {workspace.toUpperCase()}</p><h1>{account?title:'Welcome to Steward'}</h1>
    {!account?<section><div className="section-heading"><h2>{role === 'master' ? 'Master administration' : 'Worker enrollment wizard'}</h2>{account ? <button onClick={() => void api('/auth/logout', 'POST', {}).then(() => { csrf.current = ''; setAccount(undefined); }).catch(report)}>Sign out</button> : null}</div>
      {<>
        <p>{role === 'master' ? 'Sign in with a Master administrator account.' : 'Sign in with your Worker business account. Master enrollment authorization takes place only on the trusted Master site.'}</p>
        <form onSubmit={login} className="form-grid"><label>Username<input name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button disabled={busy} type="submit">Sign in</button></form>
      </>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>:null}
    {account&&error?<p className="form-error" role="alert">{error}</p>:null}
    {account?(denied?<section role="alert"><h2>Access restricted</h2><p>Your account does not have permission to open this workspace. Contact your administrator.</p><a href="#/business/overview">Return to Business</a></section>:<>
      {workspace==='administration'?(page==='settings'?<CompanySettings api={api} master={role==='master'}/>:role==='master'?<MasterAdministration api={api} account={account} report={report}/>:page==='enrollment'?<WorkerEnrollment api={api} signedIn={administrator} report={report}/>:<ModuleConsole key={route} api={api} administrator={administrator} mode="administration" {...(screenKey?{screenKey}:{})} currency={profile?.preferences?.baseCurrency??'EUR'}/>):workspace==='developer'?<>{page==='synchronization'?<BusinessConsole api={api} master={role==='master'}/>:role==='worker'?<ModuleConsole key={route} api={api} administrator={administrator} mode="developer" {...(screenKey?{screenKey}:{})}/>:<BusinessConsole api={api} master/>}<section><h2>Runtime Identity & Health</h2><p>Company identity above comes from the enrolled legal entity. Installation and configuration identities below describe infrastructure; they do not reassign business records.</p><RuntimeDiagnostics api={api}/></section></>:workspace==='business'?(page==='findings'?<Findings api={api} master={role==='master'} administrator={administrator} id={route.split('/')[3]}/>:role==='master'?(analytics?(page==='authorization'?<MasterAdministration api={api} account={account} report={report}/>:page==='overview'||page==='companies'?<ExecutiveOverview api={api} companies={page==='companies'}/>:<AnalystWorkspace key={page} api={api} mode={page==='history'?'history':['reports','opportunities'].includes(page)?'reports':'analyst'} initialId={route.split('/')[3]}/>):<section><h2>No business access assigned</h2><p>Ask a registry administrator to review your role and company authorization.</p></section>):<>{page==='overview'?<section><h2>Your Business Workspace</h2><p>{profile?.enrollmentState==='enrolled'?'Connected to '+profile.name:'Local services are available. An administrator can configure Master enrollment.'}</p><p>Use the application navigation to manage authorized business records and reports. Local operations continue when Master is unavailable.</p><div className="metric-grid"><article><span>Available applications</span><strong>{discovered.length}</strong></article><article><span>Company currency</span><strong>{profile?.preferences?.baseCurrency??'Not configured'}</strong><small>Transaction currencies remain authoritative</small></article></div><a href="#/business/findings">Review findings from Master</a></section>:null}<ModuleConsole key={route} api={api} administrator={false} mode="business" {...(screenKey?{screenKey}:{})} currency={profile?.preferences?.baseCurrency??'EUR'}/>{screenKey&&!discovered.some(m=>m.ui.some(s=>m.moduleId+'/'+s.screenId===screenKey))?<section role="alert">This screen is unavailable, uninstalled or not authorized for your account.</section>:null}</>):<section role="alert">Page not found. Choose a destination from navigation.</section>}
    </>):null}</div></main></div></PresentationContext.Provider>;
}
function RuntimeDiagnostics({api}:{api:Api}){const [v,setV]=useState<any>();useEffect(()=>{void fetch('/api/v1/platform').then(r=>r.json()).then(setV);},[]);return v?<><p>Core release {v.release}</p><ReadableRuntime value={v.installation}/></>:<p>Loading runtime identity…</p>;}
function ReadableRuntime({value}:{value:any}){return <dl>{Object.entries(value).map(([k,v])=><div key={k}><dt>{k==='entity'?'Configured bootstrap entity':k}</dt><dd>{typeof v==='object'?JSON.stringify(v):String(v)}</dd></div>)}</dl>;}

function WorkerEnrollment({ api, signedIn, report }: { api: Api; signedIn: boolean; report: (e: unknown) => void }) {
  const [status, setStatus] = useState<any>();
  const [profile, setProfile] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const value = await api('/worker/status'); setStatus(value);
    setProfile(current => current || value.profileId || value.profiles[0]?.profileId || '');
  }
  useEffect(() => { void refresh().catch(report); const interval = setInterval(() => void refresh().catch(report), 3000); return () => clearInterval(interval); }, []);
  async function act(work: () => Promise<unknown>) { setBusy(true); try { await work(); await refresh(); } catch (e) { report(e); } finally { setBusy(false); } }
  return <section><h2>Enrollment status</h2><p data-testid="enrollment-state"><strong>{status?.enrollmentState ?? 'Loading'}</strong>{status?.status === 'connection_unavailable' ? ' · Connection unavailable — local services remain available' : ''}</p>
    {status?.entityId ? <p>Legal entity: <strong>{status.entityName}</strong><br /><code>{status.entityId}</code></p> : null}
    <p className="muted">Worker key fingerprint: <code>{status?.keyThumbprint ?? '—'}</code></p>
    {status?.enrollmentState === 'enrolled' ? <p>The enrollment certificate is persisted locally. Master administrator sign-in is not required after restart.</p> : <>
      <ol className="wizard-steps"><li>Choose an operator-installed trusted Master profile.</li><li>Open Master’s verification page and sign in there.</li><li>Select an authorized legal entity and request approval.</li><li>After approval, this Worker verifies and saves its enrollment.</li></ol>
      {signedIn ? <div className="form-grid"><label>Trusted Master profile<select aria-label="Trusted Master profile" value={profile} onChange={e => setProfile(e.target.value)}>{status?.profiles.map((p: any) => <option key={p.profileId} value={p.profileId}>{p.browserUrl}</option>)}</select></label>
        <button disabled={busy || !profile || status?.enrollmentState === 'pending'} onClick={() => void act(() => api('/worker/connection', 'PUT', { profileId: profile }))}>Save Master connection</button>
        <button disabled={busy || !status?.profileId || status?.enrollmentState === 'pending'} onClick={() => void act(() => api('/worker/start', 'POST', { requestId: crypto.randomUUID() }))}>Begin enrollment</button>
      </div> : null}
      {status?.profiles.length === 0 ? <p>No trusted Master profiles are installed. An operator must install a reviewed trust bundle; entering an arbitrary URL is not permitted.</p> : null}
      {status?.userCode && status.enrollmentState === 'pending' ? <div className="verification"><p>Verification code: <strong data-testid="user-code">{status.userCode}</strong></p><a href={status.verificationUri} target="_blank" rel="noreferrer">Authorize on Master Steward</a><p>Compare the Worker installation ID and key fingerprint on Master before authorizing.</p></div> : null}
    </>}
    {status?.profiles.find((p: any) => p.profileId === profile) ? <details><summary>Master trust details</summary>{status.profiles.filter((p: any) => p.profileId === profile).map((p: any) => <p key={p.profileId}>Master: <code>{p.installationId}</code><br />Signing key: <code>{p.signingKeyThumbprint}</code><br />{p.browserUrl}</p>)}</details> : null}
  </section>;
}
function MasterAdministration({ api, account, report }: { api: Api; account: Account; report: (e: unknown) => void }) {
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [entity, setEntity] = useState<LegalEntity>({ entityId: crypto.randomUUID(), name: '', classification: '', enrollmentEligible: true });
  const [scopeAccount, setScopeAccount] = useState('');
  const [scopeEntity, setScopeEntity] = useState('');
  const [scopes, setScopes] = useState<any[]>([]);
  const code = new URLSearchParams(location.search).get('authorize');
  const [authorization, setAuthorization] = useState<any>();
  const [selectedEntity, setSelectedEntity] = useState('');
  const [message, setMessage] = useState('');
  const registry = account.role === 'registry_admin';
  async function refresh() {
    const [e, r] = await Promise.all([api('/entities'), api('/enrollment/requests')]);
    setEntities(e.entities); setRequests(r.requests);
    if (registry) { const [a, log] = await Promise.all([api('/accounts'), api('/audit')]); setAccounts(a.accounts); setScopes(a.authorizations); setAudit(log.records); }
    if (code) { const a = await api(`/enrollment/authorize/${encodeURIComponent(code)}`); setAuthorization(a); setSelectedEntity(current => current || a.entities[0]?.entity_id || ''); }
  }
  useEffect(() => { void refresh().catch(report); }, []);
  async function act(work: () => Promise<unknown>, message: string) { try { await work(); setMessage(message); await refresh(); } catch (e) { report(e); } }
  return <>
    {message ? <p role="status">{message}</p> : null}
    {code ? <section><h2>Authorize Worker enrollment</h2>{authorization ? <>
      <p>Installation: <code>{authorization.request.installation_id}</code><br />Worker key: <code>{authorization.request.key_thumbprint}</code></p><p>Compare both values with the Worker that you intend to authorize.</p>
      <label>Legal entity<select aria-label="Legal entity" value={selectedEntity} onChange={e => setSelectedEntity(e.target.value)}><option value="">Select an authorized entity</option>{authorization.entities.map((e: any) => <option key={e.entity_id} value={e.entity_id}>{e.name}</option>)}</select></label>
      <button disabled={!selectedEntity || authorization.request.status !== 'authorizing'} onClick={() => void act(() => api('/enrollment/authorize', 'POST', { code, entityId: selectedEntity }), 'Enrollment request submitted for approval.')}>Request enrollment</button>
      <p>Request status: {authorization.request.status}</p>{!authorization.entities.length ? <p>No eligible legal entities are authorized for this account.</p> : null}
    </> : <p>Loading authorization request…</p>}</section> : null}
    {registry ? <section><h2>Legal entity registry</h2><form className="form-grid" onSubmit={e => { e.preventDefault(); void act(() => api('/entities', 'PUT', entity), 'Legal entity saved.'); }}>
      <label>Entity ID<input aria-label="Entity ID" value={entity.entityId} onChange={e => setEntity({ ...entity, entityId: e.target.value })} required /></label>
      <label>Legal name<input aria-label="Legal name" value={entity.name} onChange={e => setEntity({ ...entity, name: e.target.value })} maxLength={120} required /></label>
      <label>Classification<input aria-label="Classification" value={entity.classification} onChange={e => setEntity({ ...entity, classification: e.target.value })} maxLength={80} required /></label>
      <label className="checkbox"><input type="checkbox" checked={entity.enrollmentEligible} onChange={e => setEntity({ ...entity, enrollmentEligible: e.target.checked })} />Eligible for enrollment</label><button type="submit">Save legal entity</button>
      <button type="button" onClick={() => setEntity({ entityId: crypto.randomUUID(), name: '', classification: '', enrollmentEligible: true })}>New entity</button>
    </form><ul>{entities.map(e => <li key={e.entityId}><strong>{e.name}</strong> · {e.classification} · {e.enrollmentEligible ? 'eligible' : 'ineligible'} <button onClick={() => setEntity(e)}>Edit</button><br /><code>{e.entityId}</code></li>)}</ul></section> : null}
    {registry ? <section><h2>Entity enrollment authorization</h2><p>Registry administrators also need an explicit entity scope to authorize enrollment.</p><div className="form-grid">
      <label>Administrator<select aria-label="Administrator" value={scopeAccount} onChange={e => setScopeAccount(e.target.value)}><option value="">Select administrator</option>{accounts.filter(a => ['registry_admin', 'enrollment_admin'].includes(a.role)).map(a => <option key={a.account_id} value={a.account_id}>{a.username}</option>)}</select></label>
      <label>Authorized entity<select aria-label="Authorized entity" value={scopeEntity} onChange={e => setScopeEntity(e.target.value)}><option value="">Select entity</option>{entities.map(e => <option key={e.entityId} value={e.entityId}>{e.name}</option>)}</select></label>
      {[true, false].map(allowed => <button key={String(allowed)} disabled={!scopeAccount || !scopeEntity} onClick={() => void act(() => api('/authorizations', 'PUT', { accountId: scopeAccount, entityId: scopeEntity, allowed }), allowed ? 'Authorization granted.' : 'Authorization revoked.')}>{allowed ? 'Grant authorization' : 'Revoke authorization'}</button>)}
      </div><ul>{scopes.map(s => <li key={s.account_id + s.entity_id}>{accounts.find(a => a.account_id === s.account_id)?.username} → {entities.find(e => e.entityId === s.entity_id)?.name}</li>)}</ul></section> : null}
    <section><div className="section-heading"><h2>Enrollment requests</h2><button onClick={() => void refresh().catch(report)}>Refresh requests</button></div>{requests.length ? requests.map(r => <div className="request-card" key={r.request_id} data-testid={`request-${r.request_id}`}><strong>{r.name}</strong> · <span>{r.status}</span><p>Worker: <code>{r.installation_id}</code><br />Key: <code>{r.key_thumbprint}</code></p>{r.status === 'pending' ? <>{['approve', 'reject'].map(decision => <button key={decision} onClick={() => void act(() => api('/enrollment/decision', 'POST', { requestId: r.request_id, entityId: r.entity_id, decision }), `Request ${decision === 'approve' ? 'approved' : 'rejected'}.`)}>{decision === 'approve' ? 'Approve enrollment' : 'Reject enrollment'}</button>)}</> : null}</div>) : <p>No enrollment requests within your entity scopes.</p>}</section>
    {registry ? <section><h2>Security audit</h2><ul className="audit-list">{audit.slice(0, 30).map(a => <li key={a.audit_id}><strong>{a.action}</strong> · {new Date(a.occurred_at).toLocaleString()}<br /><code>{a.target_id}</code></li>)}</ul></section> : null}
  </>;
}
