# Procurement 1.1.0 private service requirements

Legacy 1.0.2 purchasing, receipts, commercial requisitions and signed projection
contracts remain supported. Appended migration 003 adds private-service lookup
and minimal access auditing. New private requirements are separate record kinds;
they never enter commercial demand/quote projections or legacy requisitions.

Configure `syntheticServiceReplenishment: true`, `integrationsEnabled: true` and
an explicit `serviceAuthorityProgramId` UUID. Current staff must hold
`cee.procurement.service.manage`. Create and explicitly approve a service-source
relationship identifying source entity, Worker, programme, module and expiry.
The reviewer must match the receiving bilateral peer-grant approver. Changing
configuration or revoking authority also denies access to cached inbox receipts.

The optional signed `procurement.service-replenishment` capability, contract
`steward.service-replenishment@1.0.0`, purpose `food.replenishment`, accepts a
closed requirement UUID, both programme scopes, category and positive quantity.
No participant alias, private SKU, supplier, price or case note is accepted.
Source identity comes only from the private broker's verified attestation.

The receipt is duplicate-safe and contains `status: "draft"` and
`financialCommitment: false`. Requirements remain private human planning records.
They do not create orders, submit production, select suppliers, approve spending
or manufacture prices. Any actual purchasing requires the existing separate human
purchasing workflow and its normal permissions.

Run `npm run build --prefix modules/procurement`,
`node modules/procurement/update-service-manifest.mjs`,
`node scripts/test-food-services.mjs` and
`node scripts/test-business-modules.mjs`. Signing/publication supplies actual
migration hashes; retain all published 1.0.2 packages.
