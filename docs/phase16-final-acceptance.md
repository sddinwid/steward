# Phase 16 final acceptance

## Source and release boundary

Built source: `a03d9f4f4ffba794c20381da6066f1af4207bcc6`, branch
`codex/phase16-business-automation`. Distribution:
`artifacts/releases/steward-0.16.0-candidate-a03d9f4`.
All 21 mandatory acceptance gates passed. The local `v0.16.0` tag identifies
the final accepted evidence revision; no Phase 16 branch or tag was pushed.
Documentation/evidence commits follow this build without changing its verified
runtime payload. The immutable toolkit retains build-source documentation;
the release tag and checksummed evidence archive contain the final documentation.

Installed business scenarios ran on `04ec54f` or earlier explicitly identified
checkpoints. The final candidate changes only a deterministic clock-boundary
test and the verification ledger relative to `04ec54f`. All production source,
module packages, migration bytes and Dockerfiles are unchanged; original evidence
retains its actual source identity (`phase16-final-runtime-source-equivalence.json`).

## Implemented and exercised

Business Automation 1.0.1 is an independently signed module on Worker 1. Its
database owns definitions, publications, separate human reviews and internal
notifications. Worker-local governance owns import, activation, subscriptions and
durable execution. The generic SSDS renderer discovers signed capabilities and
provides the visual designer, typed mappings, conditions, synthetic previews and
execution history. A preview or compatible capability grants no execution authority.

Worker 1 also runs Inventory 1.7.0, Sales 1.6.0 and Procurement 1.4.0. Other
Workers retain their original packages. Catalog 1.4.0 and Pricing 1.3.1 remain on
all three Workers. The README inventory distinguishes all 21 packaged module
versions from actual installed versions; optional modules were not force-upgraded.

| Verification | Actual result and evidence |
| --- | --- |
| Final source build and uninterrupted regression | PASS: 1,287 Node tests / 80 summaries, zero failed, skipped or cancelled; `phase16-final-full-*` |
| Clock boundary correction | PASS: seven targeted tests twice; frozen test clock verifies exact permitted boundaries and one millisecond beyond; production 30-second age / 5-second future tolerance unchanged |
| Signed source migration integrity | PASS: 10 tests, 89 original SQL migrations including four legacy declarations and Automation 001; `phase16-final-source-migrations.json` |
| Scientific engine | PASS: 88 Python tests and actual authenticated nonroot, network-isolated HTTP calculation; one upstream deprecation warning |
| Scientific governance | PASS: 28 checks with real PostgreSQL/authentication; `phase16-final-scientific-governance.log` |
| Generic browser components | PASS: eight designer, six real module-form and seven governance checks; 21 total, separate from installed acceptance |
| Installed designer | PASS: creation, preview, publication, rejected author self-review, separate reviewer approval, import, activation, execution, history and suspension; `phase16-installed-workflow-ui.json` |
| Installed Sales/Inventory event and recovery | PASS: execution `c7275f76-2068-534a-a2ef-dbee6acc399d`; actual host restart during wait resumed the same execution, exactly one fulfillment, stock 10 → 7 with zero reserved, accepted USD 3.00 order total unchanged; `phase16-installed-sales-event-corrected.json` |
| Threshold, human approval, Procurement and notification | PASS: execution `c141a700-cc09-555a-af95-1e256d3ee7da`; shortage 4, self-approval rejected, separate current approval, independent parallel draft/notice branches joined, exactly one Procurement draft and recipient acknowledgment; `phase16-installed-threshold-business.json` |
| Installed history browser | PASS: two completed executions with source publications and graph/status screens; no browser errors; `phase16-business-history-browser.json` |
| Provider substitution | PASS: four browser checks; Inventory → Stock Ledger → Inventory only for new work, original reservations released at their pinned providers; zero browser/HTTP errors; `phase16-provider-browser.json` |
| Installed MCP | PASS: authenticated TLS discovery and invocation of both read-only status tools, unauthorized access rejected, no workflow mutation tools; `phase16-installed-mcp.json` |
| Master outage | PASS: all Workers available, synthetic Catalog publication queued through Worker restart and resolved at Master after recovery with exact entity/installation/module/stream/record/revision; `phase16-outage.json` |
| Workflow while Master offline | PASS: real local designer, separate review, import, activation, execution `ff3410e0-b7b8-4315-abd0-2a22a93ac90c`, history and suspension while original Master API/web/science were stopped; no browser errors; `phase16-installed-offline-workflow.json` |
| Actual backup restoration | PASS: all 48 databases from the earlier complete pre-upgrade backup restored into four isolated PostgreSQL containers, identities/accounts/migration histories verified; `phase16-real-backup-restore.json` |
| Sales migration ancestry | PASS: signed original migrations replayed against a restored backup matched actual upgraded legacy tables; `phase16-sales-signed-migration-replay.json` |
| Live catalogs | PASS after final upgrade: actual Shopify development-store identity/products and fresh Printify automatic GET receipts, three private profile files/configuration/disabled production flags unchanged; `phase16-final-live-catalog.json` |
| Final clean installation | PASS: six major checks, copied toolkit `npm ci` and full build, TLS enrollment, repeated provisioning, same Worker images, durable synchronization, repeated upgrade/redeployment and exact original operator restoration; `phase16-clean-installation.json` |
| Final selected core upgrade | PASS: exact `a03d9f4` images, 45 module databases / 693 protected tables / 175 private files / seven original volumes preserved; original accounts, identities, provider pins, configurations and migration ancestry retained; `phase16-selected-upgrade.json` |
| Clean business/browser regression | PASS: 13 deployed Phase 4 checks and 11 deployed MCP/test-provider Phase 5 checks; no uncaught browser errors; `phase16-final-clean-phase4.json`, `phase16-final-clean-phase5.json` |
| Clean independent modules | PASS: six creation/recovery checks and one post-redeployment readback; Pricing alone, Catalog alone, Sales without either, all six offering types, reviewed pricing, immutable accepted money and real scratch-database backup restore; `phase16-final-clean-modules*.json` |

Parallel execution is bounded to four lanes and declared retry-safe distinct
providers. Same-provider effects remain ordered. Runtime regressions exercise
lost responses, coordinator rollback, completed-sibling retention, backoff,
rejection, joins, cancellation, revoked bindings and current review authority.
Installed scenarios complement these isolated fault tests; they do not imply
every fault permutation was injected into the operator deployment.

## Preserved failures and recovery

The original full-run failure at `04ec54f` was a clock race in a test, corrected
without changing production security semantics. Earlier installed acceptance
found the frontend `/api/v2/v16/` routing error and rejection of the existing
`sales_demand` stream grammar; both were fixed and rerun. Original failed
executions remain retained and suspended, not relabeled as successful.

Provider browser verification initially assumed pagination on a bounded legacy
Stock Ledger listing. Exact original-reservation readback instead used a read-only
database query; all mutations still went through approved application operations.
MCP fixture/timeout and initial live-catalog login failures remain separately
recorded alongside successful reruns.

The first final clean-install attempt encountered Docker Desktop Windows
bind-mount EIO, including for README, and could not restore 16 core containers.
After the full regression finished, a controlled Desktop restart restored the
mount layer and all 61 original container IDs/images/volume mounts. All four
installations passed readiness/identity checks. No database reset, secret
permission relaxation or volume deletion was performed. The failed temporary
installation and its evidence remain preserved.

The successful clean retry stopped its disposable project
`steward-p15-clean-90a7ae7ef1e94cbba139`, restored all 61 original operator
container IDs/images/mounts, preserved operator selection, and reported no cleanup
errors. The subsequent final upgrade intentionally replaced core containers with
the exact candidate images while preserving their installation identities,
original volumes and all installed module containers/packages. Its complete
private backup is retained under the selected deployment's `.backups` sibling,
`release-0.16.0-2026-10-29T02-15-26.855Z`; it is not included in public evidence.

## Verification commands

Run from the repository root; private deployment paths are resolved through the
existing selection. Detailed installation/recovery commands are in the
[release procedure](phase16-release.md).

```powershell
npm run build
npm test
npm run test:scientific:governance
node scripts/test-phase15-source-migrations.mjs --committed --catalog PATH_TO_DEPLOYMENT/modules/public/catalog.json --trust PATH_TO_DEPLOYMENT/modules/public/trust.json
node scripts/release.mjs verify --bundle artifacts/releases/steward-0.16.0-candidate-a03d9f4
node scripts/upgrade-phase16-selected.mjs PATH_TO_DEPLOYMENT artifacts/releases/steward-0.16.0-candidate-a03d9f4
node scripts/smoke.mjs PATH_TO_DEPLOYMENT
node scripts/verify-single-stack.mjs
```

Clean acceptance explicitly uses `STEWARD_ACCEPTANCE_RELEASE=0.16.0` with the
existing `verify-phase15-clean-installation.mjs` runner. It stops the selected
stack, builds the copied distribution toolkit, exercises the disposable stack,
then restores exact original operator containers. It is an acceptance procedure,
not a routine startup command. Staged installed acceptance helpers and actual
reports are retained in the evidence archive; rerunning synthetic mutations is
not required to inspect their results.

## Final documentation, topology and evidence

README and CHANGELOG describe the accepted capabilities and preserve historical
entries. README contains exactly one designated package version for each of 21
modules, with separately verified installed versions. All 73 local links across
README, CHANGELOG and Phase 16 guides resolve. Documented scripts/package commands
exist and were exercised by the recorded regression or deployment procedures.
The Mermaid architecture renders with 11 nodes; the shorter secondary Worker
heading avoids clipping. Documentation credential/private-path scans passed.
Final release/inventory contracts passed 11 tests in addition to the full suite.

The selected stack contains **61 containers: 16 core and 45 modules**, with
**seven original volumes** and approximately **4.11 GiB** container memory at the
recorded sample. `ollama ps` reported no loaded model. Root Docker Compose resolves
the original selected project and exact image digests; no second stack remains
running. A verification helper initially expected image tags in Compose, but the
actual configuration correctly pins digests; the corrected exact-digest check
passed without changing application configuration.

The additional Master-offline workflow completed with no browser errors. Its
first cleanup smoke sampled Master before readiness and failed; the failed report
remains preserved. Subsequent all-installation smoke and topology passed without
replaying the completed workflow. The helper now waits for actual health before
smoke. This was a verification readiness race, not a failed local execution.

The distribution, checksummed evidence archive and image identities are recorded
in [release artifacts](phase16-release-artifacts.json). The archive retains
successful results, earlier failed attempts and staged acceptance helpers; it
excludes private deployments, credentials, database dumps and node_modules.
Archive presence does not turn historical failed reports into passing evidence.

## Limitations

- Internal notifications only; no external email/SMS. Acknowledgment is not approval.
- Procurement creates governed drafts; no real purchasing, payments, commercial
  production or live order fulfillment was authorized or exercised.
- Live Shopify/Printify catalog checks do not establish paid-production compatibility.
  Historical unavailable profiles remain preserved separately from active profiles.
- Optional integration settings were restored after demonstrations; completed
  workflows/subscriptions were suspended while their histories remain inspectable.
- Model regression uses the reproducible test provider. Phase 15's genuine Qwen
  result remains historical evidence, not a newly claimed Phase 16 model run.
- Uncertain effects and changed provider/source identities require reconciliation;
  cancellation does not undo committed business effects. No destructive rollback.
- Phases 17 (AI Integration & Adapter Builder) and 18 (Marketing & Campaign
  Management) remain planned. MVP acceptance is not commercial production,
  regulatory or financial certification.
