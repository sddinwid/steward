# Exclusive programme training capacity and employment opportunities

Status: implementation decision; deployment acceptance is recorded separately.

Workforce remains authoritative for courses, positions and their capacity. A
programme manager explicitly approves an immutable allocation for one canonical
resource and an exact source organization, Worker, module and programme. New
allocation claims never adopt historical reservations. Revocation releases only
unused authority; existing claims retain their original provider identity and
continue consuming capacity.

Allocation approval, resource changes, legacy enrollment and service reservation
serialize under a module-database transaction lock. Physical claims plus unused
exclusive allocations cannot exceed the canonical resource capacity. Once a
source has approved allocations of a type, expiry, revocation or a different
resource choice cannot silently fall back to shared capacity. Current resource
revision and terms must match the reviewed allocation.

The optional signed `workforce.program-capacity` capability has separate
`training.read` and `employment.read` operations, permitting independently
approved training and employer providers. They use ordinary SSMA discovery,
bindings, exact package pins and workflows. The response contains allocation
authority and observation timestamps, never participant identities. Missing,
failed, expired or stale authority remains unknown.

Employment preserves the full private observation. Local authorized programme
screens can display exact remaining capacity. Publication requires an observation
at or before the immutable cohort cutoff, within five minutes of that cutoff and
publication, with current validity and matching programme/provider authority.
Later observations do not become historical evidence. Existing sealed cohorts
are never rewritten to add capacity.

Private employment observations include their approved slot total so remaining
opportunities cannot silently become a case-count proxy. If any slots have been
claimed, public employment opportunities remain unknown. Similarly, a public
training allocation can retain its explicitly approved total, while remaining
training seats are unknown whenever claims would reveal a complement. The
private totals and withheld claim counts are not added to Master projections.

`scripts/verify-phase13-capacity.mjs` exercises new resource allocations and
governed reads after the original six-case pathway. It preserves case, check-in,
reservation and existing sealed-publication records. Clean-install acceptance
runs it before the first cohort cutoff; retained earlier cohorts keep their
original unknown fields.
