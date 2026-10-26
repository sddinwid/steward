# Housing Management 1.0.0

Independently packaged synthetic Housing Management for Steward 0.13.0. This
module owns housing operations in its dedicated database. It does not own asset
title, custody, or property management authority. Those remain in Assets 1.1.0's
signed `property.authority` contract. No real participant records are supported.

## Build and check

From the repository root, after the shared packages have been built:

```powershell
npm --prefix modules/housing-management ci
npm --prefix modules/housing-management run build
node modules/housing-management/generate-manifest.mjs
node scripts/test-housing-management.mjs
docker build -f modules/housing-management/Dockerfile -t steward/housing-management:1.0.0 .
```

The manifest generator deterministically validates the signed-package metadata
and records all four migration checksums. The PostgreSQL test creates and
cleans up one isolated database container and a private temporary password file;
it does not modify the operator stack. Its Assets verification response is an
explicit contract fixture, not proof of real SSMA delivery. Platform acceptance
must exercise the actual governed Assets-to-Housing route separately.

## Operator setup

Install the signed package using the existing Worker Module Manager. Configure
`syntheticOnly: true`; enable `integrationsEnabled` only when the governed routes
are approved. The module requires an enrolled organization identity supplied by
the trusted runtime. No company ID or credentials belong in module settings.

1. Create a Housing programme with its currency and the Assets authority
   programme, legal entity, Worker installation and module IDs. The actual
   creator receives an explicit programme-team grant;
   local administrator status alone does not grant programme or case access.
2. Configure the existing SSMA registry and approved binding/peer grant for
   `property.authority` catalogue and verify operations. Assets must have an
   explicitly reviewed management grant for this Housing entity and programme.
3. On Programmes, refresh the approved property catalogue. Create a Property
   authority reference by selecting an approved asset. Add buildings and units.
   Owner/custodian/user/manager identities appear only in the provider receipt;
   Housing cannot edit or manufacture those authoritative relationships.
4. Create and approve an Authorized referral source specifying the exact source
   programme, legal entity, Worker installation, `steward.housing.services`
   module, purpose explanation and expiry. This is additional to the bilateral
   platform grant; it does not replace the SSMA registry or permissions.
5. The bilateral housing grant purpose must be `housing.placement`. Its source
   and destination programmes must match the request. The currently authorized
   destination approver must retain `housing.write` and the applicable case
   relationship (or explicit `program.all-cases`).

Every outbound property command additionally has a private immutable dispatch
authority row containing the exact audience, command digest and original human
requester. `/dispatch-authority?q=<command UUID>` returns only its minimal
authorization tuple after checking the current programme manager and original
requester's current housing permission. The host and Worker must verify that
tuple against the chosen signed provider before each attempt. Provider receipts
must match the saved destination and source programme, and carry the approved
grant/binding ID. Changing a programme's Asset destination never retargets an
existing command or property obligation; register an explicitly authorized new
property reference for new work.

Programme team roles and case assignments use the shared programme forms. The
coordinator can delegate only permissions held in that programme; the final
programme manager cannot be removed without appointing a successor. Worker
gateway permissions and module-owned relationships are both required.

## Ordinary staff workflow

All screens use SDK declarative navigation, fields, reference selectors and
operations. There are no module-specific screens compiled into Worker core.

An authorized Participant Services referral creates **requested** status only.
In Placement review, select a suitable unit and save a substantive review
reason. Verify the property's current authority, then explicitly:

1. Record suitability review.
2. Approve placement.
3. Reserve unit.
4. Confirm occupancy during its requested interval.
5. Record due 30/90-day follow-up observations when the milestone has elapsed.
6. Record departure when occupancy actually ends.

Each action records the actual human account and timestamp. Requests and
referral terms are immutable. Peer calls and models cannot approve, reserve or
confirm occupancy. Consent/documented authority must remain valid for each new
placement transition. Assets verification is deliberately short-lived (at most
60 seconds); refresh it when instructed. Loss of Assets or Master connectivity
does not evict occupants or prevent local reads, maintenance, observations or
departure. New placements fail closed when current authority is unavailable.

Reservations cover whole units; bed-sharing is outside this package. Native
PostgreSQL exclusion constraints prevent overlapping unit **and participant**
reservations. Confirmed actual occupancy holds the unit until explicit human
departure, even after its expected end. Future conflicting reservations must
be resolved before confirmation; expected dates do not silently terminate
occupancy. Maintenance restricts new work but never automatically evicts an
occupant. Resolving a restriction or departing restores availability only when
no other reservation or operational restriction applies.

Use the same original `requestId` after an uncertain action response. Repeated
receipts survive restarts and cannot be reused with changed input. Current
programme/case authorization is checked before returning a cached receipt.
Successful writes whose separate audit transaction fails are reported as
possibly committed and require reconciliation, not blind replay under a new
identity. No destructive rollback is performed.

## Analytical disclosure

Overview and operational availability are Worker-local and permission scoped.
Occupancy and follow-up lists additionally require the current case relationship.
Only `publishedAggregates` is exposed to MCP. Private placement APIs, notes,
aliases and exact operational availability are never analytical MCP tools or
replication streams.

Set a closed canonical programme reporting period. Record actual expenses in
integer minor currency units with that exact period. Create an Aggregate
disclosure request and explicitly approve/seal it. Counts are calculated from
persisted housing operations; staff cannot submit arbitrary metric vectors.
The shared mission disclosure policy suppresses the entire related family for
small/differentiable groups and prevents cohort edits, overlapping releases and
cross-release reuse of the same alias. Suppressed and unrecorded financial
values remain unknown, including approved funding and estimated unit cost.
Costs never imply available mission funding.

The sole replication stream is `mission_aggregates_v1` with closed `id`,
`revision`, `projection` columns and a tagged programme-aggregate envelope.
The complete source/member ledger remains private. Source identity comes from
enrollment, not browser configuration.

## Verification and limitations

The isolated HTTP/PostgreSQL suite verifies scoped creator authority, property
references, peer attestations and unknown-field rejection, live revocation on
cached requests, human approval stages, case filtering before pagination,
denied-read audit privacy, native overlap prevention, maintenance safety,
elapsed follow-up, restart/idempotency, immutable/suppressed releases and six
individually reviewed synthetic placements in twelve units. The six-case
release produces 12 units, 6 occupied, 6 available, 6 housed/retained participants
and USD 600000 minor units of explicitly recorded operating costs. No available
funds or unit-cost estimate is inferred.

These are synthetic operational outcomes. This module does not provide live
property-system connectivity, real client suitability determinations, legal
lease enforcement, HMIS certification, benefit decisions or automated eviction.
Full browser, cross-Worker delivery, outage and release gates are recorded by
the platform verification report rather than claimed by this package test.
