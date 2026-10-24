# CEE Steward platform

**Verified MVP release: v0.9.1.** Evidence-backed executive intelligence, readable investigation/finding review, currency-safe financial comparisons and refined Worker navigation/forms. Independently packaged modules still contribute navigation, forms and operations through the generic renderer.

Start with the [installation and presenter guide](docs/v0.9.1-release.md), [actual acceptance results and limitations](docs/v0.9.1-verification.md), [structured evidence](docs/v0.9.1-acceptance-evidence.json), [release gates](docs/v0.9.1-release-gates.json) and [architecture decision](docs/adr/0022-evidence-derived-business-intelligence.md). Only a distribution marked `acceptanceStatus: accepted` is accepted; its `acceptanceEvidenceCommit` identifies final verification.

The existing preview uses **https://master.localhost:26100** and **https://worker-1.localhost:26201** (Workers 2/3: 26202/26203). Accounts, passwords, identities and records were preserved. Separate local deployments are separate authentication realms; use their exact configured HTTPS origins and separate browser profiles when browsing them concurrently.

Prior tagged releases remain preserved: [v0.9.0 UI release](docs/ui-ux-release.md) and [verification](docs/ui-ux-verification.md); [v0.8.0 release/upgrade](docs/phase8-release.md), [architecture](docs/phase8-architecture.md), [commerce configuration/recovery](docs/phase8-commerce.md), [SSMA contracts](docs/phase8-ssma.md) and [verification](docs/phase8-verification.md).

Commerce validation uses local TLS simulators; it does not establish live commercial connectivity. Real local Ollama validation passed with conditional, source-backed calculations and human review. Passing the MVP demonstration does not establish commercial production readiness.
