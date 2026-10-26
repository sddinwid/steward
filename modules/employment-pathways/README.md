# Employment Pathways 1.0.0

An independently packaged Steward 0.13 synthetic service module. Workforce
1.1.0 remains authoritative for skill definitions, courses, seats, positions,
attendance, completion and employer decisions. Employment owns authorized
participant pathways, human eligibility review, dispatch, observed placement
and retention. Its dedicated database contains no competing training catalogue
or position records: provider responses are explicitly cached reference options.

## Setup

Build the shared SDK/business/contracts/mission packages first, then:

```powershell
npm --prefix modules/employment-pathways ci
npm --prefix modules/employment-pathways run build
node modules/employment-pathways/generate-manifest.mjs
node scripts/test-workforce-services.mjs
node scripts/test-employment-pathways.mjs
docker build -f modules/employment-pathways/Dockerfile -t steward/employment-pathways:1.0.0 .
```

Install its trusted signed package through Module Manager. Configure
`syntheticOnly: true` and approve integrations before enabling
`integrationsEnabled`. Trusted enrollment supplies source entity identity; no
credentials or company IDs are compiled into the module.

Create a programme with its currency and the intended training and employer
authority destinations. Each destination explicitly identifies programme,
entity, Worker installation and provider module. They may be different Workers.
The programme creator receives an explicit relationship; broad administrator
permissions do not bypass programme/case grants. Delegate declared team roles
and case assignments using the normal module forms.

Authorize the existing SSMA workflows and bilateral grants for
`workforce.pathways` operations. Training and employment have distinct durable
obligation identities so provider selection can differ without transferring an
existing reservation. Each obligation pins its original provider installation,
package and audience. Changing programme defaults does not transfer old work.

Workforce must activate its restricted services and approve the exact Employment
source programme/entity/Worker. Employment must approve the exact Participant
Services source programme/entity/Worker under Authorized service sources. Both
bilateral grant purposes are `employment.pathways`. Module-owned relationships
supplement the signed registry/workflow authority; none bypass it.

## Staff workflow

The package contributes declarative screens, forms, selectors and actions to the
existing modular SSDS renderer. Worker core contains no hardcoded Employment UI.

1. Refresh the training and employment catalogues from Programmes. Their visible
   state is pending, ready or unavailable. A queued command is not a delivered
   catalogue. Rejections leave a clear recovery message; existing records stay.
2. Authorized Participant Services requests create pending pathways only. They
   contain a scoped synthetic alias, referral type, consent/authority reference,
   expiry and explicitly entered skills, site and availability constraints.
3. Select provider-backed training/opportunity references. Record a substantive
   eligibility review and explicit `eligible` or `defer` decision. Deterministic
   comparison displays matched and unmet requirements, location compatibility
   and availability. It never scores protected traits or rejects a person.
4. Separately record the training/employer disclosure basis and future expiry.
   Incoming consent is not blindly reused for onward disclosure. Its opaque
   authority identity is generated server-side. Request a training seat, then
   explicitly confirm the actual provider reservation.
5. The Workforce instructor records real attendance and elapsed completion in
   its own application. Refresh training status to retrieve the authentic skill
   achievement and source timestamps. A catalogue match is never a completion.
6. Refer to the selected employer. The employer records a human review and
   acceptance in Workforce. Refresh its response, then separately confirm
   observed employment locally. A referral or employer acceptance alone does
   not mark the person employed.
7. Record a separately labelled 0-day check-in, or due 30/90-day observations. Retention uses the actual human placement timestamp plus the milestone, never a backdated requested start. Synthetic reported historical effective start dates
   are explicit; they cannot establish elapsed retention. Record/review timestamps always show actual execution time.
   Unknown/changed observations are preserved rather than fabricated retention.

Cancel unfinished training explicitly and reconcile employer obligations before
withdrawing a pathway. Completed skills are immutable. Active employer offers
require a provider human withdrawal/rejection and a refreshed receipt; they are
not silently abandoned. New work after a closed obligation uses a newly
authorized referral, not altered payloads under an old identity.

## Security and evidence

Each onward Worker/module audience gets a persistent independent alias. The
Participant-to-Employment alias is never forwarded verbatim to Workforce. Only
closed minimal requests cross the service boundary; case notes stay private.

Every outgoing command has a private dispatch authority row with original human,
required permission, case, exact audience and command digest. The declared
`dispatchAuthority` query returns only the minimal authorization tuple after
checking current programme management and the original requester's current case
permission. Both host and core must recheck it before delivery. Receipts must
match the original audience and signed provider identity. Older late receipts
cannot overwrite a later applied receipt. Retry the original request/command
identity after an uncertain response; never manufacture a replacement identity
as an automatic retry.

Worker-local pathway, comparison and retention reads enforce programme and case
relationships before pagination. Read/denial audits contain only opaque
identities, static operations, actor and result; no notes or payloads. Private
mutation audit failure reports possible committed state requiring reconciliation.

Only approved sealed aggregates are contributed to MCP. Counts derive from
module-owned actual receipts, human placement and observations. Fixed canonical
periods, immutable member ledgers, minimum-group/complement suppression and
cross-release overlap guards prevent small-group differencing. Participant
aliases, review notes and source request bodies never replicate. Shared training
capacity stays unknown: summing a provider catalogue into several programmes
would double count it. No model arithmetic supplies missing observations.

Approved resources are a distinct explicit source-issued financial statement.
Human `program.finance`, `program.fund` and `program.publish` authority is
required. Its private evidence is excluded from the closed
`mission_resources_v1` stream; exact authorized/available/committed/transferred/
spent cash states and transfer identities are checked and sealed immutably.
The action moves no money and does not turn hypothetical business profit into
available programme funding. Outcome costs/funding remain unknown unless a
separately approved resource statement supports the calculation.

## Verification boundaries

The native acceptance starts real Employment and Workforce HTTP servers against
separate PostgreSQL databases. It exercises durable requests/ACKs, independent
catalogues, pending intake, peer/header/payload rejection, target consent,
private audience aliases, deterministic matching, original actor revocation,
provider reservation/confirmation, actual elapsed instructor completion,
employer review/acceptance, local human placement, immediate check-in and rejected fabricated retention, restart, sealed
suppression and financial statement integrity.

The test's private host attestation is an explicit transport contract fixture.
It does not claim signed SSMA registry or live cross-Worker acceptance; those
are separate platform/browser gates. No real participant, paid provider action,
live employer, benefit decision, regulated-client workflow or production
certification is provided. Local case records and operations remain available
without Master, scientific service or model-provider connectivity.

## Selected-stack deployed acceptance

After the release operator has verified core schema 18, published the signed
Workforce 1.1.0 and Employment 1.0.0 packages, and installed Participant Services
1.0.1 with its six actual synthetic cases:

```powershell
node scripts/verify-phase13-employment.mjs --setup-only
node scripts/verify-phase13-employment.mjs
# Use only in the coordinated outage window; cleanup restores selected Master:
node scripts/verify-phase13-employment.mjs --prove-master-outage
```

The default deployment is the operator selection; an explicit deployment
directory may precede flags. Setup writes only its own private
`demo/phase13-employment.json` and does not claim completed investigations or
workflows. Full execution reads the existing six Participant cases, creates
normal approved source referrals without editing their state file, and uses real
signed cross-Worker SSMA deliveries. It favors a fresh Workforce installation
on Worker 3 to retain the older commercial Workforce instance. If an existing
provider is upgraded, historical migration hashes and every existing business
record are checked before and after the upgrade.

The course has a real bounded demonstration interval (three minutes by default,
configurable with `STEWARD_PHASE13_COURSE_WINDOW_MS` from 30000 to 900000).
Attendance is recorded first; completion waits until its actual end. The script
never moves the clock, backdates completion, or extends a course after a seat is
reserved. An interrupted expired cohort requires normal explicit recovery and
a newly reviewed course/referral, not destructive reset or blind replay.

Browser evidence covers ordinary course entry, eligibility review, instructor
attendance/completion, employer review/acceptance, local human placement and a
zero-day check-in. A fresh placement never establishes thirty-day retention.
Results are recorded in `artifacts/phase13-employment-deployment.json`; a
`configured` setup result is distinct from a passed full workflow.
