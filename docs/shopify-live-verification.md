# Shopify live-readiness verification

> Subsequent operator setup on 2026-10-25 UTC resolved the missing prerequisites. Worker 3 now has verified real development-store identity and a synchronized read-only catalog: 17 products / 26 variants. See [actual live verification](shopify-live-store-verification.md). Missing-prerequisite statements below describe the earlier checkpoint.

Implementation branch `codex/shopify-development-auth`, starting at `f9949fd`. This continues the latest adapter/UI code descended from v0.8.0 rather than deploying an old checkout. v0.8.0 tag object `138a5875641563899bddcc4042159e8e68a4bd1e`, peeled commit `7d3a70d6349ca684111b7e2b879650c2be4c54d6`, remains preserved. No release tag is created.

Implementation image source is `7c8f77a`; the subsequent narrow Worker configuration-error reporting fix is `739f78e`. Current implementation: Shopify 1.2.0; optional connector-egress support in module host 0.8.1. All applied Shopify migrations are unchanged (schema 4); connection profiles/pins/requests use the existing module-owned record foundation. SSMA provided/consumed contract bodies are unchanged; simulator mode is an additional deterministic availability prerequisite for fulfillment. Existing SSDS renderer and frontend source are unchanged.

Official requirements, exact Dev Dashboard settings, secret-file/environment setup, egress/network grants, URLs/scopes, callback boundaries and limitations are in [the setup guide](shopify-development-store.md).

## Live verification blocker

Inspection found neither `STEWARD_SHOPIFY_CLIENT_ID` nor `STEWARD_SHOPIFY_CLIENT_SECRET` in this process, and no Shopify private configuration file for any selected Worker. No development store/app identity or credentials were supplied. **Real Shopify authentication, installed-scope checks, store-identity verification, catalog synchronization and inbound live webhooks remain unverified.** No live Shopify order has been read, created, changed or fulfilled. No secret has been requested in chat.

Needed for the first real verification: a development store listed in the same Dev Dashboard organization as the app; its canonical `*.myshopify.com` domain; a released and installed non-embedded app version with `read_products`; and its client ID/secret in private local files or named environment variables. For live webhooks, an operator-owned public HTTPS route is additionally required. There is no callback requirement for the client-credentials flow. Commercial customer OAuth hosting/persistent token repository remain architectural future work, explicitly not an enabled installation route.

## Implementation acceptance

Protocol unit tests currently pass: pinned HTTPS/headers/serialization, token form exchange, redacted errors, authentication failures, throttling, API-version drift, partial/malformed responses, caching/renewal/coalescing, private-bundle validation, nested pagination, identity/scope/development checks, callback cryptographic validation and future expiring-token exchange, plus private CLI credential-source/idempotency checks.

The existing commerce backend suite passes with two added live-protocol cases against disposable PostgreSQL: separate configuration permission; durable asynchronous read requests and newer-request preservation; atomic connection-scoped catalog application with unknown inventory quantities; store-identity/mode reuse rejection; failure/retry recovery; real module API webhook HMAC/deduplication; live order/fulfillment blocking and deterministic SSMA provider unavailability. Its original simulator workflow is retained.

Baseline `npm test`: 109 passed. Final full `npm run build` and `npm test`: **126 passed, 0 failed, 0 skipped**. This includes the original simulator/SSMA workflow, 15 commerce database cases, 10 new Shopify protocol/configuration cases, 4 module-host cases and 2 atomic-persistence cases. Exact source migration bytes match all four hashes in the installed immutable Shopify 1.1.1 package; provided/consumed SSMA contract bodies are unchanged. Frontend/SSDS source is unchanged.

A draft UI field used an unsupported Boolean declaration. SDK validation rejected it before packaging; it was changed to the existing read-only JSON presentation type, preserving the renderer/schema contract. One Windows regression encountered a simulator control HTTP 500 whose original internal cause was not exposed. The simulator now records bounded safe error codes and retries transient locked atomic-file operations without replaying the business operation or deleting prior state. Fault-injection tests and the subsequent complete suite passed; the original failure log is retained, without claiming its original cause was conclusively identified. Simulator source/package is 1.0.1 for newly provisioned fixtures; existing 1.0.0 artifacts/configurations are retained.

## Selected deployment acceptance

The first browser/module upgrade passed on Workers 1 and 3, but its network-denial check found that the secure Worker API redacted a specific Module Host denial into a generic HTTP 500. This gate was recorded as failed. The correction returns HTTP 503 with only an allowlist of five static, operator-actionable connector network codes; arbitrary runtime details remain redacted. A regression test verifies that boundary. This requires a narrowly updated Worker API image on all three Workers; Master API and every frontend image remain unchanged. The existing SSDS renderer is preserved.

Final selected-stack acceptance **passed** (2026-10-25 UTC; 2026-10-24 local):

- Shopify **1.2.0** is installed and active on Workers **1 and 3**. Worker 2 still has no Shopify module. The browser Module Manager performed the upgrades; all four original migration hashes, module authority records and existing module configuration were preserved.
- Chromium verified the manifest-contributed read-only connection form and paginated variants screen on both Workers, with **zero JavaScript errors** and no password/secret inputs. Loaded-state waits account for the renderer's Unicode loading indicators. [Actual SSDS connection form](screenshots/shopify-live-connection-ssds.png).
- Missing and wrong-image egress grants both returned the intended safe HTTP 503 code. The approved network attached to exactly the selected Worker 3 Shopify image/installation. Native HTTPS to Shopify's **public documentation** returned HTTP 200 with a verified TLS chain. This was not a store API request.
- Live mode remained unavailable for SSMA fulfillment even with integrations enabled. The test created no connection profile, business order or credential. Its finalizer restored the original simulator configuration and removed the temporary network/grant; all three hosts have no Shopify egress grant. Worker 1 retains integrations disabled; Worker 3 retains its original simulator integrations-enabled setting. Neither has private Shopify credentials or simulator services configured. No operator setting was reset to make a test pass.
- In-place host/API deployment retained all four databases, installation identities, accounts/password hashes, enrollments, governed work and authoritative business data. Configuration and database backups are private under `.steward/backups`; protected configuration files were compared against backup. No password or installation was regenerated.
- All four APIs passed health/readiness, all frontends/assets/proxies were reachable, PostgreSQL roles remained restricted, four database volumes remained distinct, and all three Workers use identical API/frontend images. Master API and all frontend images stayed unchanged; Worker API changed only for the safe configuration-error correction. The module installation itself did not change core images.
- Final ownership audit: **one selected Steward stack, 29 running containers, zero unexpected Steward containers**. No temporary full stack, simulator service, model or permanent egress network was left running.

The signed Shopify image is `sha256:cafe7468c79cac02f7478d5635d74af394d6daeb3b6e672c404305923184bbbc`; module host is `sha256:67c6336d1a4f1f8c8c393dd18310f0d236782384d55ec5e85792c76aaa6e3f9b`; Worker API is `sha256:b3ccbae9b3bd4f9544b6ed94c9c3cf472f680bad1db0cd3b04e9db974bd5b9ca`. Simulator 1.0.1 was built separately for new test fixtures and is not running in the operator deployment. Full sanitized results/image pins are in [the evidence file](shopify-live-evidence.json). Image source is `7c8f77a` for Shopify/host/simulator and `739f78e` for the Worker reporting fix; promotion metadata also records the commit performing the promotion.

## Commands actually run

```powershell
npm run build
npm test
npm run test:smart:browser
docker build -f infra/Dockerfile.module-host -t steward-module-host:shopify-readiness-7c8f77a .
docker build -f modules/shopify/Dockerfile -t cee.shopify:1.2.0 .
docker build -f infra/Dockerfile.commerce-simulator -t steward-commerce-simulator:1.0.1 .
node scripts/publish-module.mjs modules/shopify .steward/phase8-upgrade-regressions
docker build -f infra/Dockerfile.api --build-arg APP=worker -t steward-worker-api:shopify-readiness-739f78e .
node scripts/upgrade-selected-development.mjs .steward/phase8-upgrade-regressions docs/phase10a-acceptance-evidence.json --module-host-image steward-module-host:shopify-readiness-7c8f77a --worker-api-image steward-worker-api:shopify-readiness-739f78e
node scripts/verify-shopify-readiness.mjs .steward/phase8-upgrade-regressions --test-egress
node scripts/smoke.mjs .steward/phase8-upgrade-regressions
node scripts/verify-single-stack.mjs
```

The optional egress acceptance requires an initially ungranted Worker 3 in simulator mode with no live profiles; it deliberately refuses to overwrite real operator connection setup. The tested subnet was `10.240.3.0/28`, checked against Docker/host networks first; `STEWARD_TEST_EGRESS_SUBNET` can select another unused range. Do not run this destructive-mode acceptance over a configured live connection. The final screenshot was additionally captured after data/manager loading completed, using the existing authenticated browser session without mutating records.

Ignored raw logs/reports are under `artifacts/shopify-live-*`, `artifacts/shopify-readiness-deployment.json`, `artifacts/selected-stack-upgrade.json` and `artifacts/single-stack-audit.json`. Initial failed gates were retained separately. The 9 SSMA/browser checks include 8 cases also present in the root suite; they are not 9 additional unique backend tests.

## Remaining limitations

Live authentication/store identity/catalog/webhook delivery remain **blocked, not passed**, pending the store/app/private credential setup above. Commercial OAuth remains a protocol/interface foundation, not a deployable customer installation service. Catalog limits and unknown quantities, manual webhook endpoint setup, and broad image-bound egress rather than a destination firewall are explicit in the setup guide. No commercial production readiness or new release tag is claimed.
