# UI/UX 0.9.0 acceptance verification

Status: functional acceptance passed; final archive verification, preservation redeployment and release promotion are being completed. This file must not be read as acceptance of an unverified distribution. The exact accepted manifest and final runtime evidence are recorded in ui-ux-release-gates.json and the final section below.

## Baseline and preservation

Continued branch ux/business-workspaces from 566da466; did not restart the implementation. The accepted v0.8.0/7d3a70d baseline and retained Phase 7 deployment were preserved. The checkpoint's schema-9 to schema-10 upgrade compared 18 protected table hashes without changing accounts, installation/enrollment identities, module state or pre-existing findings/investigations. Schema 10 remains append-only; 0.8 correctly refuses a newer schema.

Original Phase 7 (6100/6201–6203) and accepted Phase 8 (16100/16201–16203) were not upgraded or reset. Existing preview accounts at 26100/26201–26203 were not reset. Test acceptance uses a separate private deployment at .steward/ux-release-acceptance and its own existing demo/presenter.json. Use the configured master.localhost and worker-N.localhost hostnames; plain localhost is rejected by origin enforcement.

## Implemented and exercised

- Shared responsive Business/Executive, Administration and Developer workspaces, persistent permission-filtered module navigation and refreshable hash routes.
- Business CRUD, structured line items and comma-separated skills, human-readable nested evidence, search/loading/empty/unavailable states, exact transaction-currency formatting and explicit unconverted currency labels.
- Trusted Module Manager installation/configuration/activation, ordinary Save outside advanced JSON, and dynamic module screens without Worker rebuild. Local and entity-scoped backend authorization remain authoritative.
- Master executive overview, real registered companies/relationships, source freshness, investigation history, tool activity, deterministic calculations, original evidence references, related findings and delivery/acknowledgment.
- Explicit company localization and USD defaults for new US modules/records. Existing EUR values and module configurations retain their currency identities. No implicit FX conversion or mixed-currency financial aggregation.
- Separately signed Shopify 1.0.1 and Printify 1.0.4 add fulfillment ownership/status and native/external status/tracking monitoring. Native Shopify dispatch is rejected. No native-monitoring control authorizes paid production. Unchanged Printify reconciliation patches preserve row revisions.
- Release 0.9 packaging, digest-pinned Master/Worker distributions, preserved simulator topology during upgrades, configurable new simulator currency, and one bounded retry of idempotent cold startup.

See ADRs 0020/0021, ui-ux-capability-inventory.md and ui-ux-release.md for scope, commands, security and presenter recovery.

## Actual verification

| Verification | Actual result |
|---|---|
| npm run build | Passed all packages, applications and modules |
| npm test | 84 passed, zero failed: 14 SDK, 2 host, 30 platform, 9 installer, 2 Inventory, 2 operations, 7 business, 8 SSMA, 10 commerce |
| npm run test:smart:browser | 9 passed; includes 8 repeated SSMA backend checks and actual Chromium governance |
| Final Printify patch commerce rerun | All 10 passed, including lost responses, real module APIs, cancellations/refunds, signed webhooks and interrupted effects |
| Full historical deployment regression runner | All 17 suites passed: smoke, browser-smoke, idempotent Phase 4 seed, Phase 4 browser/durable synchronization, Inventory MCP upgrade, MCP smoke, Phase 5 backend/browser, Analyst browser publication, compact MCP/Analyst, concurrency, isolation, outage independence, module recreation/provisioning/secrets and unconfigured-model UI |
| Fresh Phase 2 enrollment/browser suite | Passed registry registration, scoped approval/rejection, unauthorized/unknown/wrong entity rejection, proof replay/signature/duplicate-key protection, trust/CA pin rejection, enrollment persistence, Master outage and secret checks |
| Expanded Chromium catalog | 98 workspace/screen/deep-link/refresh checks across Master and all three Workers; zero page errors |
| Business CRUD through normal controls | Sales/Procurement/Assets/Workforce create/edit/transitions passed without JSON; Inventory creation independently passed through the running Module Manager demo |
| User journeys | Ordinary business user created a USD customer/order, inspected Inventory/Shopify/Printify and affected finding; Master navigated companies, real investigation/evidence/calculations, finding and Analyst; failed history displayed no recommendation; normal module configuration saved with advanced JSON closed |
| Dynamic/native commerce | Eight latest-package browser checks passed; signed module upgrades, ownership guard, native shipping observations and unchanged Worker core image IDs |
| Commerce browser workflow | Workers 1 and 3 completed import → Sales reservation → explicit Printify production authorization → shipment → Shopify fulfillment → governed evidence publication; exact duplicate webhooks accepted once, forged signatures rejected |
| Commerce MCP | Seven completed synthetic orders: USD 350 revenue, USD 160 estimated production, USD 28 shipping, USD 162 estimated margin; independently recomputed exact cents and source revisions; scoped and stale/duplicate-source denials passed |
| Commerce interruption | Master/provider outages and API/module/coordinator restarts recovered exactly once without duplicate external creation, manufacturing or channel fulfillment |
| Further Phase 7/8 regressions | MCP analytics/private permissions; three reproducible test-model capabilities plus failure budgets; configuration mismatch/retry; outage/restart preservation; governed provider substitution with original obligations; four real deployed connector fault/recovery modes; ordinary-user denied administration |
| Currency integrity | 26 EUR table snapshots unchanged through explicit EUR/USD preference changes and repeated USD seeding. Worker restarts retained localization, module configuration and records. Cross-entity preference mutation denied |
| Poll idempotency | All Printify business rows/revisions unchanged across multiple polls, including a retained reconciliation error |
| Portable clean toolkit | npm ci/build, checksum validation, fresh Master/three-Worker installation/enrollments, smoke/Chromium and running Inventory installation passed without the original checkout |

Detailed sanitized evidence is committed in ui-ux-acceptance-evidence.json. Raw logs/screenshots are under artifacts/ux-*. Private account files, keys, cookies, connector secrets and generated deployments are excluded from Git and final release payloads.

## Real Ollama evidence and human review

The UI launched, selected and invoked real MCP tools using installed qwen2.5:7b through a 16384-context alias. No cloud key or simulated model response was used for these runs.

- Accepted primary run 084d04dd-5a8a-46d1-8b02-b22b45bdff04: six model calls, 69198 ms; live list_entities, query_resource_matches, query_business_relationships and analyze_resource_sharing_by_id. Independent calculations verified EUR 9000/month and EUR 102000/12 months; sensitivity EUR 8000/month and EUR 84000/12 months. Source Worker identities/revisions and assumptions are retained.
- Fresh final demo run b58ac473-4510-40c0-afa8-034d695f1c70: six model calls, 67869 ms; actual Phase 7 warehouse/storage records gave EUR 11000/month and EUR 126000/12 months, with source-backed sensitivity scenarios. The finding reached only Workers 2/3; browser acknowledgments appeared in Master. UI history/deep-link refresh and evidence display passed.
- Exact provider configuration/key bytes were restored after each run; the temporary model alias was unloaded. The installed base model was not modified.
- Human review accepts only the conditional sharing opportunity supported by the calculations. The demo wording calls EUR 2000 incremental cost lower; this is higher than the EUR 1000 assumption. Reject that adjective and use the explicit deterministic tables. Location, transport, service levels, taxes, contracts, safety and investment remain human checks. No business decision was executed.

Earlier attempts are retained honestly: one completed response had ambiguous baseline wording and is not accepted evidence; another returned MODEL_OUTPUT_INVALID and persisted no recommendation. Reproducible provider outage/timeout/malformed/undeclared-tool/tool-budget cases passed. Model prose is untrusted wording, not numerical authority.

## Defects and recovery observed

Corrected ambiguous heading selectors and generated dropdown accessible names, ordinary configuration Save placement, empty skills becoming null, bounded read-only busy retries (never automatic mutation replay), scenario currency assumptions, monotonic governance test versions, and continual rewrites of identical Printify job errors.

An initial USD connector attempt received an EUR simulator order and correctly refused production. The EUR source record remains pending with its reconciliation error, without currency rewriting or paid production. Subsequent source identities and new USD simulator configuration verified the corrected flow. Repeated provisioning preserves old simulator configuration. A financial assertion briefly observed different legitimate source revisions during durable catch-up; the final runner waits for fulfilled source observations before publication, then verifies current exact revisions.

Docker's default subnet pool was exhausted. Explicit unused private subnets restored clean test installation without pruning any other deployment. One cold API start restarted before readiness; a repeated startup recovered, and release startup now repeats that safe operation at most once. A further copied-toolkit install encountered Windows EPERM during atomic configuration-directory publication. Bounded publication retries now preserve prepared private bytes, reject existing targets and fail on persistent errors; two additional preservation tests passed. Private test state is outside the final distribution; development candidates containing operator state are not distributable artifacts.

## Remaining production limitations

Simulated Shopify/Printify results do not establish live commercial API compatibility. No live credentials or paid production orders were used. Costs remain estimates and unknown values remain unknown. Human review and reconciliation remain essential, including occasional model wording errors. Enterprise authentication/operations, account recovery UI, production backup/restore and external security/load certification are deferred deployment work. Saved time-zone preferences do not yet localize every timestamp. This MVP is not commercial production certification.

## Final distribution gate

Pending final archive checksums/image selection, preservation redeployment and accepted-manifest promotion. No v0.9.0 tag is authorized until these mandatory release checks pass.
