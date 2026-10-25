# Worker 3 Shopify configuration diagnosis

> Subsequent operator setup on 2026-10-25 UTC resolved the missing prerequisites. Worker 3 now has verified real development-store identity and a synchronized read-only catalog: 17 products / 26 variants. See [actual live verification](shopify-live-store-verification.md). Missing-prerequisite statements below describe the earlier checkpoint.

## Observed root cause

Inspected the selected existing deployment, Worker 3, Shopify **1.2.0**. PostgreSQL and `/run/module-secrets/runtime.json` both contained `mode=simulator`, `currency=USD`, `integrationsEnabled=true`, `publishOperationalAlerts=false`. No configuration propagation discrepancy was found.

A real Chromium save sent `configuration.mode=live` to `PUT /api/v3/modules/cee.shopify/configuration`. Worker API authentication/CSRF and local administrator checks succeeded. Module Manager acquired its lock and called the signed Module Host configure operation. The host rejected the request with `CONNECTOR_EGRESS_GRANT_REQUIRED`; the Worker API returned **HTTP 503** with that safe code. It did not update the database or module runtime. Recent security audit entries also recorded HTTP 503 denials. Module Host had no recent diagnostic log lines; no secret-bearing logs or configuration values were printed.

The old UI caught the rejection but displayed it in a global alert above the scrolled viewport (`alertAboveCard=true`), while retaining `live` in an unsaved draft. No success response occurred. Reopening read the actual simulator configuration. The Live Shopify Connection action's `SHOPIFY_LIVE_MODE_REQUIRED` was therefore expected, not an independent authentication failure.

## Actual prerequisites

The selected Worker 3 has **no image-bound Docker egress grant** and **no private Shopify credential configuration file**. Its existing public connection profile is retained; a profile is not a private credential configuration. The current module image remains `sha256:cafe7468c79cac02f7478d5635d74af394d6daeb3b6e672c404305923184bbbc`. No private secret was requested or generated.

An operator must configure the development store/app privately and approve this exact image. See [the Shopify setup guide](shopify-development-store.md) for official same-organization app requirements, the `read_products` scope and installation settings. With credentials already stored in private files, the exact local commands are:

```powershell
node scripts/configure-shopify-live.mjs --directory .steward/phase8-upgrade-regressions --worker worker-3 --shop YOUR-STORE.myshopify.com --connection shopify-dev --client-id-file PRIVATE_CLIENT_ID_FILE --client-secret-file PRIVATE_CLIENT_SECRET_FILE
node scripts/configure-shopify-egress.mjs --directory .steward/phase8-upgrade-regressions --worker worker-3 --subnet 10.240.3.0/28
```

Replace domain and private file paths locally; do not paste credential values. The subnet must be unused; choose another private range if necessary. These are prerequisite commands, not commands that have been run to create a real connection during this diagnosis.

Then open Worker 3 `https://worker-3.localhost:26203`, Administration → Modules → Shopify. Set Mode to live, turn Integrations Enabled off for the initial manual test, preserve other settings, and Save. Require **Configuration saved and applied** and **Saved mode: live**, including after reopening. In Administration → Live Shopify Connection, create `shopify-dev` with the same domain, run Test read-only connection and confirm the returned development-store identity, then Synchronize products only. Do not enable live order operations.

## Correction

Configuration save feedback is now local to the installed module's configuration panel. It labels the saved mode separately from the form draft, explains unsaved changes, translates allowlisted prerequisite codes into actionable messages, and clears old success feedback when edited. A successful PUT is followed by a fresh persisted configuration read before announcing success; stale or false-success responses cannot announce a successful save. Unknown failures display an uncertainty message rather than assuming the request had no effect.

The host additionally checks that a live connector's private file is readable, bounded JSON before attaching networking or changing runtime configuration. Missing/invalid files have safe allowlisted errors. The module remains responsible for provider schema, scopes, credentials and live store authentication: existence of JSON is not proof of valid credentials or connectivity. Simulator configuration does not require that file and remains supported.

The Shopify package, manifests, migrations, SSMA contracts, records, identity and permissions are unchanged. No module reinstall, new app credential or commercial order is involved. Host/API/frontend updates use the selected stack in place with private database/configuration backups. No release tag is authorized.

## Verification

Implementation image source: `44d52af`. Build and complete `npm test` passed: **128 tests, zero failures, zero skips**. This includes 5 Module Host tests, 43 platform tests, 15 commerce database tests, 10 Shopify live-protocol cases and 5 presentation/save-confirmation tests. All existing simulator regressions passed.

Actual Chromium selected-stack verification passed with **zero JavaScript errors**:

- A real Live-mode PUT returns HTTP 503 with `CONNECTOR_EGRESS_GRANT_REQUIRED`. Its actionable error is visible beside Save. The form remains an explicitly unsaved draft; saved mode and active runtime remain simulator.
- Reopening confirms the persisted simulator setting.
- A browser-injected false HTTP 200 is rejected when the subsequent persisted configuration differs. No success announcement appears. This is fault injection, distinct from actual API acceptance.
- Saving the unchanged original simulator configuration returns real HTTP 200; fresh database confirmation and running module configuration match. Editing again clears the old success announcement.
- Installation/account/enrollment/permission and module business-record fingerprints remain unchanged; Shopify's image stays identical and no module reinstall occurs.
- The module browser/prerequisite acceptance passed on Workers 1 and 3. Missing and mismatched image grants are rejected. With a temporary correct operator grant and the private file still absent, the live save returns `CONNECTOR_PRIVATE_CONFIGURATION_REQUIRED`, before attaching a network or modifying runtime/database configuration. Existing connection profiles and records remain unchanged. The grant/network is revoked in cleanup; original simulator configuration is restored exactly.

The first optional prerequisite run stopped safely at the older helper's zero-profile guard because Worker 3 now has a profile. No grant/network had been created. The negative-path helper now preserves and fingerprints existing profiles, requires absent credentials, and never applies live mode. The corrected run passed. The initial failed guard report remains in ignored artifacts; it is not reported as a successful gate.

The in-place deployment passed protected database/configuration comparisons against private backups. The Worker API, frontend and host images are respectively `sha256:10d7acfab372d059fb1acea1898cd2ddfbe3f5138b5f1b0591e88c24fc8201e5`, `sha256:343c68f94807b4c1661dbc47066bc9a399ffada8cb64207881891858557903e0`, and `sha256:4b4e9a381ff0a8db1e752477fc477e0f2d0a5fce71765fed0df04a173f34cec9`. All three Workers share these images. Master images and the Shopify package are unchanged.

```powershell
npm run build
npm test
node scripts/upgrade-selected-development.mjs .steward/phase8-upgrade-regressions docs/phase10a-acceptance-evidence.json --module-host-image steward-module-host:config-feedback-fix --worker-api-image steward-worker-api:config-feedback-fix --worker-web-image steward-worker-web:config-feedback-fix
node scripts/verify-shopify-configuration.mjs .steward/phase8-upgrade-regressions
node scripts/verify-shopify-readiness.mjs .steward/phase8-upgrade-regressions --test-egress
node scripts/smoke.mjs .steward/phase8-upgrade-regressions
node scripts/verify-single-stack.mjs
```

The optional prerequisite test is for a selected simulator configuration with **no private credential file or existing grant**. It deliberately rejects live requests; do not use it over configured operator credentials. It uses an unused private subnet (tested `10.240.3.0/28`; override with `STEWARD_TEST_EGRESS_SUBNET`). It does not delete an existing profile to satisfy a test.

Health/readiness/frontends and final single-stack results are captured in [sanitized evidence](shopify-configuration-evidence.json). [Actual inline error screenshot](screenshots/shopify-configuration-inline-error.png). Private backups and detailed logs remain ignored under `.steward/backups` and `artifacts/shopify-config-*`.

**Live mode is not operational or authenticated:** both missing prerequisites remain operator actions, and no live store API request or live order operation has been made. File presence/JSON checks do not verify the module's credential schema or authenticate the store; the read-only connection test must still succeed after real operator setup.
