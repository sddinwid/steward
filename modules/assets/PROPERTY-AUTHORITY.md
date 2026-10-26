# Assets 1.1 property authority

Assets remains the authority for canonical facilities, assets, and legal ownership,
custody and use relationships. Housing stores asset UUID references and dated
observations. Assets never receives participant, placement or occupancy records.
Existing asset/capacity publication and legacy APIs remain supported. Migration
003 adds management-authority lookup and minimal access-audit storage; migrations
001 and 002 remain unchanged.

The Phase 13 synthetic service channel requires explicit local configuration:
`syntheticServiceAuthority: true`, `integrationsEnabled: true`, an actual UUID
`serviceAuthorityProgramId`, and reviewed `authorizedManagerEntityIds`. Existing
`authorizedOwnerEntityIds` continues to govern legal ownership. These settings
alone do not authorize any housing management or remote access.

Create a residential facility and residential asset using the ordinary Assets
administration APIs. Record the canonical asset's UUID. Create a management
authority draft containing that UUID, manager legal entity UUID, authoritative
Housing programme UUID, validity interval, access basis and agreement reference.
A staff account needs `cee.assets.authority.write` to draft and
`cee.assets.authority.review` to approve or withdraw. Approval is explicit and
audited with the actual reviewer. Reviewed grants are immutable. Ownership-based
management requires manager and owner equality; leased/shared/custody management
does not imply ownership. An overlapping approved management authority for the
same asset is rejected, including concurrent approval attempts. Separate
independently managed properties require separate canonical Assets records.

The signed `property.authority` capability implements contract
`steward.property-authority@1.0.0`. Closed schemas live in
`src/authority-contract.ts` and are reproduced in the signed manifest. Durable
`catalog` and `verify` commands require destination `programId` and Housing
`sourceProgramId`; `verify` additionally requires canonical `assetId`.
Registry/workflow approvals and bilateral, package-pinned peer grants are still
required. The private module host supplies verified peer context; public request
bodies cannot supply their own legal entity, actor or authority.

Catalog results contain at most 20 authorized properties per page. Verification
requires an unexpired human-reviewed management grant matching the attested
source entity/programme and current owner. Availability, active maintenance and
active bookings are checked. Success includes distinct owner/custodian/user and
manager identifiers, management grant UUID, revision, access basis, and an expiry
bounded by 60 seconds, the next schedule boundary and both authority expiries.
Unknown, mismatched and expired authority receives a generic denial. A currently
unavailable property rejects new placement authorization. Housing must verify
again before a new reservation/confirmation; an outage or expiry never instructs
automatic eviction of existing occupants.

Authority grants, source participant records and access audits are not published
to Master projections or MCP analytical tools. This channel is synthetic-only in
this checkpoint and does not establish production tenancy or legal authority.

Run `npm run build --prefix modules/assets` and
`node scripts/test-housing-assets.mjs` from the repository root. The latter uses a
disposable PostgreSQL container and in-process private HTTP routes, preserves
operator data, and cleans up its own container and secret file even on failure.
It does not establish deployed cross-Worker or browser acceptance.
