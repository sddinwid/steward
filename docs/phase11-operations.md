# Continuous commerce simulation — operator and presenter guide

Phase 11 acceptance is tracked in [the verification report](phase11-verification.md). This guide describes the implemented interfaces; it does not assert that an unexecuted release gate passed.

## Architecture and safety

Commerce Simulation (`steward.simulation.commerce` 1.0.1) is a separately signed, independently installed service with its own database. Simulated Fulfillment (`steward.simulation.fulfillment` 1.0.1) is a separate local SSMA provider. Neither declares a commerce connector, possesses Shopify/Printify credentials, implements commercial HTTP transport, or receives approved external egress. Worker core installation precedes installation of either package.

Sales 1.3.0 and Stock Ledger 1.1.0 expose signed simulation service capabilities alongside their ordinary contracts. The generator sends approved durable commands to those owner services; it never connects to their operational databases. Sales creates orders/customers, reserves/consumes actual stock through Stock Ledger and records actual fulfillment progress from the isolated provider. The engine stores coordination state and service receipts, not a parallel business ledger.

Each transaction carries dataset, run, ecosystem, seed, event index, scenario, virtual timestamp and speed. Actual creation/processing timestamps remain separate. Host route and delivery guards prohibit all synthetic commands from reaching commercial connector packages, including a connector accidentally bound in simulator mode. Aggregate provenance pins reject removed or changed identities. Live connector private files and image/installation-bound egress approvals remain separate.

Worker-local administrators approve module configuration, bindings and a workflow. The existing resolver selects verified installed providers; no model selects authority or approves execution. A bounded workflow supports at most sixteen declared operations/inputs. The complete synthetic lifecycle uses fourteen operations. Existing workflow pinning and obligations remain in force.

## Build and verification commands

From the repository root:

```powershell
npm ci
npm run build
npm test
node scripts/test-simulation-commerce.mjs
```

When editing simulation contracts, rebuild `@steward/simulation-kit`, run `node scripts/sync-simulation-contracts.mjs`, inspect the generated manifests, run verification and commit. Published package versions are immutable; increment versions for subsequent published changes. Applied migrations must never be edited.

Core distribution builds require clean committed source:

```powershell
node scripts/build-release-images.mjs 0.11.0
node scripts/upgrade-phase11-selected.mjs .steward/phase8-upgrade-regressions
```

The second command must name the deployment currently selected in `.steward/operator/selection.json`. It makes private database/configuration backups, replaces only core image pins, applies append-only platform migrations and compares protected data/configuration. It does not install modules or change credentials. Use the selected deployment path on another installation; the example is this workstation's retained deployment, not a required source-code path. Run only one operator stack.

Publish separate module packages to that deployment's trusted catalog:

```powershell
node scripts/publish-module.mjs modules/sales .steward/phase8-upgrade-regressions
node scripts/publish-module.mjs modules/stock-ledger .steward/phase8-upgrade-regressions
node scripts/publish-module.mjs modules/simulation-fulfillment .steward/phase8-upgrade-regressions
node scripts/publish-module.mjs modules/simulation-commerce .steward/phase8-upgrade-regressions
```

Publication builds signed packages; it does not install or activate them. In each participating Worker, use **Administration → Modules** to install/upgrade Sales and Stock Ledger, install Simulated Fulfillment and Commerce Simulation, and activate each. Preserve ordinary module configuration. Enable `simulationEnabled` separately in Sales/Stock Ledger. Enable `simulationPublicationEnabled` in Sales only if synthetic analytical publication is approved. Enable `integrationsEnabled` on the two dedicated synthetic services. Ordinary Sales/Stock Ledger integration flags, currency defaults and commercial provider bindings need not change.

Under **Developer → Capabilities & Workflows**, resolve and approve these local bindings, then propose/review/activate the lifecycle workflow for each consumer:

| Consumer | Capability | Provider |
| --- | --- | --- |
| Commerce Simulation | `simulation.sales.manage`, `simulation.commerce.orders` | Sales |
| Commerce Simulation | `simulation.stock.manage` | Stock Ledger |
| Commerce Simulation | `simulation.production.manage` | Simulated Fulfillment |
| Sales | `simulation.inventory.reserve` | Stock Ledger |
| Sales | `simulation.fulfillment.submit` | Simulated Fulfillment |
| Sales | `simulation.channel.fulfillment` | Commerce Simulation |
| Simulated Fulfillment | `simulation.commerce.status` | Sales |

Include every declared operation for these capabilities in the reviewed consumer workflow. No live Shopify or Printify binding belongs in this lifecycle. Installation/configuration permissions and workflow approval remain server-enforced.

## Normal presenter operation

1. On two Workers, open **Administration → Simulation Control Center**. Create distinct named datasets with the same shared ecosystem label. Choose a seed, scenario, rate, speed and explicit analytical sharing choice. New records are USD; historical EUR records remain separate.
2. Select **Start simulation**. Setup receipts must succeed before generation. A missing approval/provider appears as an error; fix its prerequisite and use Start to retry setup. It does not reset consumed inventory or recreate completed orders.
3. Open **Simulation live dashboard** and **Simulation order activity**. The data-only modular renderer polls every three seconds without reloading the page. Sales and Stock Ledger receipts supply metrics, product performance, inventory availability and underlying source references.
4. Open **Sales & Orders** to inspect real source orders, stock reservation evidence, production/shipping state and synthetic tracking identifiers. These are synthetic business records, not commercial provider orders.
5. Edit the dataset to change scenario, rate or speed safely. History records the change. Seed/ecosystem cannot change after generation until reset. Existing events retain their original scenario/speed/provenance.
6. Open Master's executive overview to inspect the live synthetic ecosystem, company metrics, trends, freshness and cross-company purchasing estimates. Enable **Configure deterministic monitoring** only for the intended legal entities. Set intervals/thresholds using normal form controls.
7. Open a finding, inspect its retained source evidence, review human decisions, then acknowledge it in the affected Worker's Findings interface. Only affected entities receive delivery; Master shows receipts.
8. Optionally select **Synthetic ecosystem purchasing** in AI Analyst. The model discovers actual authorized MCP tools and invokes deterministic service calculations. A recommendation needs separate human finding publication; it cannot authorize production or purchases.
9. Pause or Stop generation. Already accepted owner-service work may finish. Read-only observations remain bounded so the final local dashboard can reconcile accepted work.
10. To reset, first pause/stop, then select **Reset synthetic dataset** and confirm. Sales, Stock Ledger and the synthetic provider each reset only their own tagged run. The engine reports completion only after all owner receipts succeed. A partial reset stays failed with its identity retained; retry Reset after fixing the provider. Do not start new work on a partially reset run.

No JSON editing or CLI invocation is needed for ordinary dataset creation, scenario selection, controls, dashboards, monitoring, findings or AI investigation.

## Scenarios and limits

The nine scenarios are normal commerce, seasonal demand, low margin, production delay, inventory shortage, increased refunds/cancellations, shipping increase, missing mapping and cross-company purchasing. Counter-based sampling makes product/variant, quantity, arrival, cancellation/refund and expense draws repeatable for the same seed/event index. Real processing time and delivery latency are not deterministic.

Module configuration exposes product/variant popularity, quantity ranges, cancellation/refund distributions, seasonal multiplier and provider production/shipping/expense distributions. Defaults bound generation to 120 events/minute, eight outstanding commands, twenty outstanding orders, five hundred order intents per dataset, ten datasets and one thousand retained control-history records. Engine memory/database budgets default to 128 MiB. These are application backpressure budgets, not hard OS-wide resource quotas. Pausing/stopping does not erase accepted durable work. No LLM is called by generation or dashboard polling.

Master monitors use configurable intervals and source-derived delay, cost increase, contribution floor, demand-window, stockout and exception thresholds. Condition identity excludes source revision/value changes, so unchanged active conditions do not create repeated findings. Reappearing conditions form a new episode. Automatic findings are observations for human review, not operational grants.

Purchasing estimates use the most recent four eligible source orders per entity/product/variant for two to four entities in the same ecosystem. Matching synthetic supplier terms, minimum quantities and discount thresholds are required. Calculations use exact integer cents, the highest eligible unit quote before discount, quantity-allocated pooled shipping and each entity's transition expense. The last entity receives the exact allocation remainder. Intercompany transfers are zero and never counted as ecosystem benefit. This is a conditional repeat-purchase estimate for an observed bounded cohort, not realized historical savings or a demand forecast.

## Recovery and production limitations

Workers continue local operations and synthetic generation without Master or Ollama. Synchronization replays retained events on reconnection. The optional AI provider must be independently available; a partial/failed investigation must not fabricate a finding. Restore provider configuration and unload unnecessary local models after validation.

Deactivation preserves module databases. Reset preserves ordinary business records, private credentials, enrollment identities, installations and unrelated datasets. Epoch barriers reject delayed commands from closed runs. Historical synchronization envelopes and audit trails remain retained for evidence; reset is not a forensic history purge. Do not manually delete databases, recreate identities or silently roll back migrations to recover.

The synthetic provider does not establish live Shopify/Printify mutation compatibility. Catalog reuse is deliberately avoided: isolated synthetic SKUs/product attributes provide clear authority boundaries. Estimates omit unconfirmed taxes, supplier commitments and real billing terms. Monitor product-mix/window sensitivity, source freshness and all costs before making business decisions. Passing this MVP demonstration does not establish commercial production readiness.

Additional verification/setup commands (all target the named existing deployment):

```powershell
node scripts/verify-phase11-installation.mjs .steward/phase8-upgrade-regressions
node scripts/configure-phase11-demo.mjs .steward/phase8-upgrade-regressions
```

The installation verifier uses real Chromium authentication, Module Manager installation/activation and core-image comparisons. The configuration helper uses ordinary form controls for module configuration, then the authenticated governed binding/proposal/approval APIs. It preserves existing ordinary Sales configuration and original commercial workflow steps. It does not start generation or authorize an external provider. Original deterministic monitor calculations are frozen when a finding is created (append-only platform migration 14); current condition updates do not replace the historical financial evidence shown in that finding.

Simulation configuration uses a separate logical revision from background progress counters. Safe Start/Pause/Resume/Stop/Reset controls lock and validate the latest owner state, while concurrent configuration edits still conflict. Financial/business actions retain their existing strict record revision checks. Phase 11 intelligence and finding snapshots extend the existing secure `/api/v4/` synchronization/analytics domain; no new Nginx route or trust exception is required.
