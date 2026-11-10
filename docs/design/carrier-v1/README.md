# Carrier v1 contract-design checkpoint

This folder preserves the original design checkpoint. The bounded synthetic implementation now lives in `packages/carrier-kit` and `modules/carrier-simulator`; see [operator documentation](../../carrier-simulator.md). The draft examples here remain specifications; actual executable checks are in `packages/carrier-kit/src/test/carrier.test.ts` and `scripts/test-carrier-simulator.mjs`. Real carrier connectivity remains deferred.

## Artifacts

- [ADR 0048](../../adr/0048-carrier-observation-contracts.md): ownership, reconciliation, security and UPS MCP decision.
- [contracts.ts](contracts.ts): draft TypeScript types and injected transport/local-read interfaces.
- [acceptance-examples.ts](acceptance-examples.ts): 13 synthetic scenarios and expected outcomes. They are specifications, not passing runtime tests.

## Existing components to reuse

| Source | Reuse / boundary |
| --- | --- |
| `packages/module-sdk/src/capabilities.ts` | Existing entity-scoped, provider-owned contracts; exact-schema resolver and signed declaration validation |
| `packages/platform/src/module-manager.ts` | Verified installation discovery and permission filtering |
| `packages/platform/src/mcp.ts` | Worker manifest MCP reads; Master tools remain a distinct path |
| `packages/ui/src/modules.tsx` | Existing declarative forms, lists and actions |
| `packages/business-kit/src/index.ts` | Owned records, transactional actions, revision/idempotency patterns and audit |
| `packages/commerce-kit/src/store.ts` | Observation and uncertain-operation patterns; do not copy provider-specific assumptions blindly |
| `modules/marketing/src/definition.ts` | Network outside transactions, generation checks and retained failed-read state |
| `packages/module-host/src/connector-egress.ts` | Installation/image-bound external network governance |
| `modules/sales/src/definition.ts` | Existing fulfillment authority remains unchanged |

## Proposed operations and contracts

Names below are draft identifiers; no signed manifests exist yet. Use separate provider-owned, entity-scoped SSMA contracts for tracking registration/sync versus local observations. Version `1.0.0` is proposed, not released. Runtime JSON Schemas must use the existing restricted closed-schema grammar; fingerprint and compatibility tests precede publication.

| Operation | Module API | Permission suffix | MCP |
| --- | --- | --- | --- |
| Verify connection | POST `/verify-connection/:id` | `.configure` | No |
| Register existing tracking reference | POST `/tracking-registrations` | `.tracking.register` | No |
| Request bounded refresh | POST `/sync-tracking/:id` | `.tracking.sync` | No |
| Query stored summaries | GET `/shipments` | `.read` | Yes |
| Query stored events | GET `/tracking-events` | `.read` | Yes |
| Query retained exceptions | GET `/tracking-exceptions` | `.read` | Yes |

Prefix permissions with the actual module ID (for example `cee.ups.read`), not a new colon-delimited permission namespace. Do not assume core currently accepts `cee.ups` as a connector provider.

Proposed capability IDs: `shipping.tracking.register`, `shipping.tracking.sync`, `shipping.observations.read`. Use current SSMA operation/command routing for governed consumers; do not bypass binding approval via direct HTTP. API route examples above are for local UI operations; manifest capability declarations need the existing durable integration handler for commands and permitted synchronous read mappings.

Current MCP contribution schemas only accept supported declared query names. Start with bounded `limit`, `offset`, `status`, and exact registration UUID via documented `q`; validate `q` as an exact authorized registration lookup on the event route, not fuzzy tracking search. Do not add unsupported query names without explicit SDK work. Every returned event is scoped through its registration; event IDs alone never confer access. Default page 20, maximum 20; bounded offset per current runtime. Use uniquely named tools per carrier module to avoid cross-module name collisions.

v1 UI: Connections (administration), Registered Shipments, Tracking Events, Delivery Exceptions and Sync Status. Show simulator/sandbox/live prominently, last success, current failure and freshness separately. Registering a tracking reference is local only. No label, purchase, pickup or delivery-confirmation write controls.

## Persistence blueprint

Append module-owned migrations for connection/account scope, tracking registrations, immutable observations, observation-to-attempt links, sync jobs/attempts, idempotency receipts and versioned derived summaries. Registration uniqueness and event indexes include full scope/environment. Record both authority and execution identities. Keep carrier credentials outside business tables.

Store canonical allowlisted evidence, not unrestricted payloads. Unknown carrier times, expected package counts and delivery estimates remain nullable. Events are paginated separately from summary data. Local stale evidence remains readable with qualifications. No full-shipment completion from one delivered package unless the complete expected package set is established.

Policy defaults must be explicit during implementation: maximum tracked registrations, polls per run/account, response bytes/pages/events, timeout, concurrency, retry count/delay, freshness, retention and terminal-state follow-up. Do not invent carrier quota values. Persist scheduling/backoff and use mock clocks in tests.

## Bounded implementation sequence

1. Implement carrier-kit validators, canonical identities and pure reconciliation functions from these rules. Add actual tests for every acceptance example and invalid schemas/private fields. Preserve unknowns and map provider status with a recorded version.
2. Implement a separately signed persistent simulator module using the shared ingestion path. Synthetic progression and anomaly injection have dedicated permissions and cannot target real connections. Restart recovery, duplicate retries and generation races must be demonstrated.
3. Add declarative UI, local SSMA reads/commands and database-only MCP contributions. Verify unauthorized access, cross-entity/account/environment isolation, paging, no hidden network on reads and unavailable-provider behavior.
4. Implement one real carrier transport after official authentication/environment/usage/retention requirements are verified. Compare direct REST with the UPS upstream MCP option; select one based on verified behavior and deployment cost, not tool availability alone. No arbitrary upstream tool passthrough.
5. Add precise SDK provider validation and egress/provisioning support with tests. Keep endpoint trust module-owned and existing grants unchanged. Require credentials and approvals before external verification. Missing access stays not configured.
6. Implement a second carrier behind the same contracts to demonstrate portability; do not claim this gate passed using only a second simulator label.
7. Run relevant module, platform, browser and deployment acceptance before promotion. Preserve selected operator identities, volumes and records; use existing upgrade/backup/single-stack controls. Separate simulator, carrier sandbox and live results.

Master disclosure, Master analytical tools, rate quotation, address validation, proof-of-delivery documents, labels, pickups and returns are deferred. They require separate contracts/permissions and acceptance, not placeholder booleans or methods.

## Review gates and validation record

Design-only validation command (no deployment):

```powershell
node node_modules/typescript/bin/tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext docs/design/carrier-v1/contracts.ts docs/design/carrier-v1/acceptance-examples.ts
```

This checks TypeScript consistency only. It does not validate runtime inputs, carrier behavior, reconciliation, authorization or live compatibility. Those remain mandatory implementation gates above. No pricing or legal-compliance conclusions are inferred from the UPS MCP documentation.
