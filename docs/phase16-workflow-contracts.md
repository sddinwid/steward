# Phase 16 workflow contracts (development checkpoint)

This document describes implemented SDK/UI helpers, not a completed automation
module or deployed workflow service. Release status is in
[phase16-verification.md](phase16-verification.md).

## Data-only graph

`@steward/module-sdk/workflow` is the browser-safe export. The ordinary SDK export
also exposes these contracts for trusted server code. No module assets, code,
JavaScript expressions or SQL are loaded by the graph renderer.

`WorkflowGraph.graphVersion` is 1. A definition has at most 32 nodes, 64 edges,
24 action nodes, four concurrent effects and a 31-day elapsed-time ceiling.
Application publication may impose tighter limits. Allowed node kinds are
trigger, condition, action, approval, wait, branch, join, notification and
completion. IDs are stable lowercase identifiers; reordering a diagram must not
change an existing action identity.

Graphs are DAGs with one trigger, reachable nodes and explicit terminal paths.
Conditions require both true/false connections. Approvals require approved,
rejected and expired paths. A parallel branch uses lane edges; joins wait for
all incoming paths to finish or be explicitly skipped. Safe retry is a retained
action state, not a loop drawn into the business graph.

`inspectWorkflowGraph` returns structured validation codes and node IDs;
`validateWorkflowGraph` rejects invalid graphs. Neither resolves a provider,
approves a binding nor authenticates a user. Published definitions must also be
checked against current signed operation contracts and module ownership by the
governed coordinator. That integration remains pending.

## Rules and evidence

Rules use literal, field or explicit operator objects. Operators are Boolean
and/or/not, same-type equality/inequality, integer comparisons, add, subtract,
multiply and exact divide. At most 128 expression nodes and depth 12 are accepted.
Strings are bounded to 1,024 characters. Integers must be JavaScript safe integers;
intermediate arithmetic uses BigInt and refuses overflow, zero division and
implicit rounding. Money conversion and business calculations remain owned by
their existing authoritative capabilities.

Field names are validated against a catalog derived from verified closed schemas
using `workflowFieldsFromSchema`. Arrays, unions, open objects and remote schema
references are not guessed. `WorkflowInputValue` separately assembles bounded
objects and arrays from these scalar expressions. Objects have at most 32 fields,
arrays at most 40 elements, with 256 mapping nodes and nesting depth eight.
Mappings must match declared input properties, required fields and scalar types.
The complete provider schema must be revalidated after runtime materialization;
compile-time checks do not prove a dynamic quantity meets provider bounds.
Graph serialization is limited to 64 KiB. Dynamic collection loops and arbitrary
record copying remain unsupported.

Every observed field retains entity, Worker installation, module installation,
module/package, stream, record and revision identity, plus authoritative observation
time. Evaluation rejects another entity, future/stale values, missing provenance,
missing fields and coercion. Boolean evaluation is eager so a true operand cannot
hide invalid evidence in another operand. A valid provenance shape is not proof
of authenticity: only the trusted coordinator may construct observations from
authorized provider receipts. Caller-supplied observation timestamps are not
authority.

## Signed UI contribution

A module targeting at least 0.16 may declare a formVersion-1 JSON field with
`format: workflow`. The shared renderer supplies the workflow editor; existing
forms and navigation remain intact. Available bindings are presented from the
existing authenticated SSMA registry for that consumer. Missing, disabled,
reconfigured or replaced providers cannot appear as currently approved choices.
All final authorization remains server-side.

The current component supports keyboard-accessible step lists, visual connections,
step configuration, contract inspection, validation codes and read-only display.
Input mappings and conditions currently use bounded declarative JSON editors;
further guided controls are needed before business-user acceptance. The fixture
browser tests do not establish installed-module operation or production UX.

## Shared event capture

A provider may add `streamId` to a signed capability event, identifying one of its
existing signed replication streams. This declaration requires minimum platform
0.16. Consumers cannot declare the provider's stream mapping. Adding metadata
alone does not subscribe a workflow or grant access.

The host helper `captureSharedEvents` reads the existing source `sync_outbox`
under row locks and validates source identity, signature, stream schema, payload
and entity. Additive `local_captured_at` metadata tracks local capture independently
of Master `acknowledged_at`; neither the original SQL strings nor module business
tables are rewritten. Its callback must commit current authorized subscriber
receipts idempotently before source capture acknowledgment. If a process dies
between those commits, the exact source event is retried.

The helper is deliberately not connected to the production host loop yet. Real
subscription governance, atomic fan-out, execution lineage, replay controls,
poison-event handling, retention and sensitive scoped disclosures must be completed
and exercised before activation. The existing isolated tests use a clearly
labeled synthetic receipt callback. There is no new network transport or service.


## Publication authority boundary

Optional signed `workflowServices` declares a read-only publication operation
supporting an exact `q` identifier. It requires the existing `approvalServices`
declaration and platform 0.16.0 or newer. It never grants execution permission.
The host's `verifyWorkflowPublication` precondition retains exact module
installation, package digest, publication digest, review identity and expiry.
It re-reads the module-owned publication and checks current Worker permissions
before and after transport, source continuity, entity, chronology and separate
review. A new approval does not silently renew an existing execution pin.

This precondition is implemented and tested independently. Graph execution,
activation APIs and per-action checks must call it as part of the existing SSMA
coordinator; those integrations are not yet complete.


## Coordinator graph progress (development)

`smart_executions.graph_state` holds bounded control progress, authoritative
node-entry times, exact step-review identities and only schema-selected scalar
observations. Manual-trigger provenance identifies the authenticated execution;
action observations identify the original provider command receipt, not a
fabricated business record. The module remains the definition authority.

The original SSMA executor handles graph actions with stable node-derived command
IDs and existing issuance/reconciliation behavior. Earlier graphs and retained
provider bindings are not replaced automatically. Step approval is checked again
before subsequent progress. Waiting uses persisted timestamps, explicit rejection
and expiry paths. Graph action history omits raw provider payloads. Effects require
host lifecycle locks; missing guards stop before dispatch.

This kernel is exercised with synthetic durable provider receipts. Public graph
admission, activation, decision APIs and installed business workflows are still
pending. Actions are currently serialized, so simultaneous bounded provider calls
are not yet verified. Do not describe these kernel tests as release acceptance.


## Current governance API and UI

`POST /api/v16/workflows/import` accepts an exact publication reference and reason;
it imports a proposed immutable execution projection. `/api/v16/workflows/:id/lifecycle`
activates or suspends after current source/reviewer/binding checks.
`POST /api/v16/workflows/execute` accepts a workflow ID, stable execution ID and
published-schema manual input. `POST /api/v16/workflows/executions/:id/reviews`
records an append-only approve/reject/revoke decision with a stable review ID and
reason. Cancellation retains all existing effects and history. All mutations use
real Worker sessions and CSRF. Module-user reviewers additionally require current
source read/review permission; separate-initiator rules apply to administrators too.

The source publication API returns `executionAllowed` under its current policy.
This is a necessary precondition, never sufficient authority. Tightened limits
cannot silently remain ineffective for an old publication. Previously issued
review IDs and expiry values cannot be renewed by changing a projection.

The administrator panel consumes `workflowSources` from the existing signed SSMA
registry and uses the shared read-only designer. It neither replaces module-owned
screens nor loads module executable assets. Current UI support is administrative;
non-administrator step permissions are enforced and verified at the API boundary.
Scoped programme/financial/peer actions remain on existing dedicated governance
paths until graph support for those scopes is implemented and accepted.

Targeted development commands after `npm run build`:

```powershell
npm run test:automation:definitions
npm run test:workflow:runtime
npm run test:workflow:governance
npm run test:workflow:browser
npm run test:workflow:governance:browser
npm run test:smart:browser
```

These isolated fixtures do not substitute for signed installation, operator
upgrade or the six required real-business acceptance scenarios.

### Shared outbox receipt semantics

The Phase 16 receipt store extends SSMA metadata; it is not a separate transport.
The existing module `sync_outbox` remains the event source. Local receipt commit
precedes local capture acknowledgment and never alters Master acknowledgment.
Subscriptions pin the binding revision, source installation/package and consumer
installation/package. Signed consumer and provider event schemas must agree.
Programme/economic and peer-scoped subscriptions are denied until their established
disclosure and bilateral governance paths are explicitly integrated.

Delivery queues the existing execution within its metadata transaction; external
effects must occur only through the existing coordinator afterward. Five failed
attempts produce a dead letter. An authenticated explicit replay may retry that
same failed receipt, preserving its event identity and payload; delivered or
superseded receipts cannot be replayed as fresh work. A known failed earlier
revision blocks later revisions of that record while unrelated records proceed.
An already delivered higher revision supersedes a late older snapshot. This is
ordering of observed snapshots, not a claim that every intermediate revision was
observed. The payload is bounded event evidence, not an editable shadow record.

These storage functions are verified with PostgreSQL fixtures; production
subscription admission, event publication contracts and polling are not yet wired.

Receipt execution identities are deterministically derived from both subscription
and source event, so independent subscribers cannot merge work. Admission must
use an approved current binding; previously captured work may use its original
explicitly retained binding after substitution. The original provider installation
and package must still match, and a disabled binding denies continuation. Stopping
new intake for an old workflow version does not erase its accepted receipts.

### Governed event execution

Reviewed event subscriptions now enter through authenticated Worker governance and
the signed host broker. The host's existing loop polls up to three source modules
and attempts up to three deliveries per iteration. Successful capture is delayed
one second before another poll; failed capture is delayed five seconds, with its
static error code retained separately from delivery retry state. Captures continue
without Master acknowledgment. An unauthorized subscriber is suspended and receives
no new payload; authorized subscribers are not blocked by that revocation.

Delivery atomically links the original subscriber/event to a unique existing-SSMA
execution, pins original provider obligations and records lineage. Effects occur
only in the coordinator, which revalidates the receipt and current authority on
every step. Observations use source timestamps and revisions rather than the time
a retry happened. Event snapshots and selected scalar observations are read-only
evidence; authoritative business records remain in their source module database.

This is verified with real isolated databases and signed synthetic providers.
Actual installed business scenarios, recovery controls and release acceptance
remain outstanding.

## Sales-owned continuation contract (source package 1.6.0)

`sales.orders.workflow` / `steward.sales-workflow-continuation` v1 is an optional
signed provider, requiring platform 0.16 and explicit `workflowEnabled: true`.
Its durable operations are `sales.workflow.inspect`, `sales.workflow.reserve`
and `sales.workflow.fulfill`. Inputs use an authoritative Sales order UUID;
mutations also require the exact current revision. Results contain only order
identity/revision, status, stock status and whether Inventory is integrated.
Current same-Worker/same-entity sender attestation is required. Private inbox
access remains host-authenticated; a signed declaration does not grant authority.

With `integrationsEnabled`, `smartInventory` and `workflowEnabled` enabled,
confirmation of local orders preserves accepted-price authority but leaves stock
status `awaiting_workflow`. Reserve uses Sales' existing provider-pinned Inventory
outbox; fulfillment invokes the existing Sales resource validation and consumes
the original reservation. A queued request is not completed fulfillment: the
existing Inventory acknowledgment updates Sales. Commands use the established
transactional inbox and original command identity. A different fulfillment intent
for the same workflow fulfillment is rejected for reconciliation, not repeated.
Configuration disabled preserves existing automatic reservation behavior.

The source event `sales.order.changed` references existing `sales_demand`
replication records; there is no separate event bus, database or source migration.
Its schema includes id/revision and the original bounded demand projection.
Conditions must distinguish accepted/awaiting-reservation, reserved and terminal
states; every state update is an observation, not a new authorization. Separate
reviewed event workflows can request reservation and continue after its actual
acknowledgment. Workflow intake never directly owns Inventory stock.

Channel orders and orders with requested production are explicitly excluded.
This capability cannot submit live Shopify/Printify production or fulfillment.
Catalog/Pricing acceptance and verified Inventory provider pins remain enforced
by the original Sales code. The new source package has not yet been installed or
accepted as an end-to-end workflow deployment.

## Procurement requests and internal notifications

Procurement 1.4.0 source declares `procurement.workflow.requests` v1. Its
`procurement.workflow.replenish` and `.propose` operations create module-owned
drafts using a caller request UUID, not a financial approval. `.status` returns
actual current state for the original source installation/package/entity. A
second command with matching intent is idempotent; changed terms conflict.
Explicit `workflowEnabled` configuration and an approved SSMA binding are
required. Existing Procurement human approval/placement operations remain
unchanged. `purchase.status.changed` uses the original `purchase_commitments`
projection, so it adds no independent transport or authoritative shadow records.

Automation declares `workflow.notifications` v1 with durable
`workflow.notification.send` and `.status`. It is an internal inbox provider,
not email/SMS. `notificationsEnabled` is explicit and default-off. Recipients are
the current local administrators and accounts holding `steward.automation.approve`,
from the existing fresh private host authority snapshot. Only the recipient can
read or acknowledge the notice; revoked accounts cannot receive cached replays.
Messages select a fixed approval/exception/failure/completed/deadline category and
an opaque reference UUID, not arbitrary text or private record fields. Following
that reference grants no source-module access. Notices expire within 31 days.

Sender intents preserve the original source identity and terms, including under
concurrent delivery. Status distinguishes internal availability, acknowledgment
and expiry. Acknowledgment is not approval, execution, financial authority or a
business outcome. Audit records and inbox receipts use the existing module
transaction infrastructure. Notifications are not replicated as Master evidence.
Self-provider use still requires registry discovery and an approved SSMA binding;
no module-local shortcut substitutes for Worker governance.


### Bounded parallel dispatch

Independent ready actions may run together within the reviewed `maxParallel` limit
(1–4), only when each signed operation requires idempotency and declares safe retry.
Actions sharing a provider module stay ordered on the original aggregate sequence.
Each branch retains its own attempts/deadline; a successful sibling is not rerun to
retry a failed branch. A rejection suspends the execution and blocks joins while
preserving already committed effects. Cancellation uses the existing suspended
`WORKFLOW_CANCELLED` state and cannot roll back business effects.

Safe successful responses use the existing independent `smart_attempts` journal.
Recovery matches source/provider package and installation identity, operation,
materialized input and both configurations. Changed terms require reconciliation.
Stored observations retain their first response timestamp; recovery does not renew
freshness. Lifecycle locks are shared application locks, with exclusive lifecycle
changes still excluded. This source checkpoint requires installed acceptance before
being described as released.


### Synthetic design preview

The SSDS designer can preview a draft using explicitly entered synthetic scalar
values, assumed provider outcomes and assumed human decisions. The browser-safe
SDK shares the coordinator's pure planner and expression evaluator, but has no
transport, persistence or authorization functions. A preview never creates an
execution identity, business effect, review or finding. It is invalidated when
its draft, assumptions or editor/discovery validity changes. Provider behavior,
full runtime schema enforcement, current permissions, restart safety and actual
timing still require installed acceptance. Reusable templates are unbound draft
patterns, not published workflows or authority grants.


### Inventory shortage events

Inventory 1.7.0 optionally provides `inventory.replenishment.observe` with the
`inventory.replenishment.changed` event on its existing retained replenishment
projection. `workflowReplenishmentEnabled` defaults to false and additionally
requires integrations enabled. With it enabled, new shortage episodes create
`workflow_requested` observations without sending the legacy Procurement command.
Select that status explicitly in the graph and require human review before
requesting Procurement. Other statuses belong to retained legacy requests and
must not be mistaken for new workflow episodes. Existing pending obligations are
never transferred when configuration changes. Rejected or unserved requests need
explicit operational reconciliation; merely replaying an observation does not
create a new shortage or authorize spending. The module's item lock/pending flag,
existing projection stream, shared capture and governed subscription machinery
remain the only paths. No new event transport or business-data copy was introduced.
