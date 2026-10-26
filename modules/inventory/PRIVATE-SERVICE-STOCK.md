# Inventory 1.5.0 private service stock

Existing commercial Inventory 1.4.2 contracts, records and replication streams
remain supported. Migration 005 creates new Inventory-owned private stock,
service relationships, reservations, movements, retry receipts and audit tables.
Private items never enter `inventory_items`, public item MCP results,
`replenishment_requirements`, or ordinary stock-replenishment events. Existing
public items cannot be relabeled private: their historical projections already
exist. Create separate stock classifications with independently recorded balances.

Enable `syntheticServiceStock: true`, `integrationsEnabled: true` and explicitly
configure `serviceAuthorityProgramId` to an operator-reviewed UUID. This virtual
programme scope is not a participant programme or an automatically granted peer
relationship. `programAuthority` requires the actual staff account and
`cee.inventory.service.manage`. The Private service supplies and Supply service
relationships screens require that permission as well.

Create a private item without participant aliases or participant-specific names.
Draft a source relationship pinning the source legal entity, Worker, programme,
module and expiry, then explicitly approve it. The actual reviewer must also be
the receiving approver of the corresponding bilateral peer grant. Grant expiry,
revocation and current programme authority are checked before cached inbox results
are accessible. No automatic authorization is inferred from source module names.

The signed `inventory.service-stock` capability implements closed, programme-
scoped `observe`, `reserve`, `consume` and `release` operations under contract
`steward.service-stock@1.0.0`, purpose `food.supplies`. It contains no participant
reference, SKU or unrestricted note. Stock authority resides only in this module.
Reservations retain source entity/Worker/programme/module and original provider
installation/package/grant identity. Duplicate consumption events have a stable
delivery UUID and immutable quantity; retries do not consume twice. Partial holds
remain reserved until explicitly released or reconciled. Consumed stock cannot be
released or restored through a pretend rollback.

Private balances and movements never produce ordinary Procurement events. A
service programme can submit a separate human-reviewed private requirement using
the Procurement service capability. Stock names, aliases and private quantities
are not disclosed through commercial Master projections.

Build with `npm run build --prefix modules/inventory`, regenerate new source
metadata with `node modules/inventory/update-service-manifest.mjs`, and verify
with `node scripts/test-food-services.mjs` plus
`node scripts/test-business-modules.mjs`. Publication must retain previously
published 1.4.2 packages and supply migration hashes before signing 1.5.0.
