# Phase 10A verification

Implementation branch: `phase10a/commerce-intelligence`, baseline `d0385b6`. The accepted v0.9.1 tag and operator deployment are preserved. Version 0.10.0 identifies development artifacts; no release tag has been created.

## Checkpoint 1

- Baseline `npm test`: 93 passing checks before changes (`artifacts/phase10a-baseline-tests.log`).
- Full initial build passed (`artifacts/phase10a-build.log`).
- Platform tests: 37 passing, including five new financial/exception cases (`artifacts/phase10a-platform-tests.log`).
- Commerce backend acceptance: 12 passing against disposable PostgreSQL and separate authenticated TLS simulator processes (`artifacts/phase10a-commerce-tests.log`, `artifacts/phase8-commerce-backend.json`). Includes prior exact-once lost-response recovery and a complete second-store production/shipment/Shopify fulfillment with identical remote IDs, explicit mappings and unchanged first-store effect counts.
- Dedicated `.steward/phase10a-acceptance`: clean four-installation provisioning, security/module/data/analyst/explicit USD simulator overlays, all core health/readiness checks and first-run trusted Worker enrollment passed. Private presenter credentials are generated only inside this ignored deployment.

During implementation, an added anomaly condition changed legacy result ordering; it was corrected to preserve the existing anomaly contract. A test initially reused a production-approval account for Master monitor authorization; the fixture now uses a separate registry account and preserves Worker-local approval requirements. These were test/implementation failures, not waived gates.

Deployment/browser acceptance, complete regression runs, final screenshots, preservation checks and final commit are still pending at this checkpoint. Phase 10A is not yet declared complete. No live commerce account was contacted and no paid order was submitted.

## Checkpoint 2 — exercised projection recovery

The complete simulated browser commerce workflow passed on Workers 1 and 3. A new controlled USD scenario was seeded using authenticated simulator APIs, explicit SSMA routing, real Inventory reservations, local production approvals, authoritative shipments, refunds, cost assessments and publication. It includes three fulfilled orders (estimated contributions USD 53.00, USD 1.00 and USD 30.50), a canceled order, an unapproved production intent, and a paid source order deliberately held without mapping/ownership.

End-to-end synchronization exposed a defect in Sales 1.2.0 migration 4: the financial augmentation and base projection each emitted an event at the same source revision. Master rejected the conflict as designed. Applied migrations were preserved. Sales 1.2.1 appends migration 5: one atomic projection, retained superseded envelopes plus a repair ledger/audit, and higher-revision authoritative snapshots. Browser upgrades preserved both Workers' exact business data (excluding the intentional repair revision/timestamp), configuration, enrollment certificates and core image IDs. Both queues recovered. Backend acceptance now enables real SDK capture triggers and asserts one canonical payload per revision, so this failure is covered.

`demo-commerce-intelligence.mjs ... verify` passed: exact contributions and missing margins, private cost permissions, source-attributed MCP calculation, period demand counts, scoped exceptions, rejected foreign-entity calculation, opt-in monitor policy, unchanged-condition deduplication, affected-only low-margin finding delivery, and acknowledgment back to Master. The original outage acceptance also passed with exactly-once create/production/channel fulfillment across Master, simulator, Worker, module and coordinator restarts. An overlapping orchestration attempt interrupted the first seed; recovery completed and the idempotent seed was rerun sequentially without extra production.

A browser assertion caught invalid UTF-8 separators introduced while editing on Windows. Source encoding was corrected; refreshed frontend deployment and final browser acceptance are pending. The original root regression command passed all 100 checks after updating the appended-migration version assertion from 10 to 11 while retaining its data-preservation comparisons. A further deterministic cohort/cost-comparison test and original-envelope audit UI are added for final acceptance.
