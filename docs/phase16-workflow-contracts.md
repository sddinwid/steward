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
