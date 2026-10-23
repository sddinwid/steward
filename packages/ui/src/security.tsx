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
  return <div className="security-console">
    <section><div className="section-heading"><h2>{role === 'master' ? 'Master administration' : 'Worker enrollment wizard'}</h2>{account ? <button onClick={() => void api('/auth/logout', 'POST', {}).then(() => { csrf.current = ''; setAccount(undefined); }).catch(report)}>Sign out</button> : null}</div>
      {account ? <p>Signed in as <strong>{account.username}</strong> · {account.role}</p> : <>
        <p>{role === 'master' ? 'Sign in with a Master administrator account.' : 'Sign in with this Worker’s local administrator account. Master sign-in happens only on the trusted Master site.'}</p>
        <form onSubmit={login} className="form-grid"><label>Username<input name="username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button disabled={busy} type="submit">Sign in</button></form>
      </>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
    {role === 'worker' ? <><WorkerEnrollment api={api} signedIn={account?.role === 'local_admin'} report={report} />{account ? <><ModuleConsole api={api} administrator={account.role === 'local_admin'} />{account.role==='local_admin'?<BusinessConsole api={api} master={false}/>:null}</> : null}</> : account ? <><MasterAdministration api={api} account={account} report={report} />{['registry_admin','enrollment_admin'].includes(account.role)?<AnalystWorkspace api={api}/>:null}<BusinessConsole api={api} master={true}/></> : null}
  </div>;
}
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
