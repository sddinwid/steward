# CEE Steward platform

**Verified MVP release: v0.9.1.** Evidence-backed executive intelligence, readable investigation/finding review, currency-safe financial comparisons and refined Worker navigation/forms. Independently packaged modules still contribute navigation, forms and operations through the generic renderer.

Run the complete selected installation from this directory with `docker compose up -d` and stop it with `docker compose down` (without `-v`). `docker compose ps` and `docker compose logs -f` work normally. This workspace already selects the existing preview. For another installed deployment, select it once with `node scripts/select-deployment.mjs PATH`; no accounts or data are recreated. See [Docker Compose operations](docs/docker-compose-operations.md).

Start with the [installation and presenter guide](docs/v0.9.1-release.md), [actual acceptance results and limitations](docs/v0.9.1-verification.md), [structured evidence](docs/v0.9.1-acceptance-evidence.json), [release gates](docs/v0.9.1-release-gates.json) and [architecture decision](docs/adr/0022-evidence-derived-business-intelligence.md). Only a distribution marked `acceptanceStatus: accepted` is accepted; its `acceptanceEvidenceCommit` identifies final verification.

The existing preview uses **https://master.localhost:26100** and **https://worker-1.localhost:26201** (Workers 2/3: 26202/26203). Accounts, passwords, identities and records were preserved. Separate local deployments are separate authentication realms; use their exact configured HTTPS origins and separate browser profiles when browsing them concurrently.

Prior tagged releases remain preserved: [v0.9.0 UI release](docs/ui-ux-release.md) and [verification](docs/ui-ux-verification.md); [v0.8.0 release/upgrade](docs/phase8-release.md), [architecture](docs/phase8-architecture.md), [commerce configuration/recovery](docs/phase8-commerce.md), [SSMA contracts](docs/phase8-ssma.md) and [verification](docs/phase8-verification.md).

Commerce validation uses local TLS simulators; it does not establish live commercial connectivity. Real local Ollama validation passed with conditional, source-backed calculations and human review. Passing the MVP demonstration does not establish commercial production readiness.
# Phase 10A development

Commerce contribution reporting, governed operational alerts, compact MCP investigations and the controlled USD demonstration are documented in [Phase 10A commerce intelligence](docs/phase10a-commerce-intelligence.md). Actual acceptance results are in [the Phase 10A verification report](docs/phase10a-verification.md). The accepted v0.9.1 release and existing operator-selected deployment remain preserved; Phase 10A uses a separate synthetic acceptance fixture.

