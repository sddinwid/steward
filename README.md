# CEE Steward platform — Phase 4

Platform `0.4.0` builds on verified Phase 3 commit `55ec7ef`. Independent business modules provide inventory availability, capacity, storage costs and warehouse assets. PostgreSQL transactional outboxes/inboxes deliver entity-owned analytical copies to Master and findings/status updates in both directions. Existing identities, enrollment, module state and local independence are preserved. See [Phase 4 operations and exact commands](docs/phase4.md) and [actual verification](docs/phase4-verification.md). AI Analyst, MCP and offline enrollment remain unimplemented.

## Prerequisites and first startup

Run from this repository root using Node.js **24.x**, npm **10+**, and Docker with Linux containers and Compose **2.20+** (Compose `include` support). The Phase 3 provider also requires Docker API 1.51 and named-volume subpaths (verified with Engine 29.9.1). Docker Desktop must be running. The first build needs network access to npm and container registries. All commands below work in PowerShell; npm/Docker commands also work on Linux/macOS.

```powershell
npm ci
npm run build
npm run build:inventory
npm run build:operations
npm test
npm run provision
npm run security:provision
npm run modules:provision
npm run data:provision
node scripts/compose.mjs config --quiet
npm run dev:up
npm run smoke
```

`npm run dev:up` builds four core application images and one generic module-host image and waits for fifteen containers to become healthy. It applies the optional security, module and data overlays when present and does not bind PostgreSQL to the host. Preserved Phase 1 URLs:

| Installation | React frontend | API | Health / readiness |
| --- | --- | --- | --- |
| Master | http://127.0.0.1:5100 | http://127.0.0.1:4100 | `/health`, `/ready` |
| Worker 1 | http://127.0.0.1:5201 | http://127.0.0.1:4201 | `/health`, `/ready` |
| Worker 2 | http://127.0.0.1:5202 | http://127.0.0.1:4202 | `/health`, `/ready` |
| Worker 3 | http://127.0.0.1:5203 | http://127.0.0.1:4203 | `/health`, `/ready` |

Each frontend proxies `/api/`, `/health`, and `/ready` to its own API. API route `GET /api/v1/platform` preserves the local installation identity and module inventory; enrollment is marked available only when security is configured. Sensitive v2/v3/v4 routes exist exclusively on HTTPS. Open [Master secure administration](https://master.localhost:6100) or Workers at [6201](https://worker-1.localhost:6201), [6202](https://worker-2.localhost:6202), and [6203](https://worker-3.localhost:6203) after trusting your generated development CA. Accounts must be explicitly created; no default credentials exist. See the [account and trust setup](docs/phase2.md).

## Verification

```powershell
npm run build
npm run build:inventory
npm run build:operations
npm test
npm run smoke
npm run verify:isolation
npx playwright install chromium
node scripts/browser-smoke.mjs
npm run verify:phase4
node scripts/verify-outage-independence.mjs
node scripts/verify-module-restart.mjs
node scripts/verify-module-provision.mjs
node scripts/verify-module-secrets.mjs
node scripts/compose.mjs ps
```

The 23 Node tests cover existing backend/security behavior, module SDK validation, repeatable provisioning and both independent services. Build core, Inventory and Operations before tests. Phase 4 verification requires the seeded development scenario and private test accounts, and exercises browser CRUD, provenance, bidirectional findings, duplication, authorization, interruption and outage recovery. Historical Phase 2/3 fixture suites are documented in the Phase 4 verification report; run them before changing their historical enrollment/module topology.

Smoke tests check all frontend HTML/assets, each frontend's API proxy, API health/readiness, configuration versus persisted identity, migration versions, restricted database roles, distinct data volumes, and identical Worker image IDs. Browser tests load all four React apps, check rendered identity/readiness and page errors, and capture desktop/mobile screenshots under ignored `artifacts/`.

**Run the isolation test only against a development deployment.** It creates a uniquely named probe table in each database, re-runs provisioning and compares every file hash, stops the entire Master stack, checks all Workers, stops one Worker database and checks the readiness boundary, then restarts it and verifies persistent data. It also runs real PostgreSQL migrations twice and checks rejection of a mismatched installation identity. A `finally` block restores the deployment and drops only the tables created by this run. It never drops a database or volume.

All verification scripts accept an optional deployment directory as their first positional argument:

```powershell
node scripts/smoke.mjs .steward/worker-only
```

See [Phase 4 verification results](docs/phase4-verification.md), [Phase 3 verification results](docs/phase3-verification.md), [Phase 2 verification results](docs/phase2-verification.md) and the preserved [Phase 1 baseline report](docs/verification.md).

## Shutdown, restart, and reset

Stop containers while retaining all data/configuration:

```powershell
npm run dev:down
```

Restart with retained volumes and identities:

```powershell
node scripts/compose.mjs up -d --wait --wait-timeout 180
```

Reset **database contents and module secret/state volumes**, retaining host installation configuration and credentials (destructive):

```powershell
node scripts/compose.mjs down --volumes
node scripts/compose.mjs up -d --wait --wait-timeout 180
```

Completely reset this development deployment, including identities and secrets (destructive; run from repository root). Remove the volumes before removing the configuration used to address them:

```powershell
$workspaceRoot = (Resolve-Path .).Path
if ((Get-Content -LiteralPath ./package.json -Raw | ConvertFrom-Json).name -ne 'steward-platform') { throw 'Run from Steward repository root' }
$deploymentPath = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot '.steward/dev'))
if (-not $deploymentPath.StartsWith($workspaceRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected reset target' }
node scripts/compose.mjs down --volumes --remove-orphans
if ($LASTEXITCODE -ne 0) { throw 'Compose teardown failed; configuration preserved' }
Remove-Item -LiteralPath $deploymentPath -Recurse -Force
npm run provision
npm run security:provision
npm run modules:provision
npm run data:provision
npm run dev:up
```

On Linux/macOS, after `node scripts/compose.mjs down --volumes --remove-orphans`, remove only the repository's `.steward/dev` directory, then run base, security, module and data provisioning followed by startup. Images are retained in either reset flow. Do not remove configuration or identity keys while retaining their old database volumes: identity binding deliberately rejects attaching a new installation to old data.

## Installation and provisioning

The base installer is a TypeScript workspace with the `steward-install` bin entry and a versioned Compose generator. It preserves Phase 1 files and identities; the separate security provisioner adds Phase 2 without rewriting them. The supported base source-checkout entry point is:

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

Generated Compose uses absolute build/init-script paths to this checkout and relative configuration/secret paths. Provision on the target machine; moving an existing deployment/checkout requires explicitly reviewed path edits. A registry distribution mechanism is not implemented. The standalone examples above exercise the base deployment without enrollment. [Add security to a standalone deployment](docs/phase2.md) separately; a Master trust profile adds a connection configuration but no Master startup/health dependency. All Workers with the Phase 4 data overlay use `steward-worker-api:0.4.0` and `steward-worker-web:0.4.0`; identities/secrets never enter images. Existing 0.1.0/0.2.0 manifests and base/security files remain preserved. Fresh deployments use 0.4.0. The module overlay upgrades existing core applications once; publishing/installing modules afterward does not rebuild them.

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

APIs run as a non-root user with read-only filesystems and dropped capabilities; frontends also run non-root with read-only filesystems and a temporary Nginx directory. Host bindings are loopback only. Each installation has a separate application network and internal database network, its own PostgreSQL server and volume, and separate secrets. The frontend cannot directly reach PostgreSQL. Phase 3 adds a trusted per-Worker provider and isolated module containers. PostgreSQL's admin account is used for initialization/diagnostics and by its Worker module provider; the API connects as a non-superuser owning only its local operational database. Startup runs ordered SQL migrations under a transactional advisory lock and binds identity in the same transaction. Liveness does not query PostgreSQL; readiness checks schema and identity with bounded query/connection timeouts. Shutdown closes connections on SIGTERM/SIGINT.

Compose file secrets are local bind-mounted files, **not an encrypted secret manager**. On POSIX, deployment and secret directories are private (0700); secret files are read-only (0444) so individually mounted files can be read by the different non-root container UIDs. Host users cannot traverse the private parent directories. Compose file secrets do not remap file ownership. Windows permissions inherit the parent directory ACL. Keep `.steward` private to the operator, out of source control, and backed up with the database. Never paste secret files into logs/issues. Do not rotate a password file alone: a retained PostgreSQL role password must also be changed through an administrative rotation procedure, which is outside Phase 1.

This is a local development environment. HTTP local status/identity reads remain unauthenticated; sensitive entity/authentication/enrollment writes require the HTTPS overlay, real accounts, CSRF protection, and role/entity authorization. Private security material has additional operator-only directory protection, including a restricted Windows ACL. The [production trust model and remaining limits](docs/phase2.md) cover managed PKI/renewal, secrets, backups, and operational hardening. MCP, AI/Python analytics and multi-host orchestration remain unimplemented. Durable synchronization and manual analytical findings are implemented in Phase 4. The module provider has Docker socket authority equivalent to host root and requires a dedicated trusted Worker host; it is not a multi-tenant sandbox. Modules receive only their own database/gateway credentials. [Review the module trust model](docs/phase3.md). Offline enrollment is a versioned signed-grant contract only.

## Repository layout and decisions

```text
apps/{master-api,worker-api}/    Separate Fastify entry points
apps/{master-web,worker-web}/    Separate React/Vite applications
packages/contracts/            Versioned identities, module and extension contracts
packages/platform/             Config, persistence/migrations, API lifecycle, module interface
packages/ui/                   Shared status/security UI and generic module renderer
packages/module-sdk/           Versioned manifest, signature and compatibility contracts
packages/module-host/          Generic trusted OCI deployment provider
modules/inventory/             Inventory 1.1, availability, additive migration and projection
modules/operations/            Capacity, storage costs and warehouse assets
datasets/                      Synthetic scenario, separate from application logic
tools/installer/               Versioned provisioning CLI and tests
infra/                         API/web Dockerfiles, Nginx proxy, database initialization
scripts/                       Smoke, browser, persistence and isolation verification
docs/adr/                      Architectural decision records
```

ADRs: [deployment isolation](docs/adr/0001-deployment-isolation.md), [identity and persistence](docs/adr/0002-identity-persistence.md), [extension boundaries](docs/adr/0003-extension-boundaries.md), and [provisioning/security](docs/adr/0004-provisioning-security.md).

Phase 2 ADRs: [enrollment trust and identity](docs/adr/0005-enrollment-trust-and-identity.md), [administrator authentication](docs/adr/0006-administrator-authentication.md), and [HTTPS/offline availability](docs/adr/0007-additive-https-and-offline-availability.md). Phase 1 ADRs remain historical records; these explicitly extend their enrollment/security boundaries.

Phase 3 ADRs: [independent services and declarative UI](docs/adr/0008-independent-module-services-and-declarative-ui.md), [trusted provider and recoverable installation](docs/adr/0009-trusted-provider-and-recoverable-installation.md).

Publish Inventory only after the generic platform is running:

```powershell
npm run modules:publish
```

Sign in to Worker 1 or 3 over HTTPS, refresh Module Manager, inspect/configure/install the package, activate it, and open Inventory navigation. Worker 2 can remain module-free. See the [exact procedure](docs/phase3.md). Use the repository wrapper for shutdown/reset: `npm run dev:down` handles dynamic module containers while preserving their databases and desired activation. Direct `docker compose down` bypasses that handling.

Phase 4 startup and synthetic demonstration (after initial account bootstrap/enrollment):

```powershell
node scripts/publish-module.mjs modules/inventory
node scripts/publish-module.mjs modules/operations
npm run seed:phase4
npm run verify:phase4
```

The development seed uses real private account fixtures created by Phase 2 verification, or an explicitly supplied private credential file; see [Phase 4 operations](docs/phase4.md). It enrolls Workers 2/3, installs Operations, preserves Worker 1 enrollment and existing Inventory records, and performs real synchronization. Run historical Phase 2/3 browser fixture suites before this seed changes their original topology. On an established Phase 4 dataset use Phase 4, isolation, persistence, smoke and unit regressions without resetting enrollment.

Phase 4 ADRs: [transactional capture and durable transport](docs/adr/0010-transactional-record-capture-and-sync.md), [governed analytical copies and findings](docs/adr/0011-analytical-projections-and-findings.md).
