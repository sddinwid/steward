# Phase 11 verification — in progress

Baseline: c6a5d90, branch codex/phase11-continuous-commerce. Read the full attached Phase 11 directive; [ADR 0025](adr/0025-continuous-commerce-simulation.md) records architecture and the remaining acceptance sequence. No Phase 11 release or completion is claimed.

## Preserved baseline

- Actual preflight `npm test`: **129 passed**, no failures/skips. Baseline smoke passed for Master and all three Workers, four distinct database volumes and identical Worker core images.
- Private configuration and all four PostgreSQL services were backed up before changes. The private backup pointer is `.steward/private-setup/phase11-baseline-backup.txt`; no backup contents or credentials are committed.
- Current operator project remains steward-phase8-upgrade-reg. Worker 3 retains verified Shopify 1.2.0 / Printify 1.1.2 Live catalog connections. No Phase 11 application image or module has yet been deployed.

## Checkpoint A — safety foundation

Implemented optional signed simulation declarations, closed/bounded provenance envelopes, aggregate-origin pins, deterministic route and pre-delivery live-provider denial, denial audit storage and append-only platform migration 12. Business-kit propagates dataset provenance through owner records/actions/ACKs/outboxes, prevents cross-dataset access/mutation, and supplies epoch/reset owner-service helpers. Old non-simulation contracts remain supported.

SDK tests include three additional provenance/boundary cases. Three real disposable-PostgreSQL service tests cover request idempotency and provenance/processing timestamps, pinned-origin/live-provider rejection, and selective reset with stale-epoch rejection. The first full regression caught an aggregate-origin lookup that assumed every legacy module used business_records. Legacy Inventory uses dedicated inventory tables; the lookup now checks for that relation before reading it. Its seven real database business/regression tests and the three new safety tests passed after correction. The original failed run is retained in artifacts/phase11-checkpoint-a-tests.log. Checkpoint A build passed. Final full `npm test`: **135 passed, 0 failed, 0 skipped**. The schema-6 upgrade fixture now verifies schema 12 and the provenance table; its installation/accounts/module snapshots remain unchanged across repeated migration. Failed intermediate runs are retained, including the earlier fixture expectation of schema 11. these safety tests alone do not establish a functioning continuous simulator.

## Mandatory work still open

Independently packaged generator and fake fulfillment provider; Sales/Stock Ledger simulation service capabilities and append-only module migrations; all nine scenarios, backpressure/restart/reset; declarative Control Center/live Worker dashboards; authorized Master projections/monitors/purchasing calculations/findings/MCP; actual two-Worker deployment/UI/outage/currency/evidence/affected-only delivery/acknowledgment; real Ollama investigation; clean installation; release packaging, checksums, image/redeployment gates, final artifacts and release tag. Continue sequentially, fix failures, commit checkpoints, and do not mark these gates passed without actual execution.

## Checkpoint B — continuous owner-service lifecycle

Added independently packaged Commerce Simulation 1.0.0 and isolated Simulated Fulfillment 1.0.0, simulation-kit 1.0.0, Sales 1.3.0/schema 6 and Stock Ledger 1.1.0/schema 2. No Phase 11 deployment or module installation has yet occurred. Real business work uses signed SSMA capabilities, local administrator-approved bindings/workflows, genuine Sales actions, stock reservations/consumption and durable fulfillment progress. Ordinary integration flags and the Sales EUR default are preserved; synthetic commands use an explicitly approved request-scoped USD context. The new per-capability signed prerequisites keep those authorities separate.

The native disposable-PostgreSQL acceptance uses four separate operational databases plus the Worker governance database. It creates approvals through authenticated administration APIs, routes every command through the SSMA resolver, invokes private authenticated module inboxes and replays each command to check identical durable receipts. **12 checks passed**, covering all nine actual service scenarios, fulfillment/cost reconciliation, fixed-seed sampling, stop and selective owner reset preserving ordinary stock. **24 durable commands** were observed in the earlier normal/reset four-check run; the final complete scenario command count is retained in `artifacts/phase11-service-lifecycle.json`.

Full `npm test`: **149 passed, 0 failed, 0 skipped** (`artifacts/phase11-checkpoint-b-regressions-verified.log`). Root build and subsequent UI build passed. The initial full regression failed because its legacy commerce fixture did not apply platform migration 12, required now that Sales declares simulation participation; the fixture now applies the real migration rather than weakening runtime guards. Earlier lifecycle failures exposed transaction-tied outbox ordering and an incorrect Sales production action path; both were corrected before the successful runs. Failed runs remain under artifacts.

The generic signed UI contributions now support workspace placement, bounded scheduled polling, field defaults and explicit reset confirmation. The Control Center uses this existing renderer, not hardcoded module screens. Reports show persisted Sales observations, product performance, exact-cent completed-order contribution, stock observations and data-only activity trends. Browser/deployment acceptance remains open.

Workflow declarations and manual execution inputs now have a bounded maximum of 16 operations (formerly 8), allowing the 13-operation reviewed synthetic lifecycle to remain under one deterministically pinned workflow. There is still one accepting workflow per consumer; no additional workflow authority or provider selection mechanism was introduced.

Master simulation projections/monitors/calculations, actual two-Worker deployment, full UI/outage/restart/reset acceptance, Ollama investigation and clean-source release gates remain mandatory and unverified.
