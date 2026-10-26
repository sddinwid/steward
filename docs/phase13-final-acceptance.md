# Phase 13 acceptance — verified results and remaining gates

**All mandatory acceptance gates passed.** Built source:
`f998794641bd9b8f358d0a600cf310571ff13669`. The corrected rc4 copied-toolkit
clean installation, full pathway, repeated upgrade/redeployment and cleanup
passed on 2026-10-26. The selected operator is restored with 44 containers and
no unexpected running stack. Promotion metadata is recorded separately in
[release artifacts](phase13-release-artifacts.json) and
[release gates](phase13-release-gates.json). This is a synthetic MVP acceptance,
not a commercial production-readiness claim.

## Independently packaged modules

| Module | Version |
| --- | --- |
| Housing Management | 1.0.1 |
| Participant Services | 1.0.3 |
| Employment Pathways | 1.1.0 |
| Food & Essential Services | 1.0.1 |

Workforce 1.2.0 supplies governed training and employment capacity. Scientific
1.1.0 supplies deterministic scientific calculations. The complete selection is
in [phase13-module-versions.json](phase13-module-versions.json). Module installs
and upgrades preserve dedicated databases and historical migration checksums;
they do not replace the identical Worker core images.

## Verified operations and privacy

Actual installed-module/browser acceptance exercised six synthetic people:
reviewed intake, enrollment and service plans; authorized housing referrals;
human placement approval, reservation and occupied units; Food referrals and
delivery; governed training reservation, instructor participation and actual
elapsed completion; source-backed skills; employer review and separate human
employment confirmation. Immediate follow-ups were recorded. Signed outcomes
returned to Participant Services. Worker/provider operations continued during
Master outage, and restart/recovery retained records and exact retry receipts.

Food used local stock independently, consumed private remote Inventory through
SSMA, and created a reviewed Procurement draft without a purchase or financial
commitment. Separate browser acceptance recorded six hygiene supply units;
repetition reused the delivery without consuming twice. Original commercial
records and live connector configuration were retained.

Evidence: `artifacts/phase13-participant-deployment.json`,
`phase13-employment-deployment.json`, `phase13-food-deployment.json`,
`phase13-participant-food-deployment.json`, `phase13-essential-services.json`,
`phase13-capacity-verification.json`, and `phase13-operational-recovery.json`.

Earlier premature retention claims used requested historical dates rather than
actual confirmation time. They are **invalid**, not achieved stability outcomes.
Append-only corrections retain original observations and receipts, quarantine
unsupported claims, and require authoritative placement/pathway identity and
actual elapsed timestamps. New zero-day check-ins do not establish 30/90-day
retention; immature outcomes remain unknown. Controlled-clock tests validate the
future boundaries without claiming elapsed retention in the demonstration.

Programme/case relationships, named-account disclosure leases, closed source
projections, whole-vector small-group/complement suppression and immutable cohort
membership remain enforced. Missing optional metrics remain unknown in older
sealed records; those records were not resealed. Public quota projections hide
remaining counts once claims could expose a private complement. Exact local
capacity requires programme-management authority. No unrestricted participant
records or aliases enter general Master analytics or mission MCP tools.

## Verified intelligence and model use

The controlled continuation of the earlier clean deployment passed fresh first
sealing during Master outage, source-owned capacity reporting, positive
operational-alert review, affected-only delivery/acknowledgment, and scenario
comparison. Evidence: `phase13-clean-continuation.json`,
`phase13-clean-fresh-mission-verification.json`,
`phase13-clean-comparison-verification.json`, and
`phase13-operational-alerts.json`. This continuation is separate evidence; it does
not retroactively pass the failed rc2 clean run.

Browser finance input preserved exact integer cents: USD 7,500 authorized,
5,000 available, 2,500 committed, 2,000 transferred and 1,000 spent. These are
explicit synthetic cash states, not transfers executed by Steward. Housing's
synthetic period cost is USD 6,000. Real TypeScript and SciPy calculations agree:
USD 1,000 versus USD 1,250 incremental cost yields five versus four conditional
housing units, each costing USD 5,000. Alternatives reuse the same evidence and
budget; their resources are never summed. The zero period-authority gap compares
authorized USD 7,500 with observed USD 6,000 cost, independently of the available
balance used for expansion.

Real local Qwen completed the comparison in **58,974 ms**, with five model calls
and four live MCP tools: `query_mission_programmes`, `query_mission_aggregates`,
`query_mission_scenarios`, and `compare_mission_scenarios`. Actual tool calls,
source references and independently recomputed results are retained in
`artifacts/phase13-mission-ollama-comparison.json`. Separate narrative/source
review preceded browser publication of finding
`b5e713de-499b-4c1d-a600-1d808d06965a`. Only Workers 1 and 2 received it; both
browser acknowledgments returned to Master, and Worker 3 was excluded. Provider
configuration was restored and the model unloaded.

This proves housing alternatives over authorized historical evidence. It does
**not** prove joint housing-and-training optimization or individual employment
forecasts. Historical training/opportunity unknowns remain unknown; fresh source
capacity is verified separately. The model neither grants authority nor executes
service, hiring, funding or reservation decisions.

## Test evidence

| Verification | Actual result | Evidence |
| --- | --- | --- |
| Full checkpoint Node regressions | 354 passed | `phase13-protocol-full-regressions.log` |
| Programme/privacy PostgreSQL checks | 26 passed | Same log, programme-access result |
| Mission API/security/MCP checks | 78 passed | Same log, authenticated mission result |
| Final installation/release/governance contracts | 10 passed | `phase13-final-installation-contracts.log` |
| Scientific Python tests and isolated authenticated HTTP service | 74 passed; one warning; HTTP passed | `phase13-final-scientific-service.log` |
| Scientific governance | 28 passed | `phase13-final-scientific-governance.log` |
| Scientific Chromium fixtures | 8 passed | `phase13-final-scientific-presentation.log` |
| Mission Chromium fixtures | 7 passed | `phase13-mission-analyst-presentation.json` |

Logs are under `artifacts/`. Fixture checks are not deployment/provider evidence;
the actual browser, operational and real-model reports above provide that
separate evidence. The final copied toolkit ran the complete clean deployment
suite; its ten stage summaries and all 44 mission operational/browser check
statements passed. Detailed reports/screenshots are preserved in
`artifacts/phase13-final-clean/`; `phase13-rc4-clean-installation.log` records
the complete run.

## Final installation, recovery and preservation

The fresh cohort expressly reported six available training seats, six employment
opportunities and one known local stock shortage. The positive Food and
Employment signals were separately reviewed in the browser; only Workers 2 and
3 received and acknowledged that operational finding. Housing sustainability
and comparison findings reached only Workers 1 and 2. Old sealed operator
snapshots were not rewritten to manufacture these new optional observations.

The final clean run used 14 explicit `10.241.x.0/24` test networks after checking
host routes and Docker overlap. No networks or volumes were pruned. Repeated
provisioning preserved configuration/secret bytes; backed-up repeated upgrade,
pinned-image redeployment and four isolated database volumes passed. Cleanup
stopped the test stack, restored the operator, and passed smoke/single-stack
checks with no cleanup errors. Earlier rc2 stale-verifier and rc3 host-pool
failures remain recorded; neither was retrospectively labelled a pass.

Final operator recovery passed six checks with four actual container
interruptions. Existing private records, configurations, identities, module
versions and reviewed findings survived. Original scenario reuse did not create
another calculation or duplicate finding. The Ollama outage check uses a
controlled unavailable endpoint; it is distinct from the genuine Qwen run.

Live **read-only** connector revalidation passed: Shopify 17 products/26 variants
and Printify 5 products/625 variants. Connector secrets/configuration/images and
commercial data were preserved; no live order or paid production operation ran.
One historical Printify profile remains unavailable; the active verified profile
is available. Evidence: `phase13-final-live-isolation.json`.

Resource snapshot: 44 running containers, summed container memory 2473.10 MiB,
summed instantaneous CPU 105.25% (approximately one CPU core), and zero loaded
Ollama models. These measurements exclude Docker VM/host overhead and are not
performance guarantees (`phase13-final-resources.json`). Operator URLs remain
Master `https://master.localhost:26100` and Workers `https://worker-1.localhost:26201`,
`https://worker-2.localhost:26202`, `https://worker-3.localhost:26203`.

## Production limitations

Synthetic-only MVP: no real client records, HMIS certification, privacy-law
compliance claim, or commercial production-readiness claim. Disclosure revocation
during disconnection is bounded by the signed lease expiry, at most one hour.
Fixed cohorts cannot be republished or recombined; this phase does not provide
general longitudinal releases or differential privacy. Shared-provider forecasts,
bank reconciliation, consolidation, legal distributability and transfers require
separate authority and implementation. Simulator checks do not establish live
Shopify/Printify compatibility; no paid/order/fulfillment operation is authorized
by this report. Consequential decisions remain with authorized humans.
