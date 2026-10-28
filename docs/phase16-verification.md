# Phase 16 verification ledger

Status: implementation in progress. No v0.16.0 release or Phase 16 GitHub publication.

## Accepted baseline and mandatory publication

On 2026-10-28, the clean local `v0.15.0` annotated tag was inspected against
the accepted Phase 15 documentation and retained release evidence. Its commit is
`300e4caeb876b51ee92ff7f9ecc2d4c5582cd72f`; tag object is
`141fbbdf3911bc9a9a8f82c79eb6de8fcbd4c618`.

GitHub repository `sddinwid/steward` was confirmed private. Remote `main` at
`811793c89d13c05557ad468551c5a79290961eda` was verified as an ancestor.
An ordinary, single fast-forward push of the exact release commit succeeded;
the annotated tag push succeeded separately. No unrelated branches were pushed.
The preexisting default branch was unexpectedly `push-diagnostic`; it was changed
to the required `main` through the authenticated repository settings API.
`git ls-remote --symref origin HEAD refs/heads/main 'refs/tags/v0.15.0*'`
then verified HEAD/main at the accepted commit, the exact annotated tag object,
and its peeled commit. No Phase 16 files existed when publication completed.

Local development branch: `codex/phase16-business-automation`.
Initial topology check passed: selected `steward-phase8-upgrade-reg`, 60 running
containers, no unexpected running containers. No deployment mutations performed.

## Baseline rerun

Full build passed against unchanged Phase 15 source. The uninterrupted existing
`npm test` failed in the release-contract group: 19/21 checks passed, two failed.
Both failures assumed the actual Phase 15 gate document was still an unverified
skeleton. The final accepted document is correctly passed. Logs:
`artifacts/phase16-baseline-build.log`, `artifacts/phase16-baseline-regressions.log`;
completion/result: `artifacts/phase16-baseline-result.json` (build 0, tests 1).

The test correction validates the actual accepted document and constructs an
explicit incomplete fixture for negative promotion/schema tests. No release gate
or published Phase 15 artifact was weakened or changed. First correction attempt
failed one schema check because absent optional properties were represented as
null; that failure is retained in `phase16-baseline-release-correction.log`.
Corrected rerun: **6/6 passed**, `phase16-baseline-release-correction-rerun.log`.
A new complete regression run is required; targeted success is not that gate.

Corrected checkpoint `ff8aecbf473cfd0b07206da4dc16075da57e75fb`: full build and
uninterrupted full regression completed with exit 0, **1,119 tests across 69
summaries, zero failures/skips**. Logs: `phase16-checkpoint-build.log`,
`phase16-checkpoint-regressions.log`, `phase16-checkpoint-result.json`.
This checkpoint includes the 16 new graph/rule tests. Later designer/scheduling
changes have separate targeted results below and require another full release run.
Selected original deployment smoke passed in `phase16-baseline-selected-smoke.log`:
all four health/readiness checks, frontends/assets/proxies, original identities,
migration state, restricted DB roles, four distinct PostgreSQL volumes and identical
Worker core images. No operator upgrade occurred.

New SDK graph/rule contracts compiled in isolated `.steward/phase16-sdk-check`
without replacing baseline runtime outputs. **16/16 focused tests passed** in
`artifacts/phase16-workflow-contract-tests.log`. These contracts are not yet
connected to the runtime or deployed; they grant no execution authority.

## Designer and scheduling checkpoint

- SDK build and **47/47 SDK tests passed**, including signed/version-gated
  `format: workflow` metadata. Original 0.15 manifests remain supported. The
  browser-safe `@steward/module-sdk/workflow` export contains no crypto/runtime
  authority APIs.
- Host build and **27/27 host tests passed**, including five pure graph scheduling
  checks. Scheduling helpers are not yet connected to the durable executor.
- UI build and **13/13 presentation tests passed**, covering existing forms and
  same-consumer binding presentation with original provider/package/entity checks.
- **5/5 Chromium component checks passed**: keyboard interaction, malformed-input
  save prevention, explicit connections, read-only inspection and mobile layout.
  Report: `phase16-workflow-designer-component.json`; screenshot of the generic
  SSDS component: `phase16-workflow-designer-component.png`. This uses synthetic
  in-memory binding metadata; it is not authenticated installed-module evidence.
- The generic module renderer recognizes signed workflow fields and obtains
  choices from its existing authenticated Smart Modules registry. No executable
  module frontend asset or domain-specific screen replaces that renderer.

Retained failures: the first browser run found an ambiguous operation label;
the next found mobile field overflow. Explicit accessible labeling and bounded
SSDS field layout fixed these. A new manifest-test fixture initially retained a
column absent from its changed fields; the manifest validator correctly rejected
it, and the fixture was corrected. Logs retain each original failure.

No workflow effect, subscription, publication, installation or deployment is
claimed from these component checks. The full module/runtime integration and
all six end-to-end scenarios remain pending.

## Shared outbox capture checkpoint

Signed provider events may explicitly identify an existing signed replication
stream through optional `streamId` metadata, gated to platform 0.16. Legacy event
contracts remain unchanged. Consumers cannot declare a provider stream mapping.
The new capture helper uses the existing `sync_outbox` with additive local progress
metadata; it never changes `acknowledged_at` or Master delivery retry state.
An authorized, idempotent local receipt commit must precede source acknowledgment.
Sensitive mission/economic sources are rejected without a scoped disclosure path.

**7/7 isolated PostgreSQL tests passed**, using separate source and receipt
databases, signed synthetic source metadata, actual row locks/transactions and a
synthetic idempotent receipt callback. They verify repeated metadata setup, Master
ACK independence, interruption between commits, concurrent claims, rejected
subscriber acceptance, package/source identity and entity isolation.
Evidence: `phase16-shared-event-capture.json`, original and corrected-build rerun
logs. SDK now passes **48/48** tests including signed event mapping constraints.

This helper is not wired into the production host loop yet. The real governed
subscription transaction, dead-letter/reconciliation policy, module-owned
publications, execution continuation and event-triggered business scenarios remain
to be implemented. No operator module database schema was changed by this work.

## Pending acceptance

Additional bounded object/array mapping checks pass with the graph/rule suite:
**20/20** in isolated SDK compilation (`phase16-workflow-input-tests.log`). A
prototype-key rejection initially returned a less precise object error than its
test expected; the field-specific diagnostic is corrected and the original
failure is retained in `phase16-workflow-input-shape-failure.log`. Initial mapping
type-check errors were also corrected before this successful isolated build.

The integration build at `5c91453` failed on a deliberately invalid consumer
stream fixture's TypeScript cast; it did not reach tests. That exact failure is
retained in `phase16-integration-build.log` and `phase16-integration-result.json`.
Commit `d3bb4c0` corrects the fixture's explicit `unknown` cast. Its full build and
uninterrupted regression rerun passed: **1,135 tests across 71 summaries**, zero
failures/skips, both exit 0 (`phase16-integration-result-rerun.json`). This run
precedes the additional nested mapping changes. Their SDK suite passes **52/52**;
UI, Master frontend and Worker frontend builds pass, and all five Chromium
component checks pass again. Logs use the `phase16-input-` prefix. SQL/source and signed
catalog ancestry independently pass **10/10** (`phase16-source-integrity.log`).

The signed Business Automation module, governed subscription and approval APIs,
persistent execution integration, six business acceptance scenarios, complete
security/failure matrix, installed visual designer acceptance, data-preserving upgrade,
clean installation, final redeployment, release packaging and tagging remain
unverified until individually recorded here. Phase 15 evidence is retained and
does not substitute for Phase 16 acceptance.
