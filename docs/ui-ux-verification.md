# UI/UX and USD implementation verification

Status: implementation in progress; this is an automatically verified checkpoint, not final phase acceptance. No v0.9.0 release tag or accepted distribution has been produced.

## Preserved release

The preflight working tree was clean on phase8/smart-modules-commerce at 7d3a70d6349ca684111b7e2b879650c2be4c54d6 (v0.8.0). That commit/tag and its accepted release artifacts remain intact. UI work is isolated on ux/business-workspaces. Source identifies the next candidate as 0.9.0, with append-only migration 10. Existing 0.8 images cannot run against a migrated schema-10 database; retained deployments were not migrated.

## Implemented checkpoint

- Shared responsive shell with persistent workspace navigation and hash-based deep links. Worker Business is the default. Administration and Developer are restricted to existing authorized administrator roles, including direct navigation.
- Business navigation uses active, trusted, permission-filtered module discovery. Groups cover Sales & Orders, Inventory, Procurement, Assets, Workforce, Shopify and Printify as those packages become available. Uninstalled and unauthorized modules are absent.
- Existing declarative operational screens retain backend authority. Added search, loading/empty/error states, readable structured details, structured line-item forms and original-currency amount formatting. Sales line prices are entered as dollars and stored as integer cents.
- Module Manager has schema-derived configuration controls, with an optional advanced JSON editor. Governance, signed contracts and raw diagnostics are separated into Developer.
- Master overview reads actual authorized companies, synchronization freshness, findings and persisted investigations. History, AI Analyst, reports/opportunities and consolidated Findings & Alerts have visible destinations. Investigation lists now include their existing question, timestamps and finding link, under unchanged account ownership enforcement.
- Findings show original evidence references and affected-entity review/delivery status. Local business users can read only the local affected-only finding projection; acknowledgment/resolution remains administrator-controlled.
- Company preferences store country, base currency, locale and time zone, using scoped, audited HTTPS APIs. Worker business identity resolves persisted enrollment; bootstrap/runtime identity remains explicitly labeled in diagnostics.
- New US setup proposes USD. New currency-aware module installations inherit explicit local company preferences. Existing module configuration, EUR records and analytical evidence are never automatically rewritten. Display preserves original currency and labels a different configured base currency as unconverted.
- Separately authored datasets/us-workspace-demo.json and an idempotent seed runner add controlled USD Inventory, customer and order records, requiring explicit US/USD setup and a USD Sales configuration first.

## Actual verification so far

| Command/check | Result |
|---|---|
| npm run build | Passed all workspace applications/packages and business modules |
| npm test | 82 passed, zero failed: previous 80 plus two localization/identity/authorization checks |
| npm run test:smart:browser | 9 passed, including actual Chromium governance navigation in the new Developer workspace |
| node scripts/verify-workspaces.mjs .steward/phase8-upgrade-regressions | 7 checks passed: exact protected-row preservation, installed-screen deep links, separated workspaces, persisted USD preference, actual Master history/findings and desktop/mobile rendering |
| node scripts/verify-workspace-operations.mjs .steward/phase8-upgrade-regressions | Passed module management/core-image checks, actual customer/USD order creation with line-item controls, and ordinary-user visibility plus backend installation denial |
| node scripts/seed-us-workspace.mjs .steward/phase8-upgrade-regressions (twice) | First run created 3 new USD records; repeat created 0 and preserved all 3 |
| Earlier operational regression rerun | 12 suites passed: smoke, idempotent seeding, Inventory MCP upgrade, MCP smoke, compact MCP/Analyst, concurrency, isolation, Master-outage independence, module restart/provisioning/secrets |
| node scripts/verify-workspace-installation.mjs .steward/phase8-upgrade-regressions | 6 checks passed for fresh Workforce 1.0.2 installation, generated USD configuration, dynamic navigation/refresh, unchanged Worker images and other-Worker configuration hashes |
| node scripts/verify-workspace-currency.mjs .steward/phase8-upgrade-regressions | 6 checks passed; all 12 existing EUR table snapshots unchanged through explicit EUR/USD preference updates and repeated USD seeding; foreign-entity mutation rejected |
| node scripts/verify-workspace-investigations.mjs .steward/phase8-upgrade-regressions | 6 read-only Chromium checks passed for a persisted test-model finding, its originating investigation, question, deterministic result, source Workers and refresh; no fresh live-model claim |
| Historical verify-phase4.mjs with the explicit candidate override | 13 checks passed through Chromium: operational edits, durable events, conflicts/replays, outages/SIGKILL, affected-only findings and offline acknowledgment, with zero page errors |

Raw evidence: artifacts/ux-build.log, ux-tests.log, ux-smart-browser.log, ux-workspaces.json, ux-operations.json, ux-regressions.json and ux-*.png. Evidence contains no passwords, session cookies, private keys or connector credentials. Initial schema-9 to schema-10 redeployment compared 18 protected table hashes, preserving installation/account/enrollment/module/finding/investigation rows exactly before deliberate synthetic tests.

Browser acceptance caught a nested-label accessibility defect in the line editor and historical field-selector mismatches; these were corrected and actual order creation was repeated. The original smoke check assumed schema 9 for all 0.8 runtimes; the new source candidate is explicitly versioned 0.9.0/schema 10 rather than misidentifying the migrated application as the accepted release.

## Running candidate and retained environments

The isolated regression fixture serves candidate Master at https://master.localhost:26100 and Workers at https://worker-1.localhost:26201, https://worker-2.localhost:26202 and https://worker-3.localhost:26203. Use its existing private demo/presenter.json credentials. Do not reuse accounts from another installation or publish that file.

Retained Phase 7 remains on HTTPS 6100/6201-6203; accepted Phase 8 remains on 16100/16201-16203. Their database, identity, credentials and application images were not changed for this checkpoint.

## Outstanding acceptance

Finish browser Shopify/Printify commerce and remaining module demonstrations across the expanded catalog; complete all earlier deployment regressions against the new navigation; validate analytical finding links/calculation screens with accepted live-model evidence; extend currency/locale and failure-state browser coverage; improve remaining advanced-only business/configuration fields where their signed schema is insufficient. A fresh three-Worker installation and final source/artifact verification remain required. Account creation/password recovery still uses the operator CLI; this checkpoint adds no password-changing shortcuts. No new live Shopify/Printify connectivity, paid order or fresh live-model acceptance is claimed.

## Recovery and regression invocation

Tests on a source candidate must consistently select its image overlay. Both scripts/lib.mjs and scripts/compose.mjs now accept STEWARD_COMPOSE_OVERRIDE_FILE, restricted to an existing file inside the selected deployment. Omitting that override during a regression recovery initially reapplied pinned 0.8 images to the isolated schema-10 fixture; the old images correctly refused the newer schema. The fixture was restored with the explicit override, its disposable phase1_probe tables were removed, and all 12 suites were rerun successfully. No business records or schema migrations were rolled back.

For the already provisioned isolated candidate in this workspace:

```powershell
$env:STEWARD_DEPLOYMENT = '.steward/phase8-upgrade-regressions'
$env:STEWARD_COMPOSE_OVERRIDE_FILE = 'ux-compose.yaml'
$env:STEWARD_SEED_CREDENTIALS_FILE = Join-Path (Resolve-Path $env:STEWARD_DEPLOYMENT) 'demo/presenter.json'
$env:STEWARD_DEMO_RETRY_LOGIN = '1'
node scripts/compose.mjs up -d --no-build --wait
node scripts/verify-workspace-currency.mjs $env:STEWARD_DEPLOYMENT
node scripts/seed-us-workspace.mjs $env:STEWARD_DEPLOYMENT
```

The fresh-install check deliberately requires an absent eligible signed package; it must not delete an existing module to manufacture an absence result. Historical browser verifiers now navigate by signed discovery through actual workspace links; advanced JSON configuration is explicitly opened when testing an older operator workflow. These adapters also retain the legacy navigation path, but the entire historical browser matrix is not yet reaccepted.

One failed browser-test diagnostic included its ephemeral fixture session cookie. That session was revoked and the captured diagnostic was sanitized. The test helper now discovers modules using the authenticated browser fetch rather than Node's API request context, which cannot resolve these local-development hostnames on this system. No operator password, connector credential, private key or retained-deployment session was changed.

Final checkpoint health: retained Phase 7 has 27 running containers, accepted Phase 8 has 37, and the isolated candidate has 24. Master and all three Worker health/readiness endpoints returned HTTP 200 in each environment. Existing module form defaults now preserve the approved module currency even when it differs from the company base currency. The final currency check asserts that discovery provides only this non-secret default, without full configuration.

## Finalization run (acceptance in progress)

The continuation starts from 566da466. Full 17-suite deployment regression acceptance has now passed, including actual Chromium Analyst publication, failure/timeout/malformed/loop cases, outage independence, complete recreation, repeated provisioning and secrets checks. Fresh digest-pinned 0.9 installation at `.steward/ux-release-acceptance` passed Master/three-Worker startup and enrollments. A separate fresh `.steward/ux-enrollment-acceptance` passed all historical Phase 2 security/browser checks and was shut down with volumes retained. Default Docker network exhaustion was resolved by allocating explicit unused private subnets; no existing network/volume pruning occurred.

Newly exercised USD commerce on Workers 1 and 3 passed browser import, reservation, explicit production authorization, shipping/status synchronization and exact duplicate-webhook rejection. MCP independently recomputed USD 100 revenue, USD 48 estimated production, USD 8 shipping and USD 44 margin across the two completed orders. A further interrupted workflow survived Master/provider/coordinator/module outages and recovered exactly once.

Corrections include accessible configuration dropdowns, ordinary configuration Save outside Advanced JSON, bounded retry for read-only busy responses (never mutation replay), and empty structured array defaults. Historical browser selectors now distinguish page titles from section headings, and operational browser checks use line controls/comma-separated skills rather than JSON.

Native fulfillment acceptance uncovered a missing module observation screen and routing guard. Separate signed Shopify 1.0.1 and Printify 1.0.3 packages add native/external ownership/status/tracking observations and reject native Shopify dispatch; eight deployed Chromium checks passed with unchanged Worker images. All 10 commerce backend tests passed after these changes. No existing signed package was overwritten.

The first USD simulator attempt correctly refused an EUR remote order. New 0.9 simulator provisioning now defaults to USD (explicitly configurable); existing accounts/records retain their currencies. The initial mismatched synthetic order remains pending with a reconciliation error; it was not relabeled, erased or sent to production. A separate order namespace exercised successful USD orders without resetting prior history. The first real Qwen run completed but used ambiguous baseline wording. A second failed MODEL_OUTPUT_INVALID safely with retained activity and no recommendation. A final run completed with unambiguous zero-change/proposal/sensitivity wording, full tool evidence and independently recomputed EUR 9000/month, EUR 102000/12 months, sensitivity EUR 8000/month and EUR 84000/12 months. Browser launch/publication/history refresh/affected-only acknowledgments passed, configuration was restored and alias unloaded. Full evidence is in artifacts/ux-live-ollama-final.json; acceptance still requires final packaging and remaining browser/currency gates.
