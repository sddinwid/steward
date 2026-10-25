# Worker 3 real Shopify development-store verification

Verified 2026-10-25 UTC (2026-10-24 local) using the operator-supplied application credentials and the existing `shopify-dev` profile on the selected Worker 3. This supersedes the earlier missing-credentials blocker; those reports remain historical evidence.

## Actual results

- The credentials were read from the supplied local image and written through the existing configuration CLI to Worker 3's private, ignored connector configuration. No credential value was printed or committed. Temporary OCR text was removed. No substitute or invented credential was used.
- Private backups of Worker 3 platform/module databases and the original simulator settings were created before applying Live mode. The operator grant is bound to the existing Shopify **1.2.0** image, `sha256:cafe7468c79cac02f7478d5635d74af394d6daeb3b6e672c404305923184bbbc`, on this installation only. The approved egress subnet is `10.240.3.0/28`, checked against current Docker/host routes.
- Mode **live** saved successfully and matched the active runtime file. Automatic synchronization (`integrationsEnabled`) is **false** for controlled manual reads. Currency and other configuration are retained. Worker 1 remains in its previous simulator configuration; Worker 2 remains without Shopify.
- Initial identity testing returned `CONNECTOR_UNAVAILABLE`. A safe diagnostic inside the installed image then acquired an access token over verified TLS with HTTP 200. Retrying the failed, read-only identity request succeeded; no production submission was retried.
- The real GraphQL identity response matched the configured store domain and confirmed `partnerDevelopment=true`, required product permission, read-only handling and API version **2026-10**. The module retained its normal identity pin.
- Product synchronization completed at **2026-10-25T06:11:23.008Z** with status **synced**, error **null**: **17 products and 26 variants** persisted in the Shopify module's own database. Inventory quantities remain unknown observations; no Inventory authority is inferred.
- The app's actual installed scopes are `read_products`, `read_inventory`, `read_orders`, `read_fulfillments`. Only `read_products` is needed for this phase; the app can be reduced to that minimal scope through its Dev Dashboard version/installation settings. The adapter used only its closed shop/product/variant queries. It did not read, create, modify or fulfill any live order.
- Actual Chromium checks confirmed persisted **Saved mode: live**, automatic synchronization off, and the **Synced** profile in the existing SSDS screen. No JavaScript errors occurred. Public module configuration/profile API responses contained neither client ID nor client secret.
- Master and all three Workers passed health/readiness, frontend/assets/proxy, identity, migration and database-isolation smoke checks. All Workers retain identical core images. One selected stack has **29 running containers**, with no unexpected Steward stack. No module/image was rebuilt or reinstalled, no account password was changed, and no release tag was created.

The first manual action request omitted the existing action revision/request ID envelope and was rejected with HTTP 400 before execution. Subsequent requests used the normal optimistic-revision and idempotency fields. No security check was bypassed to make the connection succeed.

## Operator state

Open Worker 3 at `https://worker-3.localhost:26203`, Administration → Live Shopify Connection. The existing profile is connected and synchronized. Use **Synchronize products only** for manual refresh. Keep live order/fulfillment functionality disabled; it is outside this integration phase.

Private credentials remain beneath `.steward/phase8-upgrade-regressions/commerce/private/worker-3/`, mounted through the existing private module runtime mechanism. Access tokens stay in process memory and are reacquired using the private client credentials. Preserve that private deployment directory and the module state/data volumes; do not place its files in Git or paste their contents into logs/chat.

Detailed local results are ignored artifacts `shopify-real-connection.json`, `shopify-real-catalog.json`, `shopify-real-live-smoke.log` and `shopify-real-live-ui.png`. The earlier 128-test implementation regression report remains valid; this step changed private operator configuration and imported real read-only observations, without changing application code. Inbound real Shopify webhooks, commercial OAuth installation, live orders and production fulfillment remain unverified or intentionally unavailable.
