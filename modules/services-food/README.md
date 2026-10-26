# Food & Essential Services 1.0.0

Independently packaged module `steward.services.food`; dedicated operational
database, signed SSMA metadata and generic SSDS screens. This Phase 13 module
supports synthetic data only. It does not make eligibility decisions or purchases.

Configuration is `{ "syntheticOnly": true, "integrationsEnabled": false }` for
local operation. Enable integrations only after reviewing the intended audiences.
No Inventory or Procurement installation is required for local operation.

Create a programme and assign its team through the module's Programme and
Programme team screens. The creator receives the explicit coordinator role for
that actual programme UUID. Reviewer, operator, stock-officer and reporting roles
are narrower; case assignments additionally restrict referral access. Gateway
module permissions do not replace these persisted programme/case relationships.

Create a site, a meal/essential-supply session with its actual interval and planned
service capacity, and a local supply record. Record an immutable delivery during
an uninterrupted session. **Service quantity and stock quantity are separate
operator-entered values**: the module never assumes one ingredient or supply unit
per meal. Stock and session capacity are checked transactionally. Record and
resolve interruptions explicitly. Quantity adjustments cannot erase already
consumed stock. Costs distinguish actual recorded expenses from estimates.

The overview shows operational capacity, delivery, shortages, interruptions and
recorded costs. Estimated cost per meal is a rounded average of recorded actual
programme expenses divided by delivered meals; it is not an audited allocation
of joint programme costs. Missing cost observations remain unknown.

Participant Services may consume `food.service` /
`steward.food-service@1.0.0`, purpose `food.service`. Its closed request contains
only destination/source programme UUIDs, referral UUID, receiving-audience opaque
synthetic alias, consent/documented authority UUID and expiry. An explicitly
reviewed service-source relationship and bilateral peer grant are necessary.
The request creates a pending referral. Staff must record a substantive review,
accept the referral and associate a confirmed actual delivery before marking it
delivered. There is no automatic service or eligibility decision. Source status
receipts contain the minimum outcome, without the participant alias or case file.

Optional Inventory integration consumes `inventory.service-stock` /
`steward.service-stock@1.0.0`, purpose `food.supplies`. Create an external supply
reference with the independently selected Inventory entity, Worker, authority
programme, provider module and private item UUID. Approve the SSMA binding and
workflow and both peer grants. Observe supplies through the running module;
these observations are private, timestamped and never substitute for Inventory's
reservation check. The generic resolver selects only verified installed providers.

An external delivery queues reserve, then consumes the explicitly recorded stock
quantity only after a full reservation is acknowledged. Its service delivery is
confirmed only after consumption succeeds. Missing connectivity leaves a visible
pending state. Partial reservations require explicit release. All retries keep
the original command and reservation IDs. Provider installation, package, grant,
entity, Worker and both programmes remain pinned. **There is no local fallback
after an external reservation has been submitted**, including an uncertain or
interrupted attempt. Reconcile the original provider obligation first.

Optional Procurement integration consumes `procurement.service-replenishment` /
`steward.service-replenishment@1.0.0`, purpose `food.replenishment`. A human records
and submits a shortage requirement to its explicitly selected audience. The
receiver creates a private draft requirement with `financialCommitment: false`.
It creates no purchase order, prices, supplier obligation or paid submission.
Without Procurement the local draft remains useful for human planning.

Master/MCP receives only closed human-reviewed disclosures. Cohort measures use
`mission_aggregates_v1`. Set a closed canonical reporting period and create/review
a disclosure request. Shared mission-kit rules seal cohort membership, prohibit
overlapping/repeated member releases and suppress small groups and correlated
capacity/cost proxies. Supply/referral ledgers, participant aliases, private
Inventory quantities and draft requirements never replicate. Shortages and
interruptions are currently operational-only because the existing versioned
mission aggregate contract does not declare those measures.

Approved programme resources use the shared mission-kit financial ledger and
separate `mission_resources_v1` stream. The financial-officer role explicitly
requires `program.finance`, `program.fund` and `program.publish`. Record the
organizational authority, fixed source programme/period, exact recipient entity
and programme, currency/restriction, stable allocation/authority/transfer IDs and
authorized/available/committed/transferred/spent cash states. A human must approve
and seal the statement. Private authority evidence stays local; sealed source
statements cannot be edited, deleted or reused under another approval identity.
The ledger records reviewed synthetic statements and executes no money movement.

Build and native verification from the repository root:

```powershell
Push-Location modules/services-food
npm ci
npm run build
Pop-Location
node modules/services-food/generate-manifest.mjs
node scripts/test-food-services.mjs
node scripts/test-business-modules.mjs
```

The generator reproduces source manifest metadata. Publication tooling supplies
actual migration checksums and signs the image-bound package. Do not distribute
the unsigned source manifest as a trusted package. The tests use disposable
PostgreSQL databases and private in-process module APIs, not an operator stack.
Their success does not establish deployed browser or cross-Worker acceptance.

Production limits include synthetic-only consent/authority semantics, manually
recorded quantities and costs, conservative immutable cohort disclosure,
bounded operational collections and no stock-unit conversion, nutrition,
benefit-determination or clinical rules.
