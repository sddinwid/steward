# Changelog

This file summarizes user-visible releases, patches and material unreleased changes. The [README](README.md) describes current operation; linked verification reports hold detailed test evidence, failed attempts and limitations. This is a curated history, not a claim that every Git commit is a separately released patch.

Add future bug fixes under **Unreleased** until they are accepted into a versioned release. For each release or patch, record changes, compatibility/upgrade impact, verification and known limitations. Keep module package versions separate from platform release versions. Do not assign a tag or release date to an unverified checkpoint.

## Unreleased — Phase 16 / target v0.16.0

Branch: `codex/phase16-business-automation`. No accepted Phase 16 release, operator upgrade or GitHub push. Existing accepted v0.15.0 deployment remains selected.

### Added

- Independent Business Automation source package, immutable publications and separate human review.
- Signed SDK graph/rule contracts, generic SSDS visual designer and execution inspection.
- Worker-local governed import, activation, suspension, approvals, cancellation and durable graph progress through the existing SSMA coordinator.
- Shared-outbox event capture, governed subscriptions, subscriber-specific execution identities, source provenance, causal handling, bounded retry and dead letters.
- Subscription suspension/resumption and explicit replay UI/API with current authorization and stable replay-request identities.
- Sales source package 1.6.0: optional `sales.orders.workflow` inspection/reservation/fulfillment and existing-stream event contracts. Default-off configuration defers local reservations to approved workflows; existing Sales/Inventory and Catalog/Pricing authority is retained. Commercial channel production is excluded. This package is not yet installed on the selected operator.

- Procurement source package 1.4.0: optional duplicate-safe replenishment/proposal drafts, original-source status inspection and existing-stream status events. Financial approval and purchasing transitions remain human-controlled.
- Business Automation internal notification inbox: authorized reviewers, recipient-only reads/acknowledgments, expiry, duplicate-safe delivery and source isolation. No external email/SMS and no arbitrary participant/business payloads. Installed acceptance remains pending.

### Fixes and material checkpoints

| Commit | Change | Verification boundary |
| --- | --- | --- |
| `5935aa2` | Connect shared outbox delivery to governed graph execution | Isolated persistence/runtime checks; not installed business acceptance |
| `7ef4c1f` | Load exact publication details for execution inspection instead of expecting full graphs in metadata lists | Six component browser checks |
| `a16f0d8` | Govern subscription recovery and make replay requests duplicate-safe | Targeted database, authentication, host/platform and browser checks |
| `8afcfc3` | Preserve active-intake limits during resume; resolve lost subscription responses by original identity | Admission/recovery checks and seven component browser checks |
| `d3c3d1d` | Register replay migration 24 as its own migration; type migration entries and verify the replay index | Corrected actual upgrade test; subsequent uninterrupted full regression passed |
| `3b3dafa` | Sales-owned workflow continuation with original stock/provider and accepted-price authority | Six new domain, 24 Catalog integration, seven business and eight publication tests |
| `d477cd1` | Procurement-owned draft requests and authorized internal notifications | Isolated provider and receipt tests; no live purchases or external messaging |
| `be44a7b` | Bounded durable parallel branches with independent retries and retained successful receipts | 25 isolated runtime checks; installed outage acceptance remains separate |
| `06f4319` | Bind historical release checks to accepted Phase 15 package identities | Preserves historical metadata as current modules advance |
| `4b8cff6` | Generic synthetic previews, guided conditions and unbound draft templates | Eight designer browser checks; preview has no execution authority |
| `7f604c1` | Inventory-owned workflow shortage observations | Seven isolated checks; existing obligations retain their original route |
| `3e43847` | Make changed-source Pricing regression select its exact original quote | Two fresh 44-test reruns; no financial validation weakened |
| `075ff2c` | Preserve primitive constant output fields for workflow discovery | 61 SDK and eight publication tests |
| `3bcd8ea` | Gated candidate packaging, additive HTTPS workflow routing and verified inventory tooling | 30 release, 18 installer, seven Compose and seven preservation contract tests |

The first recovery full run failed the migration registration check (217 passed, one failed). The corrected uninterrupted run at `d3c3d1d` passed **1,222 tests / 76 summaries**, with no failures, cancellations or skips. This full run predates the Sales changes. Existing SQL bytes and deployed state were preserved.

A pre-deployment check caught a stale shared runtime version that would reject Phase 16 modules. The runtime constant and build/package verification guards were corrected; prior development candidates are retained as rejected evidence, not deployed releases.

Procurement, internal notifications, bounded parallel dispatch, designer previews and Inventory shortage capabilities are implemented in source. Still pending: installed scenarios, outage/recovery and substitution acceptance, final regression completion, accepted release packaging and retained-deployment upgrade. See the [Phase 16 verification ledger](docs/phase16-verification.md) and [contracts](docs/phase16-workflow-contracts.md).

## v0.15.0 — Universal Catalog and Pricing Management

**Accepted and tagged.** Tag commit: `300e4caeb876b51ee92ff7f9ecc2d4c5582cd72f`; built source: `4c07ffb0980e891f917f1755ff380e4241219f40`. Subsequently published to private GitHub as the Phase 16 prerequisite; the [publication record](docs/phase16-verification.md) supersedes earlier historical “not pushed” statements.

- Catalog 1.4.0 and Pricing Management 1.3.1 installed independently on all three Workers.
- Universal offering types, typed attributes, external provider mappings, governed pricing policies, exact price resolution and immutable accepted Sales prices.
- Master Catalog Intelligence, deterministic comparisons/scientific statistics and evidence-scoped MCP investigation.
- Genuine local Qwen investigation, independent narrative review, UI publication, affected-only Worker delivery and acknowledgments.
- Eighteen acceptance gates passed, including 1,103 Node tests, clean installation, repeated provisioning, data-preserving upgrade, browser verification and live read-only catalogs.
- Retained 44 module databases, 666 tables, 159 private files and seven volumes in the accepted upgrade evidence; one selected 60-container stack.

Known limitations include expiring evidence views, nondeterministic model prose and one unavailable historical Printify profile. Live commercial mutations were not validated. [Final acceptance](docs/phase15-final-acceptance.md) · [Gates](docs/phase15-release-gates.json) · [Upgrade procedure](docs/phase15-release.md).

## v0.14.0 — Economic sustainability

Resource Availability, Mission Budget and Resource Coordination introduced reserve-aware synthetic contributions, separate entity approvals, reconciliation, reviewed service costs and governed Python/MCP/Qwen planning. All seventeen mandatory gates passed. Synthetic financial MVP, not a general ledger or financial certification. [Final acceptance](docs/phase14-final-acceptance.md) · [Financial workflows](docs/phase14-financial-workflows.md).

## v0.13.0 — Housing, employment and mission impact

Housing, Participant Services, Employment Pathways and Food & Essential Services added private programme/case authority, scoped cross-Worker coordination, mission reporting and scientific sustainability scenarios. Mandatory acceptance passed with retained identities and data. Not HMIS-certified. [Final acceptance](docs/phase13-final-acceptance.md) · [Release guide](docs/phase13-release.md).

## v0.12.0 — Executive and scientific intelligence

Added optional bounded Python analytics, chronological forecasts, integer procurement optimization, sensitivity analysis, executive/company comparisons, shared accessible charts and governed scientific MCP investigations. Fourteen gates passed, including clean installation and redeployment. [Verification](docs/phase12-verification.md) · [Methods](docs/scientific-methodology.md).

## v0.11.0 — Continuous commerce simulation

Added controlled continuous synthetic commerce scenarios, presenter controls, recovery and release packaging. Mandatory acceptance passed with retained connector credentials and operator state. Simulator results do not establish live commercial mutation compatibility. [Verification](docs/phase11-verification.md) · [Operations](docs/phase11-operations.md).

## Between v0.9.1 and v0.11.0 — Untagged development and operational fixes

No v0.10.0 tag is present in the inspected local release history. These changes are development/repair milestones, not invented patch releases:

- Phase 10A commerce contribution reporting, governed operational alerts, compact MCP investigations and controlled USD demonstrations. [Verification](docs/phase10a-verification.md).
- Selected-installation Compose entry point and module shutdown/restoration hooks, preventing accidental startup of an unsecured foundation. [Docker operations and repair evidence](docs/docker-compose-operations.md).
- Shopify live configuration feedback: failed saves expose prerequisites and persisted mode rather than appearing successful. [Diagnosis](docs/shopify-configuration-diagnosis.md).
- Shopify development-store authentication/read-only transport and connector configuration work. [Setup](docs/shopify-development-store.md) · [Verification history](docs/shopify-live-verification.md).

## v0.9.1 — Business intelligence and UI refinement (patch release)

Business intelligence and presentation refinements continued the modular UI architecture and retained the v0.9.0 baseline. Verification is tied to the exact candidate, not inferred from a build. [Release guide](docs/v0.9.1-release.md) · [Verification](docs/v0.9.1-verification.md) · [Gates](docs/v0.9.1-release-gates.json).

## v0.9.0 — UI/UX and USD demonstration

Presentation and demonstration improvements preserved independently packaged modules, Master/Worker separation and the extensible shared renderer. [Release guide](docs/ui-ux-release.md) · [Verification](docs/ui-ux-verification.md).

## v0.8.0 — Smart Modules and commerce integration

Introduced signed SSMA capabilities, registry/resolution, governed bindings/workflows and commerce integration with Shopify/Printify simulators. Historical candidate language in the procedure is not a statement about later tags; consult the gates and verification history. [Architecture](docs/phase8-architecture.md) · [SSMA contracts](docs/phase8-ssma.md) · [Verification](docs/phase8-verification.md) · [Gates](docs/phase8-release-gates.json).

## v0.7.0 — Business module expansion

Expanded independently packaged business modules and cross-module operations, preserving module-owned persistence and repeatable installation. [Release guide](docs/phase7-release.md).

## v0.6.0 — MVP packaging and demonstration hardening

Packaged the Phase 5B foundation with separate Master/Worker distributions, common Worker images, independently packaged Inventory/Operations and a local Ollama demonstration path. [Release guide](docs/phase6-release.md).

Earlier foundation work is preserved in Git history and phase documentation; no additional early release tags or patch versions are asserted here. Historical reports describe their own deployment counts and verification times, not current service health.
