# Store UI integration verification — 2026-11-03

Later bounded execution/deployment acceptance is recorded in [the execution verification ledger](module-upgrade-execution-verification.md). The historical checkpoint and failed evidence below are retained.

## Result: partial deployment; module acceptance failed

Implementation source: `9ff0a2660ff9b82b456782703c73f9311530b3db`, branch `codex/phase16-business-automation`. Subsequent changes extend isolated browser coverage and documentation only. No tag or push. This is not a completed release or full acceptance claim.

The core UI/API improvements are running in the original selected installation. New Shopify1.7.1, Sales1.6.1 and Store Marketing1.0.5 packages were built and signed, but their upgrade failed deployed acceptance. The original Worker3 packages are restored: **Shopify1.7.0, Sales1.5.0, Marketing1.0.4**, with their exact original operation IDs and signed descriptors. Printify1.7.0 was not upgraded. Candidate signed versions remain retained and must not be blindly installed again.

## Failure, cause and recovery

The normal Module Manager upgrade changes `operation_id` and the signed descriptor digest. Module Host derives the runtime provider identity from these values. Shopify monitoring deliberately requires the original owner identity (`modules/shopify/src/monitor-current.ts`). Consequently the new package could not see the original policies as current, and Monitored Store Overview became empty. The new overview cards rendered, but the browser timed out waiting for per-order links. This is a real failed deployment gate, not a passed fixture result.

The existing publication tick also automatically withdrew one previously approved #1002 observation and one approved commerce condition. After restoring the original identity, these remain withdrawn because reapproval is deliberately not automatic. At that failed acceptance checkpoint Master showed zero approved monitored-store observations. Original publication/condition history remains retained. The user subsequently authorized restoring #1002 only. Its governed restoration reached Master (artifacts/store-ui-authorized-publication-recovery.json); subsequent read-only browser verification confirms it remains visible. The condition also requires human review before republication.

Recovery first saved another complete Worker3 database dump and the changed host configuration. Only the three affected installation metadata rows were restored from the verified pre-upgrade backup, marked for recovery, and reinstated through authenticated Module Manager same-operation recovery and activation. Original image-bound egress approvals were restored from the backed-up host configuration for the exact original signed images and existing networks. No module SQL or business database was rolled back, no record was deleted, no provider identity check was weakened, and no ownership or binding was transferred. No live order mutation occurred.

The current metadata/package identity contract cannot deploy these signed UI metadata changes while retaining the original package-bound monitoring owner. A follow-up must explicitly design and test governed upgrade continuity (or reviewed new-work association renewal) without transferring existing obligations. That is beyond a bounded UI-only change. Until then retain the original modules; do not reapply the candidate upgrade to obtain a passing demonstration.

## Verified selected installation

- Same URLs: Master `https://master.localhost:26100`; Workers `https://worker-1.localhost:26201`, `https://worker-2.localhost:26202`, `https://worker-3.localhost:26203`.
- Four original accounts authenticated; eight health/readiness checks passed.
- 1,960 original business record IDs retained, seven original volumes retained; original account/password hashes, enrollment identities, module configurations, applied migration checksums and protected private files preserved.
- 106 governance/monitoring rows checked: unchanged bindings, workflows, peer grants, permissions, original monitoring owners, provider pins, policy enablement and association identity. Publication changes are reported separately above.
- Worker3 again shows all three orders. #1002 retains 640 cents production, 769 cents order shipping, 729 cents item shipping, and 40 cents unallocated adjustment; net profit remains unknown.
- Observation revisions changed during ordinary polling/recovery; byte-identical operational data is not claimed. The automatic withdrawal is explicitly identified rather than classified as an ordinary harmless refresh.
- All three Workers use the same new Worker API image; unaffected module/database images remain unchanged.
- Final single-stack check passed: 62 containers, seven volumes. Temporary full-stack environments were not started.
- No new Shopify/Printify order, production submission, Google write, model investigation or manual publication/acknowledgment was executed. Existing background read-only synchronization continued.

## Scope and acceptance by improvement

| Improvement | Actual status |
| --- | --- |
| Optional validated SDK metadata, generic links, context and action mode rendering | Implemented; SDK/fixture tested; core deployed |
| Hide impossible live Shopify dispatch while retaining simulator action | Candidate signed package tested; **not deployed** after recovery. Original button remains; backend still rejects live dispatch |
| Master simulation-only exception label | Deployed; browser verified |
| Overview entry cards, two-order context links, conditions and return | Five fixture browser checks include successful navigation; candidate module package deployment **failed**; not available on recovered original modules |
| Sales source-boundary explanation and authorized related destination | Implemented in candidate package; not deployed |
| Separate Master Reports from AI provider panel | Deployed; browser verified |
| Approved source identity and account-scoped question preparation | Core deployed; isolated browser handoff verified. Live handoff not verified because the existing approval was automatically withdrawn |
| Master marketing next/previous pagination | Core deployed; multi-page isolated browser verified; no fabricated live reports |
| Sanitized provider status | Deployed/browser verified. Current private configuration is invalid for provider/model/endpoint/apiKeyFile; values and credentials are not exposed |
| GA4 fixed/future window, empty-measurement and disabled-monitoring explanations | Candidate Marketing package tested; not deployed |
| Arbitrary historical finding-to-Worker deep links | Deferred: stream record/revision is not a current order ID or a trusted destination URL |

## Tests and builds

All focused automated suites below passed. Counts are per suite; overlapping store-UI tests are not additional independent tests.

| Command / check | Result | Evidence under artifacts/ |
| --- | --- | --- |
| `npm run build -w @steward/module-sdk`, UI and platform equivalents | Passed | store-ui-sdk-build.log, store-ui-build.log, store-ui-platform-build.log |
| Module Shopify, Sales, Marketing `npm run build` | Passed | store-ui-shopify-build.log, store-ui-sales-build.log, store-ui-marketing-build.log |
| `npm run test -w @steward/module-sdk` | 65 passed | store-ui-sdk-tests.log |
| `npm run test -w @steward/module-host` | 31 passed | store-ui-host-tests.log |
| `npm run test -w @steward/platform` | 98 passed | store-ui-platform-tests.log |
| Focused commerce, Shopify live transport, action and UI regression batch | 26 Node test entries passed; includes initial 3 store-UI tests and egress script wrapper | store-ui-commerce-tests.log |
| Connector egress upgrade checks inside that batch | 26 internal checks passed | same log; not 26 extra Node test entries |
| `node --test scripts/test-store-ui-integration.mjs` | Final expanded suite 5 passed | store-ui-tests-final.log |
| `npm run test:marketing` | 36 unit tests, 12 API checks, 3 browser checks passed | store-ui-marketing-tests.log |
| Source migration and signed package publication guards | 10 passed | store-ui-migrations.log |
| `node scripts/test-store-ui-browser.mjs` | Final expanded 5 browser checks passed | store-ui-browser-handoff.log, store-ui-browser.json |
| Five core Docker images from committed source | All built successfully | store-ui-build-*.log |
| Three signed independent candidate module packages | All built successfully; upgrade not accepted | store-ui-package-*.log |
| Initial deployed connected-order browser run | FAILED: empty current order view after package identity change | store-ui-deployed-browser.json |
| Original module recovery | Passed for all three exact original identities/images | store-ui-module-recovery.json |
| Core deployed browser after recovery | 6 check groups passed, with live handoff explicitly deferred | store-ui-core-browser.json |
| Database/configuration/identity and governance preservation | Passed with the two approval changes disclosed | store-ui-preservation.json, store-ui-governance-preservation.json, store-ui-publication-change.json |
| `node scripts/verify-single-stack.mjs` | Passed | store-ui-final-stack.json |

No complete historical `npm test`, release tagging gate, new live provider compatibility, populated GA4 measurement or model investigation is claimed. Initial fixture/test harness failures are retained in local logs; only the corrected reruns are reported as passing. The deployed failure evidence remains retained.

Private deployment/recovery scripts are intentionally under ignored `.steward`; do not copy them or secrets into source control. Their actual runs and output are retained locally. The pre-upgrade backup contains four complete cluster dumps and selected configuration; recovery also retained a post-failure Worker3 dump. Do not restore whole databases merely to reinstate an approval.

## Running core images

Built from `9ff0a2660ff9b82b456782703c73f9311530b3db`:

| Image | Content identity |
| --- | --- |
| master-api | `sha256:e87ce94ff75a77073cbee95c1111d6b94f1a6656e3200433d05a2fa78809e817` |
| worker-api | `sha256:a9565ae0d4ed1ad008e2cfc4c963624c01196c02067f665321681e548e94c8c0` |
| module-host | `sha256:9c13e0c28a86cc48a98d9902182a590bef75f9ff15eba054ae705672ee851a92` |
| master-web | `sha256:afeb3fa627c6e01163feab24b86c5d0ebb4cce9694647ad5b3e8bac1a0b7ddda` |
| worker-web | `sha256:3914e6c23f5395d39c225545ef2827e69feb684dee1cc6c679f4e72424264922` |

## Module image identities

| Module | Running restored version / image | Retained candidate version / image (not running) |
| --- | --- | --- |
| cee.sales | 1.5.0 / `sha256:0aee9b8777b2dd5324d4d5e5b5d7be882a7d0ce6bf73913e8028185faf71a2d4` | 1.6.1 / `sha256:33330455290665d5101fd7c7ae6911e4f84c7b3efd694b1bdeb8fade6d2887f9` |
| cee.shopify | 1.7.0 / `sha256:da0ce8b2ee65ab37d669bd090b281c1c47f3701b11be1fa4dff0f220a95b6ad8` | 1.7.1 / `sha256:9d6bebdfea396c5d7b06417c2e1b9d4a25617dbeca75368df2dff75f82d4dade` |
| cee.marketing | 1.0.4 / `sha256:d61a7c545aa3da1c98e5b11bab19b2149ee23704ffd412e53d25df74b6e4f687` | 1.0.5 / `sha256:8cd58d01b2536e13e014a6ace6c601f510962dd54c98067b933b06c0ea1e4aff` |

## Changed implementation files

Exact files in implementation commit `9ff0a26`:

- `docs/store-ui-integration-audit.md`
- `modules/marketing/Dockerfile`
- `modules/marketing/manifest.json`
- `modules/marketing/package-lock.json`
- `modules/marketing/package.json`
- `modules/marketing/src/definition.ts`
- `modules/sales/Dockerfile`
- `modules/sales/manifest.json`
- `modules/sales/package-lock.json`
- `modules/sales/package.json`
- `modules/sales/src/intelligence.ts`
- `modules/shopify/Dockerfile`
- `modules/shopify/manifest.json`
- `modules/shopify/package-lock.json`
- `modules/shopify/package.json`
- `modules/shopify/src/monitor-policy.ts`
- `modules/shopify/src/order-monitoring.ts`
- `packages/module-sdk/src/index.ts`
- `packages/platform/src/analyst.ts`
- `packages/platform/src/provider-configuration-status.ts`
- `packages/platform/src/synchronization.ts`
- `packages/ui/src/analyst.tsx`
- `packages/ui/src/executive-workspace.tsx`
- `packages/ui/src/investigation-context.ts`
- `packages/ui/src/marketing-reports.tsx`
- `packages/ui/src/module-links.ts`
- `packages/ui/src/modules.tsx`
- `packages/ui/src/provider-status.tsx`
- `packages/ui/src/reports.tsx`
- `packages/ui/src/security.tsx`
- `scripts/fixtures/store-ui-browser.html`
- `scripts/fixtures/store-ui-browser.tsx`
- `scripts/test-store-ui-browser.mjs`
- `scripts/test-store-ui-integration.mjs`

Subsequent changes extend the two store-UI browser fixture/test files and add this report, README status guidance and the audit disposition. They do not alter the running application payload.

## Remaining external prerequisites and next action

Keep the recovered operator stack. Review #1002 and the withdrawn condition, and authorize republication separately if desired. Design a bounded, explicitly approved identity-continuity acceptance plan before installing the candidate module packages. Preserve original obligations and history; never solve the failure by relaxing owner/package checks. Then rerun the deployed two-order path and publication-preservation checks.

AI configuration must be repaired by a separate operator task before new investigations; no private values changed here. GA4 authentication and prior empty reads do not prove website instrumentation, consent or populated measurements. These external gates remain separate from UI acceptance.

## Subsequent preventive correction

[Upgrade safety verification](module-upgrade-safety-verification.md) records the source-only fail-closed preflight, current #1002 approval, unchanged withdrawn condition and the broader continuity work still required. The operator modules remain the recovered original versions.
