# CEE Steward platform — Phase 1

Runnable release `0.1.0`: independent Master and Worker APIs, React frontends, PostgreSQL persistence, and provisioner format v1. No business modules or remote integrations are implemented.

## Prerequisites and first startup

Run from this repository root using Node.js **24.x**, npm **10+**, and Docker with Linux containers and Compose **2.20+** (Compose `include` support). Docker Desktop must be running. The first build needs network access to npm and container registries. All commands below work in PowerShell; npm/Docker commands also work on Linux/macOS.

```powershell
npm ci
npm run build
npm test
npm run provision
docker compose config --quiet
npm run dev:up
npm run smoke
```

`npm run dev:up` builds four application images and waits for all twelve containers to become healthy. It does not bind PostgreSQL to the host. Local URLs:

| Installation | React frontend | API | Health / readiness |
| --- | --- | --- | --- |
| Master | http://127.0.0.1:5100 | http://127.0.0.1:4100 | `/health`, `/ready` |
| Worker 1 | http://127.0.0.1:5201 | http://127.0.0.1:4201 | `/health`, `/ready` |
| Worker 2 | http://127.0.0.1:5202 | http://127.0.0.1:4202 | `/health`, `/ready` |
| Worker 3 | http://127.0.0.1:5203 | http://127.0.0.1:4203 | `/health`, `/ready` |

Each frontend proxies `/api/`, `/health`, and `/ready` to its own API. API route `GET /api/v1/platform` returns the configured installation identity, release, an empty module inventory, and explicit `not_implemented` extension statuses. There are no enrollment or module installation routes.

## Verification

```powershell
npm run build
npm test
npm run smoke
npm run verify:isolation
npx playwright install chromium
node scripts/browser-smoke.mjs
docker compose ps
```

The eight Node tests cover configuration/secret validation, local health versus persistence readiness, recovery, absent future routes, provisioning isolation, both standalone modes, rerun preservation, and lock/topology failures. Build before tests because Node executes compiled TypeScript.

Smoke tests check all frontend HTML/assets, each frontend's API proxy, API health/readiness, configuration versus persisted identity, migration versions, restricted database roles, distinct data volumes, and identical Worker image IDs. Browser tests load all four React apps, check rendered identity/readiness and page errors, and capture desktop/mobile screenshots under ignored `artifacts/`.

**Run the isolation test only against a development deployment.** It creates a uniquely named probe table in each database, re-runs provisioning and compares every file hash, stops the entire Master stack, checks all Workers, stops one Worker database and checks the readiness boundary, then restarts it and verifies persistent data. It also runs real PostgreSQL migrations twice and checks rejection of a mismatched installation identity. A `finally` block restores the deployment and drops only the tables created by this run. It never drops a database or volume.

All verification scripts accept an optional deployment directory as their first positional argument:

```powershell
node scripts/smoke.mjs .steward/worker-only
```

See [actual verification results](docs/verification.md).

## Shutdown, restart, and reset

Stop containers while retaining all data/configuration:

```powershell
npm run dev:down
```

Restart with retained volumes and identities:

```powershell
docker compose up -d --wait --wait-timeout 180
```

Reset **database contents only**, retaining installation configuration and credentials (destructive):

```powershell
docker compose down --volumes
docker compose up -d --wait --wait-timeout 180
```

Completely reset this development deployment, including identities and secrets (destructive; run from repository root). Remove the volumes before removing the configuration used to address them:

```powershell
$workspaceRoot = (Resolve-Path .).Path
if ((Get-Content -LiteralPath ./package.json -Raw | ConvertFrom-Json).name -ne 'steward-platform') { throw 'Run from Steward repository root' }
$deploymentPath = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot '.steward/dev'))
if (-not $deploymentPath.StartsWith($workspaceRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected reset target' }
docker compose down --volumes --remove-orphans
if ($LASTEXITCODE -ne 0) { throw 'Compose teardown failed; configuration preserved' }
Remove-Item -LiteralPath $deploymentPath -Recurse -Force
npm run provision
npm run dev:up
```

On Linux/macOS, after `docker compose down --volumes --remove-orphans`, remove only the repository's `.steward/dev` directory, then run the same provisioning/startup commands. Images are retained in either reset flow. Do not remove configuration while retaining its old database volume: identity binding deliberately rejects attaching a new installation to old data.

## Installation and provisioning

The installer is a TypeScript workspace with the `steward-install` bin entry and a versioned Compose generator. The supported source-checkout entry point is:

```powershell
node tools/installer/dist/cli.js --help
node tools/installer/dist/cli.js provision --directory .steward/dev --mode all --workers 3 --project steward-dev --label "Local Steward"
```

The installer creates a deployment atomically, with a sibling exclusive lock. Configuration/identity JSON, separate random app/admin secrets per installation, a manifest, and the generated Compose file persist under the chosen directory. PostgreSQL volumes belong to its Compose project. A repeat invocation with the same options validates and **preserves every file**. Modified display names are preserved. Missing or corrupt configuration/secrets, topology changes, and unsupported provisioner/release versions fail closed instead of regenerating identity or destroying data. An interrupted provisioner may leave a sibling `.provision-lock` directory: confirm no provisioner is running before removing that exact lock and retrying.

Before startup, edit each `installation.json` to set its entity display name or identity to the organization's assigned UUIDs. Once initialized, installation ID, entity ID, and role are bound to the database and are immutable in Phase 1; mismatch prevents startup. Display names remain configuration-driven. To change only a display name after startup, edit the JSON and restart that API. The installer generates fresh local identities; this **does not authenticate or enroll** an installation.

Standalone deployment examples (stop the default environment first to avoid host-port collisions):

```powershell
npm run dev:down
node tools/installer/dist/cli.js provision --directory .steward/worker-only --mode worker --workers 1 --project steward-worker-only --label "Local Worker"
docker compose -f .steward/worker-only/compose.yaml up --build -d --wait --wait-timeout 180
node scripts/smoke.mjs .steward/worker-only
docker compose -f .steward/worker-only/compose.yaml down

node tools/installer/dist/cli.js provision --directory .steward/master-only --mode master --project steward-master-only --label "Local Master"
docker compose -f .steward/master-only/compose.yaml up --build -d --wait --wait-timeout 180
node scripts/smoke.mjs .steward/master-only
docker compose -f .steward/master-only/compose.yaml down
```

Generated Compose uses absolute build/init-script paths to this checkout and relative configuration/secret paths. Provision on the target machine; moving an existing deployment/checkout requires an explicitly reviewed path edit in its Compose file. A registry distribution/upgrade mechanism is not implemented. Standalone Worker deployment has no Master service, URL, network, or dependency. All Worker instances use `steward-worker-api:0.1.0` and `steward-worker-web:0.1.0`; no identities or secrets enter those images.

## Configuration and security boundary

| Setting | Meaning |
| --- | --- |
| `INSTALLATION_CONFIG_FILE` | Required path to config v1 JSON |
| `DB_HOST`, `DB_NAME`, `DB_USER` | Required database connection parameters |
| `DB_PASSWORD_FILE` | Required secret-file path, minimum 24 characters |
| `DB_PORT` | Database port, default 5432 |
| `DB_SSL_MODE` | `verify-full` by default; `disable` explicitly allowed for isolated local Compose networks |
| `DB_CA_FILE` | Required CA certificate path when verifying TLS |
| `HOST`, `PORT` | API bind address/port; defaults `127.0.0.1:3000`; containers explicitly bind internally to `0.0.0.0` |

APIs run as a non-root user with read-only filesystems and dropped capabilities; frontends also run non-root with read-only filesystems and a temporary Nginx directory. Host bindings are loopback only. Each installation has a separate application network and internal database network, its own PostgreSQL server and volume, and separate secrets. Only its API joins both networks; the frontend cannot directly reach PostgreSQL. PostgreSQL's admin account is used only for initialization/diagnostics; the API connects as a non-superuser owning only its local operational database. Startup runs ordered SQL migrations under a transactional advisory lock and binds identity in the same transaction. Liveness does not query PostgreSQL; readiness checks schema and identity with bounded query/connection timeouts. Shutdown closes connections on SIGTERM/SIGINT.

Compose file secrets are local bind-mounted files, **not an encrypted secret manager**. On POSIX, deployment and secret directories are private (0700); secret files are read-only (0444) so individually mounted files can be read by the different non-root container UIDs. Host users cannot traverse the private parent directories. Compose file secrets do not remap file ownership. Windows permissions inherit the parent directory ACL. Keep `.steward` private to the operator, out of source control, and backed up with the database. Never paste secret files into logs/issues. Do not rotate a password file alone: a retained PostgreSQL role password must also be changed through an administrative rotation procedure, which is outside Phase 1.

This is a local development environment. HTTP and local status/identity read endpoints are unauthenticated. No business write endpoints exist. Public deployment requires TLS ingress, authentication/authorization, managed secrets, backups, and operational hardening. Authenticated enrollment, MCP servers, AI/Python analytics, durable synchronization, module loading/installing, topology upgrades, and multi-host orchestration are explicitly not implemented.

## Repository layout and decisions

```text
apps/{master-api,worker-api}/    Separate Fastify entry points
apps/{master-web,worker-web}/    Separate React/Vite applications
packages/contracts/            Versioned identities, module and extension contracts
packages/platform/             Config, persistence/migrations, API lifecycle, module interface
packages/ui/                   Shared status UI; no business logic
tools/installer/               Versioned provisioning CLI and tests
infra/                         API/web Dockerfiles, Nginx proxy, database initialization
scripts/                       Smoke, browser, persistence and isolation verification
docs/adr/                      Architectural decision records
```

ADRs: [deployment isolation](docs/adr/0001-deployment-isolation.md), [identity and persistence](docs/adr/0002-identity-persistence.md), [extension boundaries](docs/adr/0003-extension-boundaries.md), and [provisioning/security](docs/adr/0004-provisioning-security.md).
