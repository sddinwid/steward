# Order matching verification — 2026-11-01

Implementation source: `a875156442084d977dd48296bdc9bf99d8d35d26`.

## Verified results
- Shared package and both connector builds passed.
- 17 focused Shopify/contract tests and 24 commerce tests passed (41 total).
- Eight new database-backed monitoring checks cover authorization, association immutability, empty matches, split records, pinned receipts, duplicate acknowledgments, pagination and outage/freshness recovery.
- Existing simulated commerce tests retain explicit simulator mode and separate test databases.
- Both source manifests and original signed 1.3.1 migration ancestry passed. Original migration declarations and bytes were retained.
- Worker 3 upgraded in place to Shopify 1.4.0 and Printify 1.4.0 after private configuration and database backup.
- Three new browser screens passed; browser-triggered observation refresh returned matched.
- Live Shopify order 18986570154348 (#1001) matched Printify by its exact shopOrderId through the approved SSMA binding and workflow.
- Printify remained on-hold. No live order, payment, fulfillment or production mutation was performed.
- Preserved seven Docker volumes, 38 private-file hashes, existing record identities, original configuration, and unaffected images.
- Single selected stack: 61 containers; no unexpected running stack.

## Exact deployed images
- cee.printify@1.4.0: `sha256:ccedf2521bfd960787b7e7e41d7cdc6a384f01e44adb96d45ded3307ca6a3f7a`
- cee.shopify@1.4.0: `sha256:a6e9133ff0b3671971a73f9a8dac345549e05a98046fb45321c07e84e06e549f`

## Limitations and failures
- The first browser locator expected singular navigation words; the existing renderer pluralizes them. Failure log retained as artifacts/order-matching-live-first-browser-failure.log. Corrected locator passed; no renderer change.
- A raw git-blob/source comparison was not used as proof of migration ancestry; actual source hashes were verified against signed installed migration declarations.
- Matching is order-level, not proof of complete item fulfillment. Split Printify records remain separate.
- Refresh is explicit. Cached observations expire after five minutes; stale/unavailable sources cannot prove absence.
- No new alerts, financial analysis, Master projections, or autonomous actions.
- The Other orders visibility gap remains: a fresh empty API snapshot is not proof that Printify never received the Shopify order.
- No new platform release tag or GitHub push.

## Evidence
- artifacts/order-matching-focused-tests.log
- artifacts/order-matching-commerce-tests.log
- artifacts/order-matching-live.json
- artifacts/order-matching-preservation.json
- artifacts/order-matching-deployment.json
- artifacts/order-matching-{order-discovery,order-association,combined-orders}.png
- artifacts/order-matching-{shopify,printify}-build.log

## Implementation files
- docs/order-matching.md
- modules/printify/Dockerfile
- modules/printify/manifest.json
- modules/printify/migrations/007-order-observations.sql
- modules/printify/package-lock.json
- modules/printify/package.json
- modules/printify/src/definition.ts
- modules/printify/src/order-observations.ts
- modules/shopify/Dockerfile
- modules/shopify/manifest.json
- modules/shopify/migrations/006-order-monitoring.sql
- modules/shopify/package-lock.json
- modules/shopify/package.json
- modules/shopify/src/definition.ts
- modules/shopify/src/live.ts
- modules/shopify/src/order-monitoring.ts
- packages/commerce-kit/src/index.ts
- packages/commerce-kit/src/order-observations.ts
- scripts/test-commerce.mjs
- scripts/test-connector-order-monitoring.mjs
- scripts/test-shopify-live.mjs
- scripts/verify-order-monitoring-fixture.mjs
