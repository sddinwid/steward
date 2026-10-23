# Phase 8 commercial API research — implementation pending

Reviewed official documentation on 2026-10-23. These notes define constraints for the remaining adapters; they are not evidence of implemented or validated connectors. No commercial credentials were used, and no paid production request was made.

## Shopify

Target the versioned GraphQL Admin API, explicitly pinned to `2026-10`. Shopify publishes quarterly versions and may fall forward when a selected version becomes unsupported. Check response/webhook API version headers and treat unexpected versions as a compatibility issue rather than silently accepting a new schema. Source: [API versioning](https://shopify.dev/docs/api/usage/versioning).

Verify webhook HMAC-SHA256 using the application's client secret and the **raw request body**, comparing decoded signatures in constant time before processing. Persist delivery identities for deduplication. Signature validation alone does not guarantee a unique or current event; authoritative state reconciliation must protect against stale or missed deliveries. Source: [Verify webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries).

Fulfillment uses fulfillment-order and fulfillment-order-line-item identities, assigned locations and the appropriate granted fulfillment-order write scope. `fulfillmentCreate` requires the user's fulfillment/shipping permission as well as the relevant application scope; inspect returned `userErrors`. Product, variant, SKU, location and fulfillment-order IDs are distinct mappings. Source: [fulfillmentCreate](https://shopify.dev/docs/api/admin-graphql/latest/mutations/fulfillmentCreate).

## Printify

The official reference documents bearer authentication, shop/product/variant/provider identities, paginated APIs, orders, webhooks and rate limits. Its global limit is 600 requests/minute, with a separate catalog limit of 100/minute. Order `external_id` is a channel-supplied reference. An order-creation endpoint and a send-to-production endpoint are different effects. The adapter must not interpret an external reference as a documented exactly-once paid-production guarantee. Retain issuance identity and reconcile uncertain outcomes before any new submission. Source: [Printify API reference](https://developers.printify.com/).

## Required work before acceptance

Implement separately packaged adapters and realistic isolated simulators, secret provisioning, authenticated ingress/polling, canonical mappings, replay/out-of-order handling, throttling and missed-event reconciliation. Production submission must be explicitly authorized and disabled by default. No adapter, simulator, commerce E2E, production trust/rotation procedure or commercial-account validation is supplied by this research checkpoint. Keep all corresponding Phase 8 gates open until actual evidence exists.
