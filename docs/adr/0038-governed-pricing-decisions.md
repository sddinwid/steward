# ADR 0038: Independent deterministic pricing decisions

Status: accepted implementation specification for checkpoint 15C; operational verification pending.

Pricing owns entity-scoped lists, policies, immutable proposed rule revisions, human reviews and retained decisions in a dedicated module database. Catalog owns offering definitions and promotion-eligibility metadata. Inventory, Procurement and Sales retain stock, supplier cost and accepted transaction authority. Neither Master nor AI is required to calculate a local price.

## Selection

1. Resolve the explicitly requested list or the operator-configured default for the exact currency. Do not infer a list from a name, kind, cheapest value or insertion time. Missing defaults return no price; ambiguous defaults fail closed.
2. Consider only explicitly activated rules with current list/policy revisions and applicable subject, currency, channel, authorized customer category, promotion and UTC half-open interval `[validFrom, validTo)`.
3. Priority is an explicit merchant override. Rank eligible outcomes lexicographically by descending priority, exact variant, exact channel, exact customer category and eligible promotion. A generic offering rule may cover a variant only with the same offering revision and provider pins; the requested variant must independently be verified.
4. Multiple equally ranked outcomes are a conflict even when their amounts happen to match. IDs sort explanatory evidence; they never choose the transaction price.

A currently effective, matching active override that loses its approval/source basis must not silently expose a lower-ranked fallback price. If that invalid candidate would tie or outrank the valid winner, resolution returns `source_changed` for human correction. Future, expired or strictly lower-ranked invalid candidates need not block an unaffected winner.

An outcome is one fixed rule, or one approved basis-point discount referencing an exact approved fixed base revision. Unsupported stacking/chains fail. Currency never changes implicitly. Supported v1 currencies use exact integer cents and scale two. Discount cents are `floor(listedCents * basisPoints / 10000)` using integer arithmetic; resolved cents equal listed cents minus discount. Quantity multiplication is bounded. Zero is a known value; unknown costs are not zero. Cost/contribution functionality belongs to checkpoint 15F.

## Human authority and time

Proposal, review and activation are separate actions. Proposer/reviewer identity and event timestamps derive from the authenticated server context. Rules and reviews cannot be rewritten after submission. Policy determines current distinct reviewer quorum and separation of duties. A no-review policy still requires explicit activation. Promotions cannot bypass rule approvals.

The module host supplies a fresh snapshot of enabled accounts with the signed reviewer permission. Stored approval records are historical evidence, not proof that a reviewer remains authorized. Recheck current membership at activation and new quote decisions. Background ticks have no such snapshot and cannot manufacture authority from cached actors.

Transactions evaluate server time. Read-only preview may explicitly use a hypothetical time, but its result cannot authorize a transaction. Authorization expiry is bounded by policy duration, selected rules/promotion/customer validity, Catalog evidence freshness, and any known scheduled transition capable of changing the winner. Status/acceptance must reject changed or expired evidence; an existing accepted Sales snapshot remains historical and is never retroactively repriced.

Activating a future revision retains the current family version until its replacement boundary. Durable lifecycle cutoffs can only shorten, never extend, an earlier cutoff. Canceled or superseded revisions cannot reactivate; restoring an old amount requires a new immutable proposal and reviews. Effective status is derived separately from approval/lifecycle state. If a later change shortens an outstanding quote's authorized horizon, current status fails closed while its original historical decision remains immutable. Tightened freshness applies immediately to cached evidence; relaxing configuration does not extend an old read lease.

## Catalog and durable reads

Pricing works independently using explicitly scoped legacy SKU subjects. Matching strings never convert a SKU into a Catalog identity. Catalog subjects come from approved SSMA discovery and correlated fresh lookups, retaining actual host-attested Worker/entity/provider installation/package and offering/variant revisions. Client forms select cached authorized subjects rather than supplying provider authority.

Catalog 1.0's closed lookup ABI is preserved. Catalog 1.1 adds a separate `catalog.pricing-subjects.read` capability to return authoritative promotion eligibility. Absence of that compatible provider is an explicit unavailable/source-changed condition, not an inferred eligibility flag.

Existing durable routing carries quote requests and status. Correlate request identity, digest, consumer module and job; exact retries reuse the same job, conflicting reuse fails. Catalog failures never silently choose another provider. Remote pricing receipts remain unsupported until a separate governed contract exists. No new workflow engine is introduced.

POST previews run in read-only database transactions and cannot enqueue source work. Explicit source refresh/request actions are separate. Every decision retains exact amounts, method, rule/list/policy/approval/eligibility evidence, timestamps and original source pins. Module/provider upgrades preserve historical facts and require explicit new-work authorization where pins change; they cannot rewrite old obligations.
