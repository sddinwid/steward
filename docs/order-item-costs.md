# Item-level Printify order cost evidence

Shopify and Printify 1.6.0 add item costs to the existing order views. No core
renderer changes, new scheduler, production permission or accounting system.

Printify retains product/variant/provider references, opaque provider/external line
references, quantity, reported cost/shipping values, currency provenance, line
status and production/fulfillment timestamps. Missing, invalid and oversized
amounts remain unusable; reported numeric representations are retained separately.
Currency conflicts remain unknown. Duplicate identities are ambiguous. Item order
does not establish identity. Existing records refresh in place; discarded historical
values cannot be recovered. Capture timestamps advance with changed evidence rather
than manufacturing revisions on each identical poll.

The [official Printify order reference](https://developers.printify.com/#orders)
describes fulfillment/shipping cost fields in cents and external line identifiers.
It does not establish an unambiguous multi-quantity allocation basis. Consequently,
only unique unit-quantity lines support the existing totals. On-hold amounts are
provisional; fulfilled amounts are provider-recorded, not proof of settlement.
Retail prices and catalog estimates are never substituted for order costs.

## Governance and use

The original `commerce.printify.orders.read` contract is unchanged. The additive
`commerce.printify.order-costs.read` capability (`steward.order-item-costs` 1.0.0)
exposes only `order-costs.lookup`, a durable read of cached observations. It uses
the existing explicit store association and exact installation/package pin.
Printify's existing `costReadEnabled` gate and `cee.printify.cost.read` permission
apply. Shopify's read action requires `cee.shopify.cost.read`. Ordinary matching
records do not contain cached cost responses; the combined view redacts cost
details for readers without that permission.

Approve the new capability through the existing Smart Modules resolver, binding
and read-only workflow. In **Shopify and Printify Orders**, use **Read item costs /
next page**. Each request reads at most 20 lines. The action continues a pending
page sequence, otherwise refreshes from page zero. Pages require the same snapshot
and consistent record revisions. Duplicate identities or more than 1,000 accumulated
lines remain ambiguous. Expired results are labeled stale. Cost reads are explicit;
the existing automatic order-monitoring schedule is unchanged.

**Native Printify Fulfillment → Item cost evidence** shows the provider breakdown
and its source record, revision and capture timestamp. **Shopify and Printify
Orders → Supplier item costs** shows governed evidence, freshness and match status.
Only an exact externally supplied Shopify LineItem GID uniquely matching an observed
Shopify line is identified as an external-reference match. Numeric references,
titles, prices, array positions and coincidental SKUs are not guessed. Split/reprint
ambiguity remains visible. This does not prove item fulfillment or payment.

Unmatched supplier lines remain separate. No per-item contribution is computed
without supported allocation, and no net-profit claim is introduced. Shopify's
existing deterministic merchandise calculations remain intact. No Master cost
publication, Sales import or corrective action is added.

## Verification commands

```powershell
npm run build -w @steward/commerce-kit
npm run build --prefix modules/shopify
npm run build --prefix modules/printify
node --test scripts/test-order-item-costs.mjs scripts/test-monitor-policy.mjs scripts/test-connector-order-monitoring.mjs scripts/test-shopify-live.mjs
node scripts/test-commerce.mjs
node scripts/test-phase15-source-migrations.mjs --committed --catalog <selected-directory>/modules/public/catalog.json --trust <selected-directory>/modules/public/trust.json --report artifacts/item-costs-migration-report.json
node scripts/verify-single-stack.mjs
```

No SQL migration is required; existing module-owned records and durable routing
store the evidence. Package upgrades retain old pins and require explicitly
approved successor associations/policies. Disable the previous monitoring policy
before enabling its successor, retain acknowledgment history, and document the
transition. Preserve provider configurations and production restrictions.
