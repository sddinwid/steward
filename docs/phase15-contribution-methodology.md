# Prospective contribution methodology

Checkpoint 15F is implemented and verified in source/isolated runtime. Operator
installation and release acceptance remain pending; see `phase15-verification.md`.

Contribution potential is a planning estimate in one explicitly selected
currency. It is not realized profit, a financial posting, a tax computation or
permission to change prices, purchase stock or submit production.

## Price and quantity

Use an owned Pricing subject and an actual approved price resolution. A Catalog
subject retains its original entity, provider installation/package and offering
revision. A standalone SKU subject remains supported independently of Catalog.
Discovery, an inactive rule or a future preview cannot authorize a current price.

Scenario quantity is explicit. The current implementation uses whole quantities;
unit labels and quantity scale must agree exactly with the declared evidence.
There is no inferred conversion between packs, items, hours or other units.

## Cost evidence

Procurement and Printify provide separate, read-only cost capabilities through
the established SSMA mechanism. Both sides still require their signed
configuration prerequisites, approved binding/workflow and original provider
identity. An exact read verifies selected evidence; a discovery result alone
does not authorize a cost binding.

Procurement quote evidence must remain approved and unexpired and must satisfy
its explicit minimum quantity and units. Supplier and production acquisition are
alternatives. A quote does not prove a purchase or expenditure.

Printify production catalog costs are estimates with explicit verified currency,
captured live/simulator mode, original connection digest, source profile and
original product/variant identity. A successful source read
establishes freshness; replaying a cached observation cannot renew it. Retail
selling prices are excluded. Unavailable shipping quotes remain unknown.

Current provider costs additionally require a fresh host-attested snapshot from
the existing Worker registry. A removed, disabled, configured-off or replaced
original provider cannot remain current merely because its last read lease has
time left. Missing or incomplete registry context makes current cost coverage
unavailable. This does not erase historical receipts or assert external service
health.

The private snapshot and original read-time receipt also bind a fingerprint of
public provider configuration. Currency, mode or freshness changes therefore
invalidate current cached use even when installation/package identity stays the
same. Request a new exact read after a configuration change. Private connector
files and credentials are excluded from this fingerprint. Restoring the original
configuration can restore eligibility within the original lease; a known later
source failure/change still requires successful new evidence.

Lost acknowledgments cannot re-label old evidence: execution provenance is
stored with the original inbox receipt before the first domain execution. A
retry returns its original body and fingerprint. The host forwards that captured
proof rather than stamping current settings over a cached historical response.

Packaging, transaction, channel, fulfillment and other supported variable-cost
estimates can be supplied by explicitly identified human assessments. Their
provenance remains Pricing-owned. Human input cannot impersonate a provider
receipt or a recorded financial expense.

An explicitly reviewed human assessment can mark a required category **not
applicable**, including acquisition for a service with no supplier or production
charge. Its actor, reason, source and bounded validity remain visible. This is a
declared planning assumption, distinct from a known zero amount. Missing data or
an offering type never automatically establishes nonapplicability.

Each binding identifies the intended subject, cost category, charge basis,
applicability, source namespace/record/revision, original provider identity,
semantic digest and bounded freshness. Matching names or SKUs alone do not
establish identity. A changed provider or cost definition requires new reviewed
work. Existing evidence is retained.

## Exact calculation

All money uses bounded integer cents and supported scale-two currencies. The
calculator performs deterministic arithmetic, never model arithmetic:

- Revenue potential = resolved unit price × declared quantity.
- Per-unit cost = supported unit amount × matching declared quantity.
- Per-order cost applies once to that order scenario.
- Per-shipment cost requires an explicit applicable shipment count.
- Complete contribution = revenue potential − complete variable cost.

The result retains the exact contribution/revenue fraction. Display basis points
are the mathematical floor of `contribution × 10000 / revenue`, including for
negative values (−1 cent / 300 cents is −34 basis points). This is a conservative
display rule, not a change to the retained exact money or fraction.

A complete result means coverage of the explicitly declared categories and
assumptions; it does not prove that every business expense was captured.
A known cost subtotal is useful even with incomplete coverage. Any missing,
expired, changed, foreign-currency, ambiguous or unit-incompatible required cost
keeps complete variable cost, contribution and percentage unknown. It must not
be silently replaced with zero. Negative contribution is retained. A zero or
negative revenue denominator has no meaningful contribution percentage.

Scenarios are alternatives, not amounts to add together. A price recommendation
requires renewed price-policy review and explicit activation through existing
Pricing operations. It never automatically changes prices or external catalogs.

## Historical boundary

Accepted Sales prices remain immutable. Current rules cannot reprice an old
transaction, and a prospective cost estimate cannot be presented as a realized
historical expense. Without explicit accepted-line revenue and cost-allocation
evidence, actual contribution stays unknown. Partial fulfillment does not justify
deducting an entire order's costs from partial recognized revenue.

## Limited marketing preparation

Offering promotion eligibility, groups, campaign references, planned dates and
promotion-to-price-list metadata prepare later optional marketing capabilities.
They do not establish advertising spend, causal attribution, campaign return or
authority to activate a discounted price. Existing approval checks remain in
force.

## Configuration and normal Worker workflow

New source versions are Pricing Management **1.2.0**, Procurement **1.3.0** and
Printify **1.3.0**, minimum platform **0.15.0**. They are not yet installed in the
selected operator deployment. Never rebuild an already published module version.

- Pricing `costReadEnabled` explicitly enables provider cost reads independently
  of optional Catalog reads. `costMaxAgeSeconds` bounds accepted observations
  (10–86400, default 300) without extending their original expiry.
- Procurement/Printify `costReadEnabled` enables their declared cost-sharing
  capability. `costObservationMaxAgeSeconds` bounds provider observations
  (10–86400, default 3600). Explicit approved SSMA bindings/workflows and module
  permissions remain required.
- Provider `cee.procurement.cost.read` and `cee.printify.cost.read` grant their
  truthful read-only cost directories; they grant
  no purchase, production or financial execution. Pricing configuration actions
  require its local `configure` permission; contribution preview requires `read`.
- Printify live connector trust, private credentials, confirmed cost currency and
  installation/image-bound egress remain separate prerequisites. These fixture
  tests do not establish live compatibility.

Use Estimated Cost Models to choose an owned standalone SKU or exactly verified
Catalog subject, price list, explicit currency/unit, acquisition mode, required
categories and scope reason. Cost Evidence and Human Assumptions first discovers
named provider observations, then binds a selected observation to that model with
an explicit human reason and an exact provider read. Supplier unit cost and
shipping are separate category inputs; neither is silently added for you.

Enter other estimates with explicit amount, currency, charge basis, units,
quantity scope, reason and expiry. Unknown and Not Applicable are distinct
choices. Deactivate the original category input before replacing it; original
terms and receipts remain retained.

Estimated Contribution and Scenario Preview selects the model and quantity,
optional shipment count, promotion and hypothetical unit price. Its money frame
comes from the model; a stale currency form is rejected rather than reinterpreted.
This preview uses the chosen list with default channel/customer context; other
price contexts remain available in the existing price resolution interface. It
creates no scenario record, price change, command or financial posting. Inspect
coverage, missing data, exact results and expandable source provenance before
recommending human review.

Supported read bounds are explicit: at most 2048 current production variants,
1024 products and 1024 approved supplier quotes. Excess fails clearly before
loading native JSON. Private registry context is bounded to 12 compatible local
providers, 64 registry entries and 4096 bytes; excess is incomplete rather than
a partial allowlist. These bounds and source outages affect analysis, not basic
Worker availability.

## Reproducible isolated verification

Run from the repository root:

```powershell
npm run build
npm run test:costs:providers
npm run test:pricing:costs
npm run test:pricing:oracle
npm run test:costs:provider-context
npm run test:catalog:legacy-packages
node scripts/test-contribution-browser.mjs
npm test
node scripts/verify-single-stack.mjs
```

The PostgreSQL/browser fixtures exercise actual handlers, synchronization code
and the generic SSDS renderer with explicitly synthetic gateway/actor/provider
context and injected upstream GET responses. Installed-host, live read-only,
operator preservation, Master intelligence and release acceptance remain separate
gates. Exact results and failed attempts belong in the verification record.

Provider authors using Business Kit get execution provenance automatically for
platform-15 private capability commands. The existing inbox response wrapper
stores the original public-configuration fingerprint, and the private response
header `x-steward-provider-configuration-digest` repeats it without changing the
closed capability body. Independently implemented providers must preserve this
first-execution behavior across retries. Missing proof cannot be reconstructed
from current configuration. The host's reserved `_steward` receipt metadata is
not accepted from frontend bodies.
