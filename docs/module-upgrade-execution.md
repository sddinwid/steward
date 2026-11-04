# Reviewed module execution upgrades

This protocol changes an executable under retained authority. It does not replace provider identity, approve a new provider, transfer obligations, or publish business records. Ordinary package replacement remains blocked.

## Supported scope

An independently signed target must declare execution protocol 1 (quiescence and provenance). A separate publisher-signed transition binds the exact original and target package digests and the owning module's assessment declaration. Database migration declarations, replication contracts, required permissions and write API contracts must remain unchanged. Existing authority continues governing configuration, capabilities, workflows and writes. Only compatible presentation and read contributions use the target contract.

Legacy images are assessed through their publisher's bounded table/predicate declaration; they are stopped before assessment. They are not modified or assumed to provide a new endpoint. Assessment runs read-only in the module database, checks applied migration history and returns counts, SHA-256 fingerprints and blocking categories, never row contents. Core inspects only its own governance tables.

## Publication and preparation

Build and publish from clean committed source using the existing `scripts/publish-module.mjs` procedure. Retain all old packages/images. Changed runtime contents require new versions; the retained 1.7.1/1.6.1/1.0.5 UI candidates lack the required execution declaration.

Publish each exact transition after signing its target:

```powershell
node scripts/publish-execution-transition.mjs .steward/phase8-upgrade-regressions cee.shopify 1.7.0 1.7.2
node scripts/publish-execution-transition.mjs .steward/phase8-upgrade-regressions cee.sales 1.5.0 1.6.2
node scripts/publish-execution-transition.mjs .steward/phase8-upgrade-regressions cee.marketing 1.0.4 1.0.6
```

Use the directory in `.steward/operator/selection.json`; the example is the current selected installation, not a new installation command. The transition sidecar is `modules/public/catalog.json.transitions.json`. A changed declaration cannot overwrite an existing exact transition.

In Worker Administration → Modules:

1. Inspect the target package, then **Prepare reviewed execution upgrade**. Preparation pauses the module; other Workers remain independent.
2. **Refresh execution plans**. Inspect the exact binding, assessment, blockers and governance digest.
3. Supply a meaningful review reason and **Approve exact assessment**. A missing declaration, changed state or uncertain submission blocks this path.
4. For a live connector, renew only its existing image-bound grant through the existing egress command:

```powershell
node scripts/configure-connector-egress.mjs --directory .steward/phase8-upgrade-regressions --worker worker-3 --module cee.shopify --execution-plan <approved-plan-uuid>
```

The same command supports `cee.marketing`. It verifies the stopped connector, exact journal/approval, trusted images and existing network; it neither creates a network nor expands provider permissions. No credentials belong in command arguments.

5. **Execute approved upgrade**. Success is reported only after runtime protocol/readiness checks and journal activation. Module Manager shows executable version and retained authority version separately.

## Recovery

Do not use ordinary Install/Activate to bypass an open execution plan. Resume preparation or execution using its existing plan, never a new operation identity. One open plan per module and existing lifecycle locks prevent competing upgrades. Requests and approval are scoped to installation, entity, original operation, exact packages, configuration, schema/data assessment and governance state.

**Abort and restore prior execution** restores the prior executable on the same database and secrets; it never rolls back module business data or SQL migrations. If image-bound egress prevents restoration, the plan remains `aborting`: run the same egress command for that plan (it selects the exact prior image), then **Resume recovery**. Retain backups for disaster recovery, but do not restore an entire database to undo lifecycle metadata. A currently authorized administrator may recover a plan even if its original approver was disabled.

Prepared runtimes stay paused on host restart. Lost success responses resume the existing journal; they do not create another installation. New events carry the execution package/plan separately from original ownership. Historical envelopes are unchanged. Existing publication intent remains module-owned; no withdrawn record is automatically reapproved.

A restored old core/host does not understand execution releases. Recover modules through this protocol before attempting a core downgrade. Do not manually edit authority descriptors, operation IDs, journal rows or owner pins.

## Verification commands

```powershell
npm run build -w @steward/module-sdk
npm run build -w @steward/business-kit
npm run build -w @steward/module-host
npm run build -w @steward/platform
npm run build -w @steward/ui
npm run test:module:upgrade
npm run test:module:execution
```

The real Docker fault test additionally requires locally built fixture images:

```powershell
docker build -f infra/Dockerfile.module-host -t steward-execution-host-fixture:working .
docker build -f modules/shopify/Dockerfile -t steward-shopify-execution-fixture:1.7.2 .
npm run test:module:execution:runtime
```

That test uses an isolated database/host, retained legacy image, signed fixture packages and explicit simulator mode. It uses no live secrets and does not create a second operator platform. Its Docker proxy injects single failures at replacement and activation boundaries. Test subnets default to `10.247.201.0/28` and `10.247.202.0/28`; set `STEWARD_EXECUTION_TEST_DATA_SUBNET` and `STEWARD_EXECUTION_TEST_MODULE_SUBNET` to unused ranges if needed. Docker rejects overlap. Cleanup stops fixture containers, removes only disposable test containers/networks, and retains its state volume.

No test fixture establishes live Shopify/Printify compatibility. Operator deployment and running business UI acceptance are separate mandatory gates. See the execution verification ledger for their actual status.
