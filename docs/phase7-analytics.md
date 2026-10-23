# Phase 7 analytical copies, tools and calculations

Worker modules own operational truth. Master holds revisioned, attributed synchronization copies for analysis; a finding cannot approve a purchase, allocate stock, reserve property or hire someone. The contracts are version 1 in `packages/contracts/src/business.ts`, with runtime validation and deterministic capability implementations in `packages/platform/src/business-analysis.ts`. Existing storage/resource contracts remain compatible.

## Canonical evidence

Every source reference contains `entityId`, `moduleId`, `streamId`, `recordId` and positive `revision`. Results also identify source Worker installation and observation time. Master resolves references against the requester's currently authorized entities and the current recorded revision before calculating. Withdrawn or expired projections are excluded from discovery; stale reference inputs are rejected. Synchronization does not make a copy a freshness or commercial guarantee.

| Category / stream | Source module | Information available to Master |
| --- | --- | --- |
| `procurement-demand` / `procurement_demands` | Procurement | Explicitly approved external SKU/unit demand, quantity, currency, unit price, shipping and transition cents |
| `procurement-quote` / `procurement_quotes` | Procurement | Approved external supplier quote, minimum combined quantity, currency/unit, quoted unit/shipping cents, expiration |
| `purchase-commitment` / `purchase_commitments` | Procurement | Order number, supplier reference, lines, currency, shipping, lifecycle/received amounts |
| `sales-demand` / `sales_demand` | Sales | Order demand, quantities/prices, fulfillment and stock constraints; no customer directory |
| `replenishment` / `replenishment_requirements` | Inventory | Item/SKU low-stock requirement and threshold state |
| Existing capacity streams | Assets and Operations | Approved resource capacity/utilization, availability window, location, operating cost, explicit ownership/use relationships |
| `workforce-supply` / `workforce_supply` | Workforce | Approved synthetic skill aggregates, available people and potentially overlapping completion counts |
| `training` / `training_metrics` | Workforce | Approved synthetic program skill, remaining seats, completion count and optional program end |
| `workforce-demand` / `workforce_demand` | Workforce | Approved synthetic job/skill/opening aggregates |

Workforce groups below the configured minimum (at least three) are `null`/suppressed. Null means unknown, not zero. Individual people, enrollment records, achievements and local candidate matches have no Master synchronization or MCP contribution. Updating approved programs/positions withdraws prior aggregates until explicit republication. Ended programs contribute zero remaining training seats. Publishing a summary does not authorize future disclosure of additional private fields.

## MCP interface

The same authenticated MCP server, audit trail, session/entity authorization and invocation budgets serve old and new tools. Worker discovery contributes only active, declared, permitted module reads. Disabling a module removes its tools and rejects its APIs. Read-only MCP cannot change operational data.

| Master tool | Input and result |
| --- | --- |
| `query_business_evidence` | Category, optional entity, bounded limit/offset and allowed selected fields; attributed records and pagination |
| `query_procurement_matches` | Optional entity, bounded limit/offset; two distinct participating entities' compatible approved external demands plus a valid participating issuer's external quote |
| `analyze_shared_procurement_by_id` | Actual first/second/quote record IDs and revisions, optional nonnegative internal transfer cents; current scoped evidence and deterministic cost calculation |
| `query_workforce_matches` | Optional entity, bounded limit/offset; skill supply/program from one entity and relevant openings from another |
| `analyze_workforce_opportunity_by_id` | Actual supply/program/demand IDs and revisions; current scoped aggregates, coverage/gap and explicit uncertainties |

The existing `query_resource_matches` and `analyze_resource_sharing_by_id` also accept compatible Assets supply against Operations demand. The same scope and revision checks apply. Worker Sales additionally exposes `sales_by_period`: UTC inclusive `from`, exclusive `to`, actual completed fulfillment revenue and creation-period order volume, separate currencies and invalid-date rejection. All-time summaries do not pretend to be period summaries.

Matching is bounded evidence screening, not a recommendation or arithmetic result. Call the corresponding deterministic capability with observed references. The model must never invent source IDs or calculate money itself.

## Shared procurement

Demands and quote must agree on SKU, unit and currency; quote minimum quantity and expiration are enforced. Currency/unit conversion is unsupported. Integer-cent arithmetic is checked for safe bounds and service formatting uses exact integer division.

```
combined quantity = quantity A + quantity B
baseline external = A quantity × A unit cents + A shipping
                  + B quantity × B unit cents + B shipping
proposed external = combined quantity × quote unit cents + quote shipping
transition        = A transition cents + B transition cents
proposed total    = proposed external + transition
ecosystem saving  = baseline external − proposed total
```

Internal transfers redistribute costs; they do not create ecosystem revenue and do not change net savings. The controlled scenario computes 300 units, EUR 3,520.00 baseline, EUR 2,780.00 external purchase, EUR 30.00 transition, EUR 2,810.00 total and EUR 710.00 potential saving. Supplier terms, specifications, delivery, taxes, allocation and authorized purchasing decisions remain unconfirmed. The calculation returns raw cents internally and exact `displayAmounts` strings for model prose.

## Workforce and training

Matching requires the same skill for source supply/program and a different entity's demand that includes that skill. Counts of available people and completed qualifications may overlap and are never added. Seats are future capacity, not graduates or qualified people. For the single-skill synthetic scenario, the observed three available qualified people cover at most three of five openings, leaving a gap of two; three completions do not increase coverage to six. Five remaining training seats are separately reported potential. Suppression or additional unverified required skills leave qualification/coverage unknown. Humans must verify consent, complete skills, scheduling, access, geography and suitability; no hiring action exists.

## Asset resource sharing

The established resource service uses m³ and compatible currency. Available capacity is authoritative Worker evidence; incremental cost, internal payment, avoidable external fraction, transition, horizon and location suitability are explicit illustrative assumptions unless independently confirmed. It distinguishes total observed operating cost from assumed incremental cost and cancels internal payments in ecosystem totals. Base and labelled sensitivity calculations remain separate evidence.

The Phase 7 scenario observes 800 m³ available against 500 m³ external demand costing EUR 12,000/month. With illustrative internal payment 3,000, incremental cost 1,000, transition 6,000 and horizon 12 months, deterministic consumer/provider/ecosystem monthly benefits are 9,000/2,000/11,000 and horizon benefit 126,000. Raising incremental cost to 2,000 and transition to 12,000 leaves consumer monthly benefit unchanged at 9,000, lowers provider/ecosystem monthly benefits to 1,000/10,000 and horizon benefit to 108,000. These are conditional proposals, not bookings or savings realized.

## Analyst and human publication

The existing provider-independent loop supports `resource-sharing`, `shared-procurement` and `workforce-opportunity` investigation profiles. Native local Qwen receives compact authorized tool definitions/results; full source evidence, calculations, actual arguments and model activity remain internally retained. Call, tool and total investigation limits are separate. Model/provider/format/tool-budget failures remain explicit partial or failed runs; a valid JSON shape alone does not establish a supported conclusion.

The [presenter guide](phase7-presenter.md) runs genuine native Ollama investigations and records their actual calls. Phase 7 tooling defers finding publication. An administrator reviews amounts, units, source revisions/freshness, assumptions and wording against the calculation, then explicitly publishes through Master. Existing durable synchronization delivers only to affected Workers and brings acknowledgments back. Repeated publication is idempotent. The reproducible test model is explicitly labelled and covers protocol/failure regressions; it is never evidence of a live-model investigation.
