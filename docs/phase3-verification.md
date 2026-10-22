# Phase 3 actual verification

Executed on October 22, 2026, Windows/PowerShell, Node 24.13.0, npm 10.3.0, Docker Engine 29.9.1 (Linux containers), Compose 5.6.0 and Chromium through Playwright 1.58.2. These are executed checks. Machine-readable timestamps, core image/container identities and results are recorded in [the sanitized evidence](phase3-verification-evidence.json).

## Preserved baseline

Phase 2 is committed as `9c518b5` (`feat: establish verified Phase 2 enrollment baseline`), atop Phase 1 `faf25e8`. Before Phase 3 changes, inspected the README, all seven ADRs, both verification reports, shared contracts, application/security code, installation tooling and tests. Ran the complete baseline build, all 12 tests, smoke, Phase 2 TLS/browser suite, isolation/persistence suite and four-frontend browser smoke; all passed. The original reports remain unchanged. Installation v1 identities/configuration, base/security Compose files, enrollment keys/certificates and operational data were retained.

## Real dynamic installation

At `2026-10-22T18:31:38.217Z`, all three running Workers had zero installed module records, no Inventory API (404) and no discovered navigation. The signed catalog was empty. Saved this state, all core image hashes, container IDs and start times in `artifacts/phase3-initial-baseline.json`, with browser screenshots for every Worker.

Only afterward, `scripts/publish-module.mjs` built the separate Inventory image and published its signed descriptor. Inventory `cee.inventory@1.0.0` arrived as image **`sha256:4b4a9640260ee2b20e6f486a0c6be1e701c839306c902d3b616ce85a578178e8`**. The Worker Dockerfiles neither copy nor compile `modules/inventory`; the running core filesystems were also checked for its absence.

Chromium installed and activated Inventory through Worker 1's Module Manager, discovered its navigation, created `PHASE3-W1`, and edited its name and quantity to `19.375`. Worker 3 remained absent until its own subsequent browser installation, then independently created/edited `PHASE3-W3`. Actual API responses and SQL queries against each dedicated database confirmed the records. Worker 1 configuration uses quantity unit `pieces`; Worker 3 uses `boxes`.

During this publication/installation/activation/CRUD window, **all eight core image hashes, container IDs and start times stayed identical**, including both API and web images shared by the three Workers. First successful full-suite evidence is retained in `artifacts/phase3-first-verification.json`. Later deliberate platform development rebuilds and restart tests occur outside that installation window; final verification again compares identities within its own operation window. Reruns reuse persisted modules and retain the original absence/install evidence rather than pretending a new installation occurred.

Worker 2's module registry, database list and installation configuration hash remained unchanged. It has no Inventory database or navigation and its authenticated Inventory API returns 404. Cross-checks found no Worker 3 SKU in Worker 1's database and no Worker 1 SKU in Worker 3's database.

## Commands and observed results

| Command/check | Observed result |
| --- | --- |
| `npm run build` | All 10 core/shared/tool workspaces built successfully |
| `npm run build:inventory` | Independent package dependency install and TypeScript build passed |
| `npm test` | **18 passed, 0 failed, 0 skipped**: 3 SDK, 7 platform/security, 6 provisioner, 2 Inventory |
| `npm run dev:up` | Generic platform upgrade/build succeeded; 15 Compose services healthy |
| `npm run modules:publish` | Built/published only the separate signed Inventory package after core was running |
| `npm run verify:phase3` | Real TLS/API/browser installation and all CRUD, isolation, permission, lifecycle, recovery, restart and outage assertions passed |
| `node scripts/verify-module-restart.mjs` | Complete down/removal/recreation preserved module install rows/configuration, every Inventory record, local enrollment certificates and core image hashes; active module containers/APIs resumed |
| `node scripts/verify-module-provision.mjs` | Base/security/module provisioning preserved every file byte, signed published catalog, publisher key, database list and installation record on the populated deployment |
| `node scripts/verify-module-secrets.mjs` | Actual fixture passwords and module database/gateway credentials absent from frontend bundles, item responses and runtime stdout/stderr logs |
| `npm run verify:phase2` | Original registration, Master-hosted authentication, entity scopes, proof/grant adversarial checks, enrollment persistence and outage browser suite passed on Phase 3 |
| `npm run verify:isolation` | Original hash-preserving provisioning, isolated database failure, repeatable migrations, wrong-installation rejection and Master outage checks passed |
| `npm run smoke` | Four frontends/assets/proxies and APIs, schema 3, distinct PostgreSQL volumes/identities, restricted database roles and identical Worker core image IDs passed |
| `node scripts/browser-smoke.mjs` | All four React apps rendered identity/readiness with zero page errors; desktop/mobile captures and viewport checks passed |
| `npm audit --audit-level=low` (root and Inventory) | Zero reported vulnerabilities in both dependency trees |
| `git diff --check` | Passed; local LF/CRLF advisory warnings only |

## Security, concurrency and recovery exercised

- Tampered signatures and unknown publishers returned 400 before installation records/resources were created. Correctly signed incompatible-platform and missing-dependency packages returned 409. Invalid closed-schema configuration returned 400. SDK tests reject unsupported SDK versions, script URL contributions, path traversal, foreign permission namespaces and destructive rollback declarations.
- Six concurrent/repeated requests returned completed/idempotent results or an explicit operation conflict; one module installation and one exact-image container remained. Reusing an operation ID with different configuration was rejected. Lifecycle and installation locks are independent of shared API traffic locks.
- Unauthenticated API access returned 401; cross-Worker session reuse returned 401; missing CSRF returned 403. An authenticated local `module_user` could neither administer/install modules nor list Inventory until explicitly granted read permission. It then listed successfully but writes still returned 403. Its browser showed the module screen without creation/editing or Module Manager controls.
- The actual module-host verified its TLS hostname/CA and accepted a Worker-signed proof. Replaying that proof returned 409. Altered, stale or wrong-installation proofs returned 403. Sensitive v3 routes were absent from HTTP. Direct internal service access without its gateway token returned 401. The module role could not connect to the Worker core database (PostgreSQL 42501).
- Inspected runtime containers: immutable signed module image, nonroot user, read-only filesystem, dropped capabilities, one read-only secret-volume subpath, no published port or Docker socket, and only its own module/database networks.
- A **real independently built migration-check fixture** executed `CREATE TABLE ...; SELECT 1/0;`. Installation returned 503 with `MIGRATION_FAILED`, the manager displayed a persistent failed state/error, and SQL confirmed no partial tables. Explicit recovery using a corrected signed `1.0.1` applied both migrations successfully to the retained database. The test fixture remains disabled; no database was dropped, no existing secret rotated and no down migration ran. Provider state/configuration files now use synced atomic replacement to avoid torn JSON on interruption.
- Deactivation stopped the service, returned 404 at its application gateway and retained all database rows. Reactivation restored access. Worker/API/provider restarts retained enrollment, configuration, activation and records without Master administrator login.
- With **Master web, API and database all stopped**, every Worker health/readiness endpoint remained 200, Inventory created a new record through its authenticated application API, and Chromium read it successfully. Services were restored afterward. Browser installation/CRUD flows reported zero uncaught JavaScript errors.

## Evidence and running state

Ignored local evidence includes `artifacts/phase3-initial-baseline.json`, `phase3-first-verification.json`, `phase3-results.json`, `phase3-restart-results.json`, `phase3-provision-results.json`, `phase3-secret-check.json`, and `phase2-results.json`. Screenshots: `phase3-worker-{1,2,3}-before.png`, `phase3-worker-{1,3}-inventory.png`, `phase3-migration-failure.png` and `phase3-master-outage.png`. The Inventory screenshot was visually inspected. The tracked evidence intentionally excludes credentials and enrollment certificates.

The development deployment is retained running: Master and three Worker APIs/frontends/databases, three generic module hosts (15 healthy Compose services), and two separate active Inventory containers. A third dynamically managed migration-check fixture container is stopped with its database retained. Worker 1 remains enrolled; Workers 2/3 retain their prior enrollment states. Access Master at `https://master.localhost:6100`, Workers at `https://worker-1.localhost:6201`, `https://worker-2.localhost:6202`, `https://worker-3.localhost:6203`. Existing loopback HTTP status/frontend endpoints remain available on 4100/5100 and 4201–4203/5201–5203.

## Limits

The generic provider has **host-root-equivalent Docker socket authority** and its own Worker's database administrative credential. It requires a dedicated trusted host; shared multi-tenant production isolation needs a constrained orchestration provider. Modules have narrower credentials/network/container access, but trusted publisher code is not an adversarial sandbox. The module service link uses authenticated single-host internal Docker networking; cross-host deployment needs encrypted service transport. Production PKI, certificate renewal, backup/restore and secret rotation remain operator responsibilities.

Verified only on Windows Docker Desktop with Linux containers, the local preloaded OCI image provider, one Inventory version, and declarative CRUD UI. Native Linux/macOS, ARM, a remote registry, multi-host deployment and production PKI were not exercised. SDK is locally linked and versioned; no public npm SDK/registry distribution is published. Active upgrades/uninstall, richer executable UI extensions, durable event delivery, MCP, analytics and the offline enrollment workflow are not implemented. Signed event/analytical declarations are contracts only. Full crash/power-loss fault injection and distributed reconciliation were not tested; real migration failure, retained-state retries, atomic state writes and complete container teardown/recreation were exercised.

Exact setup, package format, configuration, permissions and recovery procedures: [Phase 3 operations](phase3.md), [README](../README.md), [ADRs 0008](adr/0008-independent-module-services-and-declarative-ui.md) and [0009](adr/0009-trusted-provider-and-recoverable-installation.md).
