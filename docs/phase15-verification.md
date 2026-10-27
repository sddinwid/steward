# Phase 15 verification

Phase 15 is in progress. No v0.15.0 tag or operational Catalog/Pricing installation has been produced. The operator deployment remains the preserved v0.14.0 deployment.

## Baseline

See [authority investigation](phase15-ownership.md). Full build, 488 Node tests, selected-deployment smoke, single-stack verification and canonical live read-only Shopify/Printify catalog checks passed before implementation.

## 15A: versioned contracts and module foundation

Implemented six closed versioned offering types, typed extension definitions, pinned provider/source references and compact SSMA offering read contracts. Pricing foundation defines exact scale-two monetary values, supported currencies, list/rule/policy/approval contracts, bounded quote decisions and immutable accepted snapshot validation. This is a contract foundation; operational price selection and activation are checkpoint 15C work.

Shared infrastructure provides host-attested installation/package identity, current eligible reviewer snapshots and read-only typed POST previews. Signed metadata grants no account permissions. Generic SSDS forms support nested objects/arrays, conditions, dates, exact money, authorized references and preview reports. No domain screens are hardcoded into core.

Actual commands/evidence:

- `npm run build`: passed; `artifacts/phase15-a-build.log`. Existing frontend chunk-size advisory remains.
- `npm test -w @steward/module-host`: 19 passed; `artifacts/phase15-a-host-tests.log`.
- `npm run test:module:previews`: 13 passed; `artifacts/phase15-a-preview-tests.log`.
- `node scripts/test-module-preview-database.mjs`: 2 passed against isolated PostgreSQL, including actual rejected writes; `artifacts/phase15-a-preview-database.log`. Added to `test:module:previews` for subsequent runs.
- `npm test -w @steward/catalog-kit`: 59 passed (38 Catalog, 21 Pricing); `artifacts/phase15-a-catalog-tests.log`. Creation validators bind proposer/reviewer and timestamps to authenticated server context; historical validation remains separate.
- `npm run test:smart:browser`: 10 passed; `artifacts/phase15-a-smart-browser.log`. These exercise existing PostgreSQL/authentication/SSMA browser behavior; new operational module browser acceptance remains pending.
- `npm run test:catalog:forms:browser`: 4 Chromium checks passed with zero page errors; `artifacts/phase15a-module-forms-browser.json` and three `phase15a-module-forms-*.png` screenshots. Actual production renderer interactions use synthetic HTTP fixtures, including exact money, datetime, nested/conditional forms, permission-filtered controls and failed previews. This is not packaged module, database or live-commerce acceptance. All screenshots were inspected. Failed preview attempts clear stale successful output.
- `npm test`: 568 tests across 41 Node suite summaries passed, zero failures/cancellations; `artifacts/phase15-a-regression-tests.log`. Includes existing business, commerce, simulation, mission, financial, Python/MCP test-provider regressions and new contract/preview tests. This does not establish a real Qwen Phase 15 investigation or the later operational acceptance gates.
- `node scripts/verify-single-stack.mjs`: passed after fixture cleanup; `artifacts/phase15-a-single-stack.log`. Selected operator remains the only platform stack, 52 running containers.

No applied migrations, installed module packages, live connector settings, databases or private credentials were modified in 15A. No external write or financial commitment was performed.

## 15B: persistent Universal Catalog

Implemented independent `steward.catalog.universal` 1.0.0, migration 001, 41 API contributions and 16 SSDS screens. See [module guide](phase15-catalog.md). Stable offering identities, editable codes, six types, media/windows/dimensions/promotional references, variants, scoped attributes, validated extensions, categories, bundle graphs, append-only history, provider observations and explicit import/reconciliation are persisted in the module database.

Required completeness applies at activation; archived/inactive data and history are preserved. Active bundles cannot acquire unavailable components or variants. New attribute definitions cannot silently invalidate active offerings. Equal codes warn across the full owned directory, even when a search hides the duplicate. Same-origin external mapping continuity checks preserve original provider pins across package upgrades.

Actual verification:

- `npm run build`: passed, including the new module; `artifacts/phase15-b-build.log`. Final shared/module changes also received targeted builds.
- `npm run test:catalog:contracts`: 66 passed (42 Catalog, 21 Pricing, 3 external read contracts); `artifacts/phase15-b-contract-tests.log`.
- `npm run test:catalog:module`: 25 actual PostgreSQL groups passed; `artifacts/phase15-b-catalog-tests.log`.
- `npm run test:module:previews`: 17 passed, including actual PostgreSQL read-only enforcement; `artifacts/phase15-b-preview-tests.log`.
- `npm test -w @steward/module-host`: 22 passed; `artifacts/phase15-b-host-tests.log`.
- `npm run test:smart:browser`: 10 passed; `artifacts/phase15-b-smart-browser.log`.
- Generic renderer Chromium: 4 passed; actual Catalog API/PostgreSQL Chromium: 8 passed, zero browser/cleanup errors, ten screenshots; `artifacts/phase15b-catalog-browser.json` and `phase15b-catalog-*.png`.

Corrections verified during this checkpoint: import preview originally attempted `SELECT FOR UPDATE` in a read-only transaction; it now uses nonlocking reads. Migration digest validation caught a stale generated manifest after new indexes and passed after regeneration. Browser harness locator/timing assumptions were corrected. Generic optional-object validation now agrees with native browser controls, empty optional references display “None,” and failed previews clear stale successful reports.

Host review also identified a lifecycle race: identical package/configuration after a reinstall could pass a post-lock continuity check without comparing installation operation IDs. Delivery now revalidates both original installation IDs under lifecycle locks and checks new runtime identity against the locked metadata. Three targeted tests cover replacement, configuration/state changes and runtime attestation. Existing legacy runtime support remains intact.

Boundary: module/browser tests use real Catalog code/PostgreSQL, with explicit private gateway/account and source-ACK fixtures. They do not establish signed ModuleManager installation, installed SSMA routing, a platform upgrade or live Shopify/Printify compatibility. Standalone signed-image acceptance must run from the committed clean source before checkpoint 15B advances.

Standalone image attempt from source `6bfecfc`: Docker build and signed manifest/image verification passed. Image `sha256:9bb4dd8d71f17c755fab14604cac34c0e923d65a2cd559da622b73bfe5a9b6c7`, descriptor digest `e98f98934cc8c47685ff7666a29f42ddc38337fc134d54a0711587d57bc9f263`. Runtime acceptance then failed because Docker's default address pools were fully allocated. Evidence: `artifacts/phase15b-catalog-package/2cdb84d7-412c-43f8-a792-cfa336792e0c/acceptance.json`. Cleanup passed and selected operator container IDs/images/start times remained unchanged. Existing networks and retained archives were not pruned. The runtime gate remains open until retried with an explicit nonoverlapping fixture subnet, reusing the exact signed image.

The explicit-subnet retry exposed a harness assumption: internal Docker networks did not publish host ports on this system (`48dc6a9f-5bd8-4814-8ad9-1f2a2d2d79cb/acceptance.json`). The standalone fixture now uses a dedicated, collision-checked bridge with host ports bound only to `127.0.0.1`, as the existing database fixtures do. It does not claim production egress-isolation acceptance. Both attempts cleaned their private fixtures/networks and preserved all 52 selected operator containers. Production networks were unchanged.

The next attempt passed real image health, migration, readiness, CRUD and permission gates, but the restart probe timed out (`5b130c9b-2c27-4d79-8213-15d52f609ac8/acceptance.json`). Docker assigned an ephemeral host port; the harness is corrected to re-inspect the loopback binding after restart and record both ports. Restart/persistence acceptance remains pending the rerun. Cleanup and operator preservation passed.

Final standalone signed-image acceptance **passed all six gates**: `artifacts/phase15b-catalog-package/c43d3244-62b5-4110-b286-0d67555213f5/acceptance.json`, command:

```powershell
node scripts/verify-catalog-package.mjs --reuse-package artifacts/phase15b-catalog-package/2cdb84d7-412c-43f8-a792-cfa336792e0c
```

Build source remains `6bfecfceccbb59e81e1c8ec422e8fcc9d92ff75c`; verification harness commit `37cf57cbd875cba187fb4e0a011d287ebfafb039`. The exact original image/signature was reused without rebuilding or re-signing version 1.0.0, and unchanged application inputs were checked. Actual host ports changed from 60141 to 60148 on restart, confirming the harness defect. The real nonprivileged module container preserved offering data, history, migration timestamps, identity and original creation receipts across restart/repeated migration. All fixture containers, network and private files were removed; operator IDs/images/start times were unchanged. Final single-stack verification passed with 52 selected containers.

Checkpoint 15B is verified within the stated standalone/isolated scope. Actual ModuleManager installation and upgraded full deployment remain later acceptance gates.

## Remaining gates

15C–15J remain pending: operational Pricing/resolution/approval, business integration and accepted Sales correction, live read-only external discovery/mapping, contribution calculations, Master projections/science, MCP/real Qwen, synthetic/deployed browser/outage acceptance and clean/install-preserving release acceptance. Contract and isolated module tests alone do not establish these outcomes.
