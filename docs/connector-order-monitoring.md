# Connector order monitoring patch

Shopify and Printify 1.3.1 extend observations without enabling provider writes.
Shopify reads bounded accessible order history during catalog synchronization only
when the existing integrationsEnabled configuration is true. It preserves orders
on failed/incomplete reads, reports order errors separately from catalog status,
and does not enqueue Sales imports. Existing development-store restrictions remain.
Printify retains separate provider and shop-order references, line items, and
shipment timestamps. No production permissions or private settings change.

Limits: no cross-provider matching or new alerts, no webhook order enablement,
no resumable incremental cursor, no complete-history claim, and no live order
compatibility claim without actual provider evidence. Pages and line counts are
bounded; an incomplete Shopify batch is rejected. Existing settings are preserved
on deployment, so disabled integrations remain disabled.

Validation: node --test scripts/test-connector-order-monitoring.mjs scripts/test-shopify-live.mjs;
node scripts/test-commerce.mjs. Selected deployment evidence is recorded separately
under artifacts/connector-monitor-deployment.json. These are patch modules, not a
new platform release. Preserve all signed previous packages and SQL migrations.
