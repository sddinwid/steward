# Developing and packaging a Steward module

Read [the existing SDK/package interface](phase3.md), [Phase 7 API/security contracts](phase7.md), and ADRs 0015–0017 first. `modules/sales` is a working optional-integration example; `modules/workforce` demonstrates private local records and explicit aggregate publication. There is one Module Manager and one runtime provider.

## Build a separate service

Create a separately versioned directory under `modules/` with its own `package.json`, lockfile, `tsconfig.json`, Dockerfile, manifest, `src/` and numbered SQL migrations. Do not import its operational implementation into Worker or Master. The SDK is `@steward/module-sdk@1.2.0`; the optional module-only transaction library is `@steward/business-kit@1.1.0`. Both are built before the module. Copy the module and these libraries into its own image; follow the existing Dockerfiles' non-root process and installed-image labels.

The signed manifest must declare identity/version, minimum platform, required/optional dependencies, permissions, exact public API methods/paths, UI contributions, configuration schema, persistence/migration hashes, integration events, analytical capabilities and optional read-only MCP operations. The publisher replaces migration hash declarations with hashes of the actual SQL. An old migration must never change after publication; add a new migration and increment the module version.

The service listens on its private port 8080. `/health` reports process availability; `/ready` verifies its own database/schema/installation identity. `/internal/migrate` verifies the signed migration hashes and applies outstanding migrations transactionally. Operational and private endpoints require the runtime's generated gateway token. Runtime configuration and credentials arrive through the read-only installation-specific secret volume, never frontend code or image layers.

`startBusinessModule` accepts an actual `Definition` with closed resource schemas, workflow actions, optional queries/reports, inbox/acknowledgment handlers and a bounded maintenance tick. Its `Context.db` connects only to this module's database. It supplies revision checks, actor-bound creation/action receipts, audit and atomic business/outbox transactions. Declare the corresponding public methods and UI fields/actions in the manifest; undeclared operations remain inaccessible. A custom service may implement the same SDK protocol without using this library.

Public lists return `records` and `nextOffset`. Declare supported query keys explicitly; validate limits, offsets, field selection and dates in the service. The Sales `/sales-period` example uses UTC `from` inclusive and `to` exclusive and sums completed fulfillment revenue with immutable order prices. Private resources must have separate permissions and must not accidentally become MCP tools or replication streams.

## Cooperate through versioned commands

An optional signed `integration` declaration uses version 1, three distinct private paths (`/integration-outbox`, `/integration-inbox`, `/integration-ack`), and bilateral peers. Each peer declares `moduleId`, `minimumVersion`, and versioned `sends`/`receives`. Both modules must also have operator configuration `integrationsEnabled:true`. These private paths cannot appear among public API contributions. Required dependencies belong in `dependencies`; optional peers do not make standalone module installation fail.

The wire envelope has exactly these fields:

```typescript
interface IntegrationCommand {
  protocol: 'steward-module-integration-v1';
  commandId: string;             // UUID, stable across retries
  sourceModuleId: string;
  targetModuleId: string;
  command: string;
  version: 1;
  aggregateId: string;           // UUID, ordering scope
  sequence: number;              // positive safe integer
  occurredAt: string;            // timestamp
  payload: Record<string, unknown>;
}
```

Canonical envelopes are limited to 32 KiB and bound to a SHA-256 digest. The host authenticates both actual installation and source module. The target validates its own command payload. Never trust identities or effective permissions provided by a browser, and never connect to another module's database.

| Command version 1 | Sender → receiver | Payload and effect |
| --- | --- | --- |
| `stock.reserve` | Sales → Inventory | `{orderId,lines:[{sku,quantity}]}`; aggregate is order ID; partial reservation returns authoritative reserved quantities |
| `stock.release` | Sales → Inventory | `{orderId}`; ordered release of that order's remaining reservations |
| `stock.consume` | Sales → Inventory | `{orderId,fulfillmentId,lines:[{sku,quantity}]}`; consumes only owned reserved stock |
| `stock.replenishment` | Inventory → Procurement | `{itemId,sku,quantity}`; aggregate is item ID; creates one linked draft requisition per event, without approval |
| `goods.received` | Procurement → Inventory | `{receiptId,orderNumber,lines:[{sku,quantity}]}`; aggregate is receipt ID; records a unique referenced stock movement |

Business writes and source outbox enqueue commit together. The target commits effect, inbox digest/result and ordering position together. An identical retry returns the recorded outcome; altered replay is rejected; a future sequence gap returns retryable 425. Business rejection rolls back effects and records the rejection while advancing ordering, so later compensation is possible. Source acknowledgment and its business-state update commit together. Pending transport failures retry with bounded backoff. Do not create a new identity to conceal a rejected operation or silently roll back stock.

## Publish analytical evidence

Use module-owned projection tables with IDs/revisions and declared replication streams. Update approved projections in the same database transaction as their source state. Existing capture/outbox/synchronization transports `record.upsert` to Master and retains source entity, installation, module, stream, record and revision attribution. Semantic integration-event declarations describe real changes; they do not introduce an imaginary event service.

Canonical categories and closed payload contracts are in `packages/contracts/src/business.ts`; deterministic calculations and current-reference validation are in the existing platform analytical capability layer. Master analytical records are synchronized copies, never operational authority. Publish private Workforce data only as explicitly approved threshold-suppressed aggregates. Do not replicate people, enrollments, achievements or local candidate matches.

## Build, trust, install and verify

From the checkout root, build the shared packages and the actual module; for example:

```powershell
npm ci
npm run build
node scripts/publish-module.mjs modules/procurement .steward/demo7
```

Publication builds the independent module image, checks labels/migration content, pins its digest and signs the payload with the installation's private publisher key. Publish sequentially. A same-version content conflict is rejected. The local trusted catalog is operator-managed; it is not a remote registry or an arbitrary URL loader. Distribution import verifies payload checksums and requires the explicit bundled-module trust option before local signing.

In the running Worker's Module Manager, inspect the package/version/compatibility, enter configuration and choose Install, then Activate. Grant only the required Worker-local permissions to module users. APIs, navigation and declared MCP tools appear dynamically; Worker frontend/core images are not rebuilt. Upgrade is explicit and newer-version only; the same completed operation identity is idempotent. Disabled modules retain their databases. Failed/interrupted installs expose errors and the existing Recover action; use a compatible corrected signed package, preserving old databases and credentials.

Run `npm test` for the transactional, permission, privacy, replay and calculation suites. On a dedicated synthetic deployment, run the browser/MCP/recovery/configuration commands in the [presenter guide](phase7-presenter.md), then the full earlier-phase regressions on their preserved baseline scenario. Record actual installation request IDs, image digests, source references and failed attempts. Compilation alone is not installation or workflow verification.
