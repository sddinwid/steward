# Phase 15 authority and baseline investigation

Baseline: v0.14.0, `811793c89d13c05557ad468551c5a79290961eda`.
Development branch: `codex/phase15-catalog-pricing`. No unexpected changes were present at preflight.

| Data | Existing authority | Phase 15 interoperability |
| --- | --- | --- |
| Stock items, SKU, balances, movements, reservations | Inventory or the explicitly selected Stock Ledger provider | Catalog defines commercial offerings; references provider records and capabilities, never copies stock authority. |
| Shopify product and variant identities | Connection-scoped Shopify observations and original remote identifiers | Explicit pinned mappings and read-only import previews. Similar names or SKUs do not establish identity. |
| Printify products, variants, production and fulfillment | Original Printify connection and provider installation | Preserve original IDs, routing and obligations; no external catalog writes or paid orders. |
| Suppliers, quotes, requisitions and purchasing costs | Procurement | Catalog references suppliers; Pricing references cost evidence without creating purchasing authority. |
| Accepted customer order lines and revenue | Sales | Optional catalog references and immutable accepted pricing snapshots; legacy SKU operations remain valid. |
| General sales price lists and approval policy | No existing general-purpose authority | Independently installed Pricing Management owns its dedicated database. Catalog has no sales-price authority. |
| Mission service capacity and participant records | Dedicated mission modules | Catalog may describe commercial services and approved resource capabilities; no participant records. |
| External media | Provider observations where actually retrieved | References retain attribution; no claim that existing Shopify queries retrieve images or prices. |
| Tax | No general tax engine | Classification metadata only; unknown tax remains unknown. |
| Simulation | Simulation Commerce orchestrates; operational modules own resulting records | Retain dataset/run provenance and explicit simulator mode. |
| Master reporting | Authorized synchronized projections | Derived analytical authority only; no operational edits across entities. |

Existing Shopify live product queries retrieve IDs, title, status, update time and variant IDs/SKUs. They do not establish live price, tax, image or stock observations. Printify catalog and shipping costs are estimates; retail `total_price` is not production cost. Existing contribution methods exclude unsupported tax and shipping revenue.

Inspection found a Sales acceptance risk to correct in checkpoint 15D: non-draft channel reimport protects local unit prices but can replace discounted source-line revenue. A new immutable accepted snapshot must protect both. Historical gaps must be marked for reconciliation rather than inventing original discounted revenue.

Source resolution requires entity, Worker, module, stream, record and revision. Installed provider references additionally pin module installation and package identity. Substitution applies only to approved new work; existing obligations remain bound to their original provider.

## Actual preflight evidence

- Full build passed: `artifacts/phase15-baseline-build.log`.
- Full Node baseline passed: 488 tests, zero failures, `artifacts/phase15-baseline-tests.log`.
- Selected operator smoke passed for Master and three Workers, TLS/frontend/API proxies, identity, schema 18 and database isolation.
- Single-stack check passed: 52 containers, 16 healthy core services and 36 isolated module containers.
- Read-only canonical Shopify check: 17 products, 26 variants. Printify: 5 products, 625 variants. The separate historical unavailable Printify profile remains preserved.
- Private preservation snapshot records 40 databases, 141 private-file hashes, 7 volumes and installed package/configuration/binding/obligation identities. Public summary: `artifacts/phase15-deployment-baseline.json`. This observation is not a database backup; a backup is required before deployment upgrades.
- Existing Worker module counts: 14/12/10. Bindings: 27/27/13; workflows: 21/21/13; obligations: 1105/933/42. Retained commerce simulation provenance: 345 records.

Only local contract and presentation changes are being made in checkpoint 15A. No running deployment, credentials, database migration or external provider configuration has been changed.
