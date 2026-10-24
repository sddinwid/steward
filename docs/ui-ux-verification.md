# UI/UX and USD implementation verification

Status: implementation in progress; this is an automatically verified checkpoint, not final phase acceptance. No v0.9.0 release tag or accepted distribution has been produced.

## Preserved release

The preflight working tree was clean on phase8/smart-modules-commerce at 7d3a70d6349ca684111b7e2b879650c2be4c54d6 (v0.8.0). That commit/tag and its accepted release artifacts remain intact. UI work is isolated on ux/business-workspaces. Source identifies the next candidate as 0.9.0, with append-only migration 10. Existing 0.8 images cannot run against a migrated schema-10 database; retained deployments were not migrated.

## Implemented checkpoint

- Shared responsive shell with persistent workspace navigation and hash-based deep links. Worker Business is the default. Administration and Developer are restricted to existing authorized administrator roles, including direct navigation.
- Business navigation uses active, trusted, permission-filtered module discovery. Groups cover Sales & Orders, Inventory, Procurement, Assets, Workforce, Shopify and Printify as those packages become available. Uninstalled and unauthorized modules are absent.
- Existing declarative operational screens retain backend authority. Added search, loading/empty/error states, readable structured details, structured line-item forms and original-currency amount formatting. Sales line prices are entered as dollars and stored as integer cents.
- Module Manager has schema-derived configuration controls, with an optional advanced JSON editor. Governance, signed contracts and raw diagnostics are separated into Developer.
- Master overview reads actual authorized companies, synchronization freshness, findings and persisted investigations. History, AI Analyst, reports/opportunities and consolidated Findings & Alerts have visible destinations. Investigation lists now include their existing question, timestamps and finding link, under unchanged account ownership enforcement.
- Findings show original evidence references and affected-entity review/delivery status. Local business users can read only the local affected-only finding projection; acknowledgment/resolution remains administrator-controlled.
- Company preferences store country, base currency, locale and time zone, using scoped, audited HTTPS APIs. Worker business identity resolves persisted enrollment; bootstrap/runtime identity remains explicitly labeled in diagnostics.
- New US setup proposes USD. New currency-aware module installations inherit explicit local company preferences. Existing module configuration, EUR records and analytical evidence are never automatically rewritten. Display preserves original currency and labels a different configured base currency as unconverted.
- Separately authored datasets/us-workspace-demo.json and an idempotent seed runner add controlled USD Inventory, customer and order records, requiring explicit US/USD setup and a USD Sales configuration first.

## Actual verification so far

| Command/check | Result |
|---|---|
| npm run build | Passed all workspace applications/packages and business modules |
| npm test | 82 passed, zero failed: previous 80 plus two localization/identity/authorization checks |
| npm run test:smart:browser | 9 passed, including actual Chromium governance navigation in the new Developer workspace |
| node scripts/verify-workspaces.mjs .steward/phase8-upgrade-regressions | 7 checks passed: exact protected-row preservation, installed-screen deep links, separated workspaces, persisted USD preference, actual Master history/findings and desktop/mobile rendering |
| node scripts/verify-workspace-operations.mjs .steward/phase8-upgrade-regressions | Passed module management/core-image checks, actual customer/USD order creation with line-item controls, and ordinary-user visibility plus backend installation denial |
| node scripts/seed-us-workspace.mjs .steward/phase8-upgrade-regressions (twice) | First run created 3 new USD records; repeat created 0 and preserved all 3 |
| Earlier operational regression rerun | In progress; final results must be recorded before phase acceptance |

Raw evidence: artifacts/ux-build.log, ux-tests.log, ux-smart-browser.log, ux-workspaces.json, ux-operations.json, ux-regressions.json and ux-*.png. Evidence contains no passwords, session cookies, private keys or connector credentials. Initial schema-9 to schema-10 redeployment compared 18 protected table hashes, preserving installation/account/enrollment/module/finding/investigation rows exactly before deliberate synthetic tests.

Browser acceptance caught a nested-label accessibility defect in the line editor and historical field-selector mismatches; these were corrected and actual order creation was repeated. The original smoke check assumed schema 9 for all 0.8 runtimes; the new source candidate is explicitly versioned 0.9.0/schema 10 rather than misidentifying the migrated application as the accepted release.

## Running candidate and retained environments

The isolated regression fixture serves candidate Master at https://master.localhost:26100 and Workers at https://worker-1.localhost:26201, https://worker-2.localhost:26202 and https://worker-3.localhost:26203. Use its existing private demo/presenter.json credentials. Do not reuse accounts from another installation or publish that file.

Retained Phase 7 remains on HTTPS 6100/6201-6203; accepted Phase 8 remains on 16100/16201-16203. Their database, identity, credentials and application images were not changed for this checkpoint.

## Outstanding acceptance

Finish browser commerce/module-installation demonstrations across the expanded module catalog; complete all earlier deployment regressions against the new navigation; validate analytical finding links/calculation screens with accepted live-model evidence; finish currency-integrity and outage/recovery checks; improve remaining advanced-only business/configuration fields where their signed schema is insufficient. A fresh three-Worker installation and final source/artifact verification remain required. Account creation/password recovery still uses the operator CLI; this checkpoint adds no password-changing shortcuts. No new live Shopify/Printify connectivity, paid order or fresh live-model acceptance is claimed.
