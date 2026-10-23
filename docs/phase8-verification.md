# Phase 8 checkpoint verification — incomplete release

Date: 2026-10-23. Branch: `phase8/smart-modules-commerce`.

**Phase 8 is not complete, has no v0.8.0 release tag, and is not ready for the next phase.** This report establishes a tested SSMA foundation, not simulator-based commerce acceptance or commercial production readiness. Missing adapters/simulators are unimplemented work, not merely unavailable commercial credentials.

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
