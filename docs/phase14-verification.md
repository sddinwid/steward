# Phase 14 verification

Baseline: v0.13.0 / 5522b4110cb367decb1a88e2ed616b4f3e71a96e, preserved unchanged. Branch: codex/phase14-economic-sustainability. The baseline working tree was clean. Read the original directive, repository rules, Phase 13 acceptance/ADRs/release docs, authoritative module and finance contracts, module renderer, permissions, signed peer routing, scientific/MCP integration and selected deployment.

Baseline actual checks: 94 platform/backend tests passed; Master and three Worker API/readiness/frontend checks passed; four separate database volumes and identical Worker core images passed. The selected operator remains steward-phase8-upgrade-reg with 44 containers. No passwords, identities, live connector settings or operational data were changed.

14A contract checkpoint: new economic contracts and shared exact-money functions build successfully. Seven tests passed: decimal precision/currencies, independent reserve reference case and negative availability, cash freshness/source identity/forecast rejection, current approval grants/separation of duties, changed-policy/terms/expired/repeated approvals, noncash ownership/unknown valuation, balanced journals/intercompany exclusion/reversal references. These are source contract results, not module, deployment or release acceptance. All 14B–14I gates remain pending.
