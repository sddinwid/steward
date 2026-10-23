# Steward 0.7.0 — Phase 7 acceptance verification

Verified on 2026-10-23. Source, runtime, browser, security, synchronization and genuine local-model acceptance passed. The final archive binding, repeated deployment hashes and exact image identities are in [the sanitized post-packaging evidence](phase7-verification-evidence.json). This is an MVP verification, not commercial production certification.

## Baseline and implementation

The clean Phase 6 baseline `6a508dc` is preserved by annotated tag `v0.6.0`. Work uses branch `phase7/business-module-expansion`. Preflight inspected the repository, ADRs, SDK/host, installation/release tooling, persistence, synchronization, MCP/Analyst, previous verification and tests. The baseline build, 34 existing tests, smoke and isolation checks passed before changes.

Increment commits `85b7848`, `3674eac` and `d275646` preserve compatible SDK/cooperation, module-owned business transactions and analytical/acceptance increments. `7bc7d10` fixes a clean-install DNS-name limit and bounded installation request timeout; `2719b8e` adds repeatable release/data-preservation verification. The final release source commit is recorded in `release.json`; the final proof commit is identified by annotated tag `v0.7.0` and the delivery response. No remote push is claimed.

Operational business code lives in separate module images and the module-only business-kit library. Worker core contains no Procurement, Sales, Assets or Workforce implementation. General SDK/host/UI extensions preserve old manifest/enrollment/synchronization contracts and core schema 6. Master adds canonical analytical projections and deterministic capabilities through its established analytical layer. ADRs 0015–0017 document the choices and failure semantics.

## Packages and running topology

| Worker | Active packages |
| --- | --- |
| Worker 1 / manufacturing | Inventory 1.3.2; Operations 1.0.0; Procurement 1.0.2; Sales 1.0.2; Assets 1.0.3; Workforce 1.0.2 |
| Worker 2 / distribution | Operations 1.0.0; Procurement 1.0.2; standalone Sales 1.0.2; no Inventory |
| Worker 3 / asset holding and training | Operations 1.0.0; Assets 1.0.3; Workforce 1.0.2; no Inventory |

The accepted clean deployment is `.steward/phase7-release-verified`, project `steward-phase7-release-acceptance2`. There are 27 containers: 15 established core/database services and 12 installed module services. The four operational PostgreSQL clusters/volumes are separate; modules have dedicated databases and roles within their own Worker's cluster. All three Workers use identical API, frontend and module-host image digests. Unused Inventory services were not started on Workers 2/3. Earlier baseline/development/failed-candidate volumes and configurations were retained, with their services stopped.

Secure addresses: Master `https://master.localhost:6100`, Workers `https://worker-1.localhost:6201`, `https://worker-2.localhost:6202`, `https://worker-3.localhost:6203`. Public local health/readiness use ports 4100 and 4201–4203. Web ports 5100 and 5201–5203 also passed reachability checks. Presenter credentials are private generated deployment files; they are not release artifacts or committed defaults.

## Builds and regression results

`npm run build`, separate Inventory/Operations builds, five core Docker builds and separate module package builds passed. `npm test` passed **52 tests, zero failures**: SDK 10, host naming 2, platform/backend/analysis 23, installer 6, Inventory 2, Operations 2 and PostgreSQL business/integration 7. Applied SQL is checksummed and was not rewritten. `git diff --check` and the source secret scan passed.

`node scripts/verify-phase6-regressions.mjs .steward/dev` passed **all 18 suites**, from 21:27:26 to 21:44:35 UTC. These include smoke, Chromium/mobile smoke, separate fresh-topology Phase 2/3/5 regressions, Phase 4 seed/browser/synchronization, retained Inventory MCP upgrade, official MCP smoke, Analyst browser/protocol/failure coverage, compact context, concurrency, database isolation, outage independence, full module restart/recreation, repeat provisioning, secrets and unconfigured-provider behavior. The separate historical fixture was removed without deleting volumes; the seeded baseline was restored.

The outage stress test passed 540 concurrent health/readiness/platform requests with all Master services stopped, including a disconnected Worker restart. Concurrency admitted exactly two stalled investigations and rejected a third while Worker CRUD, synchronization and health continued. Security rate limits remained enabled; tests waited through their existing windows instead of bypassing them.

Raw logs: `artifacts/phase7-dns-build.log`, `phase7-dns-tests.log`, `phase7-dns-core-build.log`, `phase7-earlier-regressions.log` and `phase7-earlier-regressions.json`.

## Clean installation and real module workflows

The distribution's copied toolkit successfully ran `npm ci`, `npm run build` and `release.mjs install` from its own directory. It provisioned a fresh Master and three Workers, new private accounts, real entity registration/scope grants, trusted authenticated enrollment and distinct databases. Runtime images came from the checksummed distribution, with no core build during module installation.

Chromium performed ten package installation/upgrade actions using Module Manager, including the four independently packaged modules and Inventory 1.2.1 → 1.3.2. Each actual installation request was retried with its original operation identity. Other Worker metadata stayed unchanged. All 11 core API/web/host image identities matched before and after; every Worker shared the same three role images. The retained pre-upgrade Inventory item remains quantity 7 after upgrade, reset and redeployment. Repeating the full installation driver and seed created no duplicate installation or business documents.

Browser forms created/edited records in all four new modules, rejected an invalid purchase approval, submitted/approved/placed an order, received actual stock and fulfilled an Inventory-backed Sales order. Assets used explicit separate owner/custodian/user relationships. Workforce used private synthetic records and real local candidate matching. No uncaught browser JavaScript errors occurred. Screenshots are `artifacts/phase7-install-*.png` and `phase7-browser-*.png`.

The controlled Sales/Inventory workflow reserved 8 and 2 of 10 units without overcommit, canceled/released the larger reservation, consumed 2 and applied purchase receipts of 3 and 2 exactly once. Final scenario stock is **13, reserved 0**. Low stock generated a linked draft requisition with an event/item reference, without creating or approving a purchase order. Worker 2 completed real standalone fulfillment without Inventory. Unit/integration cases additionally exercised concurrent reservations, duplicate/altered replay, future sequence gaps, durable rejection ordering, lost acknowledgments, compensation and PostgreSQL writer termination before commit.

## MCP, privacy and recovery

Actual authenticated MCP calls verified all eight canonical categories: procurement demands/quotes, commitments, Sales demand, replenishment and aggregate workforce/training/job projections. Selected fields, pagination, source entity/installation/record/revision attribution and stale-source checks passed. Sales period reporting used completed fulfillment revenue, UTC bounds, separate currency groups and invalid-date rejection.

Unauthorized/scoped accounts could not calculate across forbidden entities. Worker-local read-only grants denied writes, private people/matching, other modules and other Workers. Disabled module tools disappeared from discovery and their APIs were denied; reactivation retained data. Private people, enrollments, achievements and candidate identities had no ecosystem MCP/synchronization contribution. Local authorized synthetic candidate matching returned real records. Threshold-suppressed groups remain unknown/null, not zero.

The clean release's Master outage allowed local fulfillment and queued **7 actual module-owned events**, which caught up after reconnection. Pausing Inventory caused an explicit pending transport retry, denied premature fulfillment and recovered exactly **one** target inbox reservation after restart. Ordered cancellation released it. All three Worker API/host restarts preserved business-record hashes, module version/state/configuration and enrollment certificates.

A fault injection modeled a provider configuration commit without the corresponding core commit. The affected API failed closed with `MODULE_CONFIGURATION_MISMATCH`; Worker health and Procurement remained available. Authorized configuration retry restored consistency without losing records or credentials. Repeat base/security/module/data/Analyst provisioning preserved **79 files byte-for-byte** and all database/module states. The release secret check scanned actual runtime frontend bundles, APIs and logs against **30 actual passwords/database/gateway secrets**; none or private-key markers appeared.

Reset retired only ledger-owned approved projections and eligible open reservations, preserved audit/business history/configuration/credentials and retained unrelated pre-upgrade data. Generation 2 reseeding/rechecking and all MCP privacy/calculation checks passed. Reset does not truncate received/completed documents, people, events or databases.

## Genuine local Qwen investigations and reviewed findings

Native Ollama 0.40.4 used installed `qwen2.5:7b` (7.6B Q4_K_M) through its 16,384-context alias and a temporary authenticated local TLS bridge. No cloud key or test-model substitution was used. Accepted runs made **13 actual model calls and 10 model-selected live MCP tool calls**. Every calculation was independently recomputed and source revisions rechecked. Full source/activity remains in Master and ignored raw reports; compact transport did not replace it.

| Profile / finding UUID | Investigation time | Accepted result and delivery |
| --- | --- | --- |
| Procurement `48891a07-fde3-48b8-b3be-1c84724e2be7` | 33,685 ms | 300 units; EUR 3,520 baseline, 2,780 external quote, 30 transition, 2,810 total, **710 potential saving**; Workers 1/2 acknowledged |
| Workforce `8f62e14d-fc7f-494f-9f9d-3137894e2514` | 26,456 ms | 5 openings, 3 available skill-qualified people, 3 overlapping completions, coverage 3/gap 2, 5 future seats; Workers 1/3 acknowledged |
| Asset-backed resource sharing `a44a7fbf-341b-41f1-ade5-254e724e05ed` | 40,100 ms | 800 m3 available/500 shared; illustrative consumer/provider/ecosystem benefits EUR 9,000/2,000/11,000 per month and 126,000 over 12 months; sensitivity ecosystem 10,000/month and 108,000 over 12 months; Workers 2/3 acknowledged |

Publication was a separate authenticated browser action after narrative review, followed by an idempotent retry. Each finding reached exactly its two affected Workers with entity-filtered references; all six acknowledgments returned through durable synchronization. Review notes distinguish aggregate skill capacity from training applicants/hiring approval and synchronized copies from operational guarantees. No purchasing, hiring, booking or other business decision was executed by AI.

Current-release runs `74ff91f4-4d83-4245-8bcf-3aeb0de2d8cc` and `de09e2b5-22f8-4445-bbf8-3ab670a5becc` had valid calculations but insufficient Workforce prose or erroneous resource period wording. Both were **withheld with no finding**, independently verified in Master. Reporting guidance was clarified and actual new model calls produced the accepted runs above; raw rejected output was retained, never rewritten into success.

Earlier development failures included repeated/placeholder tool calls, missing sensitivity labels, currency-unit wording and overly strict verifier tool expectations. One earlier synthetic procurement finding published by the legacy verifier before wording review was closed, and closure delivered to Workers, in the retained development fixture. Phase 7 presentation always defers publication to the separate review helper. These failures are retained in `artifacts/phase7-ollama-*-attempt*.json`; current-release withheld attempts also have `-release-attempt1.json` suffixes.

The explicitly labelled reproducible test model passed 8 runs: three real-MCP/calculation profiles and five expected model-unavailable, malformed-output, undeclared-tool, timeout and tool-budget failures. It is regression evidence, not evidence of a live provider. Provider configuration and blank secret file were restored to their exact original bytes. Temporary fixture/bridge/recovery files were removed; original Qwen digest is unchanged and `/api/ps` is empty.

## Installation, upgrade and archive evidence

Upgrading the preserved 0.6 baseline to the accepted 0.7 images retained **77 files**, enrollment/module state and business-record hashes. The clean release was separately installed from the distribution toolkit; module installation then required no Worker rebuild. Full stop/removal/recreation and repeated release selection compare deployment bytes, certificates, module configuration/data, identities/accounts/registry and Master analytical records, investigations, activity, findings and receipts. Final archive checksums and this comparison are recorded in the post-packaging sidecar, avoiding a self-referential archive hash.

The final distribution is `artifacts/releases/steward-0.7.0/`: versioned role manifests, `release.json`, `images.tar`, seven selected module payloads and portable toolkit. Retained Inventory 1.2.1 supports upgrade verification; installed Inventory is 1.3.2. Old Operations 1.0.0 was imported as its original immutable image, never rebuilt under the same version. Runtime health/readiness and expected package placement are rechecked after final redeployment.

## Exact verification commands

Run deployment-mutating suites sequentially. The earlier regressions belong on their preserved baseline scenario; use a dedicated clean deployment for the expanded demonstration.

```powershell
npm run build
npm run build:inventory
npm run build:operations
npm test
node scripts/verify-phase6-regressions.mjs .steward/dev

# Installed distribution; see phase7-release.md for toolkit initialization.
node scripts/demo.mjs .steward/phase7-release-verified setup
node scripts/demo-phase7.mjs .steward/phase7-release-verified install
node scripts/demo-phase7.mjs .steward/phase7-release-verified install
node scripts/demo-phase7.mjs .steward/phase7-release-verified seed
node scripts/demo-phase7.mjs .steward/phase7-release-verified seed
node scripts/verify-phase7-browser.mjs .steward/phase7-release-verified
node scripts/verify-phase7-mcp.mjs .steward/phase7-release-verified
node scripts/verify-phase7-configuration.mjs .steward/phase7-release-verified
node scripts/verify-phase7-recovery.mjs .steward/phase7-release-verified
node scripts/verify-phase7-test-model.mjs .steward/phase7-release-verified
node scripts/verify-module-provision.mjs .steward/phase7-release-verified
node scripts/verify-isolation.mjs .steward/phase7-release-verified
node scripts/demo-phase7.mjs .steward/phase7-release-verified reset
node scripts/demo-phase7.mjs .steward/phase7-release-verified seed
node scripts/demo-phase7.mjs .steward/phase7-release-verified check
node scripts/verify-phase7-mcp.mjs .steward/phase7-release-verified
node scripts/demo-phase7.mjs .steward/phase7-release-verified ai
# Review output before using publish-reviewed-finding.mjs; see presenter guide.
node scripts/verify-module-secrets.mjs .steward/phase7-release-verified
node scripts/measure-phase7.mjs .steward/phase7-release-verified
node scripts/release.mjs verify --bundle artifacts/releases/steward-0.7.0
node scripts/verify-phase7-redeployment.mjs .steward/phase7-release-verified artifacts/releases/steward-0.7.0 --restart
```

Native prose retries used the corresponding updated prompt from `datasets/phase7-investigations.json` with `STEWARD_ANALYST_CAPABILITY`, `STEWARD_ANALYST_PROMPT`, `STEWARD_OLLAMA_DEFER_PUBLICATION=1`, private presenter credential-file path and `STEWARD_OLLAMA_REPORT`, then `verify-ollama-provider.mjs`. Complete tool arguments, times, calculations, references and review outcomes are in the sanitized evidence and `artifacts/phase7-ollama-*.json` / `phase7-reviewed-*.json`.

## Resource observations and production limits

Windows, Node 24.13.0/npm 10.3.0, Docker Linux Engine 29.9.1/Compose 5.6.0, PostgreSQL 17, Playwright Chromium 1.58.2 and RTX 4050 laptop GPU. A 27-container snapshot after review used **1,042.47 MiB** and aggregate **26.35% Docker CPU** (point sample, not normalized capacity). Ten sequential local health requests per API had medians 1.20–2.67 ms and maximum 27.12 ms. The native alias reported 5,835,377,868 bytes loaded model size and 4,075,112,366 VRAM bytes at context 16,384. These are observations, not throughput, sustained-load, peak-memory or production sizing guarantees.

This remains the established single-host Docker provider and locally managed trusted signed catalog. Release archives are checksummed and require explicit operator trust/provenance review; independently distributed release signing, remote registry, multi-host scheduling, HA, comprehensive backup/restore exercises, external penetration testing and commercial production certification are not implemented. Docker-host/operator privilege, production TLS/secret rotation and operational backups remain deployment responsibilities.

Modules provide MVP workflows, declarative screens and JSON line-item/configuration editors; they are not a full ERP/accounting/HR/payroll system. Workforce supports synthetic data only. Units/currencies use documented conventions without conversion; resource sharing currently measures m3 rather than arbitrary equipment throughput. Aggregate matching is potential, never consent, a personal suitability determination or an allocation. Small-model language can be wrong even when calculations succeed; review remains essential. The provider is intentionally restored to its prior unconfigured state after tests; the documented runner temporarily configures genuine local investigations. Deferred offline enrollment, Python analytical services and autonomous business execution remain unimplemented.
