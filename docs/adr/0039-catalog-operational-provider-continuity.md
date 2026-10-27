# ADR 0039: Catalog operational references restrict approved providers

Status: accepted for Phase 15 implementation; deployed acceptance pending.

Catalog references describe a commercial offering's relationship to an operational provider. They neither grant access nor replace stock, procurement or mission authority. A verified link retains its original Worker, entity, module installation, package, stream, record and revision. Ordinary stock movements may change provenance revisions without changing a semantic item-definition digest. Unit changes must never imply conversion.

A capability command can carry a versioned `providerConstraint` with five exact provider identity fields. The module host first selects and authorizes the existing approved workflow/binding. It then compares the restriction before creating routing or obligation records and before delivery. A mismatch fails with `INTEGRATION_PROVIDER_CHANGED`; it cannot select another provider. Original envelopes and hashes retain the restriction. Delivered envelopes omit this host-only field so independently packaged legacy receivers retain their closed ABI. Existing obligation pins remain authoritative.

After acquiring lifecycle delivery locks and checking current metadata/runtime continuity, local deliveries receive a private sender identity header constructed from the actual source installation and signed descriptor. Gateway-supplied copies are stripped case-insensitively. Business modules validate the closed identity against the command and enrolled local entity. Historical records and remote peer deliveries without the necessary attestation do not acquire invented installation identities. New governed commercial work fails closed where its required identity proof is unavailable; existing mission peer contracts remain unchanged.

Pricing retains this attested consumer identity on new quote jobs and requires it on retries and status reads. Legacy jobs retain their historical behavior. Sales additionally binds its own confirmation intent and actual provider receipts. A current Worker account snapshot only establishes membership; module policies and human actions still determine authority.

An optional idempotent module-owned `afterMigrate` initialization runs inside the existing schema migration transaction using trusted runtime configuration. Stock modules use it to preserve an immutable declared unit identity. This avoids adding a second configuration authority or reinterpreting existing quantities after an ordinary configuration save. Releases with outstanding reservations are preserved, not silently upgraded to new provider identities.

Actual source-level evidence: 11 SDK/host checks, 10 PostgreSQL governance groups (including all five mismatched provider fields, no routing writes/effects, original-envelope retention and legacy wire delivery), and 44 Pricing PostgreSQL groups. Installed-host, browser and deployment gates remain separate requirements.
