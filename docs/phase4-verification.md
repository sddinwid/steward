# Phase 4 actual verification

Executed October 22, 2026 on Windows/PowerShell, Node 24.13.0, npm 10.3.0, Docker Engine 29.9.1 (Linux containers), Compose 5.6.0, and Chromium/Playwright 1.58.2. This report records executed work; final timestamps, assertions, data counts and runtime identities are in [sanitized machine-readable evidence](phase4-verification-evidence.json).

## Baseline and scope

Committed the verified Phase 3 baseline **before architecture changes** as `55ec7ef` (`feat: establish verified Phase 3 dynamic module baseline`). The working tree was clean immediately after commit. Inspected contracts, SDK/manifest, application/authentication/provider/provisioner code, ADRs and Phase 3 report/evidence. Re-ran all 18 Phase 3 unit tests and complete smoke baseline successfully.

Phase 4 changes add shared event contracts, SDK transactional capture SQL, independent operational module, Inventory availability/forward upgrade, platform migrations 4/5, one synchronization transport, Master projections/organization views, findings and synthetic dataset tooling. They do not add AI Analyst, MCP, offline enrollment or an external message broker. Historical Phase 1–3 reports remain unchanged.

Before seeding/upgrading modules, saved installation configurations, Worker 1 enrollment certificate digest and every existing Inventory record in `artifacts/phase4-preserved-baseline.json`. Final assertions compared them to the running deployment. Worker 1 retained its exact existing enrollment. Workers 2/3 were newly enrolled through the real trusted request/authorization/approval flow; no database enrollment shortcut was used.

## Builds and regression commands

| Command | Actual outcome |
| --- | --- |
| `npm run build` | All ten platform/shared/application/provisioner workspaces built |
| `npm run build:inventory` | Inventory 1.1.0 dependency installation and TypeScript build passed |
| `npm run build:operations` | Independent Operations 1.0.0 dependency installation and TypeScript build passed |
| `npm test` | **23 passed, 0 failed, 0 skipped**: 5 SDK, 8 core/security, 6 installer, 2 Inventory, 2 Operations |
| `npm run data:provision` | Additive Phase 4 overlay created; subsequent rerun preserved it |
| `npm run dev:up` | Generic release 0.4.0 built and started; 15 Compose services healthy |
| `node scripts/publish-module.mjs modules/inventory` | Signed immutable Inventory 1.1.0 published separately from core |
| `node scripts/publish-module.mjs modules/operations` | Signed immutable Operations 1.0.0 published separately from core |
| `npm run verify:phase3` | Original TLS/API/Chromium package/lifecycle/CRUD/isolation/authentication/migration recovery/outage regression passed on the upgraded platform before the synthetic seed |
| `npm run verify:phase2` | Original real login, entity registry/scopes, trusted enrollment, replay/grant rejection, certificate persistence, trust failure and outage regression passed before seeding changed its historical topology |
| `npm run seed:phase4` (repeated) | Authenticated seeding, module installation/Inventory upgrade, actual records/relationships and analytical catch-up passed; rerun retained existing records |
| `node scripts/verify-phase4-seed.mjs` | Repeated seeding retained stable installation-bound IDs and record counts, including preservation of a renamed source record; test restored the original name through its authenticated API |
| `npm run verify:phase4` (repeated) | Full Chromium/TLS/SQL bidirectional scenario passed, including process interruption and offline lifecycle updates |
| `npm run smoke` | Four applications, static assets/proxies, schema 5, identities, restricted database roles, separate volumes and shared Worker image hashes passed |
| `npm run verify:isolation` | Master outage independence, isolated Worker database failure/recovery, repeated migration, checked-out connection termination and identity binding passed |
| `node scripts/verify-outage-independence.mjs` | **540 concurrent health/readiness/platform assertions** with Master web/API/database stopped, including Worker restart while disconnected |
| `node scripts/browser-smoke.mjs` | Four frontends rendered correctly, no uncaught errors, desktop/mobile captures and viewport checks passed |
| `node scripts/verify-module-provision.mjs` | Base/security/module/data provisioning preserved configuration/catalog/key bytes, databases and module installation state |
| `node scripts/verify-module-secrets.mjs` | Actual fixture passwords and module database/gateway secrets absent from frontend bundles, module item responses and runtime logs |
| `node scripts/verify-module-restart.mjs` | Complete teardown/recreation retained enrollment, module states/configuration and Inventory data; active module APIs resumed |
| `npm audit --audit-level=low` in root, Inventory and Operations | Zero reported vulnerabilities in all three dependency trees |
| `git diff --check` | Passed; LF/CRLF advisory warnings only |

Historical Phase 2/3 browser fixtures explicitly assume Worker 2 is rejected, Worker 3 is unenrolled and Worker 2 has no module. They were run before the synthetic seed enrolled/installed those Workers. Established Phase 4 deployments should use the Phase 4 and generic persistence/isolation/smoke suites without destroying enrollment just to recreate an old fixture. Original platform/security checks and provisioner assertions remain in the combined automated tests.

## Required demonstrations

| Requirement | Observed evidence |
| --- | --- |
| Existing regressions | Build/unit, Phase 2/3 browser/API regressions before seed, plus full smoke/browser/isolation/provisioning/persistence checks on the seeded platform |
| Independent operational records | Chromium created and edited capacity on Worker 1, external storage/cost on Worker 2, and warehouse assets/cost/capacity on Worker 3. SQL/API revisions reached 2, then 3 during outage. Available asset capacity displayed 1200 m³. Inventory showed 800 stock, 200 reserved, 600 available |
| Authorized synchronization | Source database triggers produced real envelopes; Master analytical rows matched the enrolled entity, original record ID, source installation/module/stream, revision, values and event provenance |
| Duplicate prevention | Re-sent actual source envelopes with fresh transport proofs. Inbox count did not increase; one analytical row remained. Controlled finding redelivery left one local finding per recipient |
| Out-of-order/conflict handling | Re-sent an older actual record revision; current analytical revision remained 2. New event ID with conflicting values at revision 2 returned 409 |
| Worker operation without Master | Stopped all Master services. All companies successfully updated their own records. Continuous local health/readiness/identity checks and a disconnected Worker restart passed |
| Outage catch-up | Module outboxes retained committed changes while Master was down. After restoration, all analytical records reached revision 3 and the outage values with one inbox entry per actual event ID |
| Interrupted synchronization | Held the receiver's actual PostgreSQL advisory lock, waited for an in-flight exchange, sent SIGKILL to Worker 1 API, released the lock and restarted it. Catch-up resumed without duplicate processing |
| Atomic mutation/outbox | Executed a real source INSERT whose trigger created an outbox event inside the same uncommitted transaction, then terminated its PostgreSQL backend. Both record and event were absent afterward |
| Cross-entity protection | Worker-signed wrong-entity source claims and wrong enrolled entity proofs returned 403; cross-Worker session returned 401; scoped Master administrator could not request another entity's analytical data; viewer was denied |
| Finding delivery | Master issued a real finding through Chromium affecting Workers 2/3. Both received it; Worker 1 did not. Each recipient received supporting references only for its own entity |
| Finding acknowledgment | With Master stopped, Worker 2 acknowledged through Chromium. Local status/outgoing event persisted, survived SIGKILL/restart, then synchronized to Master. Stale local revision returned 409 |
| Independent lifecycle conflict handling | Master closed the finding afterward; Worker received Master revision/status while retaining its independent acknowledgment |
| Attribution/freshness | Master browser showed entity, module/stream, record ID, source Worker, event ID, source timestamp, ingestion timestamp and last contact. Copies were explicitly labeled nonauthoritative |
| Existing state intact | Original installation JSON/IDs, Worker 1 enrollment certificate digest, all pre-existing Inventory rows and unaffected legacy module state remained intact. Inventory 1.0→1.1 used an additive migration; Worker 3's legacy Inventory 1.0 remained unchanged |

All tested browser flows reported zero uncaught JavaScript errors. Screenshots of operational screens, Inventory availability, Master analytical views and Worker/Master finding lifecycle were captured. The warehouse operational screen was visually inspected.

## Reliability defects found and corrected

The expanded outage regression initially exposed new-connection readiness failures while the local PostgreSQL server remained live. Default remote `getaddrinfo` resolution can occupy Node's shared worker pool when Master DNS disappears, delaying local database connection resolution. Replaced outbound Master/provider lookup with bounded asynchronous A/AAAA resolution, preserving literal addresses/hosts entries and verified TLS, and added absolute request deadlines. The repeated 540-assertion outage test then passed; health/readiness assertions were not weakened or retried to hide the defect.

The database-stop regression also exercised the checked-out PostgreSQL connection held across an asynchronous exchange. Core now handles connection error events on checked-out clients, so queries fail/readiness becomes unavailable while process liveness survives. The regression explicitly terminates a checked-out backend and verifies subsequent persistence checks recover. Basic liveness remains independent of PostgreSQL and Master.

An early provisioning attempt found a provider connection-options copy issue before module database creation. Corrected explicit administrative connection configuration, then used persistent failed-install recovery without rotating existing secrets or removing resources. No failed attempt was reported as a successful installation.

## Evidence and retained runtime

`artifacts/phase4-results.json` records the complete latest run; `phase4-first-results.json` retains the first successful bidirectional run. Other local evidence: `phase4-seed.json`, `phase4-preserved-baseline.json`, `phase4-outage-independence.json`, Phase 2/3 result files, module restart/provision/secret check results and screenshots. Credentials and enrollment certificates are excluded from tracked evidence.

Running services: 15 healthy core/database/provider Compose services, **three active Operations containers**, **two active Inventory containers** (Worker 1 1.1.0, Worker 3 retained 1.0.0), and one stopped retained migration-recovery fixture. Worker 2 has Operations without Inventory. All Workers remain separately addressed at HTTPS 6201/6202/6203, Master at 6100; original HTTP frontend/status endpoints remain available. Each module has its own database/role on its Worker's independent PostgreSQL server.

Final evidence captured at `2026-10-22T19:58:16.552Z`: **21 analytical records, 51 retained Master inbox events, 4 findings, 2 relationships, 3 synchronized peers, and zero pending finding deliveries**. The latest end-to-end run recorded 13 successful scenario assertions and zero browser page errors. Every pre-existing operational record checked across the full teardown/recreation remained present.

## Limits

Verified on Windows Docker Desktop/Linux containers only. Native Linux/macOS/ARM, remote registries, multi-host orchestration and production PKI were not exercised. The provider still has host-root-equivalent Docker socket authority and requires a dedicated trusted host. Internal module transport is authenticated single-host Docker networking; distributed transport needs encryption and a constrained provider.

No AI savings computation, AI Analyst, MCP, offline enrollment, operational deletion/tombstones, global cross-record transaction ordering, automatic conflict repair/dead-letter removal, retention compaction or rolling module upgrade is implemented. Projection capture exports only signed declared columns; initial snapshots cannot reconstruct history before capture was enabled. Conflicting events remain durable and may block a batch for operator review. Backup/restore (including the installation-bound seed ledger), secret rotation and PKI renewal remain operator responsibilities.

Installation, configuration, transport/projection contracts, dataset assumptions, recovery and exact shutdown/reset commands: [Phase 4 operations](phase4.md). Architectural decisions: [0010](adr/0010-transactional-record-capture-and-sync.md), [0011](adr/0011-analytical-projections-and-findings.md).
