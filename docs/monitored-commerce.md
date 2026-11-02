# Monitored commerce operations

This increment keeps native Shopify/Printify fulfillment read-only. Sales Commerce Intelligence remains a separate accounting source. No Sales order is created by monitoring.

## Worker

- **Monitored Store Overview**: one source-order row, payment/fulfillment status, freshness and observed production/order shipping. Missing amounts remain unknown. The separate shipping adjustment is not added to order shipping.
- **Shopify and Printify Orders**: current enabled monitoring associations only. Refresh observations, read item costs or order totals, and explicitly approve/withdraw Master observation updates.
- **Historical Shopify and Printify Orders** and **Historical monitoring conditions** retain earlier package-bound work without executable actions. Historical does not mean resolved.
- A monitoring policy's **Automatically read order cost evidence** is optional, default off, and requires the cost-read permission when approved. It uses the durable `commerce.printify.order-totals.read` capability and the exact selected provider pin.
- **Approve condition notifications** publishes a minimal condition projection. Master entity monitoring must separately be enabled. Acknowledgment and resolution remain distinct.

Previously synchronized Shopify profiles retry transient unavailability/rate limiting after 60 seconds, doubling to a maximum 15-minute interval. Retry state persists in the module database. Credential/configuration/store-identity failures require manual review. Successful observations survive failures; unverified profiles do not auto-start.

## Master

The Financial & Operational Reporting page includes approved monitored-store observations separately from Sales calculations. `monitored_commerce_v1` carries bounded, private-data-free evidence. Approval authorizes updates for that original comparison; a replaced association/package withdraws its publication rather than transferring authority.

`query_monitored_commerce` discovers approved scoped references; `analyze_monitored_commerce` resolves entity, installation, module, stream, record and revision and calculates integer-cent totals. Currencies cannot be mixed. Withdrawn sources and duplicate orders are rejected; stale costs are unknown. Payment status is not settlement; recognized revenue, fees and net profit are not inferred.

Use the existing commerce-performance investigation profile for monitored-store questions. Review the complete narrative and evidence before separately publishing a finding. Neither the model nor a notification grants production authority.

## Verification commands

```powershell
npm run build -w @steward/commerce-kit
npm --prefix modules/shopify run build
npm --prefix modules/printify run build
npm run build -w @steward/platform
npm run build -w @steward/master-web
node --test scripts/test-live-recovery.mjs scripts/test-monitored-commerce.mjs scripts/test-order-monitoring-actions.mjs scripts/test-shopify-live.mjs scripts/test-monitor-policy.mjs scripts/test-order-item-costs.mjs
node scripts/test-commerce.mjs
npm run test -w @steward/platform
node scripts/verify-single-stack.mjs
```

Deployment must use signed immutable new module packages, a clean committed source, selected-installation backups and image-bound egress approval. Preserve old SQL migration bytes and retained provider obligations. This document describes behavior; actual acceptance results are recorded separately.
