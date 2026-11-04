# Module upgrade safety — bounded preventive increment

Date: 2026-11-04 UTC (2026-11-03 local). Branch: codex/phase16-business-automation. Baseline HEAD: de84008.

## Outcome and scope

**Preventive preflight implemented and tested in source; not deployed. Full continuity execution and UI-package upgrade remain blocked.** This follows the attached instruction to finish the preventive guard and stop before operator deployment when safe continuity requires broader architectural work. No module package was rebuilt, installed, re-signed or replaced in this increment. No migration was added or rewritten. No branch/tag was pushed and no release tag was created.

[ADR 0046](adr/0046-module-upgrade-preflight.md) records the decision before implementation. Existing modules have no signed, module-owned continuity attestation or prepare/commit lifecycle. Core cannot safely certify module-local reservations, uncertain submissions, policies or approvals using its own governance tables. Blanket ownership rebinding or accepting prior package digests is not an acceptable substitute.

## Changes

- Module Manager adds authenticated Worker-local administrator GET `/api/v3/modules/:moduleId/upgrade-preflight?packageId=<module>@<version>`. Both packages must be trusted and belong to the same module. Platform-owned bindings, workflows, obligations and routes are inspected read-only. Results are bounded categories, not private records. Absence in those tables is explicitly not proof of module-local safety.
- Actual replacement is rejected with HTTP409 / MODULE_UPGRADE_CONTINUITY_REQUIRED under the existing lifecycle lock, before installation metadata, audit insertion, broker calls, runtime files or containers change. Exact successful retries remain idempotent; exact bound recovery remains supported by existing lifecycle rules. New identity recovery cannot bypass the guard.
- Available-package responses mark replacements blocked. The generic Module Manager displays the explanation and omits the executable upgrade control. Server enforcement remains authoritative.
- Module Host independently rejects replacement of a retained package before creating/changing module state. A retained digest is compared when available; older saved state permits only the same saved version/image. Fresh preparation and same-package recovery are retained. This does not add a historical-identity alias.
- The egress upgrade planner rejects image replacement before its caller writes an approval or backup. Existing unchanged grants and ordinary network-revocation behavior are not broadened.
- A new regression suite is added to the root test chain. No independently packaged module is modified.

All replacement upgrades are conservatively blocked, including legacy modules whose metadata cannot prove safety. Fresh installation and ordinary existing-module use remain supported. There is **no continuity approval or override API**. Do not interpret `allowed:true` for the same exact package as permission to replace its operation identity.

## Actual verification

| Command/check | Result |
| --- | --- |
| SDK, platform, Module Host and UI workspace builds | Passed |
| `npm run test -w @steward/module-sdk` | 65 passed |
| `npm run test -w @steward/module-host` | 31 passed |
| `npm run test -w @steward/platform` | 98 passed |
| `node --test scripts/test-monitored-commerce.mjs scripts/test-order-monitoring-actions.mjs scripts/test-shopify-live.mjs` | 22 passed |
| `npm run test:module:upgrade` (same command executed directly via node --test) | 9 passed |
| `node scripts/test-connector-egress-upgrade.mjs` | 26 checks passed |
| `node scripts/test-store-ui-browser.mjs` | 6 isolated browser checks passed |
| Read-only existing operator browser check | 7 groups passed; 4 original accounts authenticated and 8 health/readiness checks passed |
| Actual preflight SQL against selected Worker3 using PostgreSQL read-only mode | Passed for Shopify, Sales and Marketing |
| Record, configuration, identity, migration and image preservation | 1,960 original records, 7 volumes and original private files/account hashes retained |
| Governance preservation | 106 rows checked; bindings, workflows, peer grants, permissions and original monitoring pins unchanged |
| Approval inspection | #1002 approved; withdrawn condition remains false |
| `node scripts/verify-single-stack.mjs` | Passed: 62 selected containers, no unexpected running stack |

The 225 Node test cases above are separate from 26 egress checks, 6 fixture browser checks and the operator browser groups. A full historical npm test run, Docker image build, replacement activation, live provider compatibility test, new model investigation and release acceptance are **not** claimed.

The new route tests use real Fastify handlers, freshly signed isolated packages and an instrumented database substitute that rejects unexpected writes/queries. They establish API ordering, authorization, no broker invocation, retry/lock rejection and bounded errors; they are not a full PostgreSQL/Docker upgrade simulation. The dependency SQL itself was also exercised against real PostgreSQL with writes disabled. Browser fixtures establish the generic blocked-upgrade presentation. The current operator does not yet run this new guard.

The Shopify regression invokes the existing publication tick: replacing its owner identity removes the current association and withdraws approval. Guarded rejection preserves the owner and approval. Disabling the legitimate policy still withdraws approval; an already withdrawn condition remains withdrawn. Production authorization and revocation code were not changed.

Initial route-fixture failures were caused by the inject harness lacking raw.setTimeout and its omitted required Inventory quantityUnit. The fixture was corrected; production validation was not weakened. Failure evidence is retained in artifacts/upgrade-preflight-fixture-failure.log. Final logs are artifacts/upgrade-preflight-{tests,sdk,host,platform,commerce,egress,browser}.log. Operator evidence is artifacts/upgrade-preflight-operator-browser.json and its screenshots. Preservation and approval checks have separate upgrade-preflight JSON reports.

## Current operator state

The user authorized #1002 publication restoration after the earlier failed UI deployment. That prior governed action is recorded in artifacts/store-ui-authorized-publication-recovery.json. This increment independently confirmed one approved monitored-store record on Master and prepared its exact investigation question without executing an investigation. All three Worker orders remain visible. #1002 retains 640 cents production, 769 cents order shipping, 729 cents item shipping and 40 cents unallocated shipping adjustment. Net profit remains unknown. The withdrawn condition has not been republished.

Running Worker3 modules remain:

| Module | Version | Image |
| --- | --- | --- |
| cee.sales | 1.5.0 | `sha256:0aee9b8777b2dd5324d4d5e5b5d7be882a7d0ce6bf73913e8028185faf71a2d4` |
| cee.shopify | 1.7.0 | `sha256:da0ce8b2ee65ab37d669bd090b281c1c47f3701b11be1fa4dff0f220a95b6ad8` |
| cee.marketing | 1.0.4 | `sha256:d61a7c545aa3da1c98e5b11bab19b2149ee23704ffd412e53d25df74b6e4f687` |

Printify1.7.0 remains untouched. Retained UI candidates Shopify1.7.1, Sales1.6.1 and Marketing1.0.5 are **not running**. Existing shared core images are unchanged from source9ff0a26:

- master-api: `sha256:e87ce94ff75a77073cbee95c1111d6b94f1a6656e3200433d05a2fa78809e817`
- worker-api: `sha256:a9565ae0d4ed1ad008e2cfc4c963624c01196c02067f665321681e548e94c8c0`
- module-host: `sha256:9c13e0c28a86cc48a98d9902182a590bef75f9ff15eba054ae705672ee851a92`
- master-web: `sha256:afeb3fa627c6e01163feab24b86c5d0ebb4cce9694647ad5b3e8bac1a0b7ddda`
- worker-web: `sha256:3914e6c23f5395d39c225545ef2827e69feb684dee1cc6c679f4e72424264922`

No deployment-changing path was executed, so no new deployment backup or recovery was necessary. Existing backups and historical artifacts remain retained. Background operational observations may advance; byte-identical current observation payloads are not claimed.

## Remaining continuity and acceptance gates

A separate bounded design/implementation must provide:

1. Signed module-owned inspection and prepare/abort/commit contracts, without core business-schema introspection.
2. Durable review bound to exact Worker/entity, original module operation/package/configuration and target signed package; stale-state rejection.
3. Coordinated quiescence of background ticks, routing and publication processing during transition, with crash-safe activation and recovery.
4. Continued original authority for historical obligations, or a blocked upgrade; explicit separate approval for new-work substitution.
5. Fault injection across metadata/runtime/activation/publication boundaries, then isolated deployment acceptance before selected-stack execution.

Those mechanisms are not implemented or advertised as working. Exact-package continuity approval, transition fault injection, full runtime recovery and deployment of the UI candidates remain incomplete. Existing same-package recovery is not a replacement migration mechanism. A rejected preflight needs no rollback: leave original identities and records untouched. For an already damaged historical deployment, retain evidence and use a separately reviewed recovery plan; never bulk-restore business databases or reapprove publications automatically.

Do not reinstall the UI candidates, relax identity checks, manually rewrite owner fields, or republish the withdrawn condition to obtain passing acceptance.

## Exact changed files

- `README.md`
- `docs/adr/0046-module-upgrade-preflight.md`
- `docs/module-upgrade-safety-verification.md`
- `docs/store-ui-integration-audit.md`
- `docs/store-ui-integration-verification.md`
- `package.json`
- `packages/module-host/src/index.ts`
- `packages/module-sdk/src/index.ts`
- `packages/module-sdk/src/upgrade-safety.ts`
- `packages/platform/src/module-manager.ts`
- `packages/platform/src/module-upgrade-preflight.ts`
- `packages/ui/src/modules.tsx`
- `scripts/connector-egress-upgrade-policy.mjs`
- `scripts/fixtures/store-ui-browser.tsx`
- `scripts/test-connector-egress-upgrade.mjs`
- `scripts/test-module-upgrade-preflight.mjs`
- `scripts/test-store-ui-browser.mjs`
