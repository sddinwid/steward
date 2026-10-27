# Read-only external catalog interoperability

New source versions are Catalog 1.3.0, Shopify 1.3.0 and Printify 1.2.0, minimum platform 0.15.0. They are not installed in the selected operator deployment yet. Existing live credentials, profiles, native records and historical unavailable profiles remain preserved. Source/isolated verification is separate from live acceptance.

## Normal Worker workflow

1. Install trusted module packages and explicitly approve the provider-specific Catalog read binding/workflow in Smart Modules.
2. In Source Discovery, create a Shopify or Printify **connections** request and submit it. Named profile choices retain live/simulator mode, account origin and availability. An old cache without a successful source receipt is unverified.
3. Select a current profile and request products or variants. Use **Next source page** for server-owned pagination. A changed generation requires a new discovery request; pages from different generations are never silently combined.
4. Select an observation and request its exact read. Discovery alone does not authorize import. The exact read stays pinned to the original provider, profile, origin, stream, record and generation.
5. Open Import and Reconciliation Preview. Select exact verified evidence and either an existing local offering or an explicitly entered local type, name, code, classification reason and applicable type details. Source type/name/SKU remain separate facts, including nulls and long values.
6. Save a Reviewed Import Plan, review its retained preview and explicitly apply it. Conflicting mappings require reconciliation and explicit deactivation of the original mapping. Provider/package substitution never silently retargets an existing relationship.

Use **Refresh choices** after asynchronous reads finish. Source status distinguishes discovered, verified, unavailable, stale and changed snapshots. A failed known-source read invalidates older current verification until a successful exact read recovers it. Native source facts and local history remain retained.

Source Discovery is the normal named-choice interface. Legacy developer Source Reads remains available for the existing closed v1 contract; new unknown facts are never coerced into it.

## Configuration and authority

- Catalog: `integrationsEnabled: true` enables approved read interoperability; `externalCatalogMaxAgeSeconds` bounds current source evidence (10–86400, default 3600).
- Shopify/Printify: explicitly set `catalogReadEnabled: true`; `catalogObservationMaxAgeSeconds` controls successful-read leases (10–86400, default 3600). An existing preserved configuration without the new flag must explicitly enable it. Cached reads do not perform upstream requests or extend leases.
- Existing connector setup, trusted TLS, private secrets and installation/image-bound egress approval are still required for live source synchronization. See [Shopify setup](shopify-development-store.md) and [Printify setup](printify-live-verification.md). Keep credentials in existing private per-module files; no secrets belong in Catalog forms.
- Original commerce/simulator constraints remain effective per capability. Enabling catalog reads does not enable live order creation, paid production, inventory writes, external catalog publishing or storefront repricing.
- Pricing's local SKU resolution remains available independently of Catalog; `integrationsEnabled` in Pricing controls its Catalog reads. Sales uses separate governed flags, with stock integration additionally required for verified physical reservation.

The new contract deliberately contains no provider prices, production costs, shipping quotes, stock balances, images or tax facts that the existing source transport did not establish. A mapping is metadata, not authority to manufacture or fulfill. Original connection/account IDs and source references remain available in collapsed evidence details.

## Verification

```powershell
npm run build
npm run test:external:providers
npm run test:external:catalog
npm run test:capability:gates
npm run test:external:browser
npm run test:catalog:packages
npm test
node scripts/verify-single-stack.mjs
```

Provider/domain tests use actual module handlers, PostgreSQL, synchronization functions and explicitly injected synthetic read transports. Browser tests use the production generic renderer with private host receipt fixtures. They perform no live orders or external catalog mutations. Actual installed-host, live safe-configuration, operator preservation, outage and release acceptance remain later gates. See [ADR 0040](adr/0040-read-only-external-catalog-evidence.md) and the [verification record](phase15-verification.md).
