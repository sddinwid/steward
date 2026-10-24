# Commerce adapters and acceptance

Phase 8 is under acceptance. This document describes implemented interfaces; it does not establish a successful release or live commercial connectivity.

Shopify and Printify are separate signed OCI module packages, outside Worker core. Inventory 1.4.0 and Sales 1.1.0 declare the shared contracts. Stock Ledger 1.0.0 implements stock reservation independently, using its own business-record ledger. Sales does not import either inventory provider. See ADR 0019 and the SSMA reference.

## Private connector configuration

Run the ordinary base, security, modules, data and analyst provisioners before `node scripts/provision-commerce.mjs DEPLOYMENT --simulators`. The additive provisioner retains identities and existing configuration on repetition. Omit `--simulators` for an unconfigured adapter deployment. Simulator mode is immutable for that provisioned overlay. Use a separate deployment to change mode.

Connector credentials belong in `DEPLOYMENT/commerce/private/WORKER/m_SHA256_MODULE_ID_FIRST_20.json`. The provisioner creates these files automatically for simulators. The host copies only the selected module's file into its isolated secret volume on installation or configuration update; saving module configuration refreshes the secret and restarts that module. Credentials never enter public module configuration, browser bundles, module records or logs.

The private JSON contains `provider`, `mode`, HTTPS `baseUrl`, `token`, `webhookSecret`, `shopId`, and Shopify `shopDomain`. Simulator configurations also supply `caPem` and exact `serverName`; only loopback or the corresponding simulator hostname is accepted. Optional `expiresAt` refuses expired credentials. Live mode requires the canonical Shopify shop domain or `api.printify.com`, normal TLS verification and an operator-provided restricted outbound network. Default module networks are internal and deliberately provide no live commercial egress.

Printify requires public `productionEnabled`, a configured cost ceiling, private `productionEnabled`, and a Worker-local `cee.printify.production.authorize` action for each job. Live mode additionally requires a private, expiring per-order `productionApprovals[orderId]` grant with `maximumCostCents`, plus `deliveryByReference[orderId]`. Never enable live production for synthetic demonstrations. Production grants are checked again before submission. No live commercial account has been exercised.

## Local demonstration

The dedicated acceptance installation uses `--port-offset 10000` so the retained 0.7 deployment can remain running. The optional `scripts/configure-network-pool.mjs DEPLOYMENT 10.241` allocates explicit private /24 subnets only for missing networks after checking existing Docker allocations; it never prunes anything. The operator must also check for conflicts with host/VPN routing.

Build `steward-commerce-simulator:1.0.0` using `infra/Dockerfile.commerce-simulator`. Start with `STEWARD_DEPLOYMENT=DEPLOYMENT node scripts/compose.mjs up -d --wait` (PowerShell: set `$env:STEWARD_DEPLOYMENT` separately). Initialize private demo accounts with `node scripts/demo.mjs DEPLOYMENT setup`. Publish the five packages using `node scripts/publish-module.mjs modules/NAME DEPLOYMENT` for `inventory`, `sales`, `shopify`, `printify`, `stock-ledger`.

Run `node scripts/verify-phase8-commerce.mjs DEPLOYMENT enroll`, then `modules`, then `commerce`. The module stage installs through Chromium's real Module Manager. The commerce stage seeds explicit synthetic source fixtures, approves SSMA bindings/workflows, imports orders, reserves inventory, requests and approves production, observes shipments, synchronizes channel fulfillment and approves analytical publication through real application APIs/screens. It exercises signed webhook ingress and exact retries. Reports and screenshots are emitted under `artifacts/phase8-*`.

The two TLS simulators have distinct private operator tokens, per-Worker API credentials and persistent volumes. Their authenticated `/__sim/control` supports `seed`, `snapshot`, `update`, `event`, bounded `fault` and prefix-constrained synthetic `reset`. Faults support HTTP errors, throttling, delay, malformed JSON and connection loss after a committed create/production/fulfillment. Events are signed raw bodies; the acceptance runner relays them through the real Worker ingress. They do not contact commercial services.

## Governance, authority and recovery

Declare explicit mappings from Shopify variant identities to canonical SKUs, then SKUs to Printify product/variant identities. A used mapping cannot silently change its SKU/variant meaning. Shopify inventory quantities remain observations and never overwrite local Inventory. Module-owned databases remain authoritative; Master receives approved projections only.

Every capability delivery requires a signed consumer requirement, compatible installed provider, approved binding, active approved workflow, current configuration, installation identity and unrevoked local approver. Workflow activation selects that version for new aggregates. Existing aggregates retain their original workflow. Provider substitution disables old bindings unless the administrator explicitly selects continuation of original obligations; retained bindings cannot serve new aggregates. No reservation or production obligation transfers to the replacement.

Non-repeatable external calls commit an issuance journal before sending. Lost create responses reconcile exact external IDs and production lines; multiple matches suspend. Lost production responses reconcile authoritative order status. Shopify fulfillment reconciles tracking, fulfillment order line identities and quantities. Unknown outcomes never trigger blind paid retries. A process interrupted before any issuance receipt can be explicitly reconciled back to its prior authorized state; an existing uncertain receipt cannot be cleared by that action. Disable preserves all business data. No destructive rollback is performed.

The bounded initial connector reconciles at most 100 source orders/products per Shopify polling pass, 100 Printify records (two records per page, at most 50 pages), and 20 active production jobs. Oversized nested Shopify variants/order lines require explicit reconciliation rather than silent truncation. Only supported two-decimal configured currencies are accepted; no FX conversion. Customer addresses remain private configuration and are excluded from projections.

## Analytical contract

Sales publication creates `commerce_orders` only after explicit local approval. Withdrawal removes analytical eligibility and stops updated facts. Master rejects additional/private projection fields, including nested product fields. Revenue recognizes completed discounted merchandise, excluding tax and shipping income. Refund totals may include tax/shipping and remain explicitly unallocated. Catalog production cost and shipping quotes are estimates, not supplier invoices. Unknown costs remain null and prevent a fabricated margin.

Master MCP provides `query_commerce_evidence`, `query_commerce_anomalies` and `analyze_commerce_by_id`. The deterministic service uses exact integer cents, scoped record IDs/revisions, explicit cost coverage, product/channel performance and source references. Multiple currencies must be analyzed separately. Worker MCP exposes read-only capability registry/workflow status. Analyst profile `commerce-performance` permits observation and calculations; publication still requires a separate human review and affects only the referenced entities.
