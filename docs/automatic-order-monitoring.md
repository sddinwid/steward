# Automatic read-only order monitoring

Shopify 1.5.0 extends the existing pinned SSMA order-observation capability.
Printify 1.5.0 retains the same capability contract and adds module-owned order
cost evidence. Neither change authorizes external writes or Sales imports.

## Operator setup

Use the selected installation and its existing signed module upgrade procedure.
After an upgrade, approve the exact current Printify provider binding and the two
read operations. Discover its current store profile and explicitly associate it
with the verified Shopify store. Historical associations and pending obligations
retain their original package identities; they are not rewritten.

In Shopify administration, **Order Monitoring Policies** creates one policy per
association. `cee.shopify.configure` is required to create or change it. A policy
records its approver and timestamp and authorizes observations only. Enable or
disable it by editing `enabled`. Defaults: 300-second interval, ten orders per
batch, 1,800-second missing-observation grace, 300-second freshness, 172,800-second
delay review; include pending payment, exclude identifiable test orders.

The existing 30-second module tick persists an order cursor and next run time.
Requests use the existing durable SSMA outbox and exact provider constraints.
Repeated failures use bounded exponential backoff, capped at one day. Pending
requests receive a five-minute timeout. Store/order identity deduplicates new
comparisons and adopts existing manual comparisons where applicable. Grace and
delay start from local monitoring observation, not a backdated order date.
Read pagination is bounded to 20 items per request and 1,000 accumulated matches;
pages from different snapshots cannot establish a complete match. Expired pages
restart safely. Explicit refresh remains available.

## Exceptions and evidence

**Order Monitoring Exceptions** is a Worker-local internal condition inbox for
authorized Shopify readers. Configure permission is required to acknowledge.
Stable condition IDs, episode counters, acknowledgment and resolution timestamps
prevent repeated alerts for unchanged conditions. Recovery closes an episode;
recurrence opens another. An unavailable source cannot resolve a business issue
or establish that an order is missing. These conditions stay unpublished
(`approved=false`): no Master findings, external messages or recipient inbox
deliveries are claimed.

Pending payments do not generate missing-order exceptions. Canceled/refunded
orders and excluded identifiable tests are ineligible. Holds, failures, delay,
fulfillment review, incomplete pagination and connection failures are distinct.
An empty Printify API observation is not proof the order never arrived: Printify
**Other orders** can be absent from the public API. Partial/split observations do
not prove line-level fulfillment. Review discrepancies in the provider; Steward
does not correct them automatically.

The combined view includes deterministic booked merchandise calculations and
source record/revision references. Recognition, merchandise refund allocation,
tax treatment, customer shipping, fees and margin remain unknown without supporting
evidence. No totals are added across comparisons or Sales, avoiding duplicate
revenue claims. These are source merchandise values, not tax-exclusive accounting
or profit claims.

Printify's Native Fulfillment view exposes its own cost evidence. The
[official order reference](https://developers.printify.com/#orders) documents
`cost` and `shipping_cost` on order lines. Only complete unit-quantity lines with
known or explicitly administrator-confirmed currency are summed; multi-quantity
allocation remains unknown. Fulfilled line amounts are labeled provider-recorded,
not proof of payment or final settlement. Other states are incomplete. Retail
`total_price` is never used. Supplier costs remain in Printify's database and do
not extend the existing signed cross-module contract or establish Shopify margin.

## Verification

```powershell
npm run build -w @steward/commerce-kit
npm run build --prefix modules/shopify
npm run build --prefix modules/printify
node --test scripts/test-monitor-policy.mjs scripts/test-connector-order-monitoring.mjs scripts/test-shopify-live.mjs
node scripts/test-commerce.mjs
node scripts/test-workflow-notifications.mjs
node scripts/test-phase15-source-migrations.mjs --catalog <selected-directory>/modules/public/catalog.json --trust <selected-directory>/modules/public/trust.json
node scripts/verify-single-stack.mjs
```

No migrations were appended for this increment: durable state uses the existing
module-owned records and outbox. Git attributes preserve the exact CRLF bytes
already signed/applied for Shopify 006 and Printify 007. The migration gate checks
the released v0.15.0 ancestry while allowing verified appended migrations.

Live production/shipment acceptance requires actual provider evidence and is not
established by simulator tests. No live production or fulfillment mutation is
part of this verification.
