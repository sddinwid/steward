# Optional scientific service

The service is a separately containerized Python process, not a Worker module or
an additional authority registry. Master uses the existing analytical capability
catalog and MCP authorization path. Workers do not depend on it. It receives
bounded permitted snapshots, never database, module-host, connector or model
credentials. See ADR 0026 and scientific-methodology.md for exact methods/bounds.

After provisioning a secure installation, build the scientific image and create
the additive private overlay:

```powershell
docker build -f services/scientific/Dockerfile --target runtime -t steward-scientific:1.0.0 .
npm run scientific:provision -- .steward/your-installation
```

Re-running provisioning preserves its key/configuration and validates the Master
installation identity. Standard Steward Compose wrappers and deployment selection
include `scientific/compose.yaml` when present. The overlay adds a dedicated
internal network shared only with Master API. The scientific container has no host
port, database credentials, external network, Docker socket or live commerce
secrets. Limits: two CPUs, 768 MiB, 128 PIDs, nonroot UID 10001, read-only root,
32 MiB no-exec temporary filesystem, dropped capabilities, no new privileges.
Master has no dependency-on-readiness relationship with the service.

Private files under the installation's `scientific/` directory:

- `key.txt`: generated 256-bit HMAC secret; mounted only into Master and science.
- `config.json`: version 1, endpoint, keyFile, optional CA/servername,
  allowIsolatedHttp and maximumExecutionMillis (12000 in this overlay).
- `manifest.json`: installation identity and service version.
- `compose.yaml`: the isolated additive service/network definition.

Local isolated HTTP is accepted only for exact service hostname `scientific` with
explicit `allowIsolatedHttp=true`. HMAC authenticates exact timestamp, nonce,
method, route and body with replay protection. For production across hosts or
untrusted network boundaries use an operator-controlled HTTPS endpoint, trusted
CA, verified hostname and private key distribution; leave isolated HTTP disabled.
There are no frontend credentials or arbitrary endpoint/Python execution tools.
Rotate shared keys through a coordinated private deployment change, not chat or
source control. Production transport/availability hardening requires deployment-
specific review; local MVP acceptance does not establish commercial readiness.

Master endpoints under `/api/v4/scientific` create/read immutable datasets, start
bounded runs, retrieve/cancel runs and explicitly publish reviewed findings.
Every cross-entity read/execution requires all participants in scope; CSRF and
existing administrator authentication apply. Synthetic reference history is
separate from real operational records. Source intervals without disclosed
observations remain missing. No prices or capacity are inferred from retail
catalog totals. Same-demand procurement baselines reuse the existing exact
external-cost helper.

Runs persist complete inputs, provenance, engine metadata, results or explicit
failure codes. Restart marks unfinished runs interrupted; cancellation kills the
bounded service subprocess. Retry with a new job identity after reviewing the
failure. Repeating an identical existing identity returns its retained state;
different inputs with that identity are rejected. Historical results remain
readable during service outages. No destructive rollback or business action is
performed.

Governed MCP tools: `query_scientific_datasets`, `forecast_demand`,
`query_scientific_constraints`, `optimize_procurement`,
`compare_procurement_scenarios`, `get_scientific_result`. The
`scientific-procurement` Analyst profile uses staged discovery, forecasting,
constraints, integer optimization and scenario comparison. Scientific evidence
uses a distinct job/dataset/input-digest reference, never a fabricated Worker
source record. Compact provider-independent responses preserve full original
evidence in scientific run history. Partial results cannot become published
recommendations. Publication requires a separate authenticated human review;
affected-only delivery uses existing durable synchronization.

Validation commands (from repository root):

```powershell
npm run build
npm run test:scientific
npm run test:scientific:governance
npm run test:scientific:presentation
```

Presentation checks use intercepted API fixtures with actual Python calculations;
they do not replace deployment, real-provider, outage or synchronization acceptance.
Test evidence and pending production limitations are recorded in
`docs/phase12-verification.md`.
