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

New SDK graph/rule contracts compiled in isolated `.steward/phase16-sdk-check`
without replacing baseline runtime outputs. **16/16 focused tests passed** in
`artifacts/phase16-workflow-contract-tests.log`. These contracts are not yet
connected to the runtime or deployed; they grant no execution authority.

## Pending acceptance

All Phase 16 implementation, six business acceptance scenarios, new security and
failure tests, visual designer browser acceptance, data-preserving upgrade,
clean installation, final redeployment, release packaging and tagging remain
unverified until individually recorded here. Phase 15 evidence is retained and
does not substitute for Phase 16 acceptance.
