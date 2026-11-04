# Module execution verification ledger

Accepted on 2026-11-04 UTC for this bounded execution/UI increment. The selected operator was upgraded in place; no release tag or push. Application images and signed module packages were built from clean commit `a6493bc26a677305f8d1f71fe571613bcbca518b`. A final operator-script-only hardening checks stopped containers independently of network membership; it does not change container application code.

## Actual installed execution

| Module | Retained authority | Active executable | Image |
|---|---|---|---|
| cee.shopify | 1.7.0 | 1.7.2 | `sha256:352d80bb4310c5d87dfe38ec32488aed63a180ebcbc36708cc16c09b67c2500a` |
| cee.sales | 1.5.0 | 1.6.2 | `sha256:9a0b0f06f4cab069f16e19733482435420284f3050a1dc08f82269336848deb0` |
| cee.marketing | 1.0.4 | 1.0.6 | `sha256:42233408e9a3687990b66fa2d16fb945c951c962c40e5f1e1b095998c53689da` |

Printify 1.7.0 remains unchanged: `sha256:552527030509bcd295b71745c78410f6a07067d25176f5837b7bb8ef29ebf67d`. Original operation IDs, descriptors, provider pins and configurations remain authoritative. Retained candidates Shopify 1.7.1, Sales 1.6.1 and Marketing 1.0.5 were not overwritten or installed.

| Core service | Deployed image |
|---|---|
| master-api | `sha256:1ea124d56b950de33588b4c14e05c4167e9f5c94cda08d070df367dc3d1649a4` |
| worker-api | `sha256:2c9d2626d50d0a51433d0d5c77fc48cdcd8ce49713b9835bbbf7ae74c5cb4d5f` |
| module-host | `sha256:e12c3489fe639529adee0230170f806832936eacc04158a7f829059cf0799f57` |
| master-web | `sha256:d31ca7d48a2c5e252715323f45f5e88e8e0603291a77f7e1b8bc0aa117d8aa96` |
| worker-web | `sha256:d9294cace185c656e20ba2492db445040a8376707252cdf5637a29282ff8ccc7` |

All three Workers use the same Worker API, frontend and Module Host images. The three execution plan IDs and exact assessment hashes are recorded in `artifacts/execution-operator-upgrades.json`.

## Successful commands and results

Counts below are per suite/run and overlap where focused tests were repeated; they are not a unique-test sum.

| Verification | Result |
|---|---|
| SDK, contracts, Business Kit, Module Host, platform, UI, Shopify, Sales and Marketing TypeScript builds | Passed |
| Five core Docker builds and three immutable signed module publications from a6493bc | Passed |
| `npm test -w @steward/module-sdk` | 65/65 |
| `npm test -w @steward/module-host` | 31/31 |
| `npm test -w @steward/platform` | 98/98 |
| `node --test scripts/test-module-execution-contract.mjs scripts/test-module-upgrade-preflight.mjs` | 19/19; final run includes stopped-runtime egress hardening |
| Focused commerce, monitoring and store UI regressions, `execution-commerce-regressions.log` | 47/47 |
| `node --test scripts/test-order-item-costs.mjs scripts/test-shopify-live.mjs scripts/test-store-ui-integration.mjs` | 30/30 |
| `npm run test:commerce` | 2 simulator tests and 36 commerce integration tests passed |
| `node scripts/test-shared-event-capture.mjs` / `test-shared-event-delivery.mjs` | 7/7 and 16/16 |
| `node scripts/test-connector-egress-upgrade.mjs` | 26/26 checks; no mutations |
| `node scripts/test-module-execution-api.mjs --browser` | 12 isolated PostgreSQL/API checks and 2 browser checks |
| `node scripts/test-module-execution-runtime.mjs` using exact candidate host/Shopify images | 4 real Docker check groups, including 7 fault/restart boundaries |
| `node scripts/test-store-ui-browser.mjs` | 6 browser groups |
| `npm run test:marketing` | 36 Node tests, 12 API/database checks and 3 browser checks |
| Selected operator browser acceptance | 11 groups, plus 3 post-restart/actual Module Manager checks |
| `node scripts/verify-single-stack.mjs` | Passed: 62 selected containers, zero unexpected running Steward containers |

Actual Docker faults covered lost preparation response, restart while prepared, abort start failure, runtime deletion failure, failure before activation, lost activation response and active host restart. Recovery reused the same journal, database and operation identity. No whole-database restore or destructive migration rollback was used. The isolated transport proxy injects failures only into test containers. No second operator platform was started.

The complete unrelated Phase 1–16 release suite was not rerun and no release promotion is claimed. Required affected backend, host, commerce, synchronization and browser suites passed.

## Operator acceptance and preservation

- Backed up all four PostgreSQL clusters and selected installation/private configuration before deployment. Dumps include the completion marker; original volumes and previous images/packages remain retained.
- Applied the exact candidate core images using the selected Compose configuration. Prepared, reviewed, approved and executed each module plan through authenticated Worker-local APIs. Shopify and Marketing egress used the existing governed CLI and existing exact-image networks; no scopes or provider permissions were broadened.
- 1970 original business record identities, 106 checked governance/ownership rows, 27 prior publication/condition approval states, account/password hashes, private file hashes and original seven volumes preserved. Existing observations may advance through normal polling; their original IDs/owners remain intact.
- An additional read-only historical comparison verified 90 original obligations, 6,056 route authority/envelope records and 2,550 historical synchronization envelopes unchanged.
- All three Shopify orders remain visible. #1002 is approved and visible on Master. The withdrawn condition remains withdrawn. No record was republished as part of this task.
- #1002 still shows production 640 cents, shipping 769 cents, item shipping 729 cents, and the separate unallocated 40-cent adjustment. Unknown net profit remains unknown.
- Two distinct orders navigated overview → exact combined evidence → conditions → return in the deployed browser. Live dispatch is not offered as executable; isolated server tests reject it and simulated dispatch still completes its synthetic lifecycle.
- Sales source-boundary navigation and Marketing explanations are deployed. Fixture browser tests cover populated pagination; the real GA4 account's empty reports were not represented as populated data.
- Master reporting remains independent of AI configuration. An exact approved source prepares an investigation question without any investigation request. The preexisting invalid provider configuration is displayed explicitly.
- Master received new Shopify envelopes carrying the actual 1.7.2 execution package/plan separately from original authority. SQL integration tests verify that pre-upgrade envelopes are unchanged and financial unknowns remain null. No artificial Sales/Marketing business events were created to manufacture operator evidence.
- Worker 3 API/host restart preserved active executable images, original operations, all three monitored orders and financial evidence. Actual Module Manager displays all three activated execution plans.
- Final resource snapshot: 62 running selected containers, 7 original operator volumes, approximately 5.11 GiB aggregate container memory. Stopped fixture state volumes and previous release artifacts are retained.

## Evidence

`artifacts/execution-acceptance-summary.json` contains final image identities and scope. Supporting files: `execution-operator-upgrades.json`, `execution-preservation.json`, `execution-governance.json`, `execution-historical-authority.json`, `execution-all-approval-provenance.json`, `execution-runtime-tests.json`, `execution-api-tests.json`, `execution-operator-browser.json`, `execution-operator-restart-acceptance.json`, and `single-stack-audit.json`. Screenshots use the `execution-operator-` prefix, including exact-order navigation, live monitor-only UI, Sales boundary, Marketing reports, Master reports/provider state and actual Module Manager.

## Failed attempts retained and corrected

Initial contract fixtures shared mutable data or supplied invalid manifests before the intended assertion; corrected fixtures passed. Discovery/API wiring initially failed TypeScript inference; an explicit presentation contract fixed it. A stale-plan fixture expected 500 instead of the intended 409; rejection semantics were retained and the fixture corrected.

Docker default address pools were exhausted; the isolated test uses bounded explicit unused subnets without deleting operator networks. Its internal-only DB network initially exposed no host port, and Docker reassigned the fixture host's ephemeral port after restart. Fixture network/port handling was corrected; final real-runtime acceptance passed. Operator URLs never changed.

The first deployed browser run expected a heading named “Orders”; the actual signed screen is “Shopify Orders”. That failed report/log was retained as `execution-operator-browser-initial-failure.*`. Correcting the locator yielded a complete pass; no application behavior was weakened.

A later historical COPY-text check initially re-escaped SQL NULL markers and reported a false route mismatch. Decoding both old/current COPY values before comparison passed all 90 obligations and 6,056 routes; the initial diagnostic and corrected result are retained. No database change was made.

## Limits

Supported transitions are exact signed backward-compatible maintenance/UI executions only. Changed migrations, replication, write contracts, required permissions or provider authority remain blocked. Candidate-only capabilities/configuration do not gain authority. A module is paused during preparation/review: this is not zero-downtime upgrading. Future independently developed modules need their own reviewed signed assessment/transition and execution-protocol implementation.

This task does not establish new live Shopify/Printify order compatibility, populated GA4 instrumentation, accounting/net profit, or model-provider readiness. No live order, payment, fulfillment, Google setting, investigation or finding was created or changed by acceptance actions. Existing read-only polling continues with retained credentials.
