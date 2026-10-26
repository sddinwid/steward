# Phase 12 executive and scientific presenter guide

Use the selected retained deployment and existing private presenter credentials. Keep one active stack. Normal startup/shutdown: `docker compose up -d --wait` / `docker compose stop` from the selected workspace. Never use `down -v`. No account passwords changed during Phase 12. See [installation and upgrade](phase12-release.md).

## Controlled setup

```powershell
npm run build
node scripts/verify-phase12-installation.mjs .steward/phase8-upgrade-regressions
node scripts/configure-phase12-demo.mjs .steward/phase8-upgrade-regressions
node scripts/verify-phase12-browser.mjs .steward/phase8-upgrade-regressions
```

These are actual setup/acceptance commands, not required before every presentation. Installation uses the running Module Manager and separately signed packages without rebuilding Worker core. Configuration explicitly approves synthetic-only SSMA bindings/workflows and preserves ordinary Sales settings. The browser driver creates or resets only the Phase 12 dataset IDs recorded privately in `demo/phase12.json`; older datasets and ordinary records remain retained. Do not run outage acceptance during model investigations.

## Browser walkthrough

1. On Workers 1/2 open **Administration > Simulation Control Center**. Select the Phase 12 dataset; reset only that synthetic dataset for a fresh run and wait for owner-service recovery, then Start. The verified setup uses twelve orders/minute and speed 600. Speed one deliberately makes simulated production/shipping take several real minutes. Pause, Resume and Stop are local controls. At the generation limit, already accepted work settles before automatic pause.
2. Open **Simulation live dashboard**. State/limits, source activity, inventory and completed-order reconciliation are grouped separately. Recognized completed merchandise minus completed refunds, production, shipping, transaction fees and channel fees equals estimated contribution. All-order refunds are informational, not deducted twice. Unknown components or pending final owner observations suppress complete contribution.
3. Master **Business > Executive Overview** shows authorized entities, freshness, outstanding findings, currency-separated finances, conditional opportunities and supported risks. Master's own operating entity need not run a Worker.
4. **Companies & Relationships** provides compact comparisons with expandable details and a relationship graph. Known and hypothetical relationships have different styles. This workspace does not repeat the executive dashboard or rank businesses by inferred profit.
5. **Scientific Analytics**: select or prepare the two-company synthetic analytical history. It is 168 reproducible historical daily observations, not imported transactions. Its following 30 intervals are historical fixture dates, not today's next month. Short operational history may correctly be insufficient.
6. Run a demand forecast. Inspect range, completeness, method selection, chronological MAE/RMSE and baseline comparisons, supported 90% future-observation intervals and limitations. Expand accessible value tables/source details. One observation is not a trend; missing values are not zero.
7. Select that completed forecast and **Optimize procurement**. Compare external baseline/proposed/conditional benefit, integer allocations, supplier capacity/MOQ/tier/shipping and separate company effects. Terms are explicit synthetic assumptions, not live quotes. Internal transfers are zero and do not count as savings.
8. **Compare scenarios**. Demand, prices, shipping, capacity and transition variations are conditional cases, not probabilities. Inspect infeasibility and entity disadvantages; favorable modeled outcomes execute nothing.
9. Review frozen input/results, forecast derivation, source references, assumptions and required decisions. Check human review only after inspection and create the affected-only finding. Acknowledge on Workers 1/2 and inspect Master receipts; Worker 3 remains unaffected. No purchase, contract, financial transfer or production is authorized.
10. Pause the controlled datasets. Historical charts/calculations remain readable.

## Optional real local AI

Scientific UI operations do not require a model. In AI Analyst inspect provider status, select Scientific procurement, and ask for a conditional investigation of the separately labeled synthetic historical dataset through forecast, constraints, integer optimization and scenarios. Watch actual MCP activity and original calculation links. Review model wording against evidence before publishing.

The existing `verify-ollama-provider.mjs` supports `STEWARD_ANALYST_CAPABILITY=scientific-procurement`, installed `qwen2.5:7b` and the authenticated local TLS bridge. It temporarily creates a larger-context alias without altering the base model, restores exact private configuration and unloads the model afterward. No cloud key is required. See [local provider setup](phase5b.md) and [scientific deployment](scientific-deployment.md). A missing model/configuration is explicit; no test-model result is presented as real AI. One bounded evidence correction remains within original time/step/context budgets; repeated mismatch fails and cannot publish. Human review remains mandatory even when automatic validation passes.

## Recovery and limits

- Master/science/model outages do not prevent Worker operations. Master historical reports and ordinary deterministic monitoring remain available during science outage. Restore the service, inspect failed/interrupted work, and use a new reviewed job identity; identical retries retain state.
- Failed module upgrade: inspect visible identity/migration failure and recover a retained trusted package. Do not rewrite published versions or reverse applied migrations.
- Paused incomplete accepted work: Resume and let the bounded lifecycle settle. Final observation retries are finite and unavailable evidence is explicit.
- Missing history/terms: use a properly scoped snapshot or clearly synthetic validation data. Never pad operational history or infer production cost from retail catalog totals.
- Keep USD synthetic activity and historical EUR/other currencies separate. No implicit exchange rate.
- Worker 3's live Shopify/Printify remain read-only; synthetic modules have neither commercial secrets nor public egress. Simulation establishes no live paid-production compatibility.
- Forecasts and solver results depend on declared data/terms, model assumptions and numerical status. They are neither guarantees nor fairness decisions. Separate company consent remains required.
- Local MVP acceptance does not establish commercial production readiness.
