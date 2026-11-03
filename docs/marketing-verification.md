# Store Marketing verification

Gate 1 passed: implemented, tested, signed and deployed. Gates 2 (Google account/measurement setup) and 3 (live read-only acceptance) remain **Not configured / unverified**. This is an incremental deployment, not a release tag or production certification.

Baseline `2b1b213`; implementation `a09a02d`; final functional source `e066f85`, branch `codex/phase16-business-automation`. Store Marketing **1.0.1** is installed only on Worker 3 in selected project `steward-phase8-upgrade-reg`. The original signed 1.0.0 package remains retained. Worker frontends and the shared modular renderer were not changed.

## Verified results

| Gate | Actual result | Evidence under artifacts/ |
| --- | --- | --- |
| Marketing contracts/provider/Master analysis | 33 tests passed | marketing-acceptance-final.log |
| Isolated PostgreSQL/API and generic renderer | 12 API checks and 3 browser checks passed | marketing-acceptance-final.log; marketing-api-verification.json |
| Platform backend | 98 passed | marketing-platform-tests-final.log |
| Module SDK | 65 passed | marketing-sdk-tests-final.log |
| Module host | 31 passed | marketing-host-tests.log |
| Commerce connector/action/cost/presentation/egress | 60 passed | marketing-commerce-regression.log |
| Committed migration/signing safeguards | 10 passed | marketing-migrations-final.log |
| Build | Root build passed; final affected SDK/module and Docker builds passed | marketing-full-build.log; marketing-* build logs |
| Deployed browser | 9 checks passed, including signed upgrade, five module pages, failed Live save and Master view | marketing-installed-browser.json; marketing-installed-browser-final.log; marketing-installed-*.png |
| Deployed MCP/restart | Four checks passed; original accounts, health/readiness, discovery, empty approved query, invented-source rejection and restart persistence | marketing-installed-mcp-restart.json |
| Preservation | Seven original volumes; all original credentials/identities/configurations and installed package descriptors preserved | marketing-preservation.json |
| Native module preservation | 36 Inventory/Operations tables, all 81 original rows unchanged | marketing-native-preservation.json |
| Single stack | 62 containers; no unexpected running stack | marketing-final-stack.json |

There are 297 passing tests across the six named unit/regression groups, in addition to API/browser/deployment checks. The entire historical root `npm test` chain was not executed; these are the relevant suites, not a claim of every prior-phase acceptance gate. The root build preceded the final narrow timezone correction; affected builds and tests were rerun afterward.

Commands included `npm run build`, `npm run build:marketing`, `npm run test:marketing`, `npm test -w @steward/platform`, `npm test -w @steward/module-sdk`, `npm test -w @steward/module-host`, `node scripts/test-phase15-source-migrations.mjs --committed --catalog .steward/phase8-upgrade-regressions/modules/public/catalog.json --trust .steward/phase8-upgrade-regressions/modules/public/trust.json --report artifacts/marketing-migrations-final.json`, and `node scripts/verify-single-stack.mjs`. Deployment-specific acceptance helpers and backup manifests remain private under `.steward`; sanitized outputs are retained under `artifacts`.

## Deployment and preservation

Configuration and four complete PostgreSQL dumps were backed up before upgrade, with another four dumps before 1.0.1. Backup location is recorded in private `.steward/marketing-deployment-state.json`. Recovery material, credential files and SQL dumps are excluded from the evidence archive and source control. Existing URLs, administrator password hashes, enrollment identities, seven volume identities and all installed module migration histories were verified against the baseline.

All 1,925 original business-record identities remain. Seven ongoing Shopify monitoring observations changed during normal operation (connection, totals, monitor policy, order matches and publication); other original business-record data hashes were unchanged. Complete Inventory/Operations rows were independently compared with pre-upgrade dumps. Shopify/Printify 1.7.0 packages, protected profiles and approvals remain unchanged. No live orders were created or modified. One active stack contains 62 containers, including Marketing; measured memory is recorded per container in the preservation report.

Installed Marketing remains `mode=not_configured`. Its initial configuration inherited the existing UI currency default EUR; this did not alter company preferences or any commerce currency. Budget plans require explicit currency. There is no GA4 private credential file, property/store approval or GA4 egress approval. Attempting Live mode visibly fails with the missing egress/private-file prerequisites and leaves persisted configuration unchanged. No fixture reports were inserted in the operator installation.

## Signed images

| Component | Image identity | Functional source |
| --- | --- | --- |
| Master API | sha256:70a288bff52b33fa8d70caecad81e39373cfa44617937161ec70ea322ed0756b | e066f85 |
| Worker API (all three) | sha256:e3d10097d67261d8c42e8e3ebd78dbad2117f578f9ae5728e2554255e190a3f6 | e066f85 |
| Module host | sha256:ab5a9e2615c65b0f4818f14a57b2c27abd2ef077734e8636f1a8c6fae467a510 | a09a02d |
| Master web | sha256:04db267b53d4106a90db3a093b5ee2573d84d2390eb73c41c962d207559c293b | a09a02d |
| Marketing 1.0.1 | sha256:a94de4bfb94e480059dedb0cb2f643c820e8a5b79dfd55ab49aba74adcf1cdf7 | e066f85 |

## Corrections and retained failure evidence

New-module schema compatibility and optional references were corrected after validator/browser failures. Reads now exclude old-property observations after reassociation. Automatic retry requires prior successful configuration or a transient retry; unavailable evidence cannot resolve existing conditions. Publications retain immutable snapshot identity/revision and unpublished withdrawal is rejected. IANA timezone validation now accepts valid numeric-offset names without accepting invented zones. Missing configuration has a readable label.

The migration check initially compared 92 committed migrations with 93 working migrations; after committing the new module, all ten safeguards passed without rewriting any applied SQL. Fixture database password copying, deployed title/button matching and premature browser captures were corrected in the test harness. Initial failure logs remain retained. None of these failures was treated as acceptance.

## Remaining gates and boundaries

Follow [Store Marketing setup](store-marketing.md) for the Google Cloud API, service account, GA4 Viewer access, secure private file, exact property/store association, image-bound egress and Shopify measurement checklist. No secrets should be sent in chat.

Actual Google authentication, real reports, GA4 UI comparison, ecommerce instrumentation and a model-backed marketing investigation are unverified. Operator MCP discovery/query and source rejection passed, but there is no live evidence yet for a marketing recommendation or published finding. Isolated tests exercised actual Master SQL policy, affected-entity scope, deduplication, withdrawal and recurrence; operator delivery/acknowledgment with real GA4 evidence remains Gate 3.

Budgets are plans; reports are aggregate sessions and allowlisted event occurrences. No spend, ROAS, CAC, net profit, causal attribution or order-level join is inferred. Reports have bounded periods/pagination/freshness and explicit quality qualifications. Missing data remains unknown. Human review is required before finding publication. No ads execution, Google writes, new fulfillment, commercial OAuth or unrelated subsystem was added. See [ADR 0045](adr/0045-store-marketing-ga4-evidence.md).

## Exact changed files

```text
README.md
docs/adr/0045-store-marketing-ga4-evidence.md
docs/marketing-verification.md
docs/store-marketing.md
modules/marketing/Dockerfile
modules/marketing/manifest.json
modules/marketing/migrations/001-marketing.sql
modules/marketing/package-lock.json
modules/marketing/package.json
modules/marketing/src/definition.ts
modules/marketing/src/ga4.ts
modules/marketing/src/index.ts
modules/marketing/test/marketing.test.mjs
modules/marketing/tsconfig.json
package.json
packages/module-sdk/package.json
packages/module-sdk/src/index.ts
packages/module-sdk/src/marketing.ts
packages/platform/src/analyst.ts
packages/platform/src/investigation-profiles.ts
packages/platform/src/marketing-analysis.ts
packages/platform/src/mcp.ts
packages/platform/src/synchronization.ts
packages/ui/src/analyst.tsx
packages/ui/src/marketing-reports.tsx
packages/ui/src/reports.tsx
scripts/configure-connector-egress.mjs
scripts/configure-ga4-private.mjs
scripts/connector-egress-upgrade-policy.mjs
scripts/fixtures/marketing-browser.html
scripts/fixtures/marketing-browser.tsx
scripts/test-marketing-analysis.mjs
scripts/test-marketing-api.mjs
```

Final gate invocation mistakes (missing provenance arguments and then a dirty documentation tree with --committed) failed closed. Their logs are retained; final committed-source validation uses the existing signed catalog/trust after the documentation commit.


## GA4 empty-response patch — 2026-11-02 Pacific

Store Marketing 1.0.3 is now installed and active on Worker 3. Google omitted `rowCount` and `rows` for an empty report; the connector incorrectly rejected that valid response. Missing count now defaults to zero, while explicit malformed counts and nonempty rows without a count still fail. No SQL migration, core image or shared UI changed.

Verification: marketing build passed; 35 tests, 12 isolated API checks and 3 fixture browser checks passed (`marketing-102-tests.log`). Signed Docker build succeeded from `8fd6845`; deployed browser verified the overview displays `connected no data`. Actual Google authentication, property compatibility, traffic and event report requests succeeded for the operator-approved property. Returned reports contain no rows, with USD and America/Los_Angeles metadata. Evidence: `artifacts/marketing-103-live.json` and `marketing-103-live-browser.png`. Empty results do not establish Shopify instrumentation or zero visitors. Real populated reporting, comparison with GA4 UI and evidence-backed investigation remain unverified. No publication or finding was created.

The rejected 1.0.2 image had an old Docker version label and was never signed or installed; its build log is retained. Corrected labels were published as 1.0.3, preserving that failed artifact. Upgrade initially left the module installed rather than active; the established lifecycle activation completed before live verification. Existing connection identity, approved property/store, reporting dates and Live configuration were preserved. Worker operational and Marketing databases plus private/module configurations were backed up; private recovery location is recorded in `.steward/marketing-102-backup-location.json`. The existing image-bound egress grant was renewed through the authorized upgrade CLI. One stack, 62 containers remains running.

Signed Marketing image: `sha256:47c6d86ae6314e26aa74232d5ea6c9c44e6425a2fcc91a7010762f6733dc7646`. No push or release tag.
