# Worker 3 Printify live read-only verification

Verified 2026-10-25 UTC using the operator-provided `steward_printify` token in its existing private connector file. No credential value is committed or printed. This is verified live **read-only polling**, not a claim that paid production, native Shopify linking or fulfillment has been tested.

## Changes and actual results

- The selected Worker 3 Printify package was upgraded from 1.1.1 to signed **1.1.2**, built from commit `955e0c2`. Its image is `sha256:2fb3344f47209d5b9e669762ee0b493c100de96afac2939acf134fd8d7962744`. The patch supplies Printify's required `User-Agent` header while retaining bearer authentication, verified HTTPS and existing response/time bounds. Shopify authentication headers remain separate. See [official authentication requirements](https://developers.printify.com/#authentication).
- The existing egress helper now supports either verified connector with an explicit `--module`; the original Shopify command remains a compatible wrapper. Printify's grant is bound to Worker 3's original installation, module ID and exact signed image. The bridge `10.240.3.16/28` was checked against existing Docker/host routes. It has exactly one endpoint, the verified Worker 3 Printify container. Shopify retains its separate existing grant.
- Private configuration and both Worker 3 platform/module databases were backed up beneath `.steward/backups/printify-live-setup`. All four original migration hashes matched before/after upgrade; there are no new or rewritten migrations. Core API/web images, original records, identity/accounts/permissions, other Workers and Shopify configuration were checked unchanged.
- `costCurrency=USD` is explicitly recorded in the private connection with timestamp/basis. Authenticated `GET /v1/catalog/blueprints/4195/print_providers/217/shipping.json`, selected from an actual shop product, returned HTTP 200 and **USD** shipping currencies. A generic documentation-example product/provider pair first returned 404; the actual shop product was used for confirmation instead. The USD setting is an operator-approved interpretation for catalog cost estimates matching this Worker, not verification of account billing currency or actual invoice costs. See [shipping currency fields](https://developers.printify.com/#catalog) and [catalog versus billing currency](https://help.printify.com/hc/en-us/articles/17227301407121-What-is-the-difference-between-catalog-currency-and-billing-currency). Unknown costs remain unknown; retail totals are not treated as production cost.
- Mode **live** persisted and matched the running module. The `printify-dev` connection reached **available**, error **null**, after real authenticated polling through the installed module. The shop catalog imported **5 products / 625 variants** into the Printify-owned database. Read-only shops, products and order-observation endpoints were exercised; no external create, publish, send-to-production or other write endpoint was called.
- Module and private `productionEnabled` remain **false**, private per-order production grants remain empty, and `integrationsEnabled` remains **false** to withhold SSMA integration/production authority. Background read polling is active independently of that SSMA flag. No external-submission receipt was added. Paid production has not been authorized or tested.
- The configured shop remains `My new store`, whose Printify sales channel is **disconnected**. API access and polling work; that status must not be presented as verified native Shopify integration. Existing Steward mappings/workflow approvals are not fabricated or changed.

## Webhooks

Webhooks are not a prerequisite for the verified polling/reconciliation path. A private future signing key exists, but **no webhook was registered**. The existing Worker is addressed on `worker-3.localhost`, not a publicly reachable trusted HTTPS host. No fake public URL or tunnel was invented and no inbound trust checks were disabled. A future webhook installation needs an operator-controlled public HTTPS ingress forwarding raw bodies and Printify headers to `/api/v8/webhooks/cee.printify`, followed by registration with the same private signing key and an actual delivery test. [Printify webhook/signature requirements](https://developers.printify.com/#webhooks).

## Verification

- `npm run build`: passed.
- `npm test`: **129 passed, 0 failed, 0 skipped**, including existing simulator production/reconciliation/permission regressions and a new provider-header boundary test.
- Real Chromium: saved Live mode, production checkbox off, exact `printify-dev` **Available** row, five catalog rows, zero JavaScript errors. Existing manifest-driven SSDS screens are unchanged. Older simulator connector rows remain retained history; the named Live row identifies the active connection.
- Actual runtime configuration matches PostgreSQL. Image/network identity, single attached endpoint, credential exclusion from public APIs, protected records/permissions, unchanged other Workers/Shopify/core images and unchanged submission receipts all passed.
- Smoke checks: Master plus all three Worker health/readiness, frontends/assets/proxies, restricted database roles, distinct volumes and identical Worker core images passed.
- Single-stack audit: **29 selected containers, zero unexpected Steward containers**. No new full stack or simulator was started. No release tag was created.

```powershell
npm run build
npm test
node scripts/publish-module.mjs modules/printify .steward/phase8-upgrade-regressions
# Upgrade/activate the trusted cee.printify@1.1.2 package through the authenticated Module Manager.
node scripts/configure-connector-egress.mjs --directory .steward/phase8-upgrade-regressions --worker worker-3 --module cee.printify --subnet 10.240.3.16/28
# Save existing Printify configuration with mode=live and productionEnabled=false.
node scripts/smoke.mjs .steward/phase8-upgrade-regressions
node scripts/verify-single-stack.mjs
```

Egress grants bind exact images: a future module upgrade needs an explicitly reviewed replacement grant. Broad outbound bridge authority is scoped to the trusted image/installation; it is not a destination firewall. Provider origin/TLS validation remains in the adapter.

Public results are in [sanitized evidence](printify-live-evidence.json). Raw local reports/logs are ignored `artifacts/printify-live-*`; private settings and tokens remain beneath the selected deployment. Do not copy private connector JSON into source control. Live production, paid fulfillment, native Shopify channel setup and real webhook deliveries remain unverified and disabled/deferred.
