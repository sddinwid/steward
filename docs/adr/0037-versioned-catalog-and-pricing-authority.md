# ADR 0037: Versioned catalog definitions and separate pricing authority

Status: accepted for Phase 15 implementation; operational acceptance pending.

Catalog owns entity-scoped commercial offering definitions across physical, digital, service, subscription, rental and bundle types. Inventory, Procurement, Sales, fulfillment and mission modules retain their operational authority. Pricing is independently installable and supports both pinned Catalog subjects and legacy SKU subjects.

Version 1 contracts use closed schemas, trusted runtime ownership and explicit provider installation/package provenance. Extensions require a validated, pinned definition. Bundle graph validation and persisted uniqueness belong to the Catalog database transaction, beyond the contract's self-reference checks.

Integrations use existing SSMA discovery, approved bindings, durable routing and acknowledgments. A response's provider identity comes from the host's actual route receipt. There is no parallel integration mechanism. Provider substitution never transfers existing obligations.

Money uses exact bounded integer minor units with an explicit scale of two and a supported currency set; no implicit conversion. Pricing proposals require module-owned human approval policies. A quote has bounded validity and accepted Sales decisions become immutable historical snapshots. Missing costs stay unknown; estimated contribution is not net profit.

The module host supplies immutable local provider provenance and fresh eligible reviewer identities. This snapshot grants no approval by itself: module policy enforces reviewers, quorum, separation and exact terms. Signed metadata does not grant account permissions.

SSDS gains versioned generic nested forms and read-only POST previews rather than hardcoded Catalog/Pricing screens. Preview discovery and execution require the declared operation permission. Preview transactions cannot perform database writes or enqueue integration work. Explicit durable read requests remain separate auditable operations.

Later workflow design, adapter generation, campaign execution, recurring payments and full rental/tax engines remain deferred. Live commerce mutations remain disabled.
