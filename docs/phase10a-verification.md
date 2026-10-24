# Phase 10A acceptance verification

**Subsequent operator correction:** [single-stack operations](single-stack-operations.md) records promotion into the existing operator installation and removal of temporary acceptance containers. The acceptance results below describe the original test run; its final operational state has since been superseded by that in-place promotion.

**Result: Phase 10A simulated-commerce acceptance passed.**

Branch `phase10a/commerce-intelligence`; original baseline `d0385b6`. The accepted v0.9.1 tag remains at `c9768025e6a95da057617f405225a3b6da006691` (annotated tag object `da9de5ff4fa8faff94672329c42cde9d9c391bc3`). No release tag is created. Version 0.10.0 denotes development packages, not a promoted production release.

## Scope and deployment preservation

Implementation extends existing Sales, Shopify and Printify packages, the generic module renderer and the existing Master analytics/findings services. No commerce screen is compiled into Worker core: independently signed modules contribute navigation, forms, permissions, operations and data-only report metadata. Ordinary reports and exceptions appear in Business.

Acceptance uses the separately named `steward-phase10a-accept` deployment under ignored `.steward/phase10a-acceptance`, with explicit USD commerce simulators. Master uses port 14100; Workers use 14201–14203. All three Workers enrolled through the trusted flow, retain separate operational and module databases and use identical Worker API/web artifacts. Worker 2 initially had no Inventory; the retained Inventory 1.2.1 was subsequently installed by an earlier-phase regression prerequisite. Existing EUR regression records coexist with new USD commerce records without conversion.

The selected operator preview (`steward-phase8-upgrade-reg`, Master 26100 / Workers 26201–26203) remains on its original release selection. Its databases, identities, passwords and presenter configuration were not replaced. Its private password file remains `.steward/phase8-upgrade-regressions/demo/presenter.json`. No credential values are recorded here or in committed evidence.

Final module packages: Sales **1.2.3** (schema 5), Shopify **1.1.1** and Printify **1.1.1** (schema 4), commerce kit **1.1.1**; retained Inventory **1.4.2**, Stock Ledger **1.0.0**. Legacy Operations **1.0.0** remains installed by regression acceptance. Package images and runtime identities are recorded in the companion evidence file.

## Automated results

Final `npm run build`: passed. Final `npm test`: **107 passed, 0 failed, 0 skipped**: SDK 14, module host 2, platform 42, installer 9, Inventory 2, Operations 2, business modules 7, SSMA 8, commerce 13, intelligence presentation 4 and Compose operator 4. Baseline before changes was 93 checks. `npm run test:smart:browser`: **9 passed** (8 overlap the SSMA root suite; these are not 9 additional unique backend tests). Earlier-phase deployed regression runner: **17/17 suites passed**, including trusted security/enrollment, persistence, MCP, reproducible AI, concurrency, isolation, outage independence, module restart/provision and secret handling. Its main run precedes the final commerce-only model-context/planning correction; that correction has platform, actual MCP/model and browser coverage separately.

Commerce backend tests use disposable PostgreSQL and separate authenticated TLS provider simulators, not mocked success responses. Final core API source is committed at `98537e2`; unchanged frontend/module-host acceptance images were built at `9a852f7`. Exact image IDs and redeployment results are in [acceptance evidence](phase10a-acceptance-evidence.json). The final acceptance commit also includes documentation and test-driver refinements; its identifier is reported with the clean-tree finalization result.

## Exercised business acceptance

- Full browser commerce workflow on Workers 1 and 3: authenticated provider observations → explicit mappings → verified SSMA provider/workflow resolution → Sales order → Inventory reservation → local human production approval → simulated Printify production/shipment → Sales fulfillment → Shopify fulfillment. Core images remain unchanged by module install/upgrade. No browser JavaScript errors.
- Repeatable USD scenario: premium Worker 1 order has gross $105, discount $15, recognized merchandise $90, refund $5, production $24, shipping $6 and transaction fee $2, giving estimated contribution **$53.00**. Low-margin order contributes **$1.00**. Worker 3 premium order contributes **$30.50**. Canceled, unapproved and unowned/unmapped orders remain distinguishable; incomplete financial evidence never becomes zero.
- Deterministic MCP checks: exact fee-aware totals, period/cohort demand, explicit conditional supplier-cost comparison (800 cents per unit for the selected evidence), source freshness and attribution, foreign-entity access rejection, and historical envelope lookup after a source revision advances. A same SKU does not establish equivalent suppliers or realizable purchasing savings.
- Durable monitoring: default-off connector publication creates no new replicated projection/outbox entry; opt-in publication synchronizes authorized conditions. Withdrawal/republication preserves the original alert episode. Unchanged observations do not duplicate findings. A real synthetic provider cancellation resolves its conditions; the affected Worker acknowledges/resolves findings, signed receipts reach Master, and explicit registry action closes findings. Finding status is not automatically treated as business execution.
- Two-store backend acceptance deliberately reuses remote IDs: local records and source observations remain isolated, mappings/production/shipping/fulfillment use the original connection, and first-store effect counts remain unchanged. Removed connections become unavailable without deleting obligations. Unknown external outcomes reconcile rather than blindly resubmit.
- Outage/restart acceptance exercised Master, simulator, Worker, module and coordinator interruption, retaining records and exactly-once effects. Worker local operation remains independent of Master availability.
- Clean initialization, repeated provisioning, append-only upgrades and pinned-image redeployment preserve protected platform/module records and 53 private configuration files. All four API readiness checks and all four frontends succeed after redeployment.

## Commands and evidence

See [operator and demonstration procedure](phase10a-commerce-intelligence.md) and [architecture decision](adr/0023-commerce-contribution-and-operational-alerts.md). Commands were run from the repository root in PowerShell; private deployment files and raw artifacts are deliberately ignored.

```powershell
npm run build
npm test
npm run test:smart:browser
node scripts/verify-phase8-regressions.mjs .steward/phase10a-acceptance
node scripts/demo-commerce-intelligence.mjs .steward/phase10a-acceptance seed
node scripts/demo-commerce-intelligence.mjs .steward/phase10a-acceptance verify
node scripts/demo-commerce-intelligence.mjs .steward/phase10a-acceptance browser
node scripts/verify-phase10a-publication.mjs .steward/phase10a-acceptance
node scripts/verify-phase10a-model.mjs .steward/phase10a-acceptance
$env:STEWARD_PHASE10A_IMAGE_CANDIDATES = '{"api":"candidate11","web":"candidate8","module-host":"candidate8"}'
node scripts/verify-phase10a-redeployment.mjs .steward/phase10a-acceptance
Remove-Item Env:STEWARD_PHASE10A_IMAGE_CANDIDATES
```

The deployment regression runner completed all 17 suites; a retained-package prerequisite was corrected and its supported resume option was used from `verify-phase5` onward. Original raw logs include `artifacts/phase10a-build.log`, `phase10a-regression-tests.log`, `phase10a-smart-browser.log`, `phase10a-deployment-regressions*.log`, `phase10a-final-commerce-browser.log`, `phase10a-redeployment.log` and corresponding JSON reports. The committed companion evidence contains selected actual results and checksums, not credentials or a private deployment.

## Corrected failures retained in the audit

Sales 1.2.0 initially emitted different payloads at the same source revision. Master correctly rejected them. Appended migration 5 replaces the competing trigger with one canonical projection, retains superseded envelopes and repair audit, and publishes higher-revision snapshots. Browser upgrade/data-preservation checks and backend one-payload-per-revision assertions pass. Applied migrations were not edited. The defective intermediate package is removed only from the isolated available catalog.

Connector 1.1.0 initially published unapproved condition metadata despite its default-off setting. Appended migration 4 prevents creation of those replicated copies and withdraws only previously published records. Actual deployed default-off and withdrawal/republication tests pass. Intermediate packages are not the final recommended versions.

Browser validation caught invalid UTF-8 punctuation and deeply nested table layout; both were corrected and re-exercised. A legacy regression lacked its retained signed Inventory 1.2.1 catalog prerequisite; the existing verified package was added to the isolated catalog, and all 17 deployment regressions subsequently passed. Known no-effect provider-inspection/read contention is retried within bounds; uncertain production writes are never blindly retried. A seed interrupted by overlapping outage orchestration recovered, and later runs were performed sequentially.

The first real Qwen investigation completed its tool pipeline in 35,281 ms but mislabeled legacy pre-fee margins as contribution. Its narrative was **rejected and never published**. The actual run is retained as `artifacts/phase10a-ollama-first-run.json`. Model-only calculation context now excludes ambiguous pre-fee legacy margins while retaining the full original evidence internally; a regression covers both compact and full context. The second run failed explicitly with `REPEATED_TOOL_CALL` after the model guessed placeholder calculation IDs before seeing the query result. No finding was published. Commerce now stages its discovered tools: entity discovery first, authorized evidence queries second, calculation only after source observations. The model still chooses actual calls/arguments and every call is validated against the tools offered in that turn. A regression verifies that this planning never adds tools or authority. The third run selected exact real sources and calculated USD 83.50 in 24,436 ms, but its text misread a generic conditional rule as missing selected fees. That narrative was also rejected without publication (`artifacts/phase10a-ollama-third-run.json`). Model context now states actual selected completeness and exact source/total service amounts, with a regression for complete estimates. Final real-model outcome is recorded below.

The final workflow browser check used:

```powershell
$env:STEWARD_COMMERCE_CURRENCY = 'USD'
$env:STEWARD_COMMERCE_ORDER_BASE = '200'
$env:STEWARD_COMMERCE_MODULE_VERSIONS = '{"sales":"1.2.3","shopify":"1.1.1","printify":"1.1.1"}'
node scripts/verify-phase8-commerce.mjs .steward/phase10a-acceptance browser
Remove-Item Env:STEWARD_COMMERCE_CURRENCY, Env:STEWARD_COMMERCE_ORDER_BASE, Env:STEWARD_COMMERCE_MODULE_VERSIONS
```

## Real local AI and delivered finding

Final investigation **`8880d658-be26-4d73-ac12-ad9f88e48e8c`** used installed **qwen2.5:7b**, context alias `steward-analyst-qwen2.5-ctx16384:7b`, **testModel=false**. It completed in **32,369 ms**, with four actual model turns (1,213 / 2,344 / 6,597 / 20,966 ms). The model selected `list_entities`, `query_commerce_evidence` with exact `SYN-10-PREMIUM` SKU filter, and `analyze_commerce_by_id` with the observed source UUIDs at revisions 13 and 14. The final turn produced the narrative. All tool results came from live Steward MCP services over the isolated deployment, using simulated commerce sources.

The service returned **USD 83.50 estimated combined contribution**, with **USD 30.50** and **USD 53.00** per order. The original complete calculations were independently recomputed and source revisions checked. The accepted narrative copies these amounts, distinguishes estimates from verified net profit, and requires conditional review of supplier quotes, product equivalence, fee evidence, pricing and company consent. Source observations/references remain visible in the retained evidence; this does not establish current live provider state or realizable purchasing savings.

After verification against the actual calculations, the exact narrative hash `3545b6b0a58172d92c1a446741898697dd2485ec21b2fbf1ba711e415744612b` was supplied to `verify-phase10a-reviewed-finding.mjs`. The script loaded/refreshed the actual investigation in Chromium and published through **Publish finding for human review**. The same-ID finding reached **Workers 1 and 3 only**; Worker 2 did not receive it. Browser acknowledgments from both affected Workers produced signed receipts displayed at Master. No browser JavaScript errors; no purchasing, pricing or production authority was granted or executed. The model context change did not remove the full original source evidence from the audit.

The reproducible protocol fixture separately checks actual MCP/calculation plus model-unavailable, malformed output, undeclared tool, per-call timeout and tool-call-budget failures. These expected failures retain partial activity and no fabricated result. It is explicitly **testModel=true**, never evidence of a real-model run. Original model configuration/secret bytes are restored after both test drivers. The real-model verifier unloaded the alias; no model is intentionally left loaded.

The first and third real-model narratives were rejected, and the second tool sequence failed safely; none was published. Their actual outcomes remain in the committed evidence. This local model requires constrained tool planning and explicit review; it is not an unattended decision engine or an automatic semantic verifier.

## Screenshots

- [Worker commerce dashboard](screenshots/phase10a-worker-dashboard.png)
- [Worker operational exceptions](screenshots/phase10a-worker-exceptions.png)
- [Master contribution report](screenshots/phase10a-master-report.png)
- [Master original finding evidence](screenshots/phase10a-master-finding-evidence.png)
- [Real Qwen investigation history](screenshots/phase10a-real-analyst.png)
- [Affected Worker finding](screenshots/phase10a-real-worker-1-finding.png)
- [Master delivery acknowledgments](screenshots/phase10a-real-master-delivery.png)

## Final operational state

After acceptance, only the isolated Phase 10A stack and its owned module containers were stopped to free memory. **Nine named volumes**, module installations, business records, configuration and generated credentials are retained. Restart instructions are in the operator guide; no Docker pruning or volume deletion occurred. The existing operator preview still has **24 running containers**; all four original API readiness endpoints and all four frontends returned **HTTP 200** after cleanup. Its root deployment selection and login information remain unchanged. Ollama reports **zero loaded models**. The separate Phase 10A images are local development artifacts; they were not silently promoted over the operator preview.

All code checkpoints are committed. The final documentation/evidence commit identifier and clean working-tree result are recorded in the completion response and ignored `artifacts/phase10a-finalization.json`; this report does not embed its own circular Git hash. No new release tag was created.

## Production limitations

All Shopify/Printify connectivity here is simulated. No commercial credential, live store, webhook subscription or paid order was used. Live API/scopes/rate-limit compatibility, invoices/fee settlements, production trust/rotation, deployment backup/restore and incident procedures require separate verification. This is not a claim of commercial production readiness.

Costs may be explicit estimates; missing costs remain unknown. Contribution excludes overhead, income tax and shipping income, and is not net profit. Multi-SKU order cost/refund allocation remains unknown. Historical refund/cancellation cohorts are not settlement cash flow. No forecasts, automatic pricing/purchasing, automatic production approval, cross-Worker global store lock, automatic obligation migration, scheduled trend investigation or custom alert policy UI is introduced. Human review and company consent remain required. Existing offline-enrollment extension contracts remain deferred.
