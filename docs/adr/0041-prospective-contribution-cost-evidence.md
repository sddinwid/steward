# ADR 0041: Contribution scenarios retain cost ownership and uncertainty

Status: implemented and verified in source/isolated runtime for Phase 15F; operator/release acceptance pending.

Pricing Management owns price policy and prospective scenarios. Procurement and
production providers retain authority over their source cost observations. A
Catalog mapping, matching name or matching SKU does not establish that a supplier
quote or external production variant is a cost for a particular offering. A human
must explicitly bind the original evidence to the intended subject and units.

The original Pricing cost component contract remains unchanged. New additive,
versioned read contracts carry complete provider installation/package identity,
source stream, record and revision, evidence digest, observation and expiry,
currency, quantity range and charge basis. Reads use existing signed SSMA
capabilities, approved bindings/workflows and constrained original-provider
routing. They cannot authorize procurement, production or provider writes.

For platform-15 consumers, the host supplies a private, bounded snapshot of
compatible active/configured providers from the existing Worker registry. Every
descriptor is signature-verified, and compatibility uses the existing resolver.
Business Kit expands compact identities using the trusted runtime's Worker/entity
and rejects stale, malformed or duplicate frames. Public copies are stripped.
Pricing requires a fresh complete snapshot containing the original provider
operation/package before treating leased provider evidence as current. Removal,
deactivation, configuration disablement or package replacement therefore cannot
silently keep an old cost current. Historical receipts remain retained. This is
read-only registry context, not a new registry, binding/workflow grant, provider
selection, external health assertion or permission to execute.

Currentness also compares a fingerprint of the provider's **public runtime
configuration**. Business Kit captures it before the first command execution and
stores it atomically beside the existing inbox response's status/value. The
private HTTP response forwards that original execution fingerprint on retries.
The host checks runtime/metadata continuity under the existing lifecycle locks
and forwards only this captured proof, never a newly computed fingerprint over
an old cached body. Legacy inbox rows without proof are not backfilled. Cost caches
retain that attested value; a later currency, mode or freshness change cannot be
hidden by unchanged installation/package pins. No private connector file or
credential is hashed. Configuration fingerprints remain separate from the
unchanged provider identity and source cost contract. A fresh successful exact
read is required to capture changed configuration. Restoring the original
configuration can reuse unchanged evidence only within its original bounded
lease and absent a later source-failure/change signal.

Legacy supplier quotes without explicit units remain unsuitable for unit-based
cost calculations. A new optional unit declaration applies to newly approved
quote terms. Production catalog amounts are estimates, never realized expenses;
Printify retail selling totals are never production cost. Unsupported shipping or
other charges remain unknown unless separately supported by evidence.

Production observations retain the captured live/simulator mode and immutable
connection-origin digest. Supplier and human origins explicitly have neither;
they are local records rather than claims of live commercial connectivity.

Locally entered packaging, channel, transaction and other supported estimates are
identified as human assessments owned by Pricing. They do not impersonate source
provider observations or financial postings. Changes require new evidence rather
than rewriting retained source observations or immutable human assessment terms.
The preview creates no saved scenario, financial posting or result receipt.

Calculations use bounded exact integer money. The model declares units,
acquisition mode and required cost categories. The preview selects that model
and quantity, with optional shipment count, hypothetical unit price with matching
currency, and promotion context. Supplier acquisition and
production are alternatives, not additive copies of the same base cost.
Per-unit charges apply only to matching explicit units and quantities; per-order
charges apply once. Shipment charges require a separately declared count. No
implicit unit conversion, foreign exchange, shipping allocation or tax estimate
is performed.

Known costs can be subtotaled, but any missing, expired, mismatched or ambiguous
required component makes the complete variable cost, contribution and percentage
unknown. A zero or negative revenue denominator has no contribution percentage.
Negative contributions remain negative. Results identify their currency,
timeframe, calculation method, evidence freshness and assumptions.

These scenarios describe prospective contribution potential. They do not rewrite
accepted Sales prices, recognize revenue, book costs, establish realized profit
or allocate an entire order's costs to a partial fulfillment. Actual contribution
remains unknown without explicit accepted-revenue and cost-allocation evidence.
Recommendations require human review and never activate a price rule.

Existing promotion eligibility, groups, campaign references and planned dates
are reused as metadata. No marketing execution or attribution subsystem is
introduced. Master projections and AI investigations remain subsequent governed
checkpoints with their own acceptance gates.
