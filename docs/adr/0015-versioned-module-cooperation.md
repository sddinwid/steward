# ADR 0015: Versioned module cooperation and canonical evidence

Status: Phase 7 design, implementation and verification in progress.

The inspected 0.6.0 baseline is commit `6a508dc`, preserved by annotated tag `v0.6.0`. Work proceeds on `phase7/business-module-expansion`. Existing application, trusted package installation, isolated databases, enrollment, synchronization and authenticated MCP remain authoritative.

## Gaps identified before shared-component changes

1. SDK 1 accepts only flat CRUD screens and parameterless module MCP reads. It has no explicit optional peer contract or internal integration interface. New business workflows require permission-aware actions, typed line items, bounded queries and declared command authority.
2. The module host authenticates Worker-to-module traffic but does not dispatch module-to-module commands. Business modules cannot safely obtain another module's credential or use its database. Master synchronization outboxes are not a local command bus and must not be repurposed into one implicitly.
3. Runtime requests omit the authenticated human's effective module permissions; module-owned approval transitions need that context without trusting browser-supplied actor fields.
4. Master currently recognizes three storage streams and requires matching module IDs for supply/demand. Independent modules need shared canonical semantic contracts, not hardcoded module names. Procurement arithmetic and aggregate workforce opportunity calculations are absent.
5. The Analyst and evidence UI assume one storage calculation shape. A general capability selection/result contract is needed while preserving existing requests and storage tools.

## Decisions

Add optional, bounded, signed SDK declarations, retaining all SDK 1 existing fields and defaults. All business behavior remains in separately built services. One reusable 0.7 core/runtime foundation may change to understand those declarations; after that foundation is captured, installing/activating/using each module must leave API/frontend image hashes and running processes unchanged. The frozen 0.6.0 images/tag remain available. The installation integrity claim does not mean that a 0.6.0 binary already supports missing interfaces.

Local integration uses a bounded polling dispatcher in the existing module host, not an external broker. Only explicitly declared and operator-enabled peer contracts may execute. Source and target are signed packages on this Worker, active and compatible; target identity and caller authority are host-bound, never taken from browser/model payloads. Internal endpoints are unavailable through ordinary module APIs or MCP. Effective human permission context is forwarded only by the authenticated gateway. No module sees another module's database or gateway credentials.

Each module transaction persists its business change and command outbox together. Targets maintain their own inbox, verify content digests, and make the inbox insertion and authoritative data mutation atomic. ACK loss causes an identical retry. A reused key with changed content fails. Sales reservation/release/consumption and Procurement receiving use explicit pending/success/failure/reconciliation states; there are no distributed transactions. Missing/disabled optional peers leave visible durable pending work and never break unrelated local services. Failed deliveries have bounded batches, retry backoff and observable errors.

New canonical projections contain explicit source identity, revision and freshness through existing synchronization. Workforce publishes approved aggregate tables only, with a minimum-group suppression policy; confidential people, enrollment and achievement rows are never declared replication streams or ecosystem MCP tools. Relationships describe ownership, custodianship and permitted use without granting access to foreign operational databases. Master arithmetic resolves exact authorized source revisions and uses deterministic services, retaining complete evidence and explicit assumptions. Models cannot mutate business data or make employment decisions.

## Verification required before acceptance

Preserve existing manifests/tools/tests; validate malformed declarations, undeclared peers, permission spoofing, disabled/missing peers, replay/content conflicts, concurrent reservations, partial receipts and fulfillment, ACK/crash recovery, secret absence and cross-Worker isolation. Exercise actual browser installation/CRUD and model MCP investigations. Record the new foundation image hashes separately from the 0.6.0 hashes. No Phase 7 completion or 0.7 release claim follows from this design document or an individual compiling module.
