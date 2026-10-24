# Phase 8 checkpoint verification — incomplete release

Date: 2026-10-23. Branch: `phase8/smart-modules-commerce`.

**Phase 8 is not complete, has no v0.8.0 release tag, and is not ready for the next phase.** This report establishes a tested SSMA foundation, not simulator-based commerce acceptance or commercial production readiness. Missing adapters/simulators are unimplemented work, not merely unavailable commercial credentials.


## Continuation results (2026-10-23)

The continuation from `fa79ac7` implements separate Shopify 1.0.0, Printify 1.0.0 and Stock Ledger 1.0.0 packages, Inventory 1.4.0 and Sales 1.1.0, module-only commerce kit 1.0.0, SDK 1.4.0 and business kit 1.3.0. Append-only platform migrations 8�9 add commerce routing evidence and retained workflow governance. See [commerce configuration and recovery](phase8-commerce.md) and [ADR 0019](adr/0019-commerce-adapters-and-issued-effects.md).

Actual continuation checks: root build and 75 backend tests passed (14 SDK, 2 host, 27 platform, 6 installer, 2 Inventory, 2 Operations, 7 business, 7 SSMA, 8 commerce). An additional chronological margin test subsequently passed in the 28-test platform suite; the final whole-suite run remains required. Commerce tests use real module APIs/PG databases and two separate authenticated TLS simulators; they cover governed import/reservation/production/shipment/channel fulfillment, explicit production permission, signed webhook replay/forgery, publication privacy, independent-provider substitution without Sales edits, lost create/production/fulfillment acknowledgments with exactly one effect, and expired credentials.

The separate `.steward/phase8-acceptance` deployment is running on ports offset by 10000. All three Workers were enrolled through the actual trusted flow. Chromium installed and activated five packages on Worker 1, Stock Ledger alone on Worker 2 and four packages on Worker 3. Worker API/frontend image IDs remained unchanged during module additions. Worker 2 remains without Inventory. Actual browser commerce completed on Workers 1 and 3: each imported one Shopify order, reserved two units, explicitly approved one Printify order and one production submission, consumed stock from 20 to 18, observed shipment, synchronized one Shopify fulfillment, and approved publication. Real raw ingress accepted duplicate signed webhooks and rejected forged signatures. No browser JavaScript errors were recorded.

Reports: `artifacts/phase8-deployed-enroll.json`, `phase8-deployed-modules.json`, `phase8-deployed-commerce.json`, `phase8-commerce-backend.json`; screenshots `artifacts/phase8-worker-*-modules.png` and `phase8-worker-*-commerce.png`. They are local generated evidence, not a release archive. Deployment exposed and corrected two issues: Docker default subnet exhaustion (explicit non-overlapping private subnets, no pruning) and Docker's lack of published ingress on internal-only simulator networks (separate loopback-published TLS simulator network). A browser harness timing issue was corrected by waiting for the actual record row.

The retained Phase 7 project was not stopped, upgraded or reset. Its 27 containers and original databases/configuration remain separate. Mandatory final earlier-phase regressions, broad deployed outage/restart matrix, Master commerce MCP/real-model findings, v0.7 upgrade, clean release packaging and archive redeployment remain OPEN. No v0.8.0 tag exists. The historical checkpoint evidence below predates this continuation and is retained for provenance; its descriptions of unimplemented adapters are superseded by the results above.

## Preserved baseline and implementation

The starting tree was clean at `59a3b865ccc59b2024644e558670f9402632ab2e`, tagged `v0.7.0`. Initial `npm test` passed 52 tests, `npm run build` succeeded and all four existing API/frontend/persistence smoke checks passed before shared changes. Architecture/preservation rules were committed as `b5cc54c`; the tested kernel implementation is `dae8583a2ddc142ab292a548126f570da4bcb0fb`.

Target source/core version is 0.8.0; SDK is 1.3.0, module-only business kit 1.2.0 and host package 0.8.0. Manifest, SDK and existing integration wire versions remain 1. Existing business-module sources/packages were not modified or republished: Inventory 1.3.2, Operations 1.0.0, Procurement 1.0.2, Sales 1.0.2, Assets 1.0.3 and Workforce 1.0.2 remain retained. No current business package advertises the new SSMA declarations yet.

Implemented files cover signed optional capability contracts, deterministic explainable resolution, verified persistent provider snapshots, explicit pinned bindings, obligation retention, versioned workflow proposal/approval/activation, bounded durable execution, an independent non-repeatable issuance journal, capability-based module outbox routing and Worker administration screens. Platform migration 7 adds tables; earlier migrations remain unchanged. See [reference and recovery limits](phase8-ssma.md), [ADR 0018](adr/0018-smart-module-capabilities.md), and [official commerce API research](phase8-commerce-research.md).

## Actual validation

| Command/check | Actual result | Scope |
|---|---|---|
| `npm run build` | Passed | All root applications/packages and four Phase 7 business module builds |
| `npm test` | **63 passed, 0 failed** | SDK 14; host naming 2; platform 23; installer 6; Inventory 2; Operations 2; existing business integration 7; SSMA PostgreSQL integration 7 |
| `npm run test:smart:browser` | **8 passed, 0 failed** | Seven PostgreSQL/backend checks repeated plus one real Chromium UI acceptance check |
| `node scripts/smoke.mjs .steward/phase7-release-verified` | Passed for Master and all three Workers | Retained **0.7.0** deployment, not a 0.8 runtime deployment |
| `node scripts/release.mjs verify --bundle artifacts/releases/steward-0.7.0` | All checksums passed | Original accepted archive preserved |
| `node scripts/release.mjs pack --version 0.8.0 --directory .steward/phase7-release-verified` | Rejected as expected | Prevents relabeling Phase 7 images as an unverified Phase 8 release; no 0.8 archive created |
| `git diff --check` | Passed | Whitespace validation |

The SDK tests cover deterministic ambiguity/preference, entity/permission/version/schema/event/sensitivity/configuration/health incompatibility, signed metadata tampering, remote schema rejection and closed value schemas. Existing backend regressions still pass, including genuine module inbox/outbox effects, original business transitions and deterministic analytical calculations.

SSMA acceptance uses PostgreSQL 17.10 in its own disposable Docker container, signed synthetic descriptors, actual module-owned Fastify inboxes and real password/session/Origin/CSRF enforcement. Package image IDs and health transport are fixtures. It verifies schema-6-to-7 migration and a repeated migration without changing retained identities/accounts/configuration, trusted-only registry reconstruction, administrative denials, workflow lifecycle enforcement, pinned command receipts, concurrent execution, a lost acknowledgment after a committed stock effect, provider substitution without obligation transfer, valid signed upgrades, invalid signatures, reinstall/configuration/entity mismatch and revoked authority.

Capability outbox tests call the actual routing implementation and real module inboxes, checking stable routed envelopes, causal gaps, altered replay rejection and original-provider retention. Malformed responses suspend with a schema error; four controlled safe transport failures exhaust the retry budget without effects. A non-repeatable test commits its module effect then loses the response; its independently committed issuance journal prevents another call even after a simulated coordinator restart.

Chromium loads the production Smart Modules component over isolated HTTPS, signs in through the actual authentication route, inspects ambiguity, approves an explicit provider, reloads the page with its retained secure session and displays an unavailable provider. This is a component/API integration fixture, not acceptance of the complete Worker deployment. No JavaScript errors were observed. The new Docker-host dispatcher/lifecycle-lock path is built but has not been exercised in a packaged 0.8 runtime.

These test providers share a synthetic stock implementation under different signed identities. They do **not** demonstrate two independently implemented packaged providers, unchanged Sales interoperability, paid production or Shopify/Printify behavior.

Latest sanitized fixture results are committed in [phase8-verification-evidence.json](phase8-verification-evidence.json). Raw regenerated reports and screenshot are `artifacts/phase8-smart-backend-verification.json`, `artifacts/phase8-smart-browser-verification.json` and `artifacts/phase8-smart-browser.png`. The browser run repeats backend cases; its eight checks are not eight additional independent backend tests. Earlier local test failures exposed harness selectors/session handling and a trust-failure classification issue; those were corrected before the final passing runs.

## Running services and resource observation

The retained `.steward/phase7-release-verified` deployment remains on its accepted image IDs: 15 healthy core/database/host containers plus 12 module services, **27 containers** total. Master remains at API 4100/web 5100/HTTPS 6100; Workers remain at APIs 4201–4203/webs 5201–5203/HTTPS 6201–6203. Workers retain four separate PostgreSQL volumes (including Master) and identical Worker API/frontend images. No retained identity, database, secret or release configuration was reset; new test containers and temporary test secret files were removed. No Phase 8 service or commerce simulator is running.

`node scripts/measure-phase7.mjs .steward/phase7-release-verified` observed **1,179.26 MiB** aggregate container memory and **26.44%** aggregate Docker CPU at one point. It confirmed that business operational code remains absent from Worker core images. These are measurements of the retained 0.7 deployment, not 0.8 sizing, sustained load or a benchmark. No model was loaded for this checkpoint's tests.

## Mandatory gates still open

| Gate | Status and missing evidence |
|---|---|
| A — Prior behavior | Root regression tests pass; full earlier deployment-mutating suites have **not** been rerun against 0.8 |
| B — SSMA | Kernel/fixture checks pass; independently packaged providers, actual Sales substitution, operational schema/version constraints and deployed restart/lifecycle acceptance remain pending |
| C — Commerce | **Unimplemented:** Shopify and Printify module packages, simulators, signed ingress/polling, canonical mappings, production guards and complete commerce/replay/recovery/privacy E2E |
| D — UI | Production component fixture passes; real packaged Worker module/provider activation and commerce screens remain pending |
| E — Master/MCP/AI | Existing unit regressions pass; new commerce projections, metrics, anomaly tools, real-model commerce investigation and reviewed affected-Worker findings remain unimplemented/unverified |
| F — Release | Only representative schema migration is tested; full retained deployment upgrade, clean packaged install, identical core hashes during module addition, final archive checksums and archive redeployment remain pending |

The complete outage/failure matrix remains open: deployed Master/Worker/coordinator/provider outages, simulator outages/throttling, webhook replay/out-of-order recovery, mid-workflow module restarts/upgrades, expired/invalid connector credentials and external uncertain production outcomes have not been accepted. Source-level fixture tests must not be substituted for this evidence.

No 0.8 release artifacts, successful-release tag, new commerce model calls/calculations, published commerce findings, production account validation or real manufacturing requests exist. Human review/publication and all deferred offline-enrollment contracts remain unchanged. Further implementation and acceptance are required before release packaging can be enabled.

## Additional acceptance at continuation commit

Root build and 78 tests passed: SDK 14, host 2, platform 28, installer 7, Inventory 2, Operations 2, business 7, SSMA 7 and commerce 9. Retained workflow/provider continuation and expired credential recovery now have meaningful coverage.

The deployed recovery check passed with Master/simulator outages and Worker/coordinator/Printify-module restarts. Six distinct synthetic Worker 1 orders were retained across harness attempts, with six external creates, production submissions and channel fulfillments, stock 20 to 8; no repeated identity effect. Module restoration and concurrent source-update revision handling were corrected in the runner. Broker transport failures now report HTTP 503.

Qwen completed real commerce investigation fd26030c-ccf0-4114-b2b4-75fe32c7dd5e in 26,531 ms using live authorized MCP calls and two source orders across Workers 1 and 3. Independent exact-cent recomputation confirmed revenue EUR 100.00, estimated production EUR 48.00, shipping EUR 8.00 and estimated margin EUR 44.00. Narrative review confirmed estimates and refund/tax limitations. Browser publication delivered only to Workers 1 and 3; both acknowledged; Worker 2 received none. Provider configuration bytes were restored and the model unloaded.

Actual deployed MCP testing found an ambiguous ID across legacy and commerce streams. Commerce source resolution now includes its declared stream and passes duplicate/stale source and entity-isolation checks. See artifacts/phase8-ollama-commerce.json, phase8-commerce-mcp.json, phase8-deployed-recovery.json and phase7-reviewed-fd26030c-ccf0-4114-b2b4-75fe32c7dd5e.json.

Full earlier-phase regression, upgrade and clean archive acceptance remain OPEN. Candidate packaging is explicitly labelled and requires clean source. Final packaging additionally requires recorded passing release gates. No v0.8.0 tag exists.
