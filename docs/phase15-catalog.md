# Universal Catalog module

Module: `steward.catalog.universal`, version `1.0.0`, minimum platform `0.15.0`.
The Phase 15 operator upgrade is not yet accepted; these instructions do not imply that the preserved v0.14.0 operator can install a v0.15.0 module.

## Authority and storage

Catalog owns commercial offering definitions in its dedicated module database. It does not own inventory balances, purchasing costs, accepted Sales revenue, participant records, external catalogs or fulfillment obligations. Pricing is a separate optional module. Local CRUD requires neither Master nor AI connectivity.

The authoritative entity, Worker installation, module installation and package identity come from the private host runtime. API bodies cannot set them. Offering UUIDs come from persisted records. A generated immutable `recordKey` supports request identity while the commercial code remains editable. Equal codes are warnings, not an automatic identity merge; variant codes are unique within an offering.

Six types share one versioned contract: physical, digital, service, subscription, rental and bundle. Type-specific fields are normalized by the module; irrelevant fields are not required for services. Media, dimensions, local availability windows, tags and lightweight promotion/campaign references are stored locally. HTTPS media references exclude userinfo, query credentials and fragments; Catalog does not fetch them. Subscription and rental definitions execute no payments or rental transactions.

Mutations use revision checks and the established module transaction lock. Child mutations advance the parent revision, so stale aggregate edits fail. Offering history contains append-only revision snapshots protected by a database trigger. Archival preserves records; there is no destructive rollback or physical-delete API.

Draft/inactive definitions can be completed before activation. Active offerings require applicable mandatory attributes; active bundles require active component offerings and selected variants. Graph traversal is bounded and circular references fail transactionally. Definition changes cannot silently invalidate active offerings. Archived historical records remain preserved.

## UI and authorization

The signed manifest contributes sixteen generic SSDS screens, including directory/editor, variants, categories, typed attributes, bundles, mappings, imports, extension values and history. Core contains no Catalog-specific screens. Ordinary forms use typed fields and authorized reference selectors, not raw JSON.

- `steward.catalog.universal.read`: local directory, details, reports and previews.
- `steward.catalog.universal.write`: local definitions and lifecycle changes.
- `steward.catalog.universal.import`: explicit provider read jobs, mappings and import plans.

Installation remains a Worker-local module administrator operation. Permissions are checked by the application API as well as filtered navigation.

## Provider reads, mapping and imports

Catalog provides `catalog.offerings.read` / `steward.catalog-offerings` version `1.0.0` through existing durable SSMA routing. It optionally consumes external-observation and extension-definition read contracts from `@steward/catalog-kit`. These contracts expose no provider mutation, price activation or production operation.

An explicitly requested read job requires an approved binding/workflow and enabled interoperability. Only an actual private host receipt supplies provider installation/package pins. Source entity, stream, record, revision and timestamp are retained. Cross-entity receipt destinations are rejected until a supported governed implementation exists. Missing providers are unavailable; cached data is not a successful live connection.

Mappings select stored verified observations. Source/provider revisions and configured observation age are rechecked. Same-origin external identity collisions across package upgrades require explicit reconciliation while preserving original pins. Neither names nor SKUs merge offerings. Deactivating a mapping preserves its historical source even when a provider is unavailable; it does not reverify the source.

Import preview is read only. Applying a reviewed draft plan rechecks source identity/content and creates local records atomically. Retries cannot create duplicate offerings or mappings. Provider fields remain provider-owned; only an explicit local display override changes presentation. Read-only source observations do not confer pricing or fulfillment authority.

Optional extension definitions arrive through governed reads, retain immutable provider/revision pins, and validate closed typed values. Submitting arbitrary JSON schemas or replacement ownership cannot grant authority.

Configuration:

```json
{"integrationsEnabled":false,"sourceMaxAgeHours":24}
```

`sourceMaxAgeHours` is an integer from 1 to 168. It bounds the age of an observation; it does not prove the external system's current state. No automatic outbound publishing or external egress is required by Catalog.

## Build, installation and verification

From repository root:

```powershell
npm ci
npm ci --prefix modules/catalog
npm run build
npm run test:catalog:contracts
npm run test:catalog:module
npm run test:catalog:browser
```

After a compatible platform checkpoint is committed, the established publisher signs the independent image:

```powershell
node scripts/publish-module.mjs modules/catalog <compatible-deployment-directory>
```

In that Worker's Administration → Modules, select the trusted package, inspect compatibility, and install it with the configuration above. Enable governed read interoperability only when approving the intended binding/workflow. Module publication alone neither installs the module nor grants permissions.

At checkpoint 15B, operational inventory/supplier/resource capability attachment remains checkpoint 15D work; Shopify/Printify read discovery remains checkpoint 15E work. The existing adapters are not falsely presented as already implementing these new SSMA contracts. Master analytical disclosure and Pricing operations remain later checkpoint gates.
