# Steward Phase 16 — Business Automation & Workflow Designer

## Mission

Implement **Phase 16: Business Automation & Workflow Designer**, targeting `v0.16.0`.

Phase 15 (`v0.15.0`) has completed all 18 mandatory acceptance gates and is locally tagged.

**Mandatory prerequisite: Publish and verify Phase 15 on GitHub before beginning any Phase 16 implementation.**

Proceed autonomously through implementation, internal checkpoints, testing, verification, and final release acceptance. Do not stop for approval between ordinary development steps unless a material architectural decision, destructive action, or genuine authorization issue requires intervention.

## 0. Mandatory GitHub synchronization

The existing private repository is:

`https://github.com/sddinwid/steward.git`

The remote `main` branch currently represents the verified Phase 14 baseline (`811793c`).

Before making any Phase 16 changes:

1. Inspect the current Git branch, working tree, release tags, remotes, and local commit history.
2. Verify that the local `v0.15.0` tag resolves to the accepted Phase 15 release, including its final acceptance documentation and release evidence.
3. Account for any uncommitted changes after the Phase 15 release. Preserve them without silently incorporating them into the release.
4. Verify that the local Phase 15 history descends from the existing remote `main`.
5. Confirm the target GitHub repository is private.
6. Push the exact accepted Phase 15 history to remote `main`, using a normal fast-forward update. Never force-push or rewrite remote history.
7. Push the annotated `v0.15.0` release tag.
8. Fetch or query remote references and verify that `main` and `v0.15.0` resolve to the expected accepted release identities.
9. Confirm no Phase 16 or unfinished post-release work was included.
10. Confirm the remote default branch remains `main`.

Do not push unrelated branches, private deployment directories, credentials, generated secrets, operational databases, or sensitive evidence.

If an ordinary full-history push is rejected, investigate the cause. The earlier Phase 14 publication required incremental ancestor pushes because GitHub rejected the initial complete-history update. A similar safe, incremental fast-forward strategy is acceptable if necessary.

**Do not begin Phase 16 until the GitHub synchronization is verified.**

Report the resulting remote commit and tag identities.

## 1. Architectural baseline

Phase 16 must extend the existing Steward architecture, not replace it.

Preserve and reuse:

- Independently installable, signed Smart Modules.
- SSMA capability declarations, registry, compatibility resolution, and approved provider bindings.
- Governed synchronous APIs and durable asynchronous communication.
- Shared Steward event infrastructure, including subscriptions, durable delivery, retries, replay, recovery, observability, and isolation.
- Module-owned authoritative databases, read-only synchronized projections, and immutable transaction snapshots.
- Existing module inbox/outbox, stable command identities, idempotency protections, issuance journals, and reconciliation semantics.
- Master/Worker separation and Worker independence during Master outages.
- The Steward Shared Design System (SSDS), dynamic module UI renderer, and established administrative controls.
- Existing authentication, permissions, tenant/legal-entity boundaries, audit trails, and approval models.
- All Phase 1–15 features, migrations, installed packages, identities, configuration, historical transactions, and deployment data.

Do not introduce a parallel capability registry, competing event bus, independent authorization system, incompatible UI framework, or redundant workflow engine.

Before implementation, inspect the actual Phase 15 implementation and document what can be reused.

## 2. Phase 16 functional scope

### A. Business Automation Smart Module

Develop an independently packaged, signed Business Automation & Workflow Designer Smart Module.

It should provide:

- Workflow creation, editing, validation, publication, activation, suspension, and versioning.
- Business event triggers and authorized manual triggers.
- Scheduled triggers where supported by the existing infrastructure.
- Conditional branching and rule evaluation.
- Sequential and bounded parallel execution where safe.
- Capability-based actions through SSMA.
- Human approval and rejection steps.
- Notifications and task assignments.
- Execution monitoring, history, and diagnostics.
- Safe retry, timeout, cancellation, and reconciliation behavior.
- Reusable workflow definitions and templates.

The module must retain its own authoritative configuration and workflow records while using platform-governed execution infrastructure.

### B. Visual Workflow Designer

Build an intuitive visual designer using SSDS.

Users should be able to construct workflows with nodes representing:

- Trigger
- Condition
- Action
- Approval
- Delay or wait
- Branch
- Join
- Notification
- Completion

Support visual connections, configuration panels, validation feedback, and read-only execution visualization.

The designer must provide accessible keyboard interaction, understandable error messages, and responsive layouts.

Do not create a new competing design system.

### C. SSMA capability discovery

The designer must discover available module capabilities through the existing signed SSMA registry.

For each capability, show appropriate metadata, including:

- Provider and capability identity
- Contract version
- Supported operations
- Input and output schemas
- Required authorization
- Sensitivity classification
- Availability and configuration status
- Approved provider binding status

Allow administrators to establish or select governed bindings using existing SSMA mechanisms.

A workflow must never acquire execution authority merely because a compatible provider was discovered.

Handle missing, disabled, incompatible, upgraded, ambiguous, or unavailable providers explicitly.

### D. Shared event integration

Use Steward's existing event infrastructure for asynchronous workflow triggers and execution.

Implement governed event subscriptions with:

- Tenant and legal-entity boundaries
- Event schema validation
- Stable event and correlation identities
- Duplicate-safe processing
- Durable delivery and replay
- Source revision and causal ordering where relevant
- Retry and dead-letter/reconciliation behavior
- Observable event-to-workflow execution lineage

Avoid creating an independent automation-specific event transport.

### E. Workflow execution and governance

Extend existing governed SSMA execution where necessary.

Support deterministic workflow evaluation with explicit, bounded execution semantics.

Requirements include:

- Immutable published workflow versions.
- Validation before activation.
- Explicit authorization and approval.
- Runtime permission revalidation.
- Stable execution and action identities.
- Persisted workflow progress.
- Provider pinning for existing obligations.
- Safe resume after interruptions.
- No blind repetition of uncertain financial, production, payment, or external effects.
- Human reconciliation when outcome certainty cannot be established.
- No unauthorized mutation of another module's authoritative data.

Use declarative workflow definitions. Never evaluate arbitrary user-provided JavaScript, Python, SQL, or model-generated executable code.

### F. Conditions and data handling

Provide a bounded rule-expression model supporting comparisons, Boolean operators, controlled calculations, and branching.

Validate all referenced fields against approved capability or event schemas.

Preserve source provenance, sensitivity, version, and freshness.

Workflow variables must not become an unauthorized shadow database of another module's records.

Define how values are passed between steps, how missing or stale data is handled, and how sensitive outputs are protected.

### G. Human-in-the-loop approvals

Support authorization-aware approval steps with:

- Named approver roles or permitted principals
- Approval and rejection
- Expiration and escalation policies
- Reason and audit records
- Separation-of-duties controls where required
- Durable continuation after approval
- Revocation checks before consequential effects

AI agents must not approve their own recommendations or bypass human authorization.

### H. Worker/Master operation

Worker automation must remain functional when Master is offline.

Master may receive authorized workflow analytics and summaries, but it must not become a required dependency for local operational automation.

Cross-Worker automation must use existing federated permissions and bilateral authority contracts. Discovery alone must never authorize cross-entity operations.

### I. MCP readiness

Expose appropriately scoped read-only workflow discovery, status, and diagnostic capabilities through Steward's existing MCP infrastructure where justified.

Do not allow MCP clients or AI models to create, approve, activate, or execute sensitive workflows without the established authenticated governance process.

Preserve the separation between AI recommendations, deterministic execution, and business authority.

The more extensive AI integration and adapter-building functionality remains part of Phase 17.

## 3. End-to-end acceptance scenarios

Design and implement realistic synthetic business workflows demonstrating the new module.

At minimum, verify:

**Scenario 1 — Sales fulfillment**

An accepted Sales order triggers inventory availability evaluation, governed reservation, and fulfillment continuation or an authorized exception path.

**Scenario 2 — Procurement approval**

An inventory threshold event initiates a replenishment proposal, routes a human approval, and invokes the authorized procurement capability only after approval.

**Scenario 3 — Cross-module notification**

A valid business event triggers a conditional notification or assignment using an available approved provider.

**Scenario 4 — Failure and recovery**

Interrupt the relevant Worker, module host, or provider during an active workflow. Restore the service and verify that execution resumes correctly without duplicate business effects.

**Scenario 5 — Provider substitution**

Replace an approved provider for new work. Confirm existing obligations retain their original provider and cannot be silently transferred.

**Scenario 6 — Unauthorized operation**

Prove that insufficient permissions, invalid contracts, expired approvals, cross-entity violations, or revoked bindings stop execution before unauthorized effects.

Use real installed modules, signed packages, authenticated interfaces, and actual persistence wherever possible. Clearly label synthetic providers and fixtures.

## 4. Verification and regression requirements

Phase 16 must be an independently verified release.

Verify:

- Complete monorepo build.
- Full existing regression suite.
- New workflow-definition and rule-expression tests.
- SSMA contract and discovery compatibility.
- Authentication, CSRF, permissions, and legal-entity isolation.
- Duplicate delivery and idempotency.
- Concurrent execution and ordering.
- Worker and provider outage recovery.
- Workflow version changes.
- Provider replacement and historical obligation preservation.
- Approval, revocation, expiration, and reconciliation.
- Browser-based visual designer operation.
- Master outage independence.
- Existing Phase 15 Catalog and Pricing behavior.
- Existing MCP and AI investigation regressions.
- Data-preserving upgrade from the accepted Phase 15 deployment.
- Fresh installation and repeated provisioning.
- Final accepted redeployment.

Preserve existing databases, tables, records, account credentials, secrets, volumes, module versions, original provider obligations, and historical evidence.

Do not reset or reinitialize the retained operator deployment to pass acceptance.

## 5. Release management

Use meaningful internal commits and checkpoints throughout development.

Build the final candidate from an identified immutable source commit.

Produce:

- Architecture and contract documentation.
- Developer documentation for adding workflow-compatible capabilities.
- Operator installation and recovery instructions.
- Visual designer user documentation.
- Demo/presenter guide.
- Automated verification reports.
- Browser acceptance evidence.
- Upgrade and preservation evidence.
- Release gates.
- Checksummed release archive and manifest.
- Final acceptance report.

Retain failed verification evidence and distinguish corrected reruns from original failures.

Complete acceptance before promotion.

Target final tag:

`v0.16.0`

Do not tag an incomplete release.

Do not push Phase 16 development or its release to GitHub unless separately authorized. The explicit GitHub publishing authorization in this prompt applies to the accepted Phase 15 release only.

## 6. Execution instructions

Proceed autonomously through the approved scope, making reasonable engineering decisions consistent with the established architecture.

Do not stop after scaffolding or a partial demonstration.

When a failure occurs, investigate and correct the underlying issue rather than weakening tests, bypassing governance, altering protected business records, or declaring success prematurely.

Maintain a clear distinction between implemented functionality, verified behavior, synthetic demonstrations, and commercial production readiness.

At completion, report:

1. Phase 15 GitHub push verification and remote commit/tag identities.
2. Phase 16 architecture and implemented capabilities.
3. Changes to SSMA, shared events, and execution infrastructure.
4. Installed module and UI functionality.
5. Full test results and acceptance evidence.
6. Preservation and deployment verification.
7. Final release commit and `v0.16.0` tag status.
8. Remaining limitations and deferred functionality.

**Start with Phase 15 GitHub publication and verification. Only then begin Phase 16 development.**