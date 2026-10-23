# ADR 0016 — Module-owned business transactions

Status: accepted for the Phase 7 development branch; deployment acceptance pending.

Procurement, Sales, Assets and Workforce are independently packaged services. A small `@steward/business-kit` library supplies closed-schema record APIs, revision checks, transactions, local audit records, pagination and durable integration plumbing. It contains no business states or business-specific tables. Worker and Master images do not include this library or the four module implementations. Each signed module contains its own manifest, schemas, transitions, SQL migrations and declarative screens.

Business writes serialize under a transaction-scoped advisory lock in that module's dedicated database. This favors straightforward consistency over high write throughput for the MVP. No transaction accesses another module's database. Sources commit business state and command outboxes together. Targets commit business effects and inbox receipts together. Command identity is bound to canonical content; duplicate identities with different content are rejected. Sequence numbers are scoped to source module and aggregate. Future sequence gaps are retryable; accepted commands and durable business rejections advance the sequence.

A rejected target operation rolls back to a savepoint before its rejection receipt commits. This permits subsequent compensation without preserving partial effects. Lost acknowledgments repeat the same target result. Acknowledgments bind to the command digest and commit source status changes atomically. Transport failures retain pending state and bounded backoff. Terminal stock-receipt rejection requires an explicit authorized retry after correcting the cause. No destructive rollback is offered.

Inventory 1.3 adds authoritative reservation and movement records while retaining the 1.2 item table and data. Sales records partial reservations and never marks pending/rejected inventory movements fulfilled. Cancellation queues ordered release. Replenishment produces a linked draft requisition, never an approved purchase order. Receipt movement identities preserve purchase references and prevent duplicate increases.

Assets keep owner, custodian, user and access basis separate. Workforce accepts synthetic references and synthetic names only. Person/enrollment/achievement and candidate-matching APIs require separate local permissions. Only expressly approved aggregate projection tables are declared for Workforce replication; individual records have no ecosystem MCP contribution.

Validation at this increment: root build; 38 existing/SDK tests; five disposable PostgreSQL business suites covering state machines, permissions, concurrency, restart persistence, replay, lost acknowledgments, compensation and aggregate privacy. Running-image installation, browser verification, Master expansion and real-model validation remain outstanding and are required before release acceptance.
