# ADR 0044: Business Automation extends governed SSMA execution

Status: accepted design for Phase 16; implementation and deployment pending.

## Existing implementation inspected

`packages/module-sdk/src/capabilities.ts` defines signed operation/event schemas,
contract compatibility, sensitivity and provider ownership. Worker
`smart-modules.ts` discovers only verified installed providers and owns explicit
binding/workflow governance. `smart-routing.ts` pins obligations and commands to
original provider installations and packages, including bilateral peer grants.
`smart-executor.ts` already coordinates fixed sequences using row locks, stable
command IDs, bounded retries and a separately committed issuance journal.
`business-kit` provides dedicated module records, request idempotency, audit,
inbox/outbox and transactional acknowledgment hooks. Replication outboxes and
the host dispatcher provide existing durable transport. MCP already exposes
read-only governed workflow status. SSDS renders signed data-only screens.

The current coordinator lacks graph dataflow, wait/approval nodes, event
subscriptions and execution visualization. Event declarations alone do not
constitute a working subscription API. These gaps must be implemented and tested,
not described as existing features.

## Decision

Add an independently signed Business Automation module owning definitions,
immutable published versions, templates and business-facing workflow records in
its dedicated database. Extend the existing SSMA coordinator for bounded graph
progress and governance; do not create a second executor, registry or event bus.
Execution projections in the Worker store reference original module publication
identity and digest. They do not become mutable authoritative definitions.

Add data-only graph/rule contracts to the SDK. Nodes have stable IDs. Graphs are
bounded DAGs with explicit terminal paths, joins, conditions and time budgets;
no user code, scripts, SQL, expression eval or unbounded loops. Schema-approved
field references use explicit provenance and freshness. Missing/expired values
fail closed rather than silently becoming zero or false. Controlled arithmetic
uses safe integers with overflow/divide-by-zero protection.

Actions remain subject to signed consumer requirements, approved bindings,
runtime authorization, provider identity pins and original issuance journals.
Discovery never grants execution authority. A workflow's publication approval
does not replace a human approval node or authorize another entity. Cross-Worker
actions retain existing bilateral contracts. Uncertain effects require explicit
reconciliation; cancellation cannot undo an already committed provider effect.

Shared event delivery must gain governed subscriptions and durable per-subscriber
receipts without changing existing replication acknowledgments or losing events
when Master is offline. Source identity, event identity, schema, revision,
causality and subscription revision are retained. Replay cannot create a second
execution for the same subscription version and source event.

The visual designer is an optional signed contribution rendered with SSDS, not
an executable module asset or hardcoded replacement for the generic renderer.
It must support keyboard operation and read-only execution history. Sensitive
outputs stay within approved local access scopes; Master/MCP receive only
explicitly authorized summaries. No AI governance authority is introduced.

## Verification obligations

Legacy workflows/packages remain valid. All original migration bytes remain
unchanged. New database migrations are additive. Acceptance must exercise actual
installed signed modules, authenticated UI, durable interruptions, revocations,
provider substitution, duplicate events, bounded parallelism and data preservation.
The six requested scenarios and full release gates remain mandatory.
