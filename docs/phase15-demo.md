# Phase 15 selected-deployment demonstration

This guide uses the original selected Master and three Workers. It adds clearly marked synthetic business records through ordinary signed module forms. It does not reset existing data, transfer existing obligations, submit external orders, or grant a model operational authority. Release completion remains governed by `phase15-release-gates.json`.

## Preparation and private state

Read `.steward/operator/selection.json` to identify the deployment. Complete the backup, candidate verification and in-place core upgrade in [the release guide](phase15-release.md) before business acceptance. Preserve original presenter passwords, identities, database volumes and per-module private connector files. Keep one running operator stack; finish with `node scripts/verify-single-stack.mjs`.

The default prerequisite command authenticates and reads installed modules without creating business state:

```powershell
node scripts/phase15-catalog-demo.mjs <selected-deployment> check
```

Mutation sections additionally require `STEWARD_PHASE15_ROOT_READY=1`, set only after the operator has verified backup, core upgrade, exact signed packages and source approvals. This flag records readiness; it does not replace account permissions or Worker governance.

The private generation ledger is `<selected-deployment>/demo/phase15-i-browser.json` (version 1). It binds the generation to the original installation identities and records package/configuration pins, generated creation-request references, action outcomes and record IDs. The public marker defaults to `P15I-V1`. Retain this ledger after failures. A matching public record cannot be adopted without that generation's recorded provenance. Do not delete the ledger or reset phase timestamps to bypass a failed or expired review. Use a newly reviewed generation when leases or scheduled dates require one.

Presenter credentials remain in the existing private `demo/presenter.json`. Each reviewer's password is held in the deployment security directory and referenced by path from the ledger. Never copy credentials or generated deployment files into Git. For any deliberately reviewed manual private-ledger change, read and write explicit UTF-8 (for example Python `read_text(encoding="utf-8")` and `write_text(..., encoding="utf-8")`); preserve human choice-label characters exactly. Do not use a shell default encoding that replaces Unicode labels with question marks. Keep a private pre-edit copy and validate JSON before the runner resumes. Create a distinct local reviewer on each Worker with only Pricing `.read` and `.review`; the existing administrator handles Catalog publication, configuration, costs and preview. Pricing analytical publication itself uses `.review`, so the reviewer needs no invented `.publish` grant or Catalog grant.

## Installation and configuration

Use Module Manager to install Catalog 1.4.0 and Pricing 1.3.0 independently on all three Workers, then Stock Ledger 1.2.0 and Procurement 1.3.0 on Worker 3: eight fresh installations. `install-fresh` verifies an already installed exact package/configuration rather than upgrading it. Existing module upgrades are a separate operator-reviewed step.

For this demonstration the fresh Catalog modules enable optional governed integrations and analytical reads, with operational/classification read age 1,800 seconds and external read age 3,600 seconds. Pricing enables optional governed Catalog and cost reads, Catalog age 1,800 seconds and cost age 3,600 seconds. Fresh Worker 3 Procurement uses USD, a 1,800-second reference lease and 3,600-second cost lease; synthetic service replenishment remains disabled. Fresh Ledger uses USD, `quantityUnit=item`, and simulation disabled. The exact public configuration is defined in `scripts/phase15-demo-plan.mjs` and pinned in the private ledger.

Worker 3's original Inventory retains `quantityUnit=units` exactly. The new physical Catalog offering, its variant, bundle component and physical cost model therefore use `units`. The fresh independent Ledger uses `item`, remains unbound to Sales, and demonstrates eleven separate units of its own. These labels are not aliases and no balances are converted. The explicit `reconcile-unit` section edits only this generation's two new Catalog records, before any mappings, links, bundle components or price rules exist; it verifies that Inventory's original configuration and identity remain unchanged.

Preserve Worker 1/2 original Inventory, Sales, Ledger, simulator and connector package/configuration pins. Upgrade only the specifically reviewed Worker 3 Inventory/Sales/connectors. Connector image approval is tied to the exact trusted image and existing private egress scope; preserve profiles, credentials and production-disabled state.

## Governed source permissions

All three Pricing modules consume their local Catalog's offering reads and exact pricing-subject lookup. Worker 3 additionally uses explicit local bindings: Catalog to Inventory item reads and Procurement supplier reads; Pricing to Procurement cost reads; Sales to Catalog subject/operational/publication reads, Pricing request/status and Inventory's verified reserve/release/consume operations. Every selection is an approved installation/package pin. The independent Ledger is not a substitute for existing Inventory obligations.

Worker 3 Shopify and Printify discovery requires the new read capabilities, exact image-bound egress approval and the root's `externalReadReady` checkpoint. Connections, product discovery and exact lookup are read operations. Do not enable order or production operations for this scenario. Historical unavailable profiles remain distinguishable from a fresh read failure.

## Business sequence

Run individual sections deliberately, inspecting each report before advancing:

1. `install-fresh`: eight ordinary UI installations and activation.
2. `catalog`: Worker 1/2 independent service definitions; Worker 3 all six offering types, a physical variant, category, typed attributes, bundle components and explicit bundle activation. If repairing the first recorded generation, perform `reconcile-unit` before dependent records; a fresh generation already uses `units`.
3. Complete the operator-reviewed additive bindings/workflows, then `operational-stock`: twenty units in the original Inventory, eleven independent Ledger items, named metadata discovery and exact Inventory-link verification.
4. `pricing-controls`: distinct reviewer approvals followed by explicit activation of retail, wholesale, web and promotional prices. A genuine same-family future revision preserves the current price until its scheduled start. Preview both times without activation or mutation.
5. `procurement-cost`: publish a real local synthetic supplier quote; discover and exactly read original cost evidence. At quantity seven, acquisition plus shipping gives a known subtotal of 1,100 cents while missing packaging leaves contribution unknown. Explicit packaging at ten cents per unit completes estimated variable cost at 1,170 cents. What-if price changes affect only the prospective preview; actual profit stays unknown.
6. `governed-sales`: select the verified Catalog subject, create a staged quantity-two draft, request prices, await actual Pricing receipts, explicitly confirm against fresh status, then fully fulfill the accepted order. Inspect the immutable accepted price, original source identity and remaining Inventory. A timeout or rejected quote is a failed gate, not acceptance.
7. `external-discovery`: select actual named live profiles and products, inspect bounded product/variant pages, then choose an exact observation. The operator records the selected human labels and classification review in the private ledger. `external-import` performs an exact read and read-only preview before applying explicit local code/name/type/details. Unknown or null provider SKU/type remain unchanged source facts. Duplicate SKUs never authorize merging.
8. `analytical-publications`: explicitly publish reviewed Simulation Catalog definitions and the actual accepted Sales line. Retain the original accepted Catalog/pricing proof. Cumulative fulfilled value is an as-of snapshot, not period revenue recognition or realized contribution.
9. `service-cohort` runs last, immediately before Master/Qwen acceptance: independent Worker 1/2 USD service observations, seven sessions each at 300 cents, all channels (null), the same required cost scope, explicit reviewed acquisition N/A and human variable-labour estimates of 100/120 cents per session. Expected conditional contributions are 1,400/1,260 cents. N/A is a reviewed assumption, not known-zero actual acquisition. All publications are Simulation and have bounded captured leases.

After the last section, use the Master Catalog & Pricing Intelligence page with Synthetic demonstration disclosures selected. Verify both original Worker identities, currency, quantity, source assumptions, unknowns, evidence and deterministic comparison. The installed Qwen investigation uses the same explicit simulation audience and existing model configuration. Publishing a finding requires a separate human review and affected-Worker acknowledgments. No model chooses providers, approves prices, reserves stock or manufactures products.

## Evidence and checkpoint status

Every browser section writes `artifacts/phase15i-<section>.json` with actual actions, screenshots, errors and status. These are installed ordinary-UI tests, not fixture-host routing claims. Preserve failures alongside successful retries.

At the 2026-10-28 03:14 UTC checkpoint, installed UI fresh installation, Catalog, explicit unit reconciliation, Inventory linking, independent Ledger, pricing controls, Procurement/cost and governed Sales acceptance have passed. Sales accepted the original synthetic draft only after explicit reviewed re-quotation and fresh authorization, then fulfilled two units through the original verified Inventory provider. Its immutable accepted snapshot is retained, with eighteen units remaining and zero reserved. Named original Shopify/Printify product and variant discovery also passed at 03:24:52 UTC. Shopify human-classified import has been applied and retains original null SKU/type; Printify import remains pending after a first-page-only browser row lookup failure. The helper now uses ordinary table pagination and preserves the already applied Shopify plan; six isolated Chromium groups pass. Actual Printify import retry remains unverified. Analytical publications, final service cohort, installed-model finding, clean-installation and final release remain separately pending. The first outage attempt timed out on an incorrect pending-publication query; its failed report has no cleanup errors, and corrected-query outage retry is pending verification.

The first Catalog run rejected an uppercase attribute key; only the harness input was corrected to the declared lowercase grammar. Two pricing attempts exposed helper dependency/cache issues: a locked derived currency was checked before selecting its source, and a same-page reviewer tab retained older reference choices. The helper now orders source dependencies and performs an ordinary reload when reopening the same screen. Validators, source authority and account permissions were not relaxed. The failure reports remain `phase15i-catalog-first-failure.*` and `phase15i-pricing-controls-{first,second}-failure.*`.

Actual read-only connectivity has separately passed with seventeen Shopify products/twenty-six variants and five Printify products/625 variants. This establishes catalog read compatibility only, not live order/fulfillment compatibility. Browser discovery pages are bounded and do not claim a full variant census.

The first Sales run omitted the ordinary Poll current price authorization action; the helper now waits for original job receipts, polls via that action and separately confirms. The second run correctly refused the original quote after its scheduled authorization boundary expired. Both failures remain `phase15i-governed-sales-{first,second}-failure.*`. The operator explicitly authorized `STEWARD_PHASE15_REQUOTE_EXPIRED=review-current-price-20261028` for this unaccepted draft. Before ordinary Request prices, the ledger recorded the original job/request IDs, expiry reasons and review label. New quote jobs then received current status and separate confirmation; the original job history was preserved. This is an explicit reviewed recovery, not default automatic re-quotation. Remove that environment value after the authorized retry. Actual success is recorded in `phase15i-governed-sales.json` and `phase15i-governed-sales-reviewed-requote.log` at 03:13:51 UTC.

The browser-adapter test requires both `scripts/fixtures/business-browser-currency.html` and `.tsx`: it builds this isolated production ModuleScreen fixture alongside the nested-form fixture. The isolated Chromium groups verify source-before-currency ordering, refusal of mismatched derived currency without a write, and ordinary same-screen reopen refreshing independently created choices. It uses only ephemeral local HTTP and no selected-deployment credentials or data.

Outage acceptance must inspect the actual durable pending-publication representation and then confirm delivery after Master recovery. `artifacts/phase15-outage.json` currently retains the first failed query assertion; stopping and restoring Master without cleanup errors does not itself establish successful outage delivery. The corrected-query retry must produce its own passing evidence before this gate is reported complete.


## Pricing 1.3.1 correction case

The installed V1 demonstration initially used Pricing 1.3.0. Actual Master recomputation rejected its two service publications because a cached Catalog receipt timestamp was omitted by the publisher. These disclosures were explicitly withdrawn, preserving their original evidence, source pins and history. Pricing 1.3.1 uses the recorded receipt timestamp; its SQL, permissions and capability contracts are unchanged. Never overwrite the signed 1.3.0 package or rewrite an old record's provider identity.

After publishing the new signed package, complete a passing selected-core preservation check and retain that run's full private backup. The guarded patch CLI is inert by default. Its execution checks quiescence, exact configuration and every old Pricing table before upgrading and approving only new-work routes:

```powershell
node scripts/upgrade-phase15-pricing-patch.mjs
$env:STEWARD_PHASE15_ROOT_READY='1'
node scripts/upgrade-phase15-pricing-patch.mjs --execute-authorized --backup-directory <completed-backup> --upgrade-proof <passed-upgrade-report>
node scripts/phase15-catalog-demo.mjs <selected-deployment> check --service-case Pricing131
node scripts/phase15-catalog-demo.mjs <selected-deployment> service-cohort --service-case Pricing131
node scripts/verify-phase15-installed-catalog-ollama.mjs --execute-authorized --ledger <selected-deployment>/demo/phase15-i-browser-pricing131.json --report artifacts/phase15i-installed-qwen-pricing131.json
node scripts/inspect-phase15-installed-catalog-analyst.mjs --execute-authorized --report artifacts/phase15i-installed-qwen-pricing131.json
```

The explicit `Pricing131` case creates distinct definitions, lists, policies, approvals, cost models, assumptions and publications in a separate ledger. It retains the V1 ledger and expired/withdrawn evidence. It never extends an old review window or transfers an accepted order/reservation. Run the native investigation immediately after current publications reach Master, then inspect the same investigation and delivered finding in the UI. A failed or expired case requires explicit reconciliation; successful fixture tests do not establish installed native-model success. The final verification report records which commands actually passed.


An explicit `--service-case NativeReview` uses a separate `phase15-i-browser-native-review.json` ledger after the Pricing131 native narrative failure. It creates separately reviewed synthetic service intent; it does not renew old publications or rewrite their evidence. Execute only after the installed correction and readiness checks, then pass this exact ledger to the installed Qwen verifier. Expired cases remain preserved; never edit their saved validity windows to force acceptance.


`--service-case NativeComposition` creates the separately reviewed `phase15-i-browser-native-compose.json` case for the two-model-part finalization correction. Existing NativeReview records and leases remain unchanged. Start the actual installed Qwen verifier with this explicit ledger only after the corrected core is deployed; historical model probes do not establish live acceptance.


The final acceptance uses explicit `--service-case NativeFinal` and ledger `phase15-i-browser-native-final.json`. The interrupted NativeComposition ledger and its original source window are retained. Atomic ledger publication retries only the same prepared snapshot on transient Windows contention; permanent errors preserve the previous and prepared snapshots for inspection. Do not change saved dates or regenerate intent IDs to force a retry.
