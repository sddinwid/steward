# CEE Steward platform

**Verified MVP release: v0.11.0.** Independently installed continuous commerce simulation, genuine Sales/Stock/fulfillment activity, synchronized ecosystem intelligence, governed purchasing findings and real local Qwen/MCP investigations. The signed modular UI renderer remains extensible; existing live catalog connections, credentials, identities and business records are preserved.

Run the complete selected installation from this directory with `docker compose up -d` and stop it with `docker compose down` (without `-v`). `docker compose ps` and `docker compose logs -f` work normally. This workspace already selects the existing preview. For another installed deployment, select it once with `node scripts/select-deployment.mjs PATH`; no accounts or data are recreated. See [Docker Compose operations](docs/docker-compose-operations.md).

Start with the [release installation guide](docs/phase11-release.md), [presenter controls](docs/phase11-operations.md), [actual verification and limitations](docs/phase11-verification.md), [structured evidence](docs/phase11-acceptance-evidence.json), [release gates](docs/phase11-release-gates.json) and [artifact identities](docs/phase11-release-artifacts.json). Only a distribution marked `acceptanceStatus: accepted` is accepted; its `acceptanceEvidenceCommit` identifies final verification.

The existing preview uses **https://master.localhost:26100** and **https://worker-1.localhost:26201** (Workers 2/3: 26202/26203). Accounts, passwords, identities and records were preserved. Separate local deployments are separate authentication realms; use their exact configured HTTPS origins and separate browser profiles when browsing them concurrently.

Prior tagged releases remain preserved: [v0.9.1 intelligence/UI release](docs/v0.9.1-release.md), [v0.9.0 UI release](docs/ui-ux-release.md) and [verification](docs/ui-ux-verification.md); [v0.8.0 release/upgrade](docs/phase8-release.md), [architecture](docs/phase8-architecture.md), [commerce configuration/recovery](docs/phase8-commerce.md), [SSMA contracts](docs/phase8-ssma.md) and [verification](docs/phase8-verification.md).

Production/fulfillment validation uses isolated synthetic providers and TLS simulators; it does not establish live commercial mutation compatibility. Shopify and Printify read-only catalog connectivity was separately exercised. Real local Ollama validation passed with conditional, source-backed calculations and human review. Passing the MVP demonstration does not establish commercial production readiness.
# Phase 10A development

Commerce contribution reporting, governed operational alerts, compact MCP investigations and the controlled USD demonstration are documented in [Phase 10A commerce intelligence](docs/phase10a-commerce-intelligence.md). Actual acceptance results are in [the Phase 10A verification report](docs/phase10a-verification.md). The accepted v0.9.1 tag remains preserved. Phase 10A upgraded the selected deployment in place; Phase 11 subsequently upgraded that same retained deployment with its original accounts, ports, identities and databases. See [single-stack operations](docs/single-stack-operations.md). Temporary acceptance containers have been removed; their archived configuration and data volumes are retained.


## Shopify development stores

The existing Shopify adapter supports read-only organization-owned development-store authentication and catalog preparation. See [setup and current Shopify requirements](docs/shopify-development-store.md) and [actual verification/blockers](docs/shopify-live-verification.md). Simulator functionality and the SSDS module renderer are preserved. No live Shopify connectivity or commercial OAuth installation is claimed without its separate verification.

## Phase 11 continuous commerce simulation

All mandatory gates passed and the exact candidate was promoted to accepted v0.11.0. See [operator/presenter controls, installation and recovery](docs/phase11-operations.md), [architecture](docs/adr/0025-continuous-commerce-simulation.md) and [actual verification evidence](docs/phase11-verification.md). The retained operator deployment and live connector credentials are preserved; the original 36-container operator stack is restored, controlled simulations are paused, and no unnecessary model remains loaded.


## Phase 12 scientific intelligence

Phase 12 release candidate: optional bounded Python analytics, chronological demand forecasts, integer procurement optimization, conditional sensitivity, executive/company comparisons, shared accessible charts and governed scientific MCP investigations. The generic signed module renderer remains extensible. See [presenter guide](docs/phase12-presenter.md), [installation/deployment](docs/phase12-release.md), [methods](docs/scientific-methodology.md) and [actual verification](docs/phase12-verification.md). The candidate is not tagged until clean-install/redeployment and all release gates pass. The selected operator installation is upgraded in place with retained accounts and databases; the optional service adds one isolated container.
