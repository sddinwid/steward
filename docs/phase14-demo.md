# Phase14 controlled demonstration checkpoint

The selected operator runs a v0.14.0 candidate with four compatible mission patches and eight independently installed financial module instances. Three bilateral synthetic cash settlements, a two-workstation sharing/return, six-case housing/food/training services, posted cash expenses and dual-disclosure Master comparisons have been exercised through normal application controls. A genuine financial-planning Qwen investigation and affected-only acknowledgments passed separately. The latest cost-aware investigation, final clean-install/redeployment acceptance and release gates remain pending. This is synthetic-only and is not a complete general ledger or production financial authorization.

## Controlled configuration and accounts

`datasets/economic-demo-v1.json` supplies the original currency, synthetic cash/reserve observations, housing/food/training budget categories, declared units, capacities and limits. Legal entity and installation IDs come from the existing enrolled deployment. No company ID or credential is embedded in the dataset. Changing an existing generation's configuration fails rather than silently rewriting approved records.

The setup reuses the original presenter administrator credentials and creates one additional `phase14-controller` module-user account per Worker if absent. These are distinct installation-local account identities with permission only for the installed financial module APIs and newly configured programme roles. Their random passwords are never printed and are stored privately in the selected deployment's `security/worker-N-phase14-controller-password.txt` files. Existing accounts/passwords are not replaced. The new programme owners also receive explicit disclosure authority so a local administrator can issue the existing source-scoped Master lease; summary review still requires the independent controller role.

Setup uses operator-authorized synthetic test accounts to exercise separate authenticated approval roles. It does not establish real-world corporate approval by separate people. No AI provider is involved in granting authority.

```powershell
$deployment = (Get-Content .steward/operator/selection.json | ConvertFrom-Json).directory
$env:STEWARD_SEED_CREDENTIALS_FILE = (Resolve-Path "$deployment/demo/presenter.json").Path
$env:STEWARD_DEMO_RETRY_LOGIN = '1'
node scripts/seed-phase14-economy.mjs "$deployment"
```

The private generation state is `demo/phase14-economy.json` within that deployment. Re-running reuses original record/account/approval identities. Expired or changed policy requires a newly reviewed controlled generation; the runner does not revoke restrictions, replace passwords, erase records, or silently renew authority.

## Verified initial source state

Each contributing business (Workers1/2) has a synthetic USD 80,000 opening cash observation, USD 15,000 obligations, USD 5,000 restrictions, USD 10,000 future cash requirements, USD 30,000 minimum operating reserve and USD 2,000 liquidity buffer. Its declared USD 200 daily operating expense over 30 days is below the absolute reserve floor. Independently reconciled potentially available resources are **USD 18,000 per entity**. Potential availability is not approval to transfer or additional ecosystem income; it remains subject to local limits, purpose, reserve protection and bilateral acceptance.

| Programme | Worker | Approved budget | Declared planning unit | Incremental unit cost | Base requirement |
| --- | --- | ---: | --- | ---: | ---: |
| Housing | 1 | USD 20,000 | housing-placements | USD 1,000 | USD 4,000 |
| Training | 2 | USD 6,000 | training-completions | USD 1,000 | USD 1,000 |
| Food | 3 | USD 8,000 | meal-services | USD 10 | USD 1,000 |

These are source-reviewed planning assumptions, not proof of operational capacity or participant outcomes. The budgets and funding requests are approved under the configured synthetic policies. All three programmes have **zero commitments, receipts, expenditure and spendable funds**. Master sees no financial summaries yet: there is no automatic financial disclosure from installation or programme creation. Each source must review/publish its closed financial summary and issue a lease to the exact named Master account; Master must explicitly accept it.

Actual verification is recorded in `artifacts/phase14-economic-setup.json`, `phase14-economic-setup-repeat.json` and `phase14-initial-ledger-evidence.json`. A real repeat preserved all eight financial module record hashes, immutable economic event counts and account/password hashes. No contribution, settlement, expense or mission delivery was executed by setup.

## Pending presenter sequence

Review the configured source resources/reserves and budgets through the independently contributed Business screens. The remaining normal-UI sequence must still be implemented/exercised: source review and named-account disclosure; reserve-aware Master alternatives; reviewed proposal delivery; contributor approval; independent recipient acceptance; synthetic-only settlement and receipt reconciliation; shared resource delivery/return; approved expenditure linked to real sealed service observations; evidence-based Master comparisons; genuine local Qwen/MCP investigation and affected-only finding acknowledgment. Do not describe these pending steps as successful validations or tag v0.14.0 until all mandatory gates pass.

Retain all original data and secrets during recovery. There is no broad financial reset command. Do not delete databases, clear programme grants or edit immutable ledger/approval records to make a demonstration pass. Use the original bound Module Manager recovery operation for an interrupted package installation; its data and migration ledger remain authoritative.


## Verified SSMA routing and Master source publication

The following setup created original local resource/budget bindings and bilateral coordination grants for Worker1 → Worker3 food, Worker2 → Worker1 housing and Worker1 → Worker2 training. Each direction pins the original entity, Worker, programme, module installation, signed package and bounded financial operations. A separate coordination programme per route keeps approval scopes and workflow limits explicit. This reuses the existing SSMA registry/resolver and source/recipient approvals; it is not a second financial transport.

```powershell
node scripts/seed-phase14-coordination.mjs "$deployment"
node scripts/publish-phase14-financial-summaries.mjs "$deployment"
```

Actual source/controller APIs reviewed and sealed **11** financial summaries (six coordination programmes, three budgets, two resource assessments). The source administrator issued a one-hour financial-only lease to the actual authenticated Master account. The runner verified the original source entity/installation/module/programme and signed named-account identity before explicit Master acceptance. All eleven current analytical copies arrived through ordinary durable synchronization. Budgets still have no receipts/commitments/expenditure and the source potential availability remains USD 18,000 per business. Analytical disclosure does not authorize any contribution.

The initial publisher attempted to assert a field deliberately omitted from the Master lease-list DTO. It stopped before accepting the first lease. It now verifies the exact account against the source-issued proof and the account-filtered Master endpoint. No authorization or response privacy check was weakened. Existing source grants/snapshots are reused; a changed/expired source snapshot or expired lease fails rather than silently extending access. Evidence: `artifacts/phase14-coordination-setup.json` and `phase14-financial-publication.json`.

Financial finding publication is currently paused while the code correction for recipient-scoped explanations is prepared for deployment. The authorized Master retains full analysis; a Worker must not receive another installation's programme identities/costs or a whole-ecosystem financial total merely because it is affected. No actual financial finding has been published yet. Continue with the corrected core candidate before the normal-UI plan/proposal demonstration.


## Verified reviewed plan and synthetic contribution UI

The initial reserve-aware Master form and affected-only scoped finding delivery have passed browser acceptance. The original financial summaries are now historical because contributions changed their source ledgers. Review a new source snapshot before a fresh investigation; never treat a historical current-cash scenario as executable authority.

```powershell
node scripts/verify-phase14-disclosure-consent.mjs "$deployment"
node scripts/verify-phase14-economic-planning.mjs "$deployment"
node scripts/verify-phase14-contributions.mjs "$deployment"
node scripts/verify-phase14-ledgers.mjs "$deployment"
```

The successful contribution runner used ordinary module-provided forms/actions and distinct authenticated accounts for food USD2000, housing USD10000 and training USD3000. It explicitly verified commitments before receipts and final reconciliation. Repeats reuse original records/settlement identities. Do not recreate proposals to recover from a timeout; inspect the original obligation and use its supported reconciliation actions. Existing source-owner/admin passwords were not changed. Actual recorded services, linked approved expenditures, shared-resource demonstration and the complete real-model investigation remain acceptance work; the focused local finalization diagnostic is not an end-to-end AI result.


After real synthetic settlements change source cash and receiving ledgers, the actual renewed source/plan procedure is:

```powershell
$env:STEWARD_ECONOMIC_SNAPSHOT = 'settled'
node scripts/publish-phase14-financial-summaries.mjs "$deployment"
node scripts/verify-phase14-economic-planning.mjs "$deployment"
Remove-Item Env:STEWARD_ECONOMIC_SNAPSHOT
```

This explicitly creates a new reviewed snapshot/scenario generation, preserves original evidence, and reuses that generation on retries. The verified settled baseline proposes USD17000 of new contributions, using the already confirmed USD15000 receipts once. Existing source resources remain USD13000/8000 potentially available; these are neither income nor authorization. Repeat ledger acceptance verified eight databases, three original settlements/receipts/consumed holds and six balanced journals with no new intercompany income.


## Genuine economic AI and shared-resource recovery

The actual selected-deployment Qwen investigation and reviewed finding delivery/acknowledgments passed. This command uses the existing bounded TLS local-provider verifier and restores provider settings/unloads the model:

```powershell
node scripts/verify-phase14-economic-ollama.mjs "$deployment"
# Separately inspect the actual narrative, retained calculation, references and assumptions.
$env:STEWARD_REVIEWED_INVESTIGATION_ID = '<the independently reviewed investigation UUID>'
node scripts/review-phase14-economic-ollama.mjs "$deployment"
Remove-Item Env:STEWARD_REVIEWED_INVESTIGATION_ID
node scripts/verify-phase14-shared-resource-outage.mjs "$deployment"
```

The outage helper deliberately stops only selected Master API/frontend services, performs original-provider noncash sharing/return, restarts all Worker APIs, proves a new module-owned financial summary queued offline, then restores Master in cleanup and verifies durable recovery/single-stack status. It retains all configuration, identities, records and unknown resource valuation. Its successful run required twelve normal UI actions and created no new cash settlement. Because source resources changed, the prior settled scenario is now historical and must not be used as current execution authority; another investigation requires a new explicit reviewed snapshot/scenario generation. Recorded service-cost comparisons and the final full demonstration remain unfinished.


## Recorded funded service checkpoint

Three confirmed synthetic contributions funded Housing USD10000, Training USD3000 and Food USD2000. Subsequent approved linked cash expenditure is respectively USD10000, USD3000 and USD1120; Food has USD880 remaining. These are external programme operating/material expenses in a controlled synthetic scenario. Shared instruction, property and equipment valuations remain unknown; do not call USD14120 a complete economic cost or new ecosystem income.

A separate six-case cohort recorded six housing placements, six meal services and six source-confirmed training completions after the actual ten-minute course ended. These are service events, not unique ecosystem beneficiaries, employment or thirty-day retention. Master Mission Outcomes comparisons require separately approved financial AND service disclosures. Ratios retain exact integer cents / six units; their different reporting periods prevent capacity-minus-observed-service subtraction. Training's separate operational cost observation remains unknown.

Before presenting, inspect the current source policy, observation and one-hour named-account disclosure validity. Expiration or revocation requires explicit new source review and Master consent; rerunning a planning request does not renew authority. The controlled setup now preserves operator changes to reviewer module permissions. Never restore access by editing database rows or an old signed proof.

The failed over-reserve proposal remains on Worker1's Coordination Overview with its source rejection reason. USD14000 exceeded USD13000 protected availability; no resource hold or synthetic payment was created. Historical successful proposals retain their own immutable settlement/receipt identities. Replaying the contribution verification preserves current recorded spending instead of expecting original receipts to remain unspent.

The optional Analyst checkbox **Include recorded service cost comparisons** requires both disclosure domains. Missing or withheld comparisons must result in an explicit partial investigation and disabled publication. Financial-only investigation remains available separately. A scenario with no future generation does not establish recurring sustainability.


Explicit review after expiry/revocation (new label; retained proof history is never restored):

```powershell
$env:STEWARD_FINANCIAL_DISCLOSURE_REVIEW = 'presenter-review-01'
node scripts/verify-phase14-disclosure-consent.mjs "$deployment"
$env:STEWARD_MISSION_DISCLOSURE_REVIEW = 'presenter-review-01'
node scripts/renew-phase14-service-disclosures.mjs "$deployment"
```

These source and Master review steps intentionally issue new bounded leases. Reusing an expired/revoked review generation fails. Keep the same unexpired generation to verify it without extending its lifetime. Financial source observations and programme policies also have their own validity; a lease does not refresh them.
