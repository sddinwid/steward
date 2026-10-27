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

## Remaining gates

15B–15J remain pending: persisted Catalog/UI, operational Pricing/resolution/approval, business integration and accepted Sales correction, read-only external mapping, contribution calculations, Master projections/science, MCP/real Qwen, synthetic/browser/outage acceptance and clean/install-preserving release acceptance. Contract tests alone do not establish these outcomes.
