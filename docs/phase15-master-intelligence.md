# Phase 15 Master Catalog and Pricing intelligence

This is reviewed analytical disclosure, not direct access to module databases.
Catalog 1.4.0, Pricing Management 1.3.0 and Sales 1.5.0 require platform 0.15.0.
They are source candidates until installed-host and release gates pass.

In Catalog, create a bounded publication from the current offering/variant and
explicitly review its purpose and lease. Optional analytical capability reads
must be enabled separately and governed through existing SSMA bindings/workflows.
In Sales, retain the accepted line and request its exact Catalog classification;
manual attribution requires human review and never rewrites accepted money.
In Pricing, prepare a contribution publication, then obtain separate authorized
reviews under the current approval policy before publishing. Existing price
approval does not silently approve an analytical publication. Withdrawals and
expired leases preserve history.

Master's Business → Catalog Intelligence uses authorized entity, currency,
publication-review time window, purpose, status, search and page filters. Missing
disclosure does not prove that a module is absent. Currency-separated cumulative
Sales values are attributed snapshots, not complete-period accounting revenue.
Unknown costs, refunds, origin coverage and actual contribution are not zero.

Select compatible Pricing publications for independent deterministic comparison
or scientific descriptive statistics. Inspect evidence by exact full reference;
split source evidence is paginated. If two full Worker references collapse to the same legacy scientific reference, scientific comparison is rejected; exact-source deterministic comparison remains available. Statistical means retain exact fractions in
cents and do not become rounded financial transactions. Each result retains
method, ownership, timeframe, currency, source leases, assumptions and human
review requirements. No price or operational decision is executed.

## API configuration and contracts

All routes use the existing Master secure session. POST requests require the
existing origin/CSRF protections. Registry administrators can access enrolled
entities; enrollment administrators require explicit entity authorizations.
Disabled accounts and out-of-scope sources fail closed.

- `GET /api/v15/catalog-intelligence/dashboard` and `/publications`: filters
  `entityId`, `currency`, `purpose=business|simulation|all`, `status=current|all`,
  canonical UTC `from`/`to`, `q`, `limit` (1–20), `offset` (0–10000).
- `POST /evidence`: `{reference, limit, offset}`; maximum eight evidence rows.
- `POST /compare`: `{references, calculationId?}`; two to eight exact Pricing
  references, optional idempotent calculation identity.
- `POST /scientific`: `{references, measure}`; measure is `contribution` or
  `variable-cost`, using compatible recomputed Pricing observations.
- `POST /sales-statistics`: `{references}`; two to eight distinct accepted Sales
  lines for the same exact offering revision/currency/channel and origin scope.
  Quantity descriptions disclose the sample; they do not fabricate missing days
  or a demand forecast.
- `GET /calculations/:id`: retained owner-scoped evidence, with renewed source
  authorization; historical results do not grant current operational authority.

Every `reference` contains `entityId`, `installationId`, `moduleId`, `streamId`,
`recordId` and `revision`. Partial IDs and client-provided financial inputs are
rejected. Pricing evidence counts/digests and original provider identity must
reconcile. A missing or altered set cannot produce a successful comparison.

Dashboard aggregation is limited to 200 publications and at most 20 complete
Pricing evidence sets. Truncation and incomplete evidence are disclosed. Select
historical status to inspect disclosed historical trends; absent comparable points
remain unavailable. Similar labels and complementary portfolio types indicate
review candidates only. Supplier records remain provider-scoped; an unproven
global supplier identity cannot establish coordinated purchasing savings.

The scientific service uses the existing secure configuration. Its absence,
timeout, malformed result or reconciliation failure does not interrupt ordinary
Catalog/Pricing operations. No provider key is required for deterministic or
scientific analysis. MCP/model and deployed demonstration acceptance are separate
subsequent checkpoints.

## Verification commands

Run from the repository with its supported Node/npm versions and Docker:

```powershell
npm run build
npm run test:catalog:publications
npm run test:pricing:publications
npm run test:catalog:intelligence
npm run test:catalog:science
npm run test:catalog:intelligence:reports
npm run test:catalog:intelligence:browser
npm test
node scripts/verify-single-stack.mjs
```

Targeted suites use disposable, explicitly synthetic PostgreSQL/API fixtures.
Scientific tests invoke the actual existing Python implementation in a bounded,
networkless container; this does not establish live HTTP transport or cloud model
acceptance. Browser fixtures use production SSDS components and actual handlers,
sessions, CSRF and signed exchanges, with their simulated routing/source setup
identified in each report. The retained operator installation is not reset.
