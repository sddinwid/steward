import { useEffect, useState } from 'react';
import type { PlatformOverview, StewardRole } from '@steward/contracts';
import { SecurityConsole } from './security.js';

export function StewardApp({ role }: { role: StewardRole }) {
  const [overview, setOverview] = useState<PlatformOverview>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let mounted = true;
    let current: AbortController | undefined;
    async function refresh() {
      current?.abort();
      current = new AbortController();
      const signal = AbortSignal.any([current.signal, AbortSignal.timeout(5000)]);
      try {
        const [response, readiness] = await Promise.all([fetch('/api/v1/platform', { signal, cache: 'no-store' }), fetch('/ready', { signal, cache: 'no-store' })]);
        if (!response.ok) throw new Error('API unavailable');
        const value: PlatformOverview = await response.json();
        if (value.installation.role !== role) throw new Error('Unexpected installation role');
        if (mounted) { setOverview(value); setReady(readiness.ok); setError(false); }
      } catch { if (mounted) { setError(true); setReady(false); } }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 10000);
    return () => { mounted = false; clearInterval(interval); current?.abort(); };
  }, [role]);
  return <div className="shell">
    <aside><a className="brand" href="/">S<span>ST E W A R D</span></a><div className="nav-label">PLATFORM</div><div className="selected">◈ &nbsp; Overview</div><div className="aside-bottom">CEE Steward ecosystem<br />Phase 1 · Foundation</div></aside>
    <main><header><span>{role === 'master' ? 'Master' : 'Worker'} Steward</span><span className="release">Core {overview?.release ?? '—'}</span></header>
      <div className="content"><p className="eyebrow">INSTALLATION OVERVIEW</p><h1>{overview?.installation.entity.displayName ?? `${role === 'master' ? 'Master' : 'Worker'} Steward`}</h1>
      <p className="intro">{role === 'worker' ? 'An independent local runtime, with dedicated configuration and persistence.' : 'The foundation for coordinating the Steward ecosystem.'}</p>
      <div className={`status ${ready && !error ? 'online' : 'offline'}`} role="status"><span className="dot" />{error ? 'API unavailable · retrying automatically' : !overview ? 'Connecting to local runtime…' : ready ? 'Local runtime ready' : 'Database unavailable · runtime is not ready'}</div>
      {location.protocol === 'https:' ? <SecurityConsole role={role} /> : overview?.administrationOrigin ? <section><h2>Secure administration</h2><p>Entity registration and enrollment require the trusted HTTPS interface.</p><a href={overview.administrationOrigin}>Open secure {role} administration</a></section> : null}
      <section className="identity"><h2>Runtime identity</h2><dl>
        <div><dt>Role</dt><dd>{role}</dd></div><div><dt>Installation ID</dt><dd>{overview?.installation.installationId ?? '—'}</dd></div><div><dt>Entity ID</dt><dd>{overview?.installation.entity.entityId ?? '—'}</dd></div>
      </dl></section>
      <section><div className="section-heading"><h2>Modules</h2><span className="tag">{overview?.modules.length ?? 0} installed</span></div>{overview?.modules.length ? <><h3>Installed modules</h3><ul>{overview.modules.map(m => <li key={m.moduleId}>{m.moduleId} · {m.version}</li>)}</ul><p>Open secure Worker administration to manage modules and access permitted screens.</p></> : <div className="empty"><span className="empty-icon">◇</span><h3>No modules installed</h3><p>Trusted modules can be installed through secure Worker administration when the module runtime is configured.</p></div>}</section>
      <section><h2>Platform extensions</h2><div className="extensions">{['Authenticated enrollment', 'MCP servers', 'AI Analyst (provider configuration required)', 'Durable event synchronization'].map((name, i) => <div key={name}><span>{name}</span><span className="tag">{(i === 0 && overview?.extensions.enrollment === 'available' || i === 1 && overview?.extensions.mcp === 'available' || i === 2 && overview?.extensions.analytics === 'available' || i === 3 && overview?.extensions.synchronization === 'available') ? 'Available over HTTPS' : 'Not implemented'}</span></div>)}</div></section>
      <footer>Configuration version {overview?.installation.configVersion ?? '—'} · Status refreshes every 10 seconds</footer>
      </div></main>
  </div>;
}
