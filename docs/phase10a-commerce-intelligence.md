# Phase 10A commerce intelligence

This development phase extends the existing Sales, Shopify and Printify packages. It does not replace the dynamic Worker UI, introduce a second integration bus, or authorize paid production. The accepted v0.9.1 release remains unchanged.

## Business workflow

In Worker **Business**, open **Sales → Commerce intelligence**. Select a reporting period; the start is inclusive and the end exclusive. Inputs use the browser's local time and are submitted as UTC. The report selects orders by their source creation time. Recognized merchandise revenue is the latest completed-quantity observation of those orders, not cash flow booked inside the selected dates. The existing Sales period report retains its fulfillment-completion-time basis.

The dashboard separates currencies, gross sales, discounts, booked and recognized revenue, average order value, refunds, cancellations, production/shipping costs and contribution coverage. AOV uses non-canceled booked merchandise revenue. Orders and product evidence remain available below the summary. Orders are paginated; the overview shows the first 20 SKUs alphabetically and declares the full product count. Narrow periods containing more than 10,000 orders instead of accepting a silently truncated census.

Use **Commerce cost evidence** to record an order's production, shipping, transaction and channel fee evidence. Amounts are decimal strings in the order currency, with at most two fractional digits. **Blank means unknown. Enter `0.00` only when evidence establishes zero.** Select known or estimated and provide an evidence reference. Only the separate Worker-local `cee.sales.finance` permission permits creating/updating these assessments. They cannot edit channel order facts. The evidence reference is included when the order is explicitly published to Master; do not put credentials or personal data in it.

Contribution is completed merchandise revenue minus source refunds, production, shipping, transaction fees and channel fees. All components must be supplied and the merchandise fully recognized. Otherwise contribution remains unknown. Record explicit, referenced estimates for missing components to obtain an estimated margin. Catalog and shipping quotes are estimates; Printify retail `total_price` is never supplier cost. Refund totals can include tax/shipping; tax, shipping income, overhead and income taxes are excluded from this calculation. It is not verified net profit. Multi-product order costs/refunds remain unallocated unless attributable single-SKU evidence exists.

Open each module's **Commerce exceptions** view for missing mappings, unassigned paid orders, approval holds, production failures/delays and uncertain/conflicting fulfillment. A read-only condition never resubmits production. Reconcile uncertain external outcomes using the original store, job identity and issuance receipt. Source observations do not prove current remote availability.

## Governed alerts and evidence

Connector configuration has optional `publishOperationalAlerts: false`. A Worker administrator must explicitly enable it to publish privacy-limited connector conditions. Sales commerce orders continue to require their existing explicit publication action. A Master registry administrator separately enables a company's monitoring in **Business → Reports → Commerce exception monitoring**. Viewer/enrollment accounts cannot change monitor policy. Disabling the approving account or changing its role prevents further alert creation.

Monitoring uses the existing durable analytical findings, signed synchronization, affected-entity delivery and local acknowledgment/resolution. Unchanged active conditions produce one finding. Source revisions and polling timestamps are not new alert identities. A cleared condition becomes inactive; human finding status is retained. A later recurrence starts a new episode. Closing a finding while the condition remains active does not create repeated alerts.

Default screening flags delays after 48 hours and complete contribution below 20%; MCP anomaly queries additionally accept their existing explicit thresholds. These are screening defaults, not forecasts or commercial policy decisions. Unrecorded costs and fees remain unknown. Monitor observations require source freshness and human review before changing prices, purchasing, authorizing production or substituting suppliers.

Master **Findings & Alerts → finding → Load original commerce evidence** retrieves the exact original envelope from the existing durable inbox, scoped by entity, module, stream, record and revision. It remains available when the current analytical record advances. Historical observations do not refresh remote state. Worker delivery contains the explanation and scoped references; Worker local operation does not require a Master evidence lookup.

## MCP and AI

The existing `commerce-performance` profile retains `list_entities`, `query_commerce_evidence` and `analyze_commerce_by_id`, and can discover anomaly, exception and demand-window tools. Commerce evidence can additionally filter by exact `sku`; all access remains under the current account's authorized entity scope.

`analyze_commerce_by_id` retains legacy pre-fee gross margin and adds explicitly distinct contribution analysis with fee coverage. Models must not call gross margin net profit. The demand-window tool compares approved observed quantities and order cohorts. Refund/cancellation cohorts use order creation time and latest source state, not dated refund cash flow. References are bounded and source counts/coverage are explicit. Cross-company same-SKU production-cost comparisons expose exact rational unit differences and references; supplier identity, specifications, capacity and product equivalence remain unconfirmed. They are prompts for supplier review, **not realizable procurement savings**. The existing shared-procurement profile requires actual demand and supplier quote evidence for savings calculations.

All analytical tools are read-only. Calculations run in deterministic services. AI output does not grant entity access, module permissions, workflow approval, manufacturing authority or supplier substitution. Findings are delivered for review; acknowledgment is not execution.

## Provider configuration, including multiple stores

No provider credential is required until an operator configures a connector. Private module files remain under the deployment's `commerce/private/<worker>/m_<module-hash>.json`, mounted read-only into that module. Tokens, webhook secrets, private production grants and delivery details must never enter public module configuration, source control or frontend bundles.

Legacy single-store files continue unchanged and normalize to connection `default`. For multiple stores, use a private bundle:

```json
{
  "version": 2,
  "connections": [
    {
      "connectionId": "default",
      "provider": "shopify",
      "mode": "live",
      "baseUrl": "https://your-store.myshopify.com/",
      "shopDomain": "your-store.myshopify.com",
      "shopId": "your-store-id",
      "token": "REPLACE_IN_PRIVATE_FILE",
      "webhookSecret": "REPLACE_IN_PRIVATE_FILE"
    }
  ]
}
```

This is a format illustration, not usable credentials or verified live configuration. Add separately named entries for additional stores, up to ten. Use `provider: "printify"`, its existing trusted API endpoint, confirmed cost currency and original private production/delivery grant format for Printify. Live TLS validation and allowed hosts are preserved. Simulator files additionally use the provisioned CA/server name; never use a simulator CA as commercial trust.

Connection IDs and provider store identities must be unique. Default-store record IDs remain unchanged; other connections namespace local product/order/variant IDs and webhook receipts. The UI exposes those local IDs for explicit mappings. Remote IDs stay private for reconciliation. Webhook authentication selects the declared store and verifies its signature before accepting the event. Polling/rate-limit cooldowns are per connection. Invalid trust/credential bundle validation fails closed; configuring a malformed/expired entry can suspend the bundle until corrected. Authentication/scopes, signed webhook replay, bounded pagination, native monitoring, explicit dispatch, local production approval, private grants and uncertain-outcome reconciliation remain enforced.

Connection identity is pinned before API polling. Rotate credentials while retaining identity. Do not change an existing connection ID to point at another store, or remove one with outstanding jobs. Reconciliation and explicit new-work configuration are required; there is no automatic job or reservation migration. Existing workflow obligations remain bound to their reviewed provider installation/package. Package upgrades can hold old obligations when the provider identity changes; do not edit bindings or move stock implicitly to bypass that hold.

## Repeat the controlled demonstration

The exercised private fixture is `.steward/phase10a-acceptance`, project `steward-phase10a-accept`. It has its own databases, trust, credentials and USD simulator accounts. The existing operator-selected preview is separate; these commands do not change root `.env` or its logins.

PowerShell, from the repository root:

```powershell
$demo = '.steward/phase10a-acceptance'
$env:STEWARD_DEPLOYMENT = $demo
node scripts/compose.mjs up -d --wait --wait-timeout 180
node scripts/demo-commerce-intelligence.mjs $demo seed
node scripts/demo-commerce-intelligence.mjs $demo verify
node scripts/demo-commerce-intelligence.mjs $demo browser
```

Open Master at `https://master.localhost:14100` and Workers at `https://worker-1.localhost:14201`, `14202` and `14203` with the matching hostname for each Worker. Accounts are in the private fixture's `demo/presenter.json`; no password is embedded in this document. The selected operator preview continues to use its original private presenter file and original ports.

The scenario uses stable synthetic source IDs. Seed only inserts absent fixtures, preserves existing cost assessments and does not reset consumed Inventory or repeat completed manufacturing. It deliberately leaves one production intent awaiting approval and a separate paid order without mapping/ownership. Expected fulfilled contributions are USD 53.00, USD 1.00 and USD 30.50, all estimated; unknown/canceled/held-order contribution remains unknown. Repeating `verify` rechecks alert deduplication and affected-only delivery. There is no broad reset command: retain the fixture or provision a separately named synthetic deployment instead of deleting real configurations, credentials or records.

To stop this test environment and its owned module containers while preserving volumes:

```powershell
$env:STEWARD_DEPLOYMENT = '.steward/phase10a-acceptance'
node scripts/compose.mjs stop
Remove-Item Env:STEWARD_DEPLOYMENT
```

The foundation was provisioned using the existing installer/security/module/data/analyst commands and `scripts/provision-commerce.mjs ... --simulators`, with `STEWARD_SIMULATOR_CURRENCY=USD`. Its explicit `10.226` network overlay avoids the host's exhausted Docker default pool. Repeated provisioning has been verified without file/data changes. New hosts should select an unused private prefix with `scripts/configure-network-pool.mjs`; never prune retained networks/volumes to make room.

Build/test commands remain `npm run build`, `npm test`, and `npm run test:smart:browser`. Signed new packages are Sales 1.2.1, Shopify 1.1.0 and Printify 1.1.0; Inventory 1.4.2 and Stock Ledger 1.0.0 are retained release images. Do not republish an existing package version from modified source. Phase 10A core acceptance images are separately named/pinned development artifacts, not a promoted commercial release.

The commerce investigation can also be exercised with the labelled reproducible protocol fixture:

```powershell
node scripts/verify-phase10a-model.mjs $demo
```

It invokes real authorized MCP tools and deterministic calculations while explicitly marking model output as test output. It also checks provider failures, malformed responses, undeclared tools, timeout and tool-call limits, and restores the original configuration and secret bytes.

For a separately recorded real local Qwen run, with Ollama and `qwen2.5:7b` already installed:

```powershell
$env:STEWARD_SEED_CREDENTIALS_FILE = Join-Path $demo 'demo/presenter.json'
$env:STEWARD_ANALYST_CAPABILITY = 'commerce-performance'
$env:STEWARD_ANALYST_PROMPT = 'Investigate the synthetic cross-company commerce records. Discover authorized entities, query fulfilled commerce evidence for sku SYN-10-PREMIUM, and calculate using exact observed IDs/revisions. Copy service-formatted contribution amounts. Distinguish estimates from verified profit, review supplier and product equivalence, and require human approval before any business action.'
$env:STEWARD_OLLAMA_REPORT = 'artifacts/phase10a-ollama.json'
node scripts/verify-ollama-provider.mjs $demo
Remove-Item Env:STEWARD_SEED_CREDENTIALS_FILE, Env:STEWARD_ANALYST_CAPABILITY, Env:STEWARD_ANALYST_PROMPT, Env:STEWARD_OLLAMA_REPORT
```

The verifier uses an authenticated temporary TLS bridge, restores the original provider configuration/key, and unloads its context alias afterward. It does not require a cloud API key. Review the retained narrative and calculations before a separate finding publication. A successful test-model run is not evidence of a successful real-model run; consult the verification report for actual results and failures.

## Recovery and limitations

Sales 1.2.0 was an intermediate acceptance candidate with conflicting financial projection events and must not be installed. Sales 1.2.1 appends migration 5. It retains superseded envelopes, records a repair ledger/audit and emits a higher-revision canonical snapshot. It never rewrites applied migrations or deletes business records. The defective candidate was removed from the isolated available catalog. Original v0.9.1 installations were not running this candidate.

All Shopify/Printify results here are simulator results. Commercial scopes, live API behavior, delivery/grant configuration, webhook subscriptions, actual provider invoices, fee settlements, store-specific tax/refund treatment and production incident procedures remain unverified. Source references and estimates must be reviewed by the affected companies. Custom alert thresholds, scheduled trend investigations, per-line multi-SKU cost allocation, automatic settlement ingestion, connection removal tooling and unresolved-obligation migration are not implemented. This phase does not establish commercial production readiness.
