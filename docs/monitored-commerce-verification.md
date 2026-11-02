# Shopify–Printify monitoring acceptance — 2026-11-01 (Pacific)

This is a bounded monitoring increment, not a platform release. No branch or tag was pushed and no release was tagged. The selected installation remains `steward-phase8-upgrade-reg`.

## Implemented and deployed

- Shopify **1.7.0**: persisted bounded transient recovery; current versus historical comparisons/conditions; read-only Monitored Store Overview; separately approved order-total SSMA reads; approved analytical and exception publications.
- Printify **1.7.0**: separate backward-compatible `commerce.printify.order-totals.read` capability (`steward.order-totals` contract v1). Existing observation and item-cost contracts remain supported. No production permission was added.
- Master: separate `monitored_commerce_v1` observations, scoped deterministic calculations, two MCP tools, existing commerce-investigation profile, report cards and existing governed finding delivery. The existing Sales report is unchanged in meaning.
- Reused the signed package registry, pinned bindings, workflows, durable routing/receipts, module-owned records, declarative UI renderer, signed synchronization, entity authorization and notification episodes. No competing runtime, scheduler or production automation was introduced.

Operational use is documented in `docs/monitored-commerce.md`; the commits below contain the implementation. New files include Shopify `live-recovery.ts`, `monitor-current.ts`, `monitor-report.ts`, `monitor-publication.ts`, `order-totals.ts`; Printify `order-totals.ts`; commerce-kit `order-total-costs.ts`; platform `monitored-commerce.ts`; two focused test files; and append-only migration `007-monitored-commerce.sql`. Existing manifests, routing, live transport, monitoring policy, Master synchronization/MCP/analyst, report rendering and acceptance fixtures were extended.

## Actual tests and builds

| Verification | Result | Evidence under `artifacts/` |
|---|---:|---|
| Focused recovery, monitored calculations, policy, action authorization, live transport and item-cost tests | 47 passed | `monitoring-focused-accepted.log` |
| Commerce database and TLS simulator suite, including new SSMA totals/publication/current-history fixtures | 36 passed | `monitoring-commerce-expanded.log` |
| Platform backend suite after final functional correction | 98 passed | `monitoring-platform-accepted.log` |
| Intelligence presentation tests | 12 passed | `monitoring-presentation-tests.log` |
| Exact migration bytes, clean Git checkout and signed publication ancestry | 10 passed | `monitoring-migration-accepted.json` |

**203 tests across these suites passed.** Overlapping reruns are not added to the total. This is relevant regression coverage, not a claim that the repository's entire `npm test` release suite was run.

TypeScript builds passed for commerce-kit, Shopify, Printify, platform, shared UI and Master frontend. Docker builds passed for both signed modules and Master API/web. The Master frontend retains its existing bundle-size warning. Worker core images were not rebuilt.

Commands used for the final focused checks:

```powershell
node --test scripts/test-live-recovery.mjs scripts/test-monitored-commerce.mjs scripts/test-order-monitoring-actions.mjs scripts/test-shopify-live.mjs scripts/test-monitor-policy.mjs scripts/test-order-item-costs.mjs
node scripts/test-commerce.mjs
npm run test -w @steward/platform
node --test scripts/test-intelligence-presentation.mjs
node scripts/test-phase15-source-migrations.mjs --committed --catalog .steward/phase8-upgrade-regressions/modules/public/catalog.json --trust .steward/phase8-upgrade-regressions/modules/public/trust.json --report artifacts/monitoring-migration-accepted.json
node scripts/verify-single-stack.mjs
```

## Browser and live evidence

Selected URLs: Worker 3 `https://worker-3.localhost:26203`; Master `https://master.localhost:26100`. Open Worker 3 → Business → Shopify Commerce → Monitored Store Overview. Master → Reports includes Monitored store observations.

Six browser views passed: Worker Monitored Store Overview, current combined orders, historical orders, historical conditions, Administration live connection, and Master reports. Historical tables have no row action buttons. Current comparison contains two orders. Actual UI approval published order #1002; the separately approved supplier-hold condition used its module UI action. Browser evidence is in `monitoring-browser.json`, screenshots prefixed `monitoring-browser-`, and `monitoring-master-report.png`.

Read-only provider observations at acceptance:

| Source order | Shopify payment / fulfillment | Printify status | Booked merchandise | Production | Order shipping | Item shipping | Unallocated difference |
|---|---|---|---:|---:|---:|---:|---:|
| #1002 | paid / fulfilled | fulfilled | USD 18.99 | USD 6.40 | USD 7.69 | USD 7.29 | USD 0.40 |
| #1001 | pending / unfulfilled | on-hold | USD 68.97 | USD 25.45 | USD 15.73 | USD 15.33 | USD 0.40 |

The #1002 known fulfillment cost is **USD 14.09**, counting order shipping once. The difference remains unallocated, not labeled a seasonal surcharge or an error. These are observations, not a complete expense ledger. No provider order was created, paid, changed, canceled, submitted, or fulfilled by this work. Fulfilled status came from provider data; it does not prove physical delivery. Customer personal information is excluded from the evidence report.

The original authorized Shopify connection automatically recovered after upgrading from its retained transient failure. A second, controlled local network interruption produced `CONNECTOR_UNAVAILABLE`, `retryAttempts=1`, and a persisted retry time. Reconnecting its exact approved egress network resulted in automatic `synced` / `healthy`, retry count zero, without a manual sync. `monitoring-outage.json` records failure and recovery times and restored networks. The separate pre-existing mismatched private Shopify profile remains unavailable; no credentials or identity checks were changed to make it pass.

## Governed Master flow

Worker-local approval of #1002 authorized its original comparison's future analytical updates. The exact installation/module/stream/record/revision reference arrived at Master through existing signed synchronization. Its report keeps monitored observations separate from Sales recognition.

The actual current supplier hold was explicitly published and Master monitoring was enabled for Worker 3's entity through the existing authorized API. Finding `40e3aa22-55b5-496c-bf95-de7de13a1a97` reached Worker 3 only. Workers 1 and 2 did not receive it. Worker 3's acknowledgment reached Master. Another monitoring cycle retained the same condition episode and finding ID. See `monitoring-notifications.json`. Synthetic tests cover recurrence, resolution and privacy cases that were not manufactured in the live store.

## Real model review

Native local Qwen (`steward-analyst-qwen2.5-ctx16384:7b`) completed investigation `36ae3096-4d1d-4302-ad7f-85e514afb5a3` in **40.85 seconds**, four model calls and three actual MCP calls: `list_entities` → `query_monitored_commerce` → `analyze_monitored_commerce`. The calculation resolved the exact approved source at revision 44 with entity/installation/module/stream/record scope.

The complete final narrative, assumptions and human decisions were reviewed against retained evidence. All amounts matched: USD 18.99 booked merchandise, USD 6.40 production, USD 7.69 order shipping, USD 14.09 known fulfillment. It explicitly kept settlement, recognized revenue, fees, tax allocation and net profit unverified/unknown. Its supported recommendation is human reconciliation against payment-provider settlement and fee records before any profit conclusion. There is no unsupported cost benchmark or estimated-margin claim.

See `monitoring-ollama-final-accepted.json` for actual calls/results/timing and `monitoring-ollama-review.json` for the separate evidence review. This was an implementation-agent evidence review, not a claim of independent operator approval. The AI recommendation remains unpublished for operator review; the actual condition finding demonstrated delivery and acknowledgment separately. Original model configuration and key bytes were restored; the model was unloaded and definitions were unchanged.


## Failures retained and corrections

- Initial new manifest fields omitted required boolean metadata; corrected before deployment and focused tests rerun.
- Clean-checkout integrity failed for the new migration's mixed line endings. Its applied/signed bytes and checksum were preserved; `.gitattributes` and the Git blob now preserve those exact bytes. Clean-checkout and ancestry checks pass. No applied SQL was rewritten.
- One registry read returned HTTP 502 during setup; the healthy existing API was retained, setup was safely retried, and approved pinned bindings/workflow were verified. No authorization bypass was used.
- Early browser harness checks used a Business route for the Administration connection screen and an incorrect heading case. Correct routing/table assertions pass. A later redundant approval encountered an expected optimistic revision conflict after background refresh; the already-approved record was re-read rather than overriding concurrency. Original successful UI publication evidence was retained.
- Four native Qwen runs returned empty output at the calculation step. Narrowing tool selection after observed monitoring evidence and compacting only model-facing results enabled actual calculation calls. Full evidence stays in activity. The established one-attempt protocol clarification was extended only to empty monitored-commerce tool responses; it never fabricates calls or resets budgets.
- Two completed model narratives included unsupported estimated-margin language; both were rejected and withheld. Monitored finalization now has separate evidence guidance and rejects unsupported monetary or estimated-margin/benchmark claims. No failed or rejected run was published. One guarded run completed with a supported unknown-cost narrative during a refresh, but failed the acceptance harness’s expected complete-cost assertion. A separate preflight’s 20-second timestamp window timed out across asynchronous synchronization; it was corrected to 90 seconds, still inside the unchanged five-minute source freshness contract.

## Deployment and preservation

Private configuration and database backups preceded upgrades. Both module upgrades preserved configurations and all original record identities (73 Shopify, 11 Printify). Original policy/association/binding history was retained; a new explicitly governed successor policy uses the new provider/package identities. It enables bounded cost reads, not production. Historical obligations were not transferred.

All seven original volumes, core installation identities, existing private security/connector files, unrelated core images and modules were preserved. The selected URLs and accounts remain unchanged. Printify production remains disabled. Exactly one operator stack with 61 running containers remains; no temporary full stack is left running. See `monitoring-deployment.json`, `monitoring-preservation.json` and `monitoring-single-stack-final.json`.

| Artifact | Exact running image |
|---|---|
| Shopify 1.7.0 | `sha256:da0ce8b2ee65ab37d669bd090b281c1c47f3701b11be1fa4dff0f220a95b6ad8` |
| Printify 1.7.0 | `sha256:552527030509bcd295b71745c78410f6a07067d25176f5837b7bb8ef29ebf67d` |
| Master API | `sha256:1c5b160817824405d704ffe9d7f0971a9299482aeebb4366ebb39e3f87230760` |
| Master web | `sha256:4c1b2120b514382e3b03fb954272b4604f258c5318f98fc911fb6978bf029cfb` |

Signed modules were built from `b5ff795`; the final API from `c9bad0c`; final web from `1572f48`. Checkout integrity corrections are `731d9c4` and `abf7268`; model planning correction is `8383adb`; narrative and bounded protocol safeguards are `bebc55e` and `c9bad0c`. Existing artifacts were retained. No release tag or push was performed.

## Limits

- Read-only monitoring does not provide complete accounting, settlement verification, net profit, production authority, or a delivery guarantee.
- Current provider observations and simulator fixtures establish different things. Simulator tests do not prove arbitrary live Shopify/Printify behavior.
- The overview provides bounded order pages and links to separate condition detail; Master report currently shows up to 20 approved records. Complex split/reprint/ambiguous evidence stays unknown rather than guessing allocations.
- Master receives only explicitly approved observations/conditions; other existing private records remain private. #1002 is the approved analytical demonstration, not a claim that all store history is shared.
- Model output still requires review. Validation guards and one successful run do not establish unattended reliability or commercial production readiness.
- During a bounded background cost read, cost coverage can briefly become incomplete; the report/calculator conservatively returns unknown rather than treating missing amounts as zero. Long model runs can also encounter changed source revisions and must re-read authorized evidence.
- No Google Analytics, ad platform, external notification provider, or new order automation was added.
