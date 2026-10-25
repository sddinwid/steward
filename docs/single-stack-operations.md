# One active Steward stack

The selected operator deployment is the one continuing installation. Development phases must upgrade it in place after verification, keeping its URLs, passwords, identities, enrollment, configuration and business databases. Do not leave the operator on an older version while newer functionality exists only in a test stack. `AGENTS.md` now makes this an explicit completion requirement.

Routine Docker commands remain:

```powershell
docker compose up -d --wait
docker compose ps
docker compose logs -f
docker compose down
```

`down` does not delete databases; never add `-v` unless intentionally erasing data. The root selection points to `.steward/phase8-upgrade-regressions`. Its historical project name is retained so Docker reuses the existing resources; it now runs the verified Phase 10A core images, not an older platform version.

Current addresses remain Master `https://master.localhost:26100`, Workers `https://worker-1.localhost:26201`, `https://worker-2.localhost:26202`, `https://worker-3.localhost:26203`. Passwords remain in the existing private `demo/presenter.json` beneath that deployment. No account or password was regenerated.

Sales 1.2.3, Shopify 1.2.0 and Printify 1.1.1 are installed/active on Workers 1 and 3. Worker 2 remains without Shopify. In **Business**, open Shopify Orders, Shopify connection, or Commerce Intelligence. New connectors have integrations disabled and no commercial credentials. There are no simulator services in this operator deployment. New module defaults use USD; the existing Sales configuration and historical EUR records were preserved. An installed UI does not establish a configured or verified provider connection.

## Verified development promotion

The in-place promotion was executed with:

```powershell
node scripts/upgrade-selected-development.mjs .steward/phase8-upgrade-regressions docs/phase10a-acceptance-evidence.json
node scripts/import-trusted-packages.mjs .steward/phase10a-acceptance .steward/phase8-upgrade-regressions cee.sales@1.2.3 cee.shopify@1.1.1 cee.printify@1.1.1
node scripts/install-selected-commerce.mjs .steward/phase8-upgrade-regressions
node scripts/verify-single-stack.mjs
node --test scripts/test-compose-operator.mjs
```

These are explicit local development promotion commands, not an official tagged release installer. The image evidence is checked, and existing local image IDs are pinned. No new core or module image was rebuilt. The upgrade takes private configuration copies and PostgreSQL `pg_dumpall` backups for all four database services under `.steward/backups/<project>/<timestamp>`. The exact backup directory is recorded in the selected deployment's `release/development-upgrade.json`. Backups include secrets and must remain private. Database restore or destructive rollback is never automatic.

The module import verifies the retained signed packages and exact local image IDs before republication under the existing operator publisher. Installation uses the existing authenticated APIs with CSRF and Worker-local administrator permissions. It preserves existing module configuration, creates new disabled integrations and applies append-only migrations. It does not seed synthetic records, copy data between unrelated entities, enable provider authority or submit production.

## Actual consolidation results

- In-place core promotion: **passed**. All four APIs ready and all four frontends returned **HTTP 200**. Worker core images remain identical across all three Workers.
- Before/after database comparisons preserved installation identities, accounts, authorizations, enrollments, governed bindings/workflows/obligations/routes and module-owned business tables. Existing Sales business records and configuration were preserved through upgrade.
- **88 original configuration/credential files** matched the private pre-upgrade backup byte-for-byte. Only release metadata/image pins and the intentionally extended module catalog changed.
- Existing credential login flow succeeded for Master and all three Worker presenter accounts. Chromium loaded Shopify Orders and Commerce Intelligence on Workers 1 and 3 with **zero JavaScript errors**.
- The first browser driver selected an ambiguous duplicate heading after successfully updating Worker 1. The selector was corrected and the idempotent installation/browser checks passed on both Workers. No credentials or data were reset to recover.
- Operator/ownership tests: **6 passed**, including two new checks for foreign stacks and orphan module containers. The prior Phase 10A application build and 107-test regression evidence remain in the Phase 10A report; this correction changes operator scripts/instructions, not application runtime code.
- Single-stack audit: **passed**, **29 selected-stack containers**, no unexpected running Steward container. Temporary Phase 10A containers/networks were removed using its exact Compose overlay without `-v`. Its nine named data volumes and private configuration remain archived; they consume no running-container memory.

Raw results are ignored local files `artifacts/selected-stack-upgrade.json`, `selected-stack-commerce.json`, `single-stack-audit.json`, `single-stack-tests.log` and `retire-phase10a-containers.log`. No private deployment or backup is committed. The accepted v0.9.1 tag is unchanged.

## Future runs

Do not start a second full Steward version alongside the operator stack. If isolated full-stack acceptance is necessary, stop the operator services first without deleting data, clean up the temporary services in a failure-safe finalizer, then restore or upgrade the selected stack. Finish with `node scripts/verify-single-stack.mjs` and readiness/browser checks on the actual operator URLs. Preserve archived data unless the operator explicitly requests its deletion. Unrelated non-Steward applications are outside this cleanup scope.

## Shopify development-store readiness update

The same selected deployment now runs Shopify 1.2.0 on Workers 1 and 3, module host 0.8.1 on all three Workers, and a narrow Worker API configuration-error reporting fix. Master API and every frontend image remain unchanged. The original identities, passwords, business data and module configuration were preserved with private backups. Current connection mode remains simulator: Worker 1 retains integrations disabled and Worker 3 retains its existing integrations-enabled setting, but neither has private Shopify credentials or a simulator service configured. No external network grant remains after acceptance. See [development-store setup](shopify-development-store.md) and [actual verification](shopify-live-verification.md). The historical promotion commands/results above remain evidence of the earlier Phase 10A consolidation.
