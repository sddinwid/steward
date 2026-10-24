# Phase 8 release and upgrade procedure

Acceptance is still running; no successful release tag is asserted by this document. Candidate archives are explicitly marked `acceptanceStatus: candidate`. Promotion to an accepted distribution requires passing `docs/phase8-release-gates.json`, clean committed source and exact tested images. No live Shopify/Printify account is required or exercised.

Prerequisites: Node 24, npm 10+, Docker Linux containers/Compose with `!reset` and volume-subpath support, OpenSSL, and sufficient free disk for the image archive. Ollama with the existing `qwen2.5:7b` model is needed for the optional real-model demonstration; ordinary Worker services remain independent. Deployment directories contain private credentials and must not be distributed.

## Build and candidate acceptance

```powershell
npm ci
npm run build
npm run build:inventory
npm run build:operations
npm test
npm run test:smart:browser
node scripts/build-release-images.mjs 0.8.0
docker build -f infra/Dockerfile.commerce-simulator -t steward-commerce-simulator:1.0.0 .
# Publish each new module once into the dedicated operator catalog; published versions are immutable.
node scripts/publish-module.mjs modules/inventory .steward/phase8-acceptance
node scripts/publish-module.mjs modules/sales .steward/phase8-acceptance
node scripts/publish-module.mjs modules/shopify .steward/phase8-acceptance
node scripts/publish-module.mjs modules/printify .steward/phase8-acceptance
node scripts/publish-module.mjs modules/stock-ledger .steward/phase8-acceptance
# Commit verified changes first. Use a fresh candidate directory for each source checkpoint.
node scripts/release.mjs pack --version 0.8.0 --candidate --bundle artifacts/candidates/steward-0.8.0-rcN --directory .steward/phase8-acceptance
node scripts/release.mjs verify --bundle artifacts/candidates/steward-0.8.0-rcN
```

The archive includes pinned Master/Worker API/frontend and module-host images, PostgreSQL, a separate simulator image, signed-module payloads and portable source toolkit. The operator reviews provenance and explicitly trusts the bundled module payloads; installation signs them with that deployment's own publisher key. No installation identities, secrets, accounts, certificates or business databases are in the bundle.

## Clean portable install

Copy the whole archive to an arbitrary location and work from its `toolkit` directory. The commands below use placeholders for operator-selected paths. All script paths resolve relative to the copied toolkit; there is no developer checkout dependency.

```powershell
npm ci
npm run build
node scripts/release.mjs verify --bundle ..
node scripts/release.mjs install --bundle .. --directory DEPLOYMENT --project steward-demo --port-offset 10000 --simulators --trust-bundled-modules
# Optional: only if Docker's default subnet pool is exhausted; choose a non-overlapping host/VPN prefix.
node scripts/configure-network-pool.mjs DEPLOYMENT 10.241
node scripts/release.mjs start --directory DEPLOYMENT
node scripts/smoke.mjs DEPLOYMENT
node scripts/browser-smoke.mjs DEPLOYMENT
node scripts/demo.mjs DEPLOYMENT setup
node scripts/verify-phase8-commerce.mjs DEPLOYMENT enroll
node scripts/verify-phase8-commerce.mjs DEPLOYMENT modules
node scripts/verify-phase8-commerce.mjs DEPLOYMENT commerce
node scripts/verify-phase8-mcp.mjs DEPLOYMENT
```

Do not run synthetic acceptance against an operator's real installation. Setup intentionally refuses to adopt existing administrator accounts or business state. The retained Phase 7 deployment runs at its original ports; an offset of 10000 places the Phase 8 Master API/web/HTTPS at 14100/15100/16100, Worker APIs at 14201–14203, webs at 15201–15203, HTTPS at 16201–16203, simulators at 28443/28444. Simulators have only loopback-published TLS ports and private operator authentication.

## Upgrade and repeat provisioning

Back up operator configuration and PostgreSQL using the existing backup policy. Verify the archive first, then:

```powershell
node scripts/release.mjs upgrade --bundle ARCHIVE --directory EXISTING_DEPLOYMENT --trust-bundled-modules
node scripts/release.mjs start --directory EXISTING_DEPLOYMENT
node scripts/smoke.mjs EXISTING_DEPLOYMENT
node scripts/release.mjs status --directory EXISTING_DEPLOYMENT
```

Topology, ports, existing module versions, activation/configuration, accounts and enrollment remain unchanged. Commerce ingress is additive; upgrades configure no live credentials. Core schema migrations append versions 7–9 to v0.7's schema 6. Old packages continue running; upgrading core does not automatically install or upgrade any module. The release selector retains `previous-compose.yaml`, but it does not promise a destructive database downgrade. Module upgrades may suspend pinned integrations until explicit review; never rewrite receipts or delete authoritative state to make a retry succeed.

Use `--simulators` consistently when upgrading a deployment already provisioned with simulators. The mode is preserved and conflicting provisioning is rejected. Re-running the original installer/provisioners preserves secrets and identities. All Workers select the same Worker image IDs. Module installation does not rebuild or replace Worker core.

## Verification and shutdown

`verify-phase8-provider-browser.mjs` exercises browser provider approval/activation and original-obligation compensation. `verify-phase8-commerce.mjs DEPLOYMENT recovery` creates additional uniquely identified synthetic orders and exercises Master/simulator/Worker/coordinator/module outages. `verify-phase8-connector-failures.mjs` verifies throttling, rejected credentials, malformed responses, timeouts and recovery without changing Sales records. `verify-phase8-upgrade.mjs DEPLOYMENT ARCHIVE` requires an actual populated v0.7 starting runtime and compares retained hashes. `verify-phase8-regressions.mjs` runs earlier regression suites against a separate upgraded fixture, with deployment-specific baselines and resumable evidence.

For real-model commerce validation, set `STEWARD_SEED_CREDENTIALS_FILE` to the private presenter file, `STEWARD_ANALYST_CAPABILITY=commerce-performance`, `STEWARD_OLLAMA_DEFER_PUBLICATION=1`, and `STEWARD_ANALYST_PROMPT` to the explicit evidence-backed commerce question. Run `node scripts/verify-ollama-provider.mjs DEPLOYMENT`. It uses a temporary authenticated TLS bridge to local Ollama, restores configuration bytes and unloads the model. Review the narrative against the exact service calculations before using `publish-reviewed-finding.mjs DEPLOYMENT INVESTIGATION_UUID "review note"`.

```powershell
node scripts/release.mjs stop --directory DEPLOYMENT
node scripts/release.mjs start --directory DEPLOYMENT
```

Stop preserves volumes, credentials and records. No blanket reset command is provided for commerce history. Existing Phase 7 controlled scenario reset withdraws only its owned projections and preserves audit history. Destroy only an explicitly disposable deployment using separately reviewed volume removal; never use Docker prune or delete the retained Phase 7 volumes.

The release author packages the final candidate from clean committed source, verifies the exact archive and its redeployment, commits acceptance gates bound to its source commit and manifest SHA-256, then runs `node scripts/release.mjs promote --bundle ARCHIVE`. Promotion changes only the acceptance label and evidence commit in `release.json`; every payload checksum and image ID remains unchanged. Run verification again after promotion and record the accepted manifest hash before tagging.
