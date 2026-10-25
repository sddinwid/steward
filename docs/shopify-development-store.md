# Shopify development-store connection

This extends the existing `cee.shopify` adapter descended from v0.8.0, including its later multi-store and SSDS work. It does not introduce another Shopify module or replace the renderer. New package: **Shopify 1.2.0**. Existing simulator order/reservation/production/fulfillment flows remain supported. Live mode is deliberately **development-store catalog only**: authentication, store identity, products and variants. It cannot read, create, change or fulfill live orders.

The source and simulator/protocol tests are not proof of successful Shopify authentication. Actual live verification remains blocked until the operator supplies their own development store/app credentials privately. No credential is requested in chat.

## Current Shopify requirements

Research was checked against Shopify's current 2026-10 GraphQL documentation. Use the versioned endpoint `https://<shop>.myshopify.com/admin/api/2026-10/graphql.json`; the adapter verifies the returned API-version header and rejects unexpected version fallback. See [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest).

For this server-side integration acting on an organization-owned store, use the [client credentials grant](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant). Both the app and development store must appear under the **same organization in the Dev Dashboard**. Merely owning a store or installing an app does not establish that membership. A development store created elsewhere may require creating a Dev Dashboard development store instead; do not invent a token or bypass `shop_not_permitted`.

Shopify's [Dev Dashboard app setup](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard) requires a released app version and installation on the intended store. Configure:

| Setting | Initial development configuration |
| --- | --- |
| App | A Dev Dashboard app in the same organization as the development store |
| Embedded in Shopify admin | Off; Steward runs outside the Shopify admin |
| App URL | `https://shopify.dev/apps/default-app-home` is Shopify's supported default for a non-embedded app |
| Admin API scope | **`read_products` only** |
| Orders/customer/fulfillment/write scopes | Do not request them for this connection |
| Webhooks API version | `2026-10` |
| Installation | Release the app version, choose Install app, and approve it on the intended development store |
| App credentials | Client ID and client secret from app Settings; store them in private files or environment configuration |
| OAuth redirect/callback URLs | **Not used by client credentials. No Steward OAuth callback is required or currently exposed** |

Scope changes require releasing the changed app configuration and approving the changes on the store. The token endpoint does not accept a requested scope list in the client-credentials grant; it reports the app's installed scopes. Steward checks both that response and `currentAppInstallation.accessScopes`. An accidentally broader app token still cannot enable writes in this adapter; correct the app settings to the minimal scope.

The module exchanges credentials at `POST https://<shop>.myshopify.com/admin/oauth/access_token` using URL-encoded `grant_type=client_credentials`, `client_id` and `client_secret`. It uses the returned token only in `X-Shopify-Access-Token`. Client-credentials tokens expire after approximately 24 hours; the module coalesces concurrent acquisition, caches only in process memory and reacquires 60 seconds before expiry. Restarting reacquires using the protected client credentials without another browser login. No access token is put in a frontend bundle, business record, module public configuration, log or API response.

## Local setup on the selected stack

Use the current operator installation and original login information. Worker 3 is `https://worker-3.localhost:26203`. Worker 1 remains `https://worker-1.localhost:26201`; use a separate, explicitly configured connection if it is to connect another store. Do not start the archived acceptance stack alongside this installation.

1. Create/install the app as above. Verify its development store domain, for example `your-store.myshopify.com`. Store client ID and secret in private local files, or set `STEWARD_SHOPIFY_CLIENT_ID` and `STEWARD_SHOPIFY_CLIENT_SECRET` securely outside shell history. Do not paste credentials into a chat or a module settings form.
2. Install/activate the trusted Shopify 1.2.0 package using the existing Module Manager. The module host must include the image-bound connector-egress support introduced with this change (module host 0.8.1); ordinary core APIs and frontends are unchanged.
3. Prepare the private file. With environment variables already configured:

```powershell
node scripts/configure-shopify-live.mjs --directory .steward/phase8-upgrade-regressions --worker worker-3 --shop your-store.myshopify.com --connection shopify-dev
```

Alternatively pass `--client-id-env VARIABLE_NAME --client-secret-env VARIABLE_NAME`, or `--client-id-file PRIVATE_FILE_PATH --client-secret-file PRIVATE_FILE_PATH`. Arguments identify credential sources, never credential values. The script performs no external call. It writes only `.steward/<deployment>/commerce/private/worker-3/m_<hash-of-cee.shopify>.json`; existing distinct stores are preserved, duplicates/replacements are rejected, and identical reruns do not rotate credentials. A pre-existing simulator secret file is preserved and blocks an implicit mode conversion.

4. Grant optional external egress to this exact installed image. Select an unused private subnet; this example is configurable and Docker rejects overlapping ranges:

```powershell
node scripts/configure-shopify-egress.mjs --directory .steward/phase8-upgrade-regressions --worker worker-3 --subnet 10.240.3.0/28
```

The grant is private operator configuration, tied to Worker installation, module and exact verified package image. Signed connector metadata alone grants no Internet access. Other modules stay on their existing isolated networks. The module host validates network ownership/driver and applies/removes the attachment during configuration, activation and restoration. Live mode without the grant fails with `CONNECTOR_EGRESS_GRANT_REQUIRED`. A package image upgrade requires a new reviewed grant; switch to simulator mode before replacing a live package, then grant the new verified image before switching back. This is networking authority, not SSMA or manufacturing authority.

5. In Worker 3 **Administration → Modules**, edit Shopify configuration: set **Mode = live**, keep **Integrations Enabled off** initially, preserve currency/other settings, and save. This refreshes the private credential mount and applies authorized egress. Do not change other modules or account credentials.
6. In **Administration → Live Shopify connection**, create a profile with Connection identifier `shopify-dev` and the same canonical shop domain. Click **Test read-only connection**, refresh until its status is verified, and check the returned shop name/domain/GraphQL ID. The module checks `shop.plan.partnerDevelopment`, refuses production stores, and pins the store identity in its own database. Optionally pre-pin a known `gid://shopify/Shop/<numeric-id>` as `shopId` in the private connection configuration.
7. Click **Synchronize products only**, then refresh until synced. The request is durable and processed outside the short HTTP request budget. Its original local permission and request identity are retained; later requests cannot be overwritten by earlier reads. Existing observations remain available after failures and retries. Only a complete validated catalog is applied. Removed remote products are marked removed within that connection, never deleted across another store.
8. Optional: enable Integrations Enabled after the first successful synchronization to reconcile catalog observations roughly once per minute. It still cannot make live order/fulfillment calls or become an available SSMA fulfillment provider. Leave it off for manual-only testing.

Products and nested variant connections are both paginated. The product table previews the first 20 variants and declares the full count; **Shopify variants** provides paginated local observations. Its UI search filters the current page; the read-only `/catalog-variants` API additionally supports `q` filtering by SKU or source product identity, so large products do not overflow the application response budget. The current bound is 250 products, 2,048 variants per product, 90 seconds between read steps, 9 seconds per HTTP request and 512 KiB per response. Exceeding the bound or detecting partial/error responses preserves the prior catalog instead of importing a truncated census. Inventory levels, quantities and locations are intentionally not fetched with the minimal product scope; displayed quantities are **unknown**, not zero and not authoritative Steward Inventory.

Profiles can be corrected before their store identity is pinned; verified identities cannot be silently changed. Retain an original connection for reconciliation and create a new identifier for a different store. Connector credentials stay in private files; public profiles contain only domain/connection identifier, verified identity, scopes, expiry metadata and status. `cee.shopify.configure` is required to create/update profiles or queue test/sync requests; frontend visibility does not confer permission.

## Webhooks and local HTTPS

Client-credentials authentication and manual product reads need outbound HTTPS only, so a public tunnel is not required to begin. Existing local Worker HTTPS/authentication stays enabled.

Optional product notifications require an operator-controlled, publicly reachable HTTPS endpoint with a publicly trusted certificate. A `.localhost` address and the private Steward development CA cannot be called directly by Shopify. Configure a reverse proxy/tunnel that trusts the existing Worker CA upstream, preserves raw JSON bytes and Shopify signature/store/topic/version/delivery headers, and forwards **only**:

`POST https://<your-public-worker-host>/api/v8/webhooks/cee.shopify`

The upstream is Worker 3's same path at `https://worker-3.localhost:26203`. Keep normal admin login on its original local origin; do not disable CSRF, origin verification or TLS to expose webhooks. Configure product create/update/delete subscriptions for API version `2026-10`; do not subscribe live order or customer topics for this phase. See [Shopify webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries).

Shopify signs raw bytes using the **app client secret**, not its access token. The module validates HMAC with a constant-time comparison, configured store, API version and permitted topic, then deduplicates the delivery ID in its dedicated database. Webhook payloads do not directly authorize operations or become authoritative product records; catalog reconciliation reads Shopify again. The existing 128-KiB inbound bound remains. Oversized notifications need a later read/manual refresh; initial live webhook delivery remains unverified without an operator endpoint and credentials. Scope and periodic reconciliation must be reviewed after app removal/reinstallation or secret rotation.

To revoke optional network access, first return the module to simulator mode (preserving its records), then:

```powershell
node scripts/configure-shopify-egress.mjs --directory .steward/phase8-upgrade-regressions --worker worker-3 --revoke
```

No database or credential is deleted. Network egress is a broad operator-approved outbound capability for a trusted image; Shopify origin/path/TLS/read-only restrictions are enforced by the adapter. A production deployment requiring a kernel/firewall destination allowlist needs an additional network policy; this code does not claim Docker bridge networking is a destination firewall.

## Future commercial customer OAuth boundary

Client credentials **must not** be used for a customer's store in another organization. Steward is a standalone application, so its appropriate future flow is the [authorization code grant](https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps). An embedded Shopify app would instead require the separate ID-token exchange architecture, which is not introduced here.

`live-auth.ts` provides the provider interface plus authorization URL construction, exact HTTPS redirect checking, shop/state/browser-state/timestamp/HMAC validation, expiring authorization-code exchange and refresh-token exchange. It requests `read_products` and `expiring=1`; returned expiry/refresh metadata is validated. Shopify authorization never enrolls a Worker or grants Steward entity/SSMA rights; those approvals remain governed locally. The read-only GraphQL client accepts an injected server-side token provider, so commercial authentication can be added without recreating the adapter, its data model or SSMA contracts.

**There is no public commercial OAuth installation/callback service in this phase.** A commercial publisher must keep its global app client secret in its own trusted authentication service; do not distribute that global secret to customer-controlled Workers. A future Worker token provider should receive only store-scoped credentials through an authenticated installation-bound mechanism. The current private client-secret file is appropriate for the organization-owned deployment, not a commercial customer onboarding shortcut. The protocol helpers are not exposed as a pretend working route. Before customer installations, the host must provide durable, one-use server-side state bound to authenticated account, Worker installation, selected connection, approved shop and exact registered redirect; a matching secure browser cookie; atomic consumption/replay rejection; tenant-scoped encrypted persistent token/refresh-token storage; serialized refresh rotation/recovery; uninstall/revocation handling; and required app-distribution/privacy/compliance flows. Pure callback validation alone does not consume state or make a replay-safe installation.

For that future host, register exactly its implemented HTTPS callback (for example `https://<your-oauth-host>/integrations/shopify/callback`) in Dev Dashboard Redirect URLs. Shopify returns `code`, `hmac`, `shop`, `state`, `timestamp` and possibly `host` there. Verify them before exchanging the code server-side; never put the client secret or access/refresh tokens into a redirect. Disable callback query/access logging, serve no third-party assets on the callback, and redirect to a clean URL afterward. Do not register the example or any nonexistent Worker route as a current callback. No redirect is needed for the implemented same-organization flow.

New public apps must use expiring offline tokens; existing public apps must migrate by Shopify's stated deadline. Follow [current access-token requirements](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens) and [refresh guidance](https://shopify.dev/docs/apps/build/authentication-authorization/implement-token-exchange). This task supplies the architecture/protocol boundary, not commercial OAuth distribution readiness.

## Verification commands

```powershell
npm run build
npm test
npm run test:shopify-live
npm run test:commerce
node scripts/smoke.mjs .steward/phase8-upgrade-regressions
node scripts/verify-single-stack.mjs
```

Consult [actual verification results](shopify-live-verification.md) for tests, deployment/browser/egress evidence and precise live-verification blockers. Simulator and injected-protocol results never establish real Shopify connectivity.
