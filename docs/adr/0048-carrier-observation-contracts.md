# ADR 0048 — Carrier-owned observations and local analytical reads

Status: design checkpoint; runtime implementation and release acceptance pending.
Date: 2026-11-10.

## Context

Sales already owns order/fulfillment quantities and Inventory acknowledgments. Printify owns its external production observations; simulation-fulfillment is explicitly synthetic. There is no general parcel-carrier module. Do not repurpose those authorities or equate Sales fulfillment completion with carrier delivery.

Existing business-kit persistence, module SDK manifests, dedicated databases, SSMA registry/resolver, governed bindings, module gateway, declarative UI and Worker MCP discovery remain the platform architecture. Carrier additions must use them rather than introduce another registry or authorization system.

## Decision

Build a future `packages/carrier-kit` with a transport interface, shared ingestion/reconciliation and synchronization services. Independently packaged carrier modules inject provider-specific authentication, normalization and documented correction semantics. Prefer composition; a thin base class is permissible but must not embed provider permissions or a universal status ordering. No real carrier implementation is included in this checkpoint.

Carrier modules own registrations, package identities, event observations, retrieval attempts and derived summaries. Consuming modules own orders and business consequences. Shared code supplies deterministic rules, but reconciliation executes inside the owning carrier module and its database. Every obligation retains its original provider installation and authority package identity; an execution upgrade records its execution identity separately.

MCP and ordinary UI reads use retained module data only. External verification and refresh are separately authorized operations. No automatic upstream MCP proxying or carrier refresh during a read. No model may add provider authority, purchase labels, schedule pickups or publish evidence through these tools.

The first implementation targets a durable simulator and one carrier, then proves contract portability with a second carrier. Missing credentials mean not configured. Simulator results never establish sandbox/live compatibility. Master projection and analytics are deferred pending an explicit disclosure contract and carrier retention/sharing review.

## Identity and reconciliation

Use module-local UUID registration, shipment and package identities under exact entity, Worker installation, provider installation, connection/account scope and environment. Carrier tracking numbers are lookup attributes, not globally unique keys. Preserve a carrier shipment discriminator/ship date when known; registration time is not evidence of a shipment cycle. Ambiguous reuse requires resolution rather than merged histories.

Authenticate scope from the existing gateway context. Reject foreign source references and never accept body-provided entity or installation fields as authorization. Private carrier account identifiers stay in configuration, represented by opaque account scope IDs in observations.

Retain immutable allowlisted observations and separate sync attempts. Deduplicate using scoped provider event identity plus canonical content digest; absent stable event IDs use a versioned canonical fingerprint of allowed fields. Exact repeats share one logical event but retain retrieval provenance. Changed content for the same identity is a conflict unless documented provider revision/correction semantics establish supersession. Missing timezones are unknown, not silently local/UTC.

Reconciliation considers package identity, event time, correction relationships and provider semantics. Receipt order alone and fixed status rankings are insufficient. Late older events do not regress a summary. A supported correction may revise a delivered conclusion; preserve the superseded observation. Contradictory evidence without a supported ordering yields ambiguity. Never invent delivery or resolve an exception from missing rows.

Freshness is computed at read time from stored timestamps and a reviewed policy, not a permanently stored boolean. Complete response coverage is distinct from complete shipment history and complete delivery. Unknown package totals cannot imply whole-shipment delivery. Partial responses may append validated evidence but cannot erase prior history or advance complete-success freshness.

## Security and recovery

Persist idempotency receipts scoped to actor, operation, registration and request ID with canonical input digest. Same key/different input is rejected. Use bounded persisted jobs/leases for external work, network I/O outside business transactions, and generation/approval checks before committing results. Resume expired leases after restart; avoid unlimited retries, including token refresh loops. Honor validated Retry-After within policy bounds; otherwise bounded exponential backoff with jitter. Credential rejection requires intervention, not a tight retry loop.

Do not retain whole raw responses by default. Keep status codes, bounded sanitized descriptions and evidence fingerprints; exclude addresses, names, signatures, credential values and provider URLs from normal MCP responses. Carrier terms, retention periods and deletion policy require separate verification before live retention. Internal user approval cannot override carrier rights. Proof-of-delivery documents are outside v1.

## UPS native MCP

The official UPS portal links an MCP server. Its README documents tracking and address-validation tools, OAuth client credentials, test/production selection and a Python/stdio invocation. The portal guide itself returned only its web shell during this review; the linked official repository supplied the details.

An upstream MCP transport can be evaluated alongside direct REST behind the same carrier interface. It does not replace Steward storage or governance. If selected, pin and review the dependency, isolate the process/secret scope, enforce tool and endpoint allowlists, bound responses/timeouts, and parse its output as untrusted evidence. Do not dynamically install arbitrary upstream tools or expose them to Steward's model. The current checkpoint adds no Python dependency or upstream process.

Sources checked 2026-11-10:
- https://developer.ups.com/api/reference/mcp/guide?loc=en_US
- https://developer.ups.com/
- https://github.com/UPS-API/ups-mcp/blob/main/README.md

No quota, price, retention entitlement or account eligibility is asserted here. They remain external acceptance gates.

## Consequences

Local evidence supports offline reads and bounded API use at the cost of explicit staleness. Common contracts do not eliminate carrier-specific interpretation. SDK connector allowlists and operator egress tooling need deliberate additions before live modules can run. Draft TypeScript contracts are design artifacts, not runtime validation or signed SSMA packages. See [the implementation plan](../design/carrier-v1/README.md) and [acceptance examples](../design/carrier-v1/acceptance-examples.ts).
