# Shopify live-readiness verification

Implementation branch `codex/shopify-development-auth`, starting at `f9949fd`. This continues the latest adapter/UI code descended from v0.8.0 rather than deploying an old checkout. v0.8.0 tag object `138a5875641563899bddcc4042159e8e68a4bd1e`, peeled commit `7d3a70d6349ca684111b7e2b879650c2be4c54d6`, remains preserved. No release tag is created.

Current implementation: Shopify 1.2.0; optional connector-egress support in module host 0.8.1. All applied Shopify migrations are unchanged (schema 4); connection profiles/pins/requests use the existing module-owned record foundation. SSMA provided/consumed contract bodies are unchanged; simulator mode is an additional deterministic availability prerequisite for fulfillment. Existing SSDS renderer and frontend source are unchanged.

Official requirements, exact Dev Dashboard settings, secret-file/environment setup, egress/network grants, URLs/scopes, callback boundaries and limitations are in [the setup guide](shopify-development-store.md).

## Live verification blocker

Inspection found neither `STEWARD_SHOPIFY_CLIENT_ID` nor `STEWARD_SHOPIFY_CLIENT_SECRET` in this process, and no Shopify private configuration file for any selected Worker. No development store/app identity or credentials were supplied. **Real Shopify authentication, installed-scope checks, store-identity verification, catalog synchronization and inbound live webhooks remain unverified.** No live Shopify order has been read, created, changed or fulfilled. No secret has been requested in chat.

Needed for the first real verification: a development store listed in the same Dev Dashboard organization as the app; its canonical `*.myshopify.com` domain; a released and installed non-embedded app version with `read_products`; and its client ID/secret in private local files or named environment variables. For live webhooks, an operator-owned public HTTPS route is additionally required. There is no callback requirement for the client-credentials flow. Commercial customer OAuth hosting/persistent token repository remain architectural future work, explicitly not an enabled installation route.

## Implementation acceptance

Protocol unit tests currently pass: pinned HTTPS/headers/serialization, token form exchange, redacted errors, authentication failures, throttling, API-version drift, partial/malformed responses, caching/renewal/coalescing, private-bundle validation, nested pagination, identity/scope/development checks, callback cryptographic validation and future expiring-token exchange, plus private CLI credential-source/idempotency checks.

The existing commerce backend suite passes with two added live-protocol cases against disposable PostgreSQL: separate configuration permission; durable asynchronous read requests and newer-request preservation; atomic connection-scoped catalog application with unknown inventory quantities; store-identity/mode reuse rejection; failure/retry recovery; real module API webhook HMAC/deduplication; live order/fulfillment blocking and deterministic SSMA provider unavailability. Its original simulator workflow is retained.

Baseline `npm test`: 109 passed. Final full `npm run build` and `npm test`: **125 passed, 0 failed, 0 skipped**. This includes the original simulator/SSMA workflow, 15 commerce database cases, 10 new Shopify protocol/configuration cases, 4 module-host cases and 2 atomic-persistence cases. Exact source migration bytes match all four hashes in the installed immutable Shopify 1.1.1 package; provided/consumed SSMA contract bodies are unchanged. Frontend/SSDS source is unchanged.

A draft UI field used an unsupported Boolean declaration. SDK validation rejected it before packaging; it was changed to the existing read-only JSON presentation type, preserving the renderer/schema contract. One Windows regression encountered a simulator control HTTP 500 whose original internal cause was not exposed. The simulator now records bounded safe error codes and retries transient locked atomic-file operations without replaying the business operation or deleting prior state. Fault-injection tests and the subsequent complete suite passed; the original failure log is retained, without claiming its original cause was conclusively identified. Simulator source/package is 1.0.1 for newly provisioned fixtures; existing 1.0.0 artifacts/configurations are retained.

Selected-stack module/host deployment, browser visibility, exact image/configuration preservation and optional network grant/revoke acceptance remain pending the final deployment checkpoint. This checkpoint does not claim those gates passed.
