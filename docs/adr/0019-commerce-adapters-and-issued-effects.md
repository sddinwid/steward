# ADR 0019 — Commerce adapters retain external authority and issued-effect receipts

Status: accepted for implementation; acceptance pending.

Continue checkpoint fa79ac7 without replacing its registry, resolver, approval or routing mechanisms. Separately packaged Shopify and Printify modules use signed SSMA capabilities for local interactions. Sales owns canonical local order execution, inventory providers own reservations, Shopify owns channel facts and Printify owns production status. Explicit variant mappings bridge their different product models.

Module inboxes commit local intent only. Module-owned background processing performs bounded external API calls outside business transactions. Before a non-repeatable request, a separately committed issuance receipt records its identity. Lost responses suspend issuance and require authoritative reconciliation; neither inbox replay nor a restart may manufacture another production order. Production requires a local permission-protected approval and an operator-enabled connector, with a cost ceiling. Acceptance uses simulators exclusively and must never submit real paid production.

Secrets are operator-provisioned private files copied into the existing per-module secret subpath. No connector credential is sent to the frontend or included in public module configuration. Verified connector declarations permit a bounded private webhook path through the existing authenticated Worker/host broker. Raw bytes reach the owning adapter, which validates source/HMAC and records replay identities before scheduling authoritative reconciliation. External payloads cannot choose module capability providers or grant workflow authority.

Simulators are separate explicitly identified services with separate persistent state, TLS, API authentication, signed events, pagination and controlled failures. Their control routes require a different operator credential. They implement synthetic business fixtures only. Passing simulator acceptance does not validate a commercial account.

Commerce projections require explicit local approval and contain no customer/address/payment data. Master computes integer-cent revenue, known/estimated costs and margin with provenance and unknown values preserved. Existing scoped synchronization, MCP and human-reviewed finding publication remain authoritative.
