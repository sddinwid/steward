# Module execution verification ledger

Status: implementation and isolated verification in progress; selected operator not yet upgraded. No release tag or push.

The retained authority packages remain Shopify 1.7.0, Sales 1.5.0 and Store Marketing 1.0.4 on Worker 3. New executable source versions are 1.7.2, 1.6.2 and 1.0.6; their deployment is not yet claimed. Printify is unchanged. The retained older UI candidates are not overwritten.

## Evidence collected

- SDK, platform, Module Host, Business Kit and UI TypeScript builds passed during implementation.
- `artifacts/execution-security-final.log`: 18 Node contract/preflight tests passed, including ordinary replacement rejection and the original owner-mismatch/withdrawal regression.
- `artifacts/execution-commerce-regressions.log`: 47 focused commerce/UI/monitoring tests passed at that checkpoint.
- `artifacts/execution-api-browser-provenance.log`: 11 isolated PostgreSQL/API checks and 2 browser checks passed. Host outcomes in this suite are explicit fixtures.
- `artifacts/execution-runtime-tests.json`: actual isolated Docker upgrade, original-image recovery and host restart passed; the test records image identities and injected failure boundaries. Later source changes require the final-source rerun recorded below before operator deployment.
- Latest operator approval/topology check: #1002 approved, condition withdrawn, one selected stack with 62 containers. No provider writes were performed.

## Retained failures and corrections

- Initial new contract tests had shared mutable fixtures and invalid manifests that failed before the intended assertion. Fixtures were isolated and invalid cases corrected; reruns passed.
- The first discovery/API wiring build failed on an inferred `any` presentation manifest. The return contract is explicitly typed; build and preflight reruns passed.
- Docker's default address pools were exhausted. The isolated runtime test uses explicit unused bounded test subnets and retains the failed log; no operator networks were deleted.
- An internal-only test database network had no published port. The fixture database network now permits its localhost-bound test port. The operator topology was not changed.
- Docker reassigned the fixture host's ephemeral port on restart. The test now re-inspects that port rather than treating it as a fixed deployment URL. Actual operator URLs remain fixed.
- Stale plan rejection now returns 409; an old fixture expected 500 and was corrected after confirming the intended rejection.

## Outstanding gates

Final-source regression and Docker failure-recovery reruns; commit and reproducible signed package/core builds; fresh recovery backup; selected installation upgrade through reviewed plans and governed egress; real UI acceptance, source/approval preservation and final single-stack check. Until these pass, safe operator deployment is not declared complete.
