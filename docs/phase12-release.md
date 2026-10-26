# Steward 0.12.0 release installation and presentation

Acceptance status and exact source/artifact identities are in [Phase 12 verification](phase12-verification.md) and [release gates](phase12-release-gates.json). A candidate is not accepted. Preserve previous release archives, configuration and volumes. This MVP does not establish commercial production readiness.

## Existing operator installation

The selected operator retains its original URLs, accounts, passwords, legal entities, installation identities and records. From the workspace:

```powershell
docker compose up -d
docker compose ps
docker compose logs -f
docker compose down
# Never add -v to shutdown: volumes contain retained business records.
```

Master: `https://master.localhost:26100`. Workers 1/2/3: `https://worker-1.localhost:26201`, `https://worker-2.localhost:26202`, `https://worker-3.localhost:26203`. Existing presenter credentials remain in `.steward/phase8-upgrade-regressions/demo/presenter.json`; this is a private local file, not a release artifact. Do not paste it into chat or source control.

## Portable distribution

Distribute the complete `artifacts/releases/steward-0.12.0` directory. `release.json` identifies acceptance, source commit, checksums and eight pinned infrastructure/core image IDs. `images.tar` includes separate module images. `module-packages.json` contains separately versioned verified payloads; installation into a running Worker remains an independent local administrative action. Master and Worker distribution JSON files describe independent roles. Multiple Workers use the same Worker API/frontend/module-host images.

Prerequisites: Node 24, npm, Docker Engine/Compose, adequate disk/memory and at least fourteen available bridge-network subnet allocations for a three-Worker lab with commerce simulators. Inspect Docker networks before repeated full-stack tests; never indiscriminately prune retained deployments or live approved egress. Empty networks owned solely by a failed acceptance fixture may be removed after verifying zero endpoints. Its volumes/configuration remain retained; recreate archived test containers with Compose if network IDs were removed.

From a copied distribution, build the bundled installer toolkit:

```powershell
Set-Location artifacts/releases/steward-0.12.0/toolkit
npm ci
npm run build
node scripts/release.mjs verify --bundle ..
$deployment=Join-Path $env:LOCALAPPDATA 'Steward/demo'
node scripts/release.mjs install --bundle .. --directory $deployment --project steward-demo --mode all --workers 3 --trust-bundled-modules --simulators
node scripts/release.mjs start --directory $deployment
node scripts/smoke.mjs $deployment
```

Review artifact provenance/checksums before trusting bundled payloads. The explicit trust option signs approved payloads into that installation's existing local publisher trust; it does not enroll a Worker or grant production authority. Use `--mode master` or `--mode worker --workers 1` for separate-role installations; transfer only the Master public trust bundle for independently provisioned Workers as described in [enrollment security](phase2.md). Production needs a stable trusted HTTPS origin, protected signing keys and managed credentials; the bundled development CA is a local-development trust model.

The fresh installer deliberately creates no insecure default administrator login. PostgreSQL bootstrap passwords are not frontend account passwords. Initialize Master `registry_admin` and Worker `local_admin` accounts with the existing secure administrator CLI, passing passwords over stdin, then register entities, scope administrators and enroll through the trusted browser wizard. Never put a password in command arguments or a committed script. Example from a directory selected for Compose:

```powershell
$secret=Read-Host 'New Master administrator password' -AsSecureString
[System.Net.NetworkCredential]::new('', $secret).Password | docker compose exec -T master-api node packages/platform/dist/security/admin-cli.js --username steward-admin --role registry_admin --password-stdin
$secret=$null
# Repeat with each worker-N-api, a local username, and --role local_admin.
```

For a disposable acceptance lab only, `verify-phase2.mjs` creates private verification accounts and exercises enrollment security; those are controlled test identities, not production bootstrap shortcuts.

## Upgrade and verification

Back up private configuration and every core/module database before upgrade. Retain the prior distribution and deployment directory. Installer/provisioning is repeatable; it does not reset databases, identities or module state:

```powershell
node scripts/release.mjs upgrade --bundle .. --directory $deployment --trust-bundled-modules
node scripts/release.mjs stop --directory $deployment
node scripts/release.mjs start --directory $deployment
node scripts/smoke.mjs $deployment
```

Use the same configuration directory and project. An upgrade does not implicitly install/replace business modules or transfer existing workflow obligations. Approve new package identities/configurations and workflows through Module Manager and Smart Modules. Failed migrations retain data and visible failure state; do not roll back destructively. To select a deployment for ordinary workspace Docker commands, run `node scripts/select-deployment.mjs PATH` once from that workspace, without recreating accounts or identities.

## Demonstration and safe reset

Follow [the scientific presenter guide](phase12-presenter.md). Workers 1 and 2 have Sales 1.3.2, Stock Ledger 1.1.0, Commerce Simulation 1.1.3 and Simulated Fulfillment 1.0.1. Worker 3 retains its live read-only Shopify/Printify catalogs and has no simulation module. Synthetic services have no commercial secrets or external egress.

The controlled purchasing runs are paused at their twelve-order bounds. For a fresh demonstration, use **Administration → Simulation Control Center → Reset selected synthetic dataset**, confirm the owner-service reset, select scenario/rate/speed, then Start. This resets only that selected dataset. Current controlled records use USD; historical EUR records remain separate. Review Master findings, original source evidence and affected Worker acknowledgment. No recommendation executes a purchase or agreement.

Real Qwen/MCP investigation and browser evidence are retained. Live-provider validation temporarily uses the documented authenticated local TLS bridge, then restores original operator provider configuration and unloads the model. The retained provider configuration can therefore remain unconfigured afterward. The optional AI demonstration requires provider availability/configuration; local business services and deterministic monitoring do not. Reproducible protocol test-model results are explicitly distinct from real-model evidence.

## Acceptance commands

```powershell
npm run build
npm test
npm run test:smart:browser
npm run test:scientific
npm run test:scientific:governance
npm run test:scientific:presentation
node scripts/verify-phase12-installation.mjs .steward/phase8-upgrade-regressions
node scripts/verify-phase11-live-isolation.mjs .steward/phase8-upgrade-regressions
node scripts/verify-phase12-science.mjs .steward/phase8-upgrade-regressions
node scripts/verify-phase12-browser.mjs .steward/phase8-upgrade-regressions
node scripts/verify-phase12-test-model.mjs .steward/phase8-upgrade-regressions
$env:STEWARD_RELEASE_BUNDLE='artifacts/releases/steward-0.12.0'
node scripts/verify-phase12-clean-installation.mjs .steward/phase12-clean-acceptance-001
node scripts/verify-single-stack.mjs
```

The clean-install acceptance target must be new, named `phase12-clean-*`, and distinct from the selected deployment. It stops all selected core and managed module containers, tests the copied toolkit, then stops all temporary containers and restores the operator in cleanup. Failed attempts and stopped volumes remain retained. Check the report, not just command completion, before accepting a release.

Limits: synthetic supplier/catalog/production behavior is not verified live commerce mutation compatibility; exact-cent estimates still need real terms/tax/specification review; module-host Docker privileges and local publisher trust require production hardening; source/audit history retention needs an operational archival policy; polling and bounded datasets are MVP limits rather than high-volume performance certification. Ollama wording is non-authoritative and requires human review. Offline enrollment remains deferred.

## Optional scientific distribution

The eighth infrastructure image is `steward-scientific:1.0.0`. New Master/all-role installations include a private internal-only scientific overlay. Existing upgrades include it when already provisioned; add it explicitly with `npm run scientific:provision -- PATH` when desired. Worker-only distributions do not require it. See [deployment and trust](scientific-deployment.md), [statistical/optimization methodology](scientific-methodology.md), [mission extensions](mission-analytics-readiness.md) and [acceptance evidence](phase12-verification.md). Appended schema 15 retains existing migrations and identities.

The optional service has no public port, database credentials, connector secrets or external network. Historical scientific jobs remain readable during outages; new requests fail explicitly. A repeated job identity is idempotent only for identical input; a new reviewed request needs a new identity after failure/cancellation. No downgrade of an applied schema is provided. Restore a verified backup to a separate stopped recovery environment rather than destructively rolling back retained databases.

Clean acceptance needs fourteen free Docker bridge subnet allocations with science and commerce simulators. The first attempt exhausted this host’s default pool. Only 21 verified empty acceptance-owned networks were removed; no container, volume, credential, selected network or approved live egress was removed. Archived test configurations/volumes remain retained. If reusing an archive whose empty network was removed, recreate its containers/networks through that archive’s Compose configuration and recover/reactivate its managed modules; do not blindly start stale container network IDs. Never prune unrelated networks or live approvals. This distribution is verified on Linux/amd64; the scientific wheel lock targets Python 3.13/Linux amd64.
