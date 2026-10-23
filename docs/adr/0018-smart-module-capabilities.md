# ADR 0018 — Signed capabilities and hybrid module communication

Status: accepted for Phase 8 implementation; acceptance remains pending.

The v0.7.0 baseline is commit 59a3b865ccc59b2024644e558670f9402632ab2e. Its signed immutable module packages, dedicated databases, authenticated gateway, durable inbox/outbox, per-aggregate causal ordering, declarative UI, replication and reviewed findings remain the foundation.

Add optional versioned capability declarations to signed manifests. A Worker registry derives providers from verified installed descriptors; untrusted metadata cannot register a provider. The resolver fails closed on incompatible contracts, schema fingerprints, permissions, entity scope, sensitivity, configuration or availability. Ambiguity requires an explicit operator preference. Exact schema equality is the initial conservative compatibility rule; this intentionally rejects some safely substitutable schemas instead of accepting an unsafe structural guess.

Approved bindings pin consumer, provider, installation, package digest, capability and contract. Durable work pins its original binding; changing the preferred provider cannot move existing obligations. Approvals retain actor, revision and explanation. Upgrades invalidate approval unless the approved package identity is unchanged. Suspended work requires explicit reconciliation.

Use bounded synchronous module queries for independent reads and commands where appropriate, existing durable module inbox/outbox for asynchronous effects, and Worker-local persisted governance for multi-step workflows and recovery. Master is never a dependency for Worker local availability. A failed coordinator may delay orchestration but must not prevent unrelated module operations.

Shopify and Printify adapters will remain separately versioned modules. External IDs are authoritative within their source; canonical mappings do not equate unrelated variant models. Simulator mode is explicit and isolated. Paid production is disabled by default and requires explicit authorization; a lost response from a non-idempotent external API suspends the operation for reconciliation.

No new framework, cloud service, broker or arbitrary module JavaScript in frontend bundles is introduced. Commercial account validation and all release gates must be reported separately from simulator acceptance.
