# Steward 0.13.0 candidate installation and release gates

**Mandatory acceptance gates passed.** The verified bundle is
`artifacts/releases/steward-0.13.0-rc4`; see [artifact identities](phase13-release-artifacts.json),
[gate evidence](phase13-release-gates.json), and [final acceptance](phase13-final-acceptance.md).
Older candidate directories are retained historical attempts, not the final distribution.
The examples below describe reproducible installation/build procedures. Passing this
synthetic MVP does not establish HMIS certification or commercial production readiness.

## Source, module and image identities

[phase13-module-versions.json](phase13-module-versions.json) is the central
distribution selection: the four independently packaged mission modules,
extensions to Assets/Inventory/Procurement/Workforce, and retained Phase 12
commerce/simulation packages. Packaging reads that map rather than maintaining a
second hardcoded Phase 13 module list. Preserve all earlier signed module
packages and applied migration hashes.

There are eight release infrastructure/core image kinds: Master API/frontend,
Worker API/frontend, module host, PostgreSQL, commerce simulator and scientific
service. Every Worker uses the same Worker distributions. Separate module images
arrive through the running Module Manager, without changing those core images.

Scientific service **1.1.0** is the exact Phase 13 service version. The build
refuses to create the historical `steward-scientific:1.0.0` tag from 1.1.0 source.
The commerce simulator keeps runtime protocol 1.0.1 but uses the new
`steward-commerce-simulator:0.13.0` release tag, preserving historical 1.0.1 tags.
PostgreSQL remains the already present 17.9-alpine image; no implicit database
image pull or major upgrade occurs. The archive pins the actual image ID, not a
claim inferred solely from a tag.

## Candidate production

Run only after implementation checkpoints and required source checks have been
committed. Never package a dirty checkout or reuse another release's source.
From the repository root:

```powershell
npm ci
npm run build
node --test scripts/test-phase13-release.mjs
node scripts/build-release-images.mjs 0.13.0
$selected = (Get-Content .steward/operator/selection.json | ConvertFrom-Json).directory
node scripts/release.mjs pack --version 0.13.0 --candidate --directory $selected --bundle artifacts/releases/steward-0.13.0
node scripts/release.mjs verify --bundle artifacts/releases/steward-0.13.0
```

Do not execute these build/pack commands while another agent is still modifying
the source. `core-images-0.13.0.json` must identify the exact clean commit and all
eight image IDs. Packaging checks build labels, that evidence, the central module
versions and signed package trust, then includes `image-build.json` in the
checksummed bundle. Existing versioned release directories are not overwritten.
Retain historical 0.12.0 archives/images/configuration and stopped volumes.

## Portable installation

Copy the entire candidate/release directory. Its toolkit contains repository-
relative code, not a dependency on the original developer checkout. Build the
toolkit before invoking its installer:

```powershell
Set-Location artifacts/releases/steward-0.13.0/toolkit
npm ci
npm run build
node scripts/release.mjs verify --bundle ..
$deployment = Join-Path $env:LOCALAPPDATA 'Steward/demo'
node scripts/release.mjs install --bundle .. --directory $deployment --project steward-demo --mode all --workers 3 --trust-bundled-modules --simulators
node scripts/release.mjs start --directory $deployment
node scripts/smoke.mjs $deployment
```

Review provenance before the explicit module trust flag. Installation initializes
secure private configuration; it does not create insecure default frontend
accounts, enroll Workers or approve a programme relationship. Use the existing
secure administrator CLI/password-stdin flow and trusted enrollment wizard.
Never put passwords in commands, release files, logs or chat. Existing operator
credentials remain in their existing private deployment files.

`--mode master` and `--mode worker --workers 1` retain independent deployment.
Worker-only operation does not need scientific, Ollama or Master connectivity.
The Phase 13 mission routing overlay is additive, generated after the secured
commerce routes and included before the digest-pinned release overlay.

## Upgrade and preservation

Upgrade the selected operator in place. Do not switch the operator to fresh
acceptance identities. A Phase 13 `upgrade` backs up its private configuration and
complete `pg_dumpall` data for every retained database into a private sibling
`DEPLOYMENT.backups/release-0.13.0-TIMESTAMP` directory before selecting images.
The existing databases must be reachable for that backup. A backup failure stops
the upgrade. The command preserves installation identities, accounts, keys,
configuration, module records and existing data volumes.

```powershell
$deployment = (Get-Content .steward/operator/selection.json | ConvertFrom-Json).directory
node scripts/release.mjs upgrade --bundle artifacts/releases/steward-0.13.0 --directory $deployment --trust-bundled-modules
node scripts/release.mjs start --directory $deployment
node scripts/smoke.mjs $deployment
node scripts/verify-single-stack.mjs
```

Repeated installation of the exact same image set is permitted. Selecting a
different image set for an existing deployment requires `upgrade` and its
backup. Signed module upgrades remain explicit Module Manager actions; core
release installation does not silently install, activate or rebind modules.
Compare old/new module migration hashes before upgrading and retain original
provider obligations. A failed migration requires recovery/reconciliation, not a
forced reinstall or destructive database rollback.

New Master/all-role scientific provisioning creates 1.1.0. Repeated provisioning
of an existing scientific installation retains its key, endpoint, network and
original configured image. An explicit approved release overlay selects the new
1.1.0 image digest; the original generated manifest can still record its original
provisioned service version. Inspect effective Compose image IDs and the live
service metadata when verifying the upgrade.

Stop with `node scripts/release.mjs stop --directory $deployment`. Do not append
`-v`, delete volumes or prune retained archives. Restore backups only into an
explicitly selected stopped recovery environment; no automatic schema downgrade
is provided.

## Required verification archive

Run all relevant Phase 1–12 regressions and the additional Phase 13 module,
privacy, analytical and presentation suites. The root build must include all four
mission modules; module commands run from their own directories for clean npm
installation. Do not use `npm install --prefix` to generate module locks: it can
introduce an unwanted dependency on the repository root.

```powershell
npm run build
npm test
node --test scripts/test-phase13-release.mjs
node scripts/test-housing-assets.mjs
node scripts/test-housing-management.mjs
node scripts/test-participant-services.mjs
node scripts/test-workforce-services.mjs
node scripts/test-food-services.mjs
node scripts/test-mission-analytics.mjs
node scripts/test-scientific-service.mjs
```

Installed acceptance must include the real Chromium module screens, approved
housing placement, Participant-to-Housing/Food/Employment referrals, training and
employment outcomes, Master mission dashboards, deterministic/scientific
calculations, authorized real Qwen/MCP investigation, affected-only finding
delivery/acknowledgment, outage recovery, clean installation and upgrade from the
preserved 0.12.0 deployment. Native private-HTTP fixtures are useful regression
evidence but do not replace installed broker/registry/browser acceptance.

The complete presenter pathway must work through normal SSDS forms; routine
staff must not need provider bindings, JSON payloads or raw MCP output. Keep
Participant aliases, service ledgers, private stock and consent evidence out of
Master projections and release archives. Only approved closed disclosure streams
may synchronize. Preserve unknown financial values and distinguish business
profit from legally authorized available programme resources.

For a separate full-stack acceptance lab, stop the selected operator first,
retain its data, then always stop the temporary stack and restore the operator in
cleanup, including failure paths. Run `verify-single-stack.mjs` afterward. Do not
leave two platform versions running.

## Promotion

After every mandatory gate has actual passing evidence, commit the verification
report, provenance and gate file. Its `sourceCommit` must equal the candidate's
built source and `verifiedCandidateManifestSha256` must identify that exact
candidate `release.json`. Evidence paths must exist inside the repository. Then,
only when release approval is authorized:

```powershell
node scripts/release.mjs promote --bundle artifacts/releases/steward-0.13.0
node scripts/release.mjs verify --bundle artifacts/releases/steward-0.13.0
```

Promotion changes acceptance metadata only. It retains payload checksums/image
IDs and embeds the passed gate snapshot plus evidence commit; verification
reconstructs and checks the original candidate manifest identity. Archive the
referenced acceptance reports and sanitized test logs alongside the preserved
release, without adding undeclared files inside the checksummed bundle. Do not
tag `v0.13.0` until all original mandatory release gates pass. No tag, accepted
release or commercial readiness is implied by this procedure document.

## Hosts with exhausted Docker default address pools

Use the existing optional network overlay after installation and before startup; choose a private range that does not overlap host/VPN routes. The tool rejects overlap with existing Docker networks, preserves existing network allocations, and never prunes networks or volumes:

```powershell
node scripts/configure-network-pool.mjs $deployment 10.241
node scripts/release.mjs start --directory $deployment
```

For the full clean acceptance runner, set `$env:STEWARD_TEST_NETWORK_PREFIX='10.241'` before invoking it (after checking host routes). The runner configures only its new test deployment, including the Scientific network. Existing operator addresses, databases and credentials remain unchanged. A failed startup still runs operator restoration and single-stack health checks; retain its failed report rather than presenting it as a passing installation.

## Exact commands for the verified local distribution

From this checkout, the retained operator remains selected at `.steward/phase8-upgrade-regressions`:

```powershell
node scripts/release.mjs verify --bundle artifacts/releases/steward-0.13.0-rc4
node scripts/release.mjs start --directory .steward/phase8-upgrade-regressions
node scripts/smoke.mjs .steward/phase8-upgrade-regressions
node scripts/verify-single-stack.mjs
node scripts/release.mjs stop --directory .steward/phase8-upgrade-regressions
```

For another clean host, copy the complete rc4 directory, build its toolkit as above, and use `--bundle ..` from that toolkit with a new private deployment directory. Approve bundled module provenance with `--trust-bundled-modules`; add `--simulators` only for the synthetic demonstration. Never point a clean-installation/reset command at the retained operator directory. Existing operator passwords remain in its private account files; this release did not reset them.
