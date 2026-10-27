# Phase14 controlled demonstration checkpoint

The demonstration is incomplete. Current code runs the rc2 candidate with four mission patches and eight financial module instances in the existing selected operator. The financial setup below is verified; contributions, settlements, funded services, current Master financial disclosures, genuine Qwen and remaining release gates are still pending. This is synthetic-only and is not production financial authorization or a complete general ledger.

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
