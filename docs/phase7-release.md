# Steward 0.7.0 installation and release operations

Prerequisites are unchanged: Node 24.x, npm 10+, Docker Linux containers/Compose with `!reset` support, and OpenSSL for local trust provisioning. Playwright Chromium is needed for automated presenter/browser verification. Ollama with an already installed `qwen2.5:7b` is needed only for the live AI segment. No cloud API key is required for installation or ordinary business services.

## Install the versioned distribution

The release directory contains `release.json`, checksummed `images.tar`, role-specific distribution manifests, separately signed module payloads, and `toolkit/`. Deployment secrets, databases, model weights and developer state are excluded. Copy the complete directory to the target machine. Run from its `toolkit` directory:

```powershell
npm ci
npm run build
node scripts/release.mjs verify --bundle ..
node scripts/release.mjs install --bundle .. --directory .steward/demo7 --project steward-demo7 --trust-bundled-modules
node scripts/release.mjs start --directory .steward/demo7
node scripts/smoke.mjs .steward/demo7
node scripts/demo.mjs .steward/demo7 setup
node scripts/demo-phase7.mjs .steward/demo7 install
node scripts/demo-phase7.mjs .steward/demo7 seed
node scripts/demo-phase7.mjs .steward/demo7 check
```

`--trust-bundled-modules` explicitly authorizes verified release payloads to be signed by this installation's local operator key. It is not an unsigned-code bypass. Installation creates/preserves configuration and selects image digests; it does not enroll Workers or install modules. The subsequent explicit demo setup uses real authentication, entity registration, authorization and trusted enrollment. Demo setup refuses to appropriate an existing business deployment. Private presenter credentials are generated in `.steward/demo7/demo/presenter.json`; never commit or share that file.

The installer also supports `--mode master`, or `--mode worker --workers 3 --trust PATH_TO_PUBLIC_MASTER_TRUST_BUNDLE`. The established split-deployment trust/account/enrollment instructions in `phase2.md` still apply. Source ports and credentials are configuration, not baked into Worker images. All Workers use the same API, frontend and module-host image identities.

## Upgrade or redeploy an existing installation

Back up the installation configuration/secret directory and PostgreSQL volumes with the existing operational procedure. Then use the new toolkit and the existing deployment path:

```powershell
node scripts/release.mjs verify --bundle ..
node scripts/release.mjs upgrade --bundle .. --directory PATH_TO_EXISTING_DEPLOYMENT --trust-bundled-modules
node scripts/release.mjs start --directory PATH_TO_EXISTING_DEPLOYMENT
node scripts/smoke.mjs PATH_TO_EXISTING_DEPLOYMENT
```

Repeated install/upgrade preserves installation identities, accounts, enrollment certificates, database volumes, module configuration and installed data. Selection keeps the previous Compose image overlay for diagnosis; do not select an older binary after future incompatible schema changes without a documented restore plan. Core schema remains 6 in this release. Module-specific migrations are checksummed and transactional, with explicit recovery and no destructive down migration.

The archive includes Inventory 1.2.1 for the retained-data upgrade demonstration, Inventory 1.3.2, Operations 1.0.0, Procurement/Sales/Workforce 1.0.2 and Assets 1.0.3. Installing new packages into the catalog does not upgrade already installed modules. Use the running Module Manager's explicit upgrade action. Existing signed old package identities remain immutable.

```powershell
node scripts/release.mjs status --directory .steward/demo7
node scripts/release.mjs stop --directory .steward/demo7
node scripts/release.mjs start --directory .steward/demo7
```

Stop removes only this project's disposable containers/networks and owned module containers. It retains all volumes, configurations and credentials. Do not use `down -v`, volume pruning or filesystem deletion as a demonstration reset.

## Build from the preserved development baseline

Run from this repository root. The verified Phase 6 descriptor catalog and original immutable Inventory/Operations image digests are retained in the existing baseline deployment or its 0.6.0 distribution. Importing them verifies the source publisher and local image digest; it never rebuilds an existing published version.

```powershell
npm ci
npm run build
npm run build:inventory
npm run build:operations
npm test
npx playwright install chromium
node scripts/build-release-images.mjs 0.7.0

node tools/installer/dist/cli.js provision --directory .steward/phase7-dev --project steward-phase7-dev
node tools/installer/dist/security-cli.js .steward/phase7-dev
node tools/installer/dist/modules-cli.js .steward/phase7-dev
node tools/installer/dist/data-cli.js .steward/phase7-dev
node tools/installer/dist/analyst-cli.js .steward/phase7-dev
node scripts/import-trusted-packages.mjs .steward/dev .steward/phase7-dev cee.inventory@1.2.1 cee.operations@1.0.0
node scripts/publish-module.mjs modules/inventory .steward/phase7-dev
node scripts/publish-module.mjs modules/procurement .steward/phase7-dev
node scripts/publish-module.mjs modules/sales .steward/phase7-dev
node scripts/publish-module.mjs modules/assets .steward/phase7-dev
node scripts/publish-module.mjs modules/workforce .steward/phase7-dev
```

Publishing is sequential. It builds only the separate module image and signs its real manifest/migration hashes. Bump a module version before changing a published package; a same-version content conflict is rejected. Do not rebuild/re-publish the retained Operations 1.0.0 or Inventory 1.2.1 artifact under the same identity. Recover legacy artifacts from their preserved 0.6.0 distribution/tag when necessary.

Stop the deployment currently occupying the default ports using its own wrapper/release stop command, then:

```powershell
$env:STEWARD_DEPLOYMENT='.steward/phase7-dev'
node scripts/compose.mjs up --no-build -d --wait --wait-timeout 180
node scripts/demo.mjs .steward/phase7-dev setup
node scripts/demo-phase7.mjs .steward/phase7-dev install
node scripts/demo-phase7.mjs .steward/phase7-dev seed
node scripts/demo-phase7.mjs .steward/phase7-dev check

node scripts/release.mjs pack --version 0.7.0 --directory .steward/phase7-dev --bundle artifacts/releases/steward-0.7.0
node scripts/release.mjs verify --bundle artifacts/releases/steward-0.7.0
```

Candidate image tags are build outputs. Accepted distributions pin their immutable digests and use `--no-build`. A deployment with a release overlay continues using its selected digests even if local tags are rebuilt; use an explicit release upgrade to select a new distribution. Do not rebuild Worker core while demonstrating module installation.

Final archive hashes, accepted core/module image identities and acceptance results are recorded in the post-packaging verification sidecar and `phase7-verification.md`. Large images remain ignored by Git; the source, exact commands, contracts, tests and sanitized verification evidence are committed.
