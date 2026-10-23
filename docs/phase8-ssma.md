# Phase 8 SSMA implementation reference — development checkpoint

This branch contains a tested SSMA kernel, not a completed v0.8.0 release. Shopify/Printify adapters, commerce simulators, Master commerce analysis and packaged deployment acceptance remain outstanding. The package/core version identifies the development target; it is not a release certification. The accepted distribution remains v0.7.0.

## Reuse and contracts

SDK package 1.3.0 preserves manifest/SDK wire version 1. Legacy packages omit `smart` and continue using existing bilateral integration contracts. SSMA packages require minimum platform 0.8.0. The optional `smart` member is covered by the existing Ed25519 package signature and immutable image identity.

`packages/module-sdk/src/capabilities.ts` is the TypeScript contract reference. `smart.version` is 1; `provides` and `consumes` contain at most 20 unique capabilities each. Providers specify capability/contract/version, named operations with input/output JSON schemas, permission, communication mode, idempotency, retry policy, events, sensitivity, entity scope and provider ownership. Consumers specify contract identity, minimum version, maximum compatible major, required operations/events, maximum sensitivity and optionality. Prerequisites require an active, healthy provider and explicitly declared configuration values. Prerequisites must reference declared configuration keys and must never contain secrets.

Input/output/event schemas are bounded to 16 KiB and compile locally. Remote schema references, executable annotations and asynchronous validators are rejected. The validator cache is bounded. Discovery includes no executable frontend assets. The initial resolver requires identical input/output/event schema canonical forms; it rejects structurally different schemas rather than guessing that they are substitutable.

## Registry and deterministic resolution

Worker-local platform migration 7 adds provider snapshots, bindings, obligations, pinned command routes, workflow definitions, executions, history and a separate issuance journal. Migrations 1–6 are unchanged. Module business tables remain in their dedicated databases.

`GET /api/v8/smart-modules` verifies installed package signatures and refreshes provider snapshots. A ten-second background refresh also reconciles snapshots. Health inspection is authenticated through the existing host and bounded by the broker timeout. States are active, inactive, failed or unavailable; configuration prerequisites are separate. There is no API for registering arbitrary metadata.

All new governance routes require an enabled Worker `local_admin` session. Mutations enforce the existing trusted Origin, JSON and CSRF checks. Module users and Master accounts cannot acquire authority merely by discovering a capability. Discovery is limited to the local installation/entity. The initial interface is administrator-only; a delegated capability-governance role is not implemented.

`POST /api/v8/smart-modules/resolve` accepts `consumerId`, `capabilityId` and optional `preferredProvider`. It reads the consumer's signed requirement and evaluates providers against entity, contract, version, schema/event compatibility, sensitivity, permissions, configuration and availability. Results include every rejection reason. One compatible provider resolves; multiple providers are ambiguous unless the administrator supplies an explicit compatible preference. Enumeration order never selects a winner.

`POST /api/v8/smart-modules/bindings` requires a new UUID `bindingId`, consumer/capability/provider IDs, the exact inspected `packageDigest`, and an explanation of 20–1000 characters. Bindings pin the provider installation operation UUID, signed descriptor digest and full contract/requirement. A changed package requires inspection and approval again. The UUID cannot be reused for different approval contents.

Substitution disables the old binding for execution and selects a provider only for new work. Existing `smart_obligations` retain their original binding/provider/package. Work using a disabled binding suspends; it does not migrate reservations to the replacement. `POST .../bindings/:id/disable` requires an explicit reason. No automatic business-data transfer or destructive rollback exists.

## Governed workflow execution

Propose a fixed, bounded sequence using `POST /api/v8/smart-modules/workflows`:

```json
{
  "workflowId": "<new UUID>",
  "name": "Reviewed synthetic reservation",
  "version": 1,
  "consumerId": "example.checkout",
  "steps": [{"bindingId": "<approved binding UUID>", "operation": "reserve"}],
  "reason": "Reviewed contract, scope and retained provider obligations."
}
```

The fixture names above are test identities, not built-in company or business configuration. See `scripts/test-smart-modules.mjs` for signed consumer/provider declarations and end-to-end API usage. It uses two provider identities with the same test implementation; it does **not** establish acceptance of two independently implemented production provider packages or an unchanged Sales commerce workflow.

Definitions have at most eight steps and are immutable under their identity/version. `POST .../workflows/:id/lifecycle` requires separate `approve` then `activate` actions; activation of an unreviewed proposal is rejected. `disable` stops further execution. `POST .../execute` accepts a UUID execution ID, an active workflow ID and one schema-validated input per step. Exact retries return the retained execution; altered retries are rejected.

The existing local module host executes steps with PostgreSQL row locking and `SKIP LOCKED`. Every step revalidates the executing administrator, approving administrator, entity, signed consumer/provider, package digest, installation identity, configuration, contract and binding state. A revoked approval, reinstall or upgrade suspends work before its next effect.

Durable operations use the existing authenticated module inbox and stable command IDs derived from execution/step. Receipt caching handles lost acknowledgments. A host-only capability header permits the signed operation without a hardcoded legacy peer name; the ordinary application gateway cannot forward that header or expose private inbox/outbox/ack routes. Module-owned validation and transactions still enforce business invariants.

Modules may also use `enqueueCapability(context, capabilityId, operation, aggregateId, payload)` in their own business transaction. Its durable outbox envelope carries a capability reference and the reserved target `steward.capability`, never a chosen provider package. The host validates the signed consumer requirement and approved binding, pins the original obligation/command, maps the operation to the provider's signed command and maintains both source-capability and target causal ordering. Lost acknowledgments replay the identical routed envelope. A replacement cannot receive an old aggregate. Only operations declaring safe durable receipt retries may use this route; non-repeatable external issuance belongs behind a reconciled provider-owned receipt or the governed issuance workflow.

The dispatcher shares lifecycle advisory locks while delivering to a provider and rechecks active package/configuration snapshots. This host path is built but has not yet been exercised through a packaged 0.8 Docker runtime; the current acceptance fixture invokes the same resolver/routing function against PostgreSQL and real module inboxes directly.

Synchronous queries currently support parameterless declared GET operations. Synchronous mutations require a declared string `requestId` input property; the runtime supplies its stable step command ID. This is not a promise that arbitrary legacy CRUD endpoints implement command idempotency.

Per-call execution is bounded to four seconds. Transient safe work has a bounded retry budget with five-second backoff, and executions have a ten-minute time budget. Non-repeatable operations use an independently committed issuance journal before calling the provider. A process death or lost response leaves an uncertain receipt and requires reconciliation. A retained response can be used without repeating the operation. Never reset or delete this journal to force a costly retry.

Definitions are data, not scripts. There is no arbitrary model code, implicit approval or model publication authority. Current workflow inputs are explicitly supplied per step; conditional composition, business-specific dataflow, automatic compensation and an operator reconciliation/resume API are **not implemented**. Suspended work retains its inputs, obligations and history for investigation; operators must reconcile provider-owned business state before a separately reviewed new action. Do not edit governance tables as a normal recovery procedure.

## UI and verification

The Worker Module Manager includes the Smart Modules panel for signed provider details, state, compatibility explanations, explicit binding approval/disable, workflow proposal/approval/activation/disable and retained execution history. It has loading, empty, failure and unavailable states. Existing module screens remain intact.

```powershell
npm ci
npm run build
npm test
npm run test:smart:browser
```

The SSMA tests use an isolated PostgreSQL 17.10 container, real password/session/CSRF authentication, signed synthetic declarations and module-owned Fastify inboxes. They do not modify the retained deployment. Browser acceptance serves the production Smart Modules component over ephemeral test HTTPS and calls genuine governance APIs; only its self-signed test certificate is bypassed in the isolated browser context. A separate health-transport fixture controls unavailable states. Tests remove their owned container and generated secret files. Raw sanitized reports are under `artifacts/phase8-smart-*-verification.json`; the screenshot is `artifacts/phase8-smart-browser.png`.

## Remaining release gates

Do not install this checkpoint as a completed commercial or MVP Phase 8 distribution. The release packer explicitly refuses unsupported version targets rather than accidentally relabeling Phase 7 images as Phase 8. Complete independent module packages, commerce adapters/simulators, business workflows and cross-module dataflow, Master commerce projections/MCP/calculations/reviewed findings, full failure matrix, retained-deployment upgrade, clean package install, archive checksum/digest verification and redeployment before enabling packaging and tagging v0.8.0.
