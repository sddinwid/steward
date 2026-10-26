# Phase 13 mission demonstration — presenter guide

**Verified synthetic MVP demonstration.** See [final acceptance](phase13-final-acceptance.md)
and [release gates](phase13-release-gates.json) for exact evidence and limitations.
All participant records are synthetic. Immediate follow-ups are not elapsed
30/90-day retention. Existing sealed operator reports retain unknown historical
capacity values; fresh-cohort acceptance separately verifies the newer optional
training and opportunity measures. This is not an HMIS-certified or production
case-management system.

## Before inviting the audience

Use the deployment selected in `.steward/operator/selection.json`. Preserve its
accounts, passwords, URLs, identities, existing commerce records and databases.
Do not start another platform stack. An operator can check the retained stack
without resetting it:

```powershell
$selected = (Get-Content .steward/operator/selection.json | ConvertFrom-Json).directory
node scripts/smoke.mjs $selected
node scripts/verify-single-stack.mjs
```

Use the existing approved account for each programme. Credentials remain in the
selected deployment's private account files, commonly `demo/presenter.json` or
`security/verification.json`; do not display their contents, copy them into the
guide or paste them into chat. Administrator sign-in alone does not grant case
access. Before the presentation, the original programme coordinator must assign
the appropriate programme team role and, where necessary, case assignments to
the presenting service account through Administration. A module-user presenter
also needs the corresponding Worker-local module permissions.

The prepared layout is:

| Worker | Application | Authority shown |
| --- | --- | --- |
| Worker 1 | Housing Management | Units, placement review, reservations and occupancy |
| Worker 2 | Assets | Canonical property, ownership and reviewed management authority |
| Worker 3 | Participant Services | Intake, plans, consent and coordinated referrals |
| Worker 3 | Food & Essential Services | Sessions, actual deliveries and private supplies |
| Worker 2 | Employment Pathways | Training referrals, employer responses and local placement observations |
| Worker 3 in the retained operator scenario; see acceptance evidence for a clean installation | Workforce | Skills, training capacity/completion and employer decisions |
| Worker 2, unless compatibility checks selected Worker 1 | Inventory / Procurement | Private stock obligations and private draft supply requirements |
| Master | Mission Impact / Scientific Analytics / AI Analyst | Approved aggregate evidence and advisory investigations |

Read the acceptance reports for the actual provider selection. Do not silently
switch an existing reservation or referral to a different provider. Administrators
prepare signed modules, programme relationships, reviewed destinations, trusted
peers, bindings and workflows beforehand. Ordinary service staff should not need
to inspect provider JSON, SSMA bindings or raw MCP output during the demonstration.

Use the prepared six-case cohort for reporting. Rehearsing with extra records
changes the facts: use an explicitly separate synthetic scenario when necessary.
Do not delete old records, state files or sealed disclosures to force a rerun.

## The story to tell

“Independent businesses and service organizations retain their own operational
authority. Steward coordinates authorized work between them and gives Master
an evidence-based view of capacity, outcomes and explicitly approved resources.
People make consequential service, housing, employment and funding decisions.”

### 1. Intake and an approved plan — Worker 3

Open **Business → Participant Services → Synthetic intake**. Select the approved
programme. Show the generated synthetic reference and minimum assessment fields;
do not enter a real name, contact information or private history.

For a new authorized demonstration case, create the intake, **Review assessment**,
then **Enroll participant**. Open **Service plans**, select that case, record a
concrete synthetic support goal and review date, and **Approve service plan**.
For an already prepared case, show its saved assessment and approval rather than
recreating it. The case activity screen provides the local history.

Explain that only assigned programme/case staff can read or change these records.
These case files are not general Master business data.

### 2. Housing request and human placement — Workers 3 and 1

In Participant Services **Service referrals**, choose **housing** and the labelled
approved Housing destination. Select a reasonable requested interval and unit
classification, record the actual synthetic consent/documented authority and its
expiry, then **Review referral** and **Send through approved provider**.

Wait for the provider receipt. A pending state is not a successful placement.
The receiving Housing programme sees a scoped synthetic alias and necessary
service terms, not the source case file.

On Worker 1, open Housing Management **Placement review**. Select a suitable
available unit and record a substantive suitability review. The authorized
housing officer performs these separate actions:

1. **Record suitability review**.
2. **Approve placement**.
3. **Reserve unit**.
4. **Confirm occupancy**, only when actual occupancy occurs within the approved
   interval.

If fresh property authority is required, the housing coordinator uses **Property
authority references → Verify property authority** first. Assets remains the
property/ownership authority on Worker 2; the housing organization may be its
authorized manager without owning it. A maintenance restriction or unavailable
property prevents a new placement. Do not bypass that check.

Show the persisted unit occupancy, then return to Participant Services and
**Refresh provider outcome**. A duplicate click or safe retry must not create
another placement. Existing confirmed occupants require an explicit human
departure decision; a connectivity failure does not evict them.

### 3. Food and essential services — Worker 3

Open **Food & Essential Services → Food overview**, then the **Site**, **Session**,
**Stock** and **Delivery** tabs. The Delivery contribution is the ordinary
business screen `service-deliveries`, not an integration-diagnostics screen.

Show a scheduled meal session, planned capacity and available local supplies.
Record the actual delivered service quantity separately from the stock quantity
consumed. The prepared example records **six meals using twelve supply units**;
the platform does not assume a universal one-to-one recipe. An interruption or
insufficient stock must prevent an unsupported delivery claim.

For the same participant cohort, send a **food** referral from Participant
Services to the approved local Food programme. In Food **Referral**, record the
substantive service review and select the actual delivery record. **Accept
Referral**, then **Deliver Referral** after service is actually confirmed. Six
recipient allocations cannot exceed the six recorded meal units and do not
consume the same supplies again. Refresh the source provider outcome.

The optional Inventory demonstration uses an approved external supply reference.
**Observe Supplies** obtains a private observation; an external delivery then
waits for real reservation and consumption receipts. Partial holds require
**Release Supplies** or reconciliation. A pending external obligation never
silently falls back to local stock.

The optional Procurement demonstration records a shortage under **Replenishment**
and **Submit Replenishment**. The receiver creates a private **draft** requirement,
not a purchase order, price, supplier commitment or paid submission. Existing
commercial Inventory and Procurement records remain unchanged.

### 4. Training and employment — Workers 3, 2 and 1

Create the authorized **training** referral in Participant Services. Record only
documented skills, relevant location/availability and the reviewed service basis.
Do not infer sensitive characteristics or let a model decide eligibility.

On Worker 2, open Employment Pathways **Pathway review**. The coordinator can
refresh the training/employment catalogues from **Programmes**. Select a relevant
course and review the deterministic opportunity comparison, including unmet
requirements. **Record eligibility review**, **Request training seat**, then
**Confirm reserved enrollment** only after the authoritative provider reserves
capacity.

On the Workforce Worker, use **Service training** to **record Participation**.
An authorized instructor records **complete Service Training** only after the
displayed actual course end and required participation. Do not backdate requested
dates or change a clock to manufacture completion. An accelerated synthetic lab
session is a demonstration of workflow, not a real qualification.

Back in Pathways, **Refresh training status** to retrieve authenticated completion
and skills. Review a compatible opening, **Refer to employer**, then use the
Workforce **Employer decisions** screen to record the employer's substantive
review and acceptance. Pathways **Refresh employer response** retrieves that
decision. A separate human **Confirm observed employment** records the actual
local placement observation. An opportunity or recommendation is not an
employment guarantee or executed employment agreement.

### 5. Follow-up without invented retention

Record a current **immediate check-in** where appropriate. It is not thirty-day or
ninety-day retention. Housing retention begins at actual confirmed occupancy;
employment retention begins at actual observed employment. Requested start dates
do not prove elapsed time.

Historical synthetic observations with an invalid time basis remain available
with an explicit invalid-basis status. Do not present them as verified outcomes
or delete them. New thirty-/ninety-day observations can be recorded only when
the actual milestone has elapsed. Until then, retention is **not yet verified**;
that is not a judgment that the person is unstable or ineligible.

### 6. Governed reporting and resources — service Workers and Master

The authorized programme publisher selects a closed canonical reporting period,
reviews the cohort and seals an aggregate disclosure. Small groups and correlated
capacity/cost proxies may be suppressed. Do not change filters or periods to
reverse-engineer a hidden count. A sealed cohort cannot be silently revised or
republished as another group.

Use **Approved resources** only with the actual programme financial authority.
For the demonstration, use the original coordinator whose explicit financial
permission upgrade has been reviewed. Enter currency amounts as shown by the
form's **Amount in USD** guidance; APIs persist integer cents. Review the saved
displayed amounts before sealing. Distinguish legally authorized funds,
availability after commitments, committed amounts, actual transfers and actual
spending. Private authority evidence stays local; sealing does not move money.

Local financial approval and Master sharing are separate. A financial officer's
sealed statement does not automatically authorize ecosystem disclosure. The
current programme manager separately approves the disclosure lease. Do not
silently expand the officer's permissions; the prepared coordinator can perform
both reviews only because that account explicitly holds both authorities.

On Master, open **Mission Impact** and inspect the approved sources and freshness.
Show housing capacity, recorded service activity, training/employment outcomes,
costs and reviewed available resources. Counts from different programmes may
describe the same people; do not add them into an invented unique-person total.
Missing costs, unavailable authority or unverified retention must remain unknown.

Explain: business revenue or profit does not automatically become money available
to a service programme. Only an explicitly approved resource statement contributes
that availability. Recipient mirrors do not create extra funds.

### 7. Advisory analysis, finding and acknowledgment

Run an authorized deterministic/scientific mission sustainability scenario from
the normal Master interface. Show its inputs, source revisions, calculation,
constraints, assumptions and human decisions required. Modeled expansion is a
recommendation, not approved housing capacity or spending authority.

For a real AI demonstration, first confirm the retained local Ollama/Qwen provider
is configured and available. Run the governed mission investigation, showing
authorized tool activity and deterministic calculations supporting the result.
If the model is unavailable, demonstrate the deterministic interface and state
that live AI validation has not run; do not label test-model output as real Qwen.

Review a supported finding before delivery. Only affected authorized Workers
should receive it. Open that Worker's **Findings & Alerts**, acknowledge it and
show the acknowledgment on Master. No finding executes a purchase, housing
decision, employment selection or transfer.

## Presenter recovery cues

| What appears | Response |
| --- | --- |
| Sign-in or origin error | Use the selected installation's HTTPS URL and existing account. Do not reset passwords or bypass trust. |
| Empty related-record choices | Confirm the current programme/case membership and read permission with its coordinator. |
| Busy operation | Wait for the current operation and refresh. Keep the original request identity for a safe retry. |
| Pending remote reservation/referral | Check the existing provider and service status; do not create a replacement obligation or force a local fallback. |
| Expired authority or changed package | Ask the administrator for an explicit new review for new work; retain original obligations and receipts. |
| Invalid historical follow-up | Show the preserved observation and its invalid-basis status; record only a genuinely due new observation. |
| Suppressed aggregate | Explain the privacy rule. Do not fabricate a count or try narrower filters. |
| Scientific or model failure | Show the explicit failure/partial result and continue local service operations. Do not invent an analytical recommendation. |

Do not perform surprise outage tests in front of an audience. The operator's
documented acceptance run must verify them beforehand, restore any stopped
services and confirm a single active stack. Keep the last honest pending/failure
status visible until a real receipt or verified result arrives.
