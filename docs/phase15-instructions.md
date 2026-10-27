# Steward Platform — Phase 15: Universal Product & Service Catalog + Pricing Management

**Target release:** v0.15.0  
**Starting release:** v0.14.0  
**Verified baseline commit:** `811793c`  
**Execution mode:** Autonomous implementation with sequential verification checkpoints

## 1. Primary objective

Implement a universal, modular Product & Service Catalog and a complementary Pricing Management capability for Steward.

These capabilities must serve independently operating businesses across different industries, including retail, manufacturing, food services, professional services, subscriptions, rentals, digital products, and mixed product/service organizations.

This is a general-purpose commercial Steward capability, not a CEE-specific module.

The objective is to establish a consistent, extensible definition of what a business offers, how those offerings relate to external providers and internal operations, and how their prices are established, approved, and applied.

The implementation must build upon existing Steward capabilities rather than replacing them.

**Phase 15 is complete only when a business user can define an offering, configure its pricing, connect it to compatible operational modules, process authorized synthetic business activity, and analyze its performance through Master Steward.**

---

# 2. Mandatory preimplementation investigation

Before writing implementation code, inspect the existing repository and deployed platform.

Read:

- `AGENTS.md` and relevant repository instructions.
- Current Git branch, HEAD, status, and recent commits.
- Phase 14 acceptance and release documentation.
- Existing module SDK and module-host implementations.
- SSMA capability contracts, bindings, and resolver behavior.
- Signed module packaging and installation procedures.
- Steward Shared Design System (SSDS).
- Worker and Master navigation and module-driven UI infrastructure.
- Sales and Orders module.
- Inventory and Stock Ledger modules.
- Procurement module.
- Shopify integration.
- Printify integration.
- Existing product, SKU, and variant contracts.
- Financial and scientific analytics interfaces.
- Simulation Commerce implementation.
- Existing MCP tools and AI Analyst.
- Tenant, entity, and authorization infrastructure.

Also inspect the currently running Docker stack, deployed module versions, database migrations, volumes, and installed provider bindings.

### Baseline verification

Confirm:

1. The current repository contains the verified v0.14.0 release.
2. No unexpected changes exist after that release.
3. The existing stack is healthy before migration.
4. Existing accounts, module databases, credentials, and identities are preserved.
5. Existing Shopify and Printify catalog configurations remain available.
6. Existing synthetic simulation data is retained.
7. Current business and mission modules remain functional.

Create a dedicated Phase 15 development branch without rewriting release history.

If the current repository differs from the reported baseline, inspect the differences before proceeding. Do not discard work.

### Architectural discovery requirement

Identify which existing modules already own:

- Product identities.
- External product IDs.
- SKU mappings.
- Product variants.
- Inventory stock.
- Supplier costs.
- Sales line items.
- Fulfillment relationships.
- Product prices.
- Tax-related values.
- Product images.
- Service definitions.

Document authoritative ownership before introducing new schemas.

**Do not create competing authoritative product or pricing stores without a documented migration or interoperability strategy.**

---

# 3. Nonnegotiable execution requirements

Execute checkpoints 15A–15J sequentially.

For each checkpoint:

1. Inspect relevant existing implementation.
2. Implement the required functionality.
3. Add unit, integration, and security tests.
4. Run targeted verification.
5. Correct failures.
6. Commit a verified checkpoint.
7. Continue automatically to the next checkpoint.

Do not request routine confirmations between checkpoints.

Use parallel development agents where appropriate, but integrate and validate all work before advancing.

Preserve previous verified commits and releases.

Do not claim tests passed unless actually executed.

### Safety boundaries

Do not:

- Delete existing business records.
- Replace current authoritative provider data.
- Overwrite external Shopify or Printify catalogs.
- Create real paid orders.
- Modify live fulfillment.
- Publish products to external storefronts.
- Change real external prices.
- Enable unapproved background synchronization.
- Create financial commitments.
- Expose credentials in logs or commits.
- Grant Master Steward operational authority over another entity.
- Make Worker operations dependent upon Master availability.
- Require AI availability for catalog or pricing operations.

All external commerce mutations remain disabled unless separately authorized in a future phase.

---

# Checkpoint 15A — Universal Catalog Contracts and Module Foundation

## Objective

Establish reusable, versioned catalog contracts.

### Required offering types

Support:

1. Physical products.
2. Digital products.
3. Professional and operational services.
4. Subscriptions and recurring offerings.
5. Rentals.
6. Bundles and composite offerings.

Use an extensible offering-type model rather than introducing unrelated catalogs for each product category.

### Common offering properties

Implement appropriate fields for:

- Offering identifier.
- Owning legal entity.
- Offering type.
- Name and description.
- Internal SKU or code.
- Category.
- Attributes.
- Tags.
- Lifecycle status.
- Images and media references.
- Availability rules.
- External provider references.
- Version and revision.
- Creation and modification history.
- Source attribution.

Do not require irrelevant physical-product fields for services.

### Product-specific properties

Support:

- Variants.
- Variant attributes.
- Units of measure.
- Physical dimensions where relevant.
- Supplier relationships.
- Inventory capability references.
- Production or fulfillment capability references.

### Services

Support:

- Service definitions.
- Duration or capacity units.
- Delivery method.
- Required resources.
- Service availability references.
- One-time or recurring delivery.

### Subscriptions

Represent recurring offering definitions and billing intervals.

Do not implement live recurring payment execution.

### Rentals

Support rentable offering definitions and availability capability references.

Do not implement a complete rental operations platform in this phase.

### Bundles

Support component relationships, quantities, compatible offering types, and bundle lifecycle rules.

Prevent invalid circular bundle references.

### Versioning and extensibility

All schemas must be versioned.

Allow additional module-defined attributes through validated extension contracts.

Do not allow arbitrary extension fields to bypass permissions or core validation.

---

# Checkpoint 15B — Universal Catalog Operational Module

**Suggested module ID:** `steward.catalog.universal`

## Objective

Create a fully functional, independently installable Universal Catalog module.

### Required capabilities

Implement:

- Create offering.
- View offering.
- Update offering.
- Archive or deactivate offering.
- Search and filter offerings.
- Categorization.
- Attribute management.
- Variant management.
- Bundle management.
- External provider mappings.
- Source attribution.
- Audit history.

Use appropriate optimistic concurrency or equivalent version-control protection for conflicting edits.

### Catalog ownership

Each catalog offering belongs to an authoritative legal entity.

A Worker must not be able to edit another company's catalog directly without a governed authorization and supported cross-entity workflow.

Master Steward may receive approved analytical catalog projections.

### External mappings

Model connections to external products and variants without claiming Steward owns the external record.

Each mapping should identify:

- External provider.
- External account/store.
- External product identifier.
- External variant identifier where relevant.
- Steward offering identifier.
- Mapping status.
- Mapping origin.
- Last verification.
- Supported capabilities.
- Field-level authority where necessary.

Support one-to-many mappings where appropriate.

### Import and reconciliation

Provide explicit import/reconciliation behavior for existing records.

Detect duplicates and mapping conflicts.

Do not automatically merge offerings solely because they share a similar name or SKU.

Preserve external identifiers and provider ownership.

### UI

Provide SSDS-compatible:

- Catalog Overview.
- Offering Directory.
- Product and Service Editor.
- Variants.
- Categories and Attributes.
- Bundles.
- Provider Mappings.
- Offering History.

Ordinary users must be able to manage offerings without viewing raw JSON or module schemas.

---

# Checkpoint 15C — Pricing Management Contracts and Module

**Suggested module ID:** `steward.pricing.management`

## Objective

Implement a separate, independently installable Pricing Management module.

Pricing Management owns Steward-defined pricing policies, price lists, and price decisions.

The Catalog owns offering definitions.

Do not merge pricing into the Catalog's authoritative persistence.

### Required pricing capabilities

Support:

- Base prices.
- Price lists.
- Retail prices.
- Wholesale prices.
- Customer-category prices where authorized.
- Channel-specific prices.
- Promotional prices.
- Effective dates.
- Currency-specific prices.
- Pricing revisions.
- Price approval history.
- Price expiration.
- Price lookup and resolution.

### Pricing resolution

Implement deterministic price resolution that considers:

1. Offering.
2. Variant where applicable.
3. Price list.
4. Sales channel.
5. Customer category where authorized.
6. Effective date/time.
7. Currency.
8. Promotion eligibility.
9. Relevant priority rules.

Define clear precedence and conflict-resolution behavior.

Do not allow ambiguous overlapping rules to silently produce an arbitrary price.

### Financial accuracy

Use precise monetary types.

Preserve currency.

Do not mix EUR and USD without an approved conversion basis.

Distinguish:

- Listed price.
- Resolved transaction price.
- Supplier cost.
- Production cost.
- Estimated contribution.
- Actual recorded cost.
- Promotional discount.

Do not confuse contribution margin with net profit.

### Approval workflow

Support configurable pricing permissions and approval requirements.

A pricing change may require authorized human approval before activation.

A proposed price must not automatically become active.

Maintain historical price versions.

An existing order must retain its original accepted price rather than changing retroactively when a price list changes.

### UI

Provide:

- Pricing Overview.
- Price Lists.
- Offering Prices.
- Channel Pricing.
- Promotional Pricing.
- Scheduled Changes.
- Approval History.
- Price Resolution Preview.

Do not introduce a full advanced tax engine in this phase.

---

# Checkpoint 15D — Integration with Existing Business Modules

## Objective

Connect the Catalog and Pricing modules to existing Steward operations through SSMA.

### Sales and Orders

Support catalog offering and variant references in sales lines.

Use authorized pricing resolution when applicable.

Preserve accepted transaction prices as immutable order snapshots.

Existing sales operations must continue functioning when the new modules are not installed.

### Inventory and Stock Ledger

Connect physical offering variants to authorized inventory capabilities.

Do not let the Catalog become a competing inventory balance store.

Preserve Stock Ledger and Inventory authority.

### Procurement

Connect catalog offerings to supplier records and purchasing requirements.

Keep supplier pricing distinct from customer-facing sales pricing.

### Fulfillment

Retain existing fulfillment ownership and routing rules.

Do not change the existing Shopify/Printify fulfillment authority boundaries.

### Housing, Food and Employment

Allow appropriate service or resource offerings to reference relevant mission modules.

Do not force participant-sensitive records into Catalog.

### Provider substitution

Use SSMA capability discovery and governed bindings.

When a provider is substituted, preserve existing obligations and historical provider references.

Do not silently redirect existing fulfillment or purchasing obligations.

### Missing-module behavior

Catalog and Pricing must remain independently installable.

A missing Pricing module must not break Catalog operations.

Existing Sales must continue to support its previously valid workflows where Catalog is absent.

---

# Checkpoint 15E — Shopify and Printify Catalog Interoperability

## Objective

Integrate Steward's Universal Catalog with the existing read-only Shopify and Printify catalog adapters.

### Preserve existing verified behavior

Shopify and Printify live catalogs must remain protected.

Existing product and variant records must remain intact.

Do not change external store prices, products, inventory, or fulfillment settings.

### Required operations

Implement:

- Read-only product discovery.
- Read-only variant discovery.
- Explicit mapping to Steward offerings.
- Field authority awareness.
- Duplicate detection.
- External identifier preservation.
- Mapping conflict reporting.
- Manual reconciliation.
- Import preview.

### Synchronization

Do not enable automatic outbound publishing.

Existing live read-only synchronization behavior must remain unchanged unless a compatible, explicitly verified enhancement is necessary.

### Provider authority

Clearly distinguish:

- Provider-owned product information.
- Steward-owned offering information.
- Mapped fields.
- Locally overridden display information.
- Pricing authority.
- Fulfillment authority.

Do not overwrite provider-owned values merely because they differ from Steward's catalog definitions.

### Verification

Test against existing safe connector configurations.

Preserve the known unavailable historical Printify profile without presenting its unavailability as failure of active verified profiles.

No live paid transactions.

---

# Checkpoint 15F — Costs, Contribution and Basic Marketing Foundations

## Objective

Use Catalog and Pricing information to support business economics and prepare a limited foundation for Phase 18 Marketing.

### Cost references

Support:

- Supplier cost references.
- Estimated production costs.
- Fulfillment costs.
- Packaging costs.
- Other supported variable cost categories.

Use existing authoritative providers where available.

Avoid duplicating financial records.

### Contribution analysis

Provide deterministic calculations for:

- Sales price.
- Estimated variable costs.
- Estimated contribution amount.
- Contribution percentage.
- Pricing scenario comparison.

Missing costs must be identified rather than silently treated as zero.

### Pricing recommendations

Allow scientific and deterministic analysis to identify:

- Low-contribution offerings.
- Cost increases affecting contribution.
- Potential price adjustments.
- Significant channel pricing differences.
- Bundle contribution risks.

Recommendations must not automatically change prices.

### Basic marketing foundations

Include only lightweight Phase 18 preparation:

- Offering promotion eligibility.
- Promotional grouping.
- Campaign reference metadata.
- Basic planned promotion dates.
- Promotion-to-price-list references.

Do not build complete campaign management, advertising integrations, AI-generated campaign execution, or attribution infrastructure.

Those belong in Phase 18.

---

# Checkpoint 15G — Master Steward Catalog and Pricing Intelligence

## Objective

Extend Master Steward's authorized analytics and dashboards.

### Required reporting

Support:

- Offering performance.
- Product and service sales.
- Category performance.
- Channel performance.
- Estimated contribution.
- Promotional price effects.
- Cost trends.
- Provider mapping health.
- Catalog adoption across entities.

### Cross-company intelligence

Identify authorized opportunities such as:

- Similar offerings sold across different companies.
- Shared suppliers.
- Potential bundle cooperation.
- Contribution improvement opportunities.
- Complementary product/service relationships.

Do not assume identical names imply identical products.

Do not automatically merge product records across legal entities.

### Scientific analytics

Reuse the existing Python scientific service where appropriate.

Support compatible pricing and demand analyses without introducing another analytical framework.

### Evidence and governance

Every recommendation must include:

- Source data.
- Entity ownership.
- Relevant timeframe.
- Calculation method.
- Currency.
- Assumptions.
- Data freshness.
- Required human review.

Never present estimated contribution as realized profit.

---

# Checkpoint 15H — MCP and AI Analyst Integration

## Objective

Expose governed Catalog and Pricing capabilities to Master Steward's existing AI Analyst.

### Required MCP capabilities

Support authorized:

- Catalog summaries.
- Offering lookup.
- Product category analysis.
- Pricing comparisons.
- Contribution analysis.
- Provider mapping summaries.
- Demand and cost investigations.

### Example investigation

A user asks:

"Which products across our businesses have the strongest contribution potential, and are there opportunities to improve pricing or coordinate purchasing?"

The AI Analyst should:

1. Discover authorized entities.
2. Retrieve permitted catalog information.
3. Retrieve relevant sales performance.
4. Retrieve pricing and cost information.
5. Invoke deterministic or scientific calculations.
6. Compare opportunities.
7. Identify missing data.
8. Explain results.
9. Recommend authorized human review.
10. Deliver findings through the existing governed lifecycle.

AI must not invent costs or financial outcomes.

Do not allow AI tools to modify live provider catalogs or activate pricing policies without separate authorized workflows.

Preserve local Ollama/Qwen functionality.

---

# Checkpoint 15I — Synthetic Demonstration and Complete Verification

## Objective

Demonstrate that the new modules integrate safely with the existing Steward ecosystem.

### Synthetic demonstration

Prepare a reproducible scenario that includes:

- Physical product.
- Product variants.
- Professional service.
- Digital product.
- Rental or recurring offering.
- Bundle containing multiple offerings.
- Retail and wholesale pricing.
- Promotional pricing.
- External provider mappings.
- Synthetic sales.
- Inventory or fulfillment interactions.
- Financial analysis.

### Required demonstration

Through the regular Worker UI:

1. Install Universal Catalog.
2. Install Pricing Management independently.
3. Create a physical offering.
4. Add variants.
5. Create a service.
6. Create a bundle.
7. Configure pricing.
8. Preview resolved prices.
9. Approve a scheduled price change.
10. Map an existing external catalog item.
11. Process synthetic sales using supported catalog references.
12. Verify accepted transaction price snapshots.
13. Review cost and contribution calculations.
14. Open Master Steward.
15. Inspect catalog and pricing analytics.
16. Run a governed AI investigation.
17. Review the evidence-backed finding.
18. Verify affected Worker delivery and acknowledgment.

### Automated verification

Test:

- Offering CRUD.
- Product variants.
- Service definitions.
- Bundles.
- Circular bundle rejection.
- Entity isolation.
- Module permissions.
- External mapping conflicts.
- Duplicate SKU cases.
- Pricing precedence.
- Effective dates.
- Currency handling.
- Price snapshots.
- Price approval requirements.
- Concurrent edits.
- Provider substitution.
- Sales compatibility.
- Inventory authority.
- Fulfillment ownership.
- Cost and contribution accuracy.
- Synthetic simulation isolation.
- AI/MCP authorization.
- Cross-Worker finding delivery.
- Outage recovery.
- Repeated installation.
- Module upgrades.
- Data preservation.

### Browser acceptance

Use Chromium for realistic user workflows.

Capture screenshots covering:

- Catalog directory.
- Offering editor.
- Variants.
- Bundle editor.
- Pricing lists.
- Pricing resolution preview.
- External mapping interface.
- Contribution analysis.
- Master Catalog Intelligence.
- AI investigation results.

Use SSDS consistently.

---

# Checkpoint 15J — Regression, Deployment and Release

## Objective

Complete comprehensive platform regression, safe deployment, and release packaging.

### Existing regressions

Run all applicable Phase 1–14 tests.

Preserve:

- Business operations.
- Shopify live read-only catalog access.
- Printify live read-only catalog access.
- Sales and Inventory behavior.
- Fulfillment ownership.
- Commerce simulation.
- Scientific forecasting.
- Procurement optimization.
- Housing and Participant Services.
- Employment Pathways.
- Food Services.
- Financial Resource Availability.
- Mission Budget Management.
- Resource Coordination.
- Financial approval workflows.
- Master and Worker synchronization.
- Peer-Worker coordination.
- MCP and Qwen investigations.
- Privacy and governance boundaries.

### Deployment safeguards

Verify:

- Clean installation.
- In-place upgrades.
- Backward-compatible migrations.
- Existing module package preservation.
- Existing database preservation.
- Existing credentials and identities.
- Existing module bindings.
- Existing provider configurations.
- Supported redeployment.
- Worker independence during Master outages.
- Graceful operation during AI/scientific service outages.

Do not destroy or recreate the existing stack's persistent volumes.

When preparing new container images, build from a known committed checkpoint and validate the deployed image identity.

### Resource management

Inspect the existing Docker resource footprint.

Minimize additional infrastructure.

Do not add unnecessary always-running services when independent modules can use the established host infrastructure.

Report final container counts and memory use.

### Release artifacts

Prepare:

- Signed Catalog package.
- Signed Pricing package.
- Module manifests.
- Data migration documentation.
- Product authority and mapping documentation.
- Pricing resolution specification.
- Financial calculation methodology.
- Security verification.
- Browser evidence.
- Synthetic demonstration guide.
- Complete regression report.
- Installation and upgrade instructions.
- Checksummed verification archive.
- Release manifest.

Commit the verified implementation.

Tag `v0.15.0` if all critical acceptance criteria pass.

Confirm the working tree is clean.

Do not modify or overwrite previous release tags.

---

# 4. Critical implementation invariants

These apply throughout Phase 15.

1. A Catalog offering has one authoritative Steward owning entity.
2. External provider identifiers retain their original authority and provenance.
3. Similar names do not establish product identity.
4. Inventory balances remain authoritative in their appropriate inventory provider.
5. Pricing policies remain authoritative in Pricing Management when that module is used.
6. Accepted sales prices remain immutable historical snapshots.
7. A promotion cannot silently bypass pricing approval requirements.
8. Shopify and Printify live catalogs remain read-only.
9. Existing fulfillment owner rules remain enforced.
10. Catalog imports must be idempotent.
11. Module substitution must not silently change existing obligations.
12. Product and service data must remain entity-scoped.
13. Historical currencies must remain intact.
14. Missing costs must be disclosed rather than treated as zero.
15. AI recommendations cannot directly modify financial or external commerce state.
16. Worker operations must continue without Master Steward.
17. Catalog and Pricing must be installable separately.
18. Existing modules must remain operational without the new modules.
19. No existing business, mission, or financial records may be discarded.
20. Every consequential operation must remain auditable.

---

# 5. Phase 16–18 compatibility requirements

Implement Phase 15 with the following approved roadmap in mind:

**Phase 16 — Business Automation & Workflow Designer**

Catalog and Pricing capabilities should expose versioned operations and events suitable for future governed workflow composition.

Do not implement the Phase 16 workflow engine in Phase 15.

**Phase 17 — AI Integration & Adapter Builder**

Catalog and Pricing must provide discoverable, schema-driven contracts compatible with future adapter generation and capability registration.

Administrative screens must continue to use SSDS.

Do not implement the adapter generator in Phase 15.

**Phase 18 — Marketing & Campaign Management**

Catalog offerings must support future campaign associations and promotional pricing.

Do not introduce full marketing automation or advertising-channel integrations prematurely.

All future phases must remain optional and independently installable.

---

# 6. Definition of Done

Phase 15 is complete only when:

1. Universal Catalog is independently installable.
2. Pricing Management is independently installable.
3. Products, services, subscriptions, rentals, digital offerings, and bundles are represented through validated contracts.
4. Catalog operations have functioning persistence and usable UI.
5. Pricing resolution is deterministic, accurate, and auditable.
6. Sales and Inventory integrate through governed capabilities.
7. Shopify/Printify mapping is safe and preserves external authority.
8. Existing accepted sales retain historical prices.
9. Master Steward presents meaningful Catalog and Pricing intelligence.
10. AI Analyst can investigate authorized offerings and pricing evidence.
11. Synthetic end-to-end commerce demonstrations pass.
12. Security, financial correctness, and entity isolation are verified.
13. Existing platform functions remain intact.
14. Browser, clean-installation, regression, outage, and redeployment acceptance pass.
15. Release artifacts are generated and checksummed.
16. The verified release is committed and tagged.

Do not declare commercial production readiness based solely on local or synthetic validation.

---

# 7. Final reporting

At completion, provide:

1. Release version and commit.
2. Working-tree status.
3. Implemented module names and versions.
4. Catalog offering types supported.
5. Pricing capabilities implemented.
6. Existing provider integrations and mappings.
7. Sales/Inventory/Procurement integration results.
8. External catalog preservation results.
9. SSMA capability registrations.
10. Master Steward analytical additions.
11. AI/MCP verification results.
12. Synthetic demonstration outcomes.
13. Backend test counts.
14. Financial and security test results.
15. Scientific verification results.
16. Browser acceptance results.
17. Installation and upgrade results.
18. Outage and recovery verification.
19. Running container count and memory use.
20. Release artifact locations.
21. Known limitations.
22. Deferred Phase 16–18 requirements.

**Primary success criterion:** Steward must provide a reusable, authoritative, independently installable Universal Catalog and Pricing Management foundation that integrates with existing business operations, preserves external provider ownership, and supports evidence-backed business intelligence without compromising legal-entity independence, financial correctness, or live commerce safeguards.

Execute all checkpoints autonomously and verify each before continuing. Do not request routine implementation confirmations.