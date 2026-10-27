# Catalog, Pricing and operational integration

Phase 15D source and isolated-runtime verification passed. No selected operator upgrade or release acceptance is implied by these isolated test commands.

## Authority and normal workflow

Catalog owns offerings, variants and explicit relationships. Inventory or Stock Ledger owns stock; Procurement owns suppliers. Sales owns accepted transactions. Pricing owns governed price decisions. All reads and mutations use signed SSMA declarations, approved Worker-local bindings/workflows and durable inbox/outbox receipts.

In Universal Catalog, create a Read-only Reference Request and select Inventory, Suppliers, Housing, Food or Workforce. Discovery produces named choices, not verified operational authority. Select an observed option and request an exact lookup. Create an Offering Operational Reference, select the offering/variant and purpose, then explicitly verify it. Parent changes during verification fail closed. Original link provenance remains retained when disabled, stale or superseded.

An inventory link requires exact declared units and a current item-definition proof. Balances, costs and private service stock do not enter Catalog. Definition digests exclude balance changes while retaining semantic item identity and units. A changed name, SKU, declared unit or installed package invalidates prior evidence. Current Catalog units are also checked. No quantity conversion is implied. New stock reservations atomically check the definition; later consumption/release uses the original retained proof and provider.

Housing, Food and Workforce references describe only interfaces declared in signed module metadata. They contain no programme records, addresses, participants, capacities, consent or allocations. Availability is explicitly **unverified** and programme authorization **required**. These links cannot authorize services or become stock authority. Actual mission operations retain their existing programme permissions and bilateral approvals.

In Sales, use Catalog Read Requests for discovery and refresh a named subject to retrieve exact operational references. Governed Order Drafts store requested quantities and subjects without fabricating accepted prices. Request prices, explicitly poll their status and inspect evidence. Confirming creates a bounded human intent and requests fresh status from the original Pricing installation. Acceptance rechecks current Sales writer membership, original draft context, provider identities, source freshness and decision expiry. It atomically retains accepted price evidence before reserving supported physical stock. Editing, revocation, expiry or replacement cannot silently requote or authorize another provider.

The initial governed Sales UI uses the configured Pricing default list for the selected currency, with no inferred channel, customer category or promotion. A Sales customer code does not establish a Pricing eligibility identity. Pricing's separate list, promotion and eligibility interfaces remain available; explicit cross-module customer mapping is not inferred.

Existing manual Sales works without either new module. Existing external orders retain their original accepted merchandise values and do not reprice through Pricing. Governed Catalog fulfillment currently supports verified physical stock from one local provider. Mixed providers, ambiguous SKUs and unsupported service/digital/subscription/rental/bundle fulfillment fail clearly. A generic module reference never authorizes Printify production; governed production requires an independently approved mapping and remains blocked where unsupported.

## Configuration and preservation

Sales opts in separately with `governedSalesEnabled` and `governedCatalogEnabled`; existing `integrationsEnabled` stock behavior is retained. `catalogMaxAgeSeconds` bounds observations and `confirmationIntentSeconds` bounds human confirmation. Catalog uses `operationalMaxAgeSeconds`; item/supplier providers use `referenceLeaseSeconds`. Tightening freshness cannot extend retained leases.

New stock packages persist declared unit identity during their migration transaction. Repeated migration with the same configuration is idempotent; changing units fails before new work. Existing obligations retain their original unit proofs. An unknown legacy unit does not become an inferred unit. Configure an explicit unit on a new Stock Ledger installation. Retained providers with outstanding holds must not be replaced merely to demonstrate the new feature.

Append-only migrations add Inventory 006, Stock Ledger 003, Catalog 002 and Sales 007–008. Original migrations are unchanged. Sales 007 recovers original acceptance only from consistent successful confirmation receipts. Unknown historical acceptance remains preserved and requires explicit human evidence review; current observations never establish an earlier accepted price. Derived projections may withdraw unverifiable monetary records at a higher revision, preserving prior emitted envelopes.

## Verification commands

```powershell
npm run build
npm run test:catalog:contracts
npm run test:catalog:operations
npm run test:catalog:mission-references
npm run test:sales:catalog
npm run test:sales:catalog:browser
npm run test:smart
npm test
node scripts/verify-single-stack.mjs
```

The module/browser fixtures use actual PostgreSQL and production handlers/renderers with explicit private host identity, approval membership and receipt fixtures. They do not prove Worker login, installed routing, Module Manager installation or deployment acceptance. Signed-package, operator preservation, outage and release gates remain separately required.
