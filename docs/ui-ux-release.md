# Steward 0.9.0 installation and presentation

This release continues the 0.8 architecture. Master and Workers remain independently deployable; modules arrive as separately signed packages. Release acceptance is recorded in `ui-ux-verification.md` and `ui-ux-release-gates.json`, not inferred from a successful build.

## Install from the distribution

Prerequisites: Node 24, npm, Docker Engine/Compose with `!reset` support, and OpenSSL (Git for Windows includes it). Review the distribution's provenance and checksums before trusting bundled packages. Keep the complete distribution directory, including `images.tar`, both distribution manifests, module packages and toolkit.

Run from the distributed `toolkit` directory; no original checkout is required:

```powershell
npm ci
npm run build
node scripts/release.mjs verify --bundle ..
$env:STEWARD_DEPLOYMENT = [IO.Path]::GetFullPath('../../steward-demo-state')
node scripts/release.mjs install --bundle .. --directory $env:STEWARD_DEPLOYMENT --project steward-ui-demo --port-offset 30000 --trust-bundled-modules --simulators
node scripts/compose.mjs up -d --no-build --wait
node scripts/demo.mjs $env:STEWARD_DEPLOYMENT setup
node scripts/verify-phase8-commerce.mjs $env:STEWARD_DEPLOYMENT enroll
```

Keep deployment state outside the distribution and never redistribute private state. The fresh-install presenter setup creates private accounts; it refuses to appropriate an existing operator installation. Credentials are stored only in the selected deployment's `demo/presenter.json`. Master uses `accounts.registry`; Workers use `accounts.worker-1`, `accounts.worker-2`, and `accounts.worker-3`. Existing installations keep their existing accounts. No password reset occurs during upgrade.

Use **https://master.localhost:36100** and **https://worker-1.localhost:36201** (Workers 2/3: 36202/36203) for this offset. Plain `localhost`, alternate hostnames, HTTP, and API ports are not equivalent secure sign-in origins. Install the generated development CA in a dedicated browser profile if desired; production requires operator-managed TLS and explicit Master identity trust. Never disable backend origin or certificate verification to resolve a sign-in error.

If Docker reports exhausted address pools, choose an unused private prefix and run `node scripts/configure-network-pool.mjs $env:STEWARD_DEPLOYMENT 10.245`, then repeat startup. This preserves existing networks and volumes; do not prune other deployments.

## Upgrade, shutdown and recovery

Back up all operational/module PostgreSQL databases and private deployment files before an upgrade. Keep the distribution beside the selected deployment, and run:

```powershell
node scripts/release.mjs upgrade --bundle .. --directory $env:STEWARD_DEPLOYMENT --trust-bundled-modules --simulators
node scripts/release.mjs start --directory $env:STEWARD_DEPLOYMENT
node scripts/smoke.mjs $env:STEWARD_DEPLOYMENT
node scripts/compose.mjs down
```

Repeat `install`/`upgrade` with the same topology to preserve identities, accounts, configuration and databases. Shutdown keeps volumes. Do not use `down -v`. Schema 10 is append-only; 0.8 images intentionally refuse it. An application-image downgrade is not a database rollback. Restore a verified backup into a separate recovery installation if rollback is necessary.

New 0.9 simulator accounts default to USD. `STEWARD_SIMULATOR_CURRENCY` can select another supported currency **before first provisioning**. Existing simulator configuration and all historical source currencies are preserved. Explicit company preferences govern defaults for new module installations; existing module currency remains authoritative until an administrator explicitly changes it. No foreign-exchange conversion is supplied.

## Presenter journey

1. Sign in to Worker with its local business account. Business is the default workspace. Open Sales & Orders, create a customer and order using line-item controls, inspect Inventory and its quantities, and review Findings & Alerts. Read-only users see only their granted screens and actions.
2. As local administrator, open Administration → Module Manager. Inspect publisher/compatibility status, install a trusted package using generated configuration controls, activate it, and return to Business. New navigation arrives from signed module discovery without rebuilding Worker. Configuration Save is outside the optional advanced JSON panel.
3. Open Administration → Shopify/Printify connections and product mappings. Map actual catalog variant IDs to local SKUs using the forms. In Shopify Orders, review fulfillment ownership before dispatch. Native/external fulfillment is monitored; it does not authorize Steward production. Use Printify → Native Printify Fulfillment to inspect external status/tracking without manufacturing controls.
4. For a Steward-routed synthetic order, dispatch to Sales, confirm/reserve stock, request production, then explicitly authorize production in Printify Production Orders. Simulator shipping changes propagate back to Sales and Shopify. Publish commerce evidence explicitly. Cost figures are estimates; unknown costs stay unknown.
5. On Master, use Executive Overview → Companies & Relationships → Investigation History. Open an investigation, its observed sources, assumptions and deterministic calculation. Follow its finding link and inspect delivery/acknowledgment. AI Analyst launches a new investigation through the visible question form.

The simulator acceptance runner provides controlled source orders and shipping changes; real commerce requires separate credentials and live-provider certification. Never use the demo runner against live commercial accounts. Repeating a completed acceptance transaction is not a reset: use a new synthetic order namespace (`STEWARD_COMMERCE_ORDER_BASE`) and preserve prior history. `seed-us-workspace.mjs` is idempotent and never erases records. Existing Phase 7 ownership-ledger reset remains restricted to its own synthetic scenario. No global database reset is needed for a presentation.

## Local AI presentation and failures

Ollama must be listening locally with `qwen2.5:7b` installed. The existing `verify-ollama-provider.mjs` driver creates a context alias, bridges local Ollama through authenticated TLS, restores the exact original configuration/key bytes, and unloads that alias afterward. `STEWARD_OLLAMA_BROWSER=1` launches and publishes through actual Chromium UI controls. Keep credentials in private files; never enter provider secrets in business forms or screenshots.

```powershell
$env:STEWARD_SEED_CREDENTIALS_FILE = Join-Path (Resolve-Path $env:STEWARD_DEPLOYMENT) 'demo/presenter.json'
$env:STEWARD_DEMO_RETRY_LOGIN = '1'
$env:STEWARD_OLLAMA_BROWSER = '1'
$env:STEWARD_OLLAMA_REPORT = 'artifacts/ui-live-ai.json'
node scripts/verify-ollama-provider.mjs $env:STEWARD_DEPLOYMENT
```

Review model wording against observed sources and server calculations before treating a recommendation as accepted. A completed model response can still contain ambiguous language. Findings never execute a business decision. `MODEL_NOT_CONFIGURED` means setup is deferred; `TRANSPORT_UNAVAILABLE` means the configured bridge/provider cannot be reached; `TRANSPORT_TIMEOUT` is a bounded provider timeout; `MODEL_OUTPUT_INVALID` means the response did not satisfy the required contract. Failed runs retain activity and display no final recommendation. After an interrupted bridge process, use the existing local-provider recovery script and its private recovery file; do not overwrite secrets with demo defaults.

For uncertain commerce outcomes, inspect the retained source order, connector connection and job error. Restore connectivity and use explicit reconciliation. Never blindly submit another paid order, erase issuance receipts, infer fulfilled status, or silently roll back module data. A module can be disabled without deleting its records.

## Production limits

This is an MVP release, not commercial production certification. Shopify/Printify acceptance uses authenticated TLS simulators, not live commercial connectivity. Costs remain estimated. Human approval, operational ownership and provider-specific reconciliation are necessary. Enterprise SSO/MFA, self-service account recovery, production secrets operations, backups/restore drills, external penetration/load testing, and full regional localization require further deployment work. Account provisioning/recovery uses the secured operator CLI; this phase does not invent password-reset shortcuts. Dates are not comprehensively localized to the saved time-zone preference.
