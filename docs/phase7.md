# Phase 7 business modules and contracts

The four new applications are isolated module services, not Worker imports or configuration switches. They use signed packages, dedicated databases, the existing Module Manager, Worker-local authentication/permissions and declarative screen discovery. `@steward/business-kit` supplies domain-neutral transaction/idempotency/API plumbing inside module images only. The Worker/Master runtime images contain no implementation of these modules.

| Module | Release package | Main records and permissions |
| --- | --- | --- |
| Inventory | `cee.inventory@1.3.2` | Existing items, authoritative reservations/movements, thresholds; `read`, `write` |
| Procurement | `cee.procurement@1.0.2` | Suppliers, requisitions, purchase orders/lines, receipts, quotes, reports; `read`, `write`, `approve` |
| Sales | `cee.sales@1.0.2` | Customers, orders/lines, fulfillment, reports; `read`, `write` |
| Assets | `cee.assets@1.0.3` | Facilities, assets, maintenance, bookings, reports; `read`, `write`, `maintain`, `publish` |
| Workforce | `cee.workforce@1.0.2` | Skills/programs/positions and aggregates; `read`, `write`, `publish`; synthetic people/enrollment/achievement/matching additionally require `people.read`, `people.write`, `people.complete` |
| Operations | retained `cee.operations@1.0.0` | Backward-compatible Phase 4 operational and resource data |

Permission names have the module prefix, for example `cee.procurement.approve`. Local administrators manage installation/configuration and grant explicit permissions to module users. Discovery filters screens/actions/MCP tools; the authenticated backend gateway independently enforces each operation. Modules receive host-bound effective permissions rather than browser-supplied authority. Sensitive Workforce handlers also check their local permission context.

## Package and data versions

SDK package 1.2.0 keeps manifest/SDK protocol 1 and adds optional signed integration declarations, declared query parameters, read-only screens, JSON/enum fields and workflow actions. Older manifests remain accepted. New modules require platform 0.7.0. Existing provisioner/config/enrollment/synchronization contracts and core schema 6 remain unchanged.

Every module has `manifest.json`, a Dockerfile, its own package lock, operational source and numbered SQL migrations. Publication hashes actual SQL and signs the immutable image digest and manifest. Runtime migrations verify hashes and installation identity inside a single PostgreSQL transaction. No destructive rollback is offered. A failed install requires explicit recovery with a trusted corrected package; other applications remain available. See ADRs 0015–0017.

API paths below are relative to `https://worker-N.localhost:PORT/api/v3/modules/MODULE/api`. All require the existing secure local session; writes require trusted Origin and CSRF. Public endpoints must match the signed method/path/query/permission declaration. No private integration path is publicly contributed.

| Module | Read/create/edit routes | Workflow action routes |
| --- | --- | --- |
| Procurement | `/suppliers`, `/requisitions`, `/orders`, `/receipts`, `/quotes` | `/submit/:id`, `/approve/:id`, `/place/:id`, `/cancel/:id`, `/publish-demand/:id`, `/publish-quote/:id`, `/withdraw-demand/:id`, `/withdraw-quote/:id`, `/retry-stock/:id` |
| Sales | `/customers`, `/orders`, `/fulfillments` | `/confirm/:id`, `/cancel/:id` |
| Assets | `/facilities`, `/assets`, `/maintenance`, `/bookings` | `/publish/:id`, `/withdraw/:id`, `/complete/:id`, `/cancel-booking/:id` |
| Workforce | `/skills`, `/people`, `/programs`, `/enrollments`, `/positions`; achievements are read-only | `/complete/:id`, `/publish-skills/:id`, `/publish-program/:id`, `/publish-position/:id`, corresponding `/withdraw-*` actions |

Create uses POST; editable records use PUT `/:id` with the observed revision. Derived workflow status cannot be submitted as an arbitrary edit. Completed receipts, fulfillments, enrollments and achievements are immutable. Actions use POST `{revision,requestId}` with a UUID request ID. Reusing a request ID with different content/actor is rejected. Natural document keys make identical create retries safe; conflicting content returns 409.

New list APIs support declared `limit` (1–20), `offset`, `fields`, `status`, `q`. Inventory supports `limit`, `offset`, `fields`; older packages retain their original parameterless APIs. `nextOffset` is null at the end. Unknown selected fields/query keys are rejected. `/reports` and `/integration-status` expose bounded summaries. Form fields ending in `Cents` require integer cents. Document line arrays use, for example:

```json
[{"sku":"SYN-SUPPLY","quantity":5,"unitPriceCents":900}]
```

Receipt/fulfillment lines omit `unitPriceCents`. Screens provide JSON editors for line/skill arrays and validated scalar inputs; they load no executable remote assets. This is a basic administrative UI, not a full accounting or ERP interface.

Sales additionally contributes `/sales-period` and MCP `sales_by_period` with optional `from`/`to` timestamps. The interval is UTC, from inclusive and to exclusive. Revenue uses actual completed fulfillment confirmation times and immutable order prices; order volume uses creation times. Pending/rejected movements are excluded, and different monetary currencies are never summed into one total. Workforce capacity distinguishes total cohort seats from available seats and treats ended programs as unavailable training capacity.

Creation receipts bind to their original actor and snapshot. A write-only retry cannot retrieve later private field changes, and another writer cannot use a known creation payload to read an existing record. Legacy receipts lacking snapshots return identity only, followed by an independently authorized read when needed.

## Optional cooperation

Set `integrationsEnabled:true` in both participating modules using the installed module's configuration editor. The signed manifests must declare compatible bilateral peer commands. Keep integrated document quantities in whole `units`; conversion between units of measure is not implemented. Inventory's display quantity label does not convert existing data. Use one configured currency per module; changing the currency meaning of populated records is unsupported. Cross-currency analytical proposals are rejected.

The existing Worker module host polls bounded source outboxes fairly, validates signed declarations and operator enablement, and delivers to the target's private authenticated inbox. It never writes a peer's business database. Source state/outbox commit together. Target effects/inbox/sequence commit together. Canonical content digests bind command identity; duplicate content returns the original result, altered replay is rejected, and future sequence gaps are retryable. A rejected business operation rolls back its effects but durably records its rejection so subsequent compensation can advance. Acknowledgments update source state atomically, with bounded retry/backoff after lost connections.

* Sales confirmation requests Inventory's actual available stock and a partial reservation. Concurrent reservations cannot exceed available quantity. Fulfillment remains pending until authoritative consumption is acknowledged. Cancellation queues ordered release, including when confirmation is still pending. An order retains the integration mode selected at confirmation; later configuration changes do not silently reinterpret it as a manual order.
* Low stock produces a linked draft Procurement requisition once per threshold cycle. It does not approve or place a purchase order. A human supplies a valid external supplier and baseline price before approval/publication.
* Procurement receipts validate order state and outstanding quantities, preserve receipt/order references and increase Inventory exactly once. Rejected stock delivery is visible and requires an authorized explicit retry after correcting its cause. Pending transport errors retry automatically.
* Disabled/absent optional peers leave durable pending work and clear delivery state; they do not break unrelated CRUD, Worker health or standalone operation. Disabling a module preserves its database. Do not disable an integration while operational compensation is pending; restore the compatible peer/configuration and allow the existing command identity to retry.

The integration outbox is distinct from the Master synchronization outbox. Module-owned synchronization events stay in the module's own `sync_outbox` until Master acknowledges them; a zero core-outbox count does not imply all module queues are drained.

## Approved projections, MCP and AI

Procurement publishes approved external demands/quotes and operational commitments. Sales publishes order demand/constraints without customer directory data. Inventory publishes quantities/replenishment state. Assets publishes approved capacity/cost/ownership copies; scheduled boundaries invalidate stale snapshots until its module refreshes them. Owners, custodians and users are independent UUID relationships, and authorized owner relationships require explicit module configuration.

Workforce accepts only labelled synthetic references/names in this release. Its private person, enrollment, achievement and candidate-matching records have no ecosystem synchronization or MCP declaration. Approved skill/training/job projections contain aggregates only; groups below `minimumGroupSize` (at least 3) are null/suppressed, never zero. Updating an approved program or position withdraws its old projection until republished. Candidate matching remains private Worker-local data with human review, not a hiring decision.

The existing authenticated MCP server contributes active, permitted module reads. Master adds `query_business_evidence`, `query_procurement_matches`, `analyze_shared_procurement_by_id`, `query_workforce_matches`, `analyze_workforce_opportunity_by_id`. Source UUIDs/revisions, entity/installation attribution and observation times accompany results. Calculations resolve authorized current references and reject wrong entities/streams, missing revisions, incompatible currency/units and unsupported arithmetic bounds. Existing resource-sharing tools now accept compatible canonical supply/demand from different modules.

Analyst requests optionally select `resource-sharing` (the backward-compatible default), `shared-procurement`, or `workforce-opportunity`. Real models choose actual MCP calls/arguments. Deterministic services perform arithmetic; exact integer-cent values and full evidence remain retained. Compact procurement views provide service-formatted currency strings to prevent model unit conversion errors. Full activity and source records remain available for review. Model errors/timeouts/budget limits yield explicit partial investigations, not invented conclusions.

Review model prose against the deterministic evidence before publishing. Phase 7 verification/presenter tooling defers publication to a separate operator browser action. The model cannot purchase, hire, book resources, approve a module, change scope or publish a finding. Deferred offline enrollment, Python analytical services, a remote module registry, payroll/accounting and generalized autonomous business actions are not implemented.
