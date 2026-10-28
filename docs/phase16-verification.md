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

## Module definition checkpoint

`modules/business-automation` now contains an independent 1.0.0 package,
Dockerfile, exact-hash initial migration, SSDS workflow field contribution and
module-owned definition/review APIs. Publication appends an immutable snapshot;
edits affect only the next draft. Review requires a different currently authorized
human and an expiring private host principal context. Review retries revalidate
current authority. Definition publication explicitly returns
`executionActivated: false`. No workflow execution or installation is implied.

**8/8 real PostgreSQL and authenticated module-gateway API tests passed**:
authentication/permissions, immutable/idempotent publication, separation of duties,
stale/revoked reviewer checks, original snapshot preservation, restart/entity
isolation, data-minimized read-only MCP status, and explicit invalid-definition
errors without publication. Host principal headers are fixtures; full Worker
session/CSRF/installed package acceptance is pending. Reports:
`phase16-automation-definitions.json`, `phase16-automation-definitions.log`,
`phase16-automation-definitions-rerun.log`. Package build and manifest validation
pass. A development npm invocation initially added a root-package file dependency;
it was removed and the lock regenerated from the module directory. The module now
depends only on shared SDK/business-kit packages, not the whole platform package.

Historical Phase 15 release tests now assert every original release module/version
is still present while allowing separately declared later-platform modules outside
that historical distribution. All six release-contract tests pass. The accepted
Phase 15 module map, tag and artifacts remain unchanged.

## Remaining acceptance

Signed image publication/installation, governed subscription and approval APIs,
persistent execution integration, six business acceptance scenarios, complete
security/failure matrix, installed visual designer acceptance, data-preserving upgrade,
clean installation, final redeployment, release packaging and tagging remain
unverified until individually recorded here. Phase 15 evidence is retained and
does not substitute for Phase 16 acceptance.

## Migration verification continuation

The committed `f6e5437` Business Automation development image built successfully:
`steward-business-automation:dev-f6e5437`, image identity
`sha256:e804bf39ff28d6f587e15d196b29818672aee71e479433463e2b140ce349adbe`.
It has not been signed, installed or accepted as a release.

Adding its migration exposed a historical test's fixed 84-migration count. The
failed run is retained in `artifacts/phase16-module-source-integrity.log` and
`artifacts/phase16-source-migrations-count-failure.json`. The runner now asserts
the original Phase 15 modules still contribute exactly 84 declared migrations
and four trusted legacy migrations, and independently verifies every additional
module migration. All ten corrected checks pass (89 total migrations).

The runner previously always wrote its historical Phase 15 report filename. Its
original accepted report was restored byte-for-byte from the evidence ZIP after
verifying ZIP SHA256
`670f60bb64a92762bcca8ad5df03edfafd070032e2f46d98fa2edc8699b04de1`.
The new `--report` argument isolates Phase 16 output. No SQL, signed descriptor,
release archive or selected deployment was changed by this correction.

## Full module checkpoint and authoritative publication verification

At committed source `7df0f62ca00c270c6402914103085893d45959ec`, the complete
monorepo build and uninterrupted root regression suite passed: **1,147 tests,
72 summaries, zero failures/cancellations/skips**. Evidence:
`artifacts/phase16-module-full-build.log`, `phase16-module-full-regressions.log`,
and `phase16-module-full-result.json`. Five designer Chromium checks passed
separately (`phase16-module-designer-browser.log`). Selected deployment smoke
checks and post-suite topology passed: one selected stack, 60 containers, no
unexpected running containers. No operator upgrade was performed.

Subsequent changes add signed optional `workflowServices` metadata requiring a
read-only publication API and existing reviewer declaration on platform >=0.16.
The module's authenticated publication detail includes original author/editor,
review identity and authoritative timestamps. MCP status remains minimized.
The host publication precondition pins module installation/package, publication
and definition digest, exact human review and expiry. It reads the actual module
API, independently rechecks Worker account permissions before and after transport,
checks separate review and the database clock, and rejects source replacement.
It does not activate or dispatch a workflow; coordinator integration remains open.

Targeted builds (SDK, host, Automation) pass. SDK tests **53 pass**, existing
module-definition tests **8 pass**, new independent metadata/module database
publication-authority tests **8 pass**. Reports/logs use the `phase16-publication-`
prefix and `phase16-workflow-authority.json`. Transport is Fastify injection and
package signing uses isolated fixture keys, not an installed production package.
Negative expiry/future-date response fixtures are explicitly synthetic; real
module API revocation and appended approvals are also exercised. These changes
postdate the 1,147-test run and require another final full release regression.

## Graph coordinator checkpoint (not installed acceptance)

The existing `executeSmartStep` now recognizes module-publication graph
projections. It re-reads the exact publication and human review, advances
persisted control nodes, and sends actions through its original binding,
authorization, schema, stable identity, issuance journal and provider dispatch
path. New migration 20 adds execution progress and append-only step decisions;
all earlier migrations remain unchanged. The host passes its existing lifecycle
advisory-lock namespace for graph effects, and missing guards fail closed.

Kernel verification uses real Automation publication/review APIs, an independent
Worker metadata database, and an explicitly synthetic provider receipt database.
Projection activation and step-decision records are privileged test fixtures;
these are NOT authenticated activation/UI acceptance or installed Inventory.
`artifacts/phase16-graph-runtime-checkpoint.log` reports **18 passed** (8 publication
checks plus 10 graph checks), including condition skip/join, human waiting,
self-approval denial, reviewer revocation before the next effect, actual approval
expiry, concurrency, binding revocation, guard denial, and a lost response after
committing a provider receipt. Exactly one receipt survives the retry.

Targeted host/platform builds pass. Host unit tests **27 pass**, platform tests
**98 pass**, and existing SSMA PostgreSQL regressions **11 pass** after updating
the upgrade fixture's expected current schema from 19 to 20. That first failure
is retained as `phase16-graph-legacy-smart-tests.log`; the corrected run is
`phase16-graph-legacy-smart-tests-rerun.log`. Its original identity/account/module
preservation assertions continue to pass through repeated migration.

Other retained failures: initial optional-condition TypeScript narrowing
(`phase16-graph-runtime-build.log`), and fixture-only endpoint declaration,
permission declaration, non-enumerable PostgreSQL password-copy and configured
parallel-limit errors (`phase16-graph-runtime-first.log`, `-rerun.log`,
`-rerun2.log`, `-rerun3.log` and corresponding failure JSON files). Fixes preserve
validators and limits. Subsequent builds and all 18 kernel checks pass.

The selected operator remains unchanged: topology checked at
2026-10-28T18:22:27.725Z, **60 containers**, no unexpected stack. Graph actions are
currently serialized by the existing execution row lock. Bounded graph branching
is represented, but simultaneous provider dispatch, admission/activation/review
APIs, subscription delivery, installed real-business scenarios, browser operation,
upgrade and final release gates still need implementation/acceptance. In
particular, existing Inventory reservation commands enforce Sales ownership;
synthetic receipt tests must not be represented as real Inventory automation.
The 1,147-test full run predates this coordinator checkpoint.

## Authenticated governance and generic UI checkpoint

New Worker `/api/v16/workflows` routes import an exact module publication, activate
or suspend it, queue an idempotent manual execution, record current human step
decisions, cancel without rollback, and list minimized progress. They use existing
sessions/CSRF, SSMA tables, compatibility resolution and signed module broker.
Legacy workflow endpoints explicitly reject graph lifecycle/execution requests.
Import does not activate. Activating one definition does not disable an unrelated
definition from the same module. Programme, financial and peer-scoped graph actions
are explicitly denied pending integration with their established scoped paths;
existing scoped legacy workflows remain unchanged.

The host broker verifies module-owned publications through their declared API.
Current module policy can block an old publication when limits tighten without
rewriting its definition. The coordinator retries temporary publication-service
outages with its existing bounded retry policy. Source/reviewer replacement or
revocation remains a denial, not an automatic substitution.

The shared UI now offers publication selection, read-only graph inspection,
import/activation/suspension, manual starts, progress, decisions and cancellation.
Its sources come from the existing verified SSMA registry. Unconfirmed starts
retain their execution identity for retries. Module forms/navigation still use the
generic signed renderer. Approval permission is now supplied by signed module
metadata instead of a hardcoded Automation permission; publication independently
enforces that declaration. The current governance panel is an administrator view;
module-user decision authorization is tested through the API.

Actual targeted results (not a replacement for the final full regression):

- SDK: **53 passed** (`phase16-governance-sdk-tests.log`).
- Automation definitions/policy: **10 passed** (`phase16-policy-module-tests.log`).
- Publication + graph kernel: **19 passed** (`phase16-publication-recovery-tests.log`).
- Publication + real session/CSRF governance: **14 passed**
  (`phase16-policy-governance-tests.log`). Broker transport is injected into real
  module APIs and independent databases; this is not installed-host acceptance.
- Platform: **98 passed** (`phase16-governance-platform-tests.log`).
- Shared presentation: **24 passed** (`phase16-governance-presentation-tests.log`).
- Legacy SSMA plus authenticated browser: **12 Node checks passed**, comprising
  11 backend checks and one grouped browser workflow
  (`phase16-governance-legacy-browser.log`).
- Designer component: **5 Chromium checks passed**
  (`phase16-governance-designer-browser.log`).
- Governance component: **5 Chromium checks passed**, including a lost-response
  retry with the identical execution ID (`phase16-governance-browser-policy-rerun.log`).
  Its browser responses are explicitly simulated; separate API tests use actual
  authentication. The narrow-screen screenshot was visually inspected.
- SDK, host, platform, UI, Automation, Master web and Worker web targeted builds pass.

Retained UI failures: optional-property TypeScript mismatch in
`phase16-generic-approval-ui-build.log`, and a Windows cp1252 middle-dot mismatch
in the first governance browser fixture (`phase16-workflow-governance-component-encoding-failure.json`).
The latter also exposed an invalid loading-label byte in the generic renderer;
changed text files now validate as UTF-8. Corrected builds/browser checks pass.

No operator upgrade, account/password change, signed module installation, live
connector operation or release promotion was performed. Governed event
subscriptions, installed business scenarios, simultaneous provider dispatch,
authenticated installed graph browser acceptance, final outage/upgrade/install
acceptance and release packaging remain open. The complete 1,147-test run still
refers specifically to commit `7df0f62`, before these later changes.

### Transport and discovery follow-up

Absolute HTTP abort deadlines now include module-call preparation time and cannot
be extended by a continuously streaming response. Host tests: **31 passed**
(`phase16-http-budget-tests.log`), including three native HTTP transport tests.
Publication lists contain paginated metadata; exact authorized queries retain the
full immutable definition. Pagination controls use signed supported query names.
Automation tests: **11 passed** (`phase16-publication-pagination-tests.log`).
Final targeted reruns: publication/governance **14 passed**, publication/kernel
**19 passed**, governance browser **5 passed**, platform/UI builds passed
(`phase16-{governance,runtime}-final-checkpoint.log`,
`phase16-governance-final-{platform-build,ui-build,browser}.log`).
Selected existing deployment smoke checks passed for Master and all three Workers,
including distinct databases and identical Worker images
(`phase16-governance-selected-smoke.log`). This did not deploy Phase 16.
