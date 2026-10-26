# Workforce 1.1.0 restricted services

This additive version retains the existing authoritative skills, training-course
and position catalogues. It appends migrations and introduces separate private
mission enrollment/employer-referral records. It does not create legacy People
rows for participant aliases or publish their achievements to legacy metrics.
Workforce 1.0.2 remains preserved in the earlier release and image history.

## Opt-in and authority

Configure `syntheticOnly: true`, `missionSensitive: true` and
`integrationsEnabled: true`. Create a **Service programme**, then explicitly
activate private mission services. Its actual creator receives the declared
programme permissions. Administrator status alone does not grant access to
another programme or private case. Team and case-assignment forms govern access
by named account and declared role, with no arbitrary permission JSON editor.

Activation atomically withdraws all approved legacy training and skills
projections before a private enrollment can be accepted. A database latch then
permanently withholds exact legacy training/skills reports and rejects their
republication, including after configuration is switched off. This prevents
remaining-seat differences and repeated completion releases from revealing
restricted participants. Historical rows remain intact. Reversing the guard
requires a separately designed, reviewed migration; it is not a configuration
toggle. Ordinary legacy operations and pre-activation publication still work.

Approve a private service-source relationship identifying the exact Employment
programme, entity and Worker installation, with expiry and purpose evidence.
Approve the normal SSMA workflow and bilateral grant with purpose
`employment.pathways`. Both the core's approved current human and the module's
programme/case permissions are required on every delivery, including cached
retries. Only attested private host context supplies peer identity. Payload
actor/entity fields and unknown private fields are rejected.

## Declared capability

`workforce.pathways` / `steward.workforce-pathways` 1.0.0 provides:

- `training.catalog`: authorized paginated original course catalogue and current
  private operational capacity.
- `training.reserve`, `training.confirm`, `training.cancel`, `training.status`:
  durable, idempotent, audience-scoped service enrollment operations.
- `employment.catalog`: original authoritative positions and current capacity.
- `employment.request`, `employment.status`: pending employer referrals and
  authenticated response receipts.

The exact closed schemas are in `src/pathway-contract.ts` and the signed
manifest. A service programme is distinct from a training course; commands carry
both the receiving authority programme and source Employment programme. Source
aliases are scoped to this Worker/module audience. No names, assessments,
protected attributes, source participant identifiers or case notes are accepted.

Seat reservation includes existing legacy enrollments and private reservations.
The module transaction lock, locked course row and unique participant/course
index prevent races and duplicates. Cancellation releases an unfinished seat;
completed cohorts keep their historical seat and achievement. A completed
achievement cannot be cancelled or silently rewritten.

Confirmation does not complete training. An authorized local instructor must
record a substantive attendance observation, mark participation, then explicitly
record completion after the actual course interval ends. Completion derives the
achieved skill from the original course record. Receipts expose only its skill
codes and authoritative confirmation/participation/completion timestamps, never
the instructor's identity or notes.

An employer request is pending only. A local authorized human records a review
and separately accepts or rejects it. Acceptance checks remaining authoritative
position capacity. A partial unique index prevents multiple active claims on
the same position by one scoped participant alias. Employer withdrawal is also
an explicit local human decision. No model score makes an employment decision.

## Verification

```powershell
npm --prefix modules/workforce ci
npm --prefix modules/workforce run build
node modules/workforce/generate-manifest.mjs
node scripts/test-workforce-services.mjs
node scripts/test-business-modules.mjs
```

The isolated PostgreSQL/API tests cover baseline behavior before opt-in,
withdrawal before private reservation, sticky publication protection, closed
peer requests, concurrent one-seat reservation, idempotency, actual elapsed
human completion, employer response, restart/revocation, and absence of aliases
from every legacy projection. The business-module regressions also run actual
legacy Workforce completion and matching.

These are synthetic operational tests. Signed package/registry routing,
cross-Worker transport and browser demonstration are separate platform gates.
No real clients, credentials, employers or production employment decisions are
used. Exact private capacity is not ecosystem MCP evidence; Employment publishes
only approved sealed outcomes and leaves shared capacity unknown when it lacks
an exclusively assigned, deduplicated quota.
