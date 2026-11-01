# Read-only Shopify–Printify order matching

This records the original 1.4.0 matching increment. For the 1.5.0 automatic
monitoring policy, local exception inbox and financial evidence, see
[Automatic order monitoring](automatic-order-monitoring.md).

Modules Shopify 1.4.0 and Printify 1.4.0 add an optional, entity-local SSMA
`commerce.printify.orders.read` capability. It reads cached observations only.
It never submits production, imports Sales orders, or changes external orders.

Authorize the two read operations using the existing Smart Modules resolver,
exact-package binding and approved workflow. Shopify uses its existing
`integrationsEnabled` gate; Printify uses `catalogReadEnabled`. No existing
configuration or production permission needs to change.

In Shopify administration, create a **Discover Printify Order Stores** request
(offset 0). Then create an **Order Store Associations** record, selecting the
Shopify connection and the returned Printify profile. Associations are immutable
and retain the original provider package/installation and store identity.

In Business / Shopify Commerce / **Shopify and Printify Orders**, select that
association and the observed Shopify order to create a comparison. **Refresh
observations** performs another governed read. Pagination offsets select bounded
pages; a response with another page is marked incomplete. Discovery also returns
a next offset when required. Multiple matches remain separate Printify records,
not proof of complete line-level fulfillment. Order labels and SKUs never establish
identity. Store associations require explicit human approval.

Printify records a separate five-minute order synchronization lease. Failed,
expired, or incomplete observations do not establish a missing order. Shopify
order freshness is also checked. A successful empty result means only no match
in the observed Printify order snapshot; unmatched Printify “Other orders” may
not be exposed by its public API. Refresh is explicit, not a new scheduler.

Only cached minimal business facts cross the signed route. No credentials,
customer addresses, email addresses or payment information cross this contract.
SQL migrations are appended: Shopify 006 and Printify 007. Existing source records
remain authoritative in their original databases. Original pins cannot be silently
changed after upgrade; create new associations for explicitly approved providers.

Validation commands:
- `npm run build -w @steward/commerce-kit`
- `npm run build --prefix modules/shopify`
- `npm run build --prefix modules/printify`
- `node --test scripts/test-connector-order-monitoring.mjs scripts/test-shopify-live.mjs`
- `node scripts/test-commerce.mjs`
- `node scripts/verify-single-stack.mjs`

No alerts, financial calculations, Master projections, automatic corrections,
provider writes, or core/UI-renderer changes are included.
