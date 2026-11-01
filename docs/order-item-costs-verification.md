# Item-level order costs — verification, 2026-11-01

Implementation commit: `65e0efa54b22383617d250a4dc56cf5f3b237bcb`.
Selected stack: `steward-phase8-upgrade-reg`, Worker 3. Shopify and Printify are
both active at **1.6.0**. No core rebuild, release tag or GitHub push.

## Deployed images

- Printify: `sha256:8bc97369be5deff85742cbac1565afd3272bf88f42a5e68e96e8c9b800bb5168`
- Shopify: `sha256:ce49b9f867429d0d92bbb55fa49dfa5761523cf495f0c99f5a5b654d1dca4c82`

Both packages were built and signed from the clean implementation commit. Existing
egress approvals were renewed only for these exact images through the existing
installation/image-bound mechanism. Private configuration and the Worker 3 database
were backed up before deployment. No database migrations were needed or rewritten.

## Automated and browser results

**78 passing automated tests** in final runs:

| Suite | Passed |
|---|---:|
| Item costs, monitoring policy, connector matching and Shopify live transport | 36 |
| Database/TLS-simulator commerce suite, rerun from committed source | 32 |
| Committed-source migration integrity and trusted legacy provenance | 10 |

Shared commerce-kit and both module TypeScript builds passed. Both Docker builds
passed. See [commands and behavior](order-item-costs.md). These are affected
regressions, not a new full-platform release acceptance run.

New checks cover raw and usable amounts, zero versus missing, invalid/oversized
values, quantity ambiguity, currency conflict, duplicate/reordered lines, bounds,
source provenance, reprints/splits, exact-reference matching, permission isolation,
wrong stores/entities/provider pins, duplicate/conflicting receipts and unavailable
sources. Original matching declarations remain unchanged. Existing TLS simulator
commerce workflows continue passing; they do not establish live production compatibility.

**Four browser checks passed:** two existing commerce screens during deployment,
then the native item breakdown and browser-triggered governed cost read in the
combined view. Both new breakdowns were expanded and captured. Passing runs had
no browser page errors. The existing modular renderer was retained.

## Actual live evidence

Existing Shopify order **#1001**, ID `18986570154348`, matched Printify order
`6ae78dadb41208d34f0e476c`. The approved additive capability returned three lines
from Printify source record `80f50804-73c2-499f-a096-eb7c8113424e`, revision **5**,
stream `printify_order_item_costs_v1`.

| Printify variant | Quantity | Reported production | Reported shipping | Basis |
|---|---:|---:|---:|---|
| 78993 | 1 | $12.65 | $4.95 | Provisional |
| 105888 | 1 | $6.40 | $5.19 | Provisional |
| 72182 | 1 | $6.40 | $5.19 | Provisional |
| Total | 3 | **$25.45** | **$15.33** | Incomplete order cost evidence |

Currency is USD using the existing administrator-confirmed currency setting.
Reported numeric representations are retained alongside validated amounts.
All three lines and the order remained **on hold**. These are not settled expenses.
The item sums equal the existing order-level cost observations. No retail
`total_price`, catalog estimate, currency conversion or quantity multiplication
was substituted.

**Individual Shopify lines are unmatched.** The returned Printify lines lack
external Shopify line references. Product names, positions, prices and coincidental
SKUs were not used to invent a mapping. Shopify merchandise remains $68.97; no
per-item margin or net profit is asserted. Fees, settlement, allocation and other
unsupported financial components remain unknown.

No live order creation, production submission, fulfillment update, refund,
payment change or webhook registration occurred. Shopify's existing read-only
catalog/order retry was used to restore a stale observation, as described below.

## Preservation and monitoring transition

- Seven original volumes remain present.
- All 38 captured private-file hashes matched.
- All 38 previous Shopify and 10 previous Printify record identities remain.
- Worker and entity identities remain unchanged; captured core images match.
- Existing credentials, provider profiles, live mode and production restrictions
  remain unchanged. The only module configuration addition is Printify
  `costReadEnabled=true`, required by the existing internal cost-read gate.
- Old monitoring policy `919666b2-6b57-40b6-925b-218d0a9eef48` was explicitly disabled.
  Its parameters and original acknowledgment history were retained.
- Successor policy `3615befd-f6f1-483e-89f6-671f8de407bf` uses the original thresholds
  and explicitly approved current association/bindings. Exactly one policy is enabled.
  Its automatic comparison succeeded before the browser cost read.
- Original acknowledgment timestamp and actor were verified unchanged. Historical
  acknowledgment was not rewritten as acknowledgment of a new provider observation.

The existing module host derives `moduleInstallationId` from the install operation
ID. Therefore upgrades issue new module-operation pins as well as package pins.
An initial assertion that these would be unchanged was incorrect; source review
confirmed the established behavior. Old association pins remain intact; successors
explicitly authorize the new pins. Worker/enrollment identities were not replaced.
Both transitions are recorded in `artifacts/item-costs-preservation.json`.

Final single-stack verification passed: **61 running containers**, no unexpected
stack. Container memory sample: approximately **8,362 MiB**. No persistent volumes
were deleted or recreated by this work.

## Failures investigated

1. An old Shopify test assumed every capability other than order matching was
   simulator-only. It was narrowed to exempt the new read-only capability while
   keeping simulator restrictions on consequential operations. Final suite passed.
2. The deployment preservation helper compared a live comparison byte-for-byte to
   an earlier backup. A scheduled read had advanced its command/observation times
   before policy pause. The corrected check retains strict order, policy, owner and
   provider-pin comparisons while allowing legitimate observation advancement.
   The initial failure log is retained; no reinstall was needed.
3. Resolver rejected the new capability with `CONFIGURATION_PREREQUISITE` because
   the installation lacked an explicit `costReadEnabled` value. It was enabled via
   the normal configuration API, verifying all other settings remained identical.
4. Shopify observations were stale after a connection failure predating this upgrade
   (last successful order synchronization was 20:39 UTC). The existing read-only
   retry succeeded at 21:36:34 UTC, and live validation subsequently passed. No
   transport code, credentials or outbound controls were changed to force success.

## Limits

- Cost reads in the combined view are explicit, using **Read item costs / next page**.
  Existing automatic status monitoring is unchanged; native ingestion refreshes
  item evidence during its existing polling cycle.
- Multi-quantity allocation stays unknown. No new settlement or accounting claim.
- Actual live split/reprint cases, multi-quantity semantics, production completion,
  shipment and paid settlement were unavailable for acceptance. Automated fixtures
  cover interpretation and safety; commercial lifecycle verification remains separate.
- No approved line mapping was invented for the three real supplier lines.
- The capability reads up to 20 lines per page and caps accumulation at 1,000;
  changed snapshots, conflicting revisions or duplicate identities remain incomplete,
  stale or ambiguous rather than silently producing a total.
- Historic discarded item costs cannot be recovered. Old module pins and policy
  records remain historical rather than being silently rebound.

## Exact changed files and purposes

- `modules/printify/src/definition.ts`: retain item evidence and change-observation
  timestamp during existing reads, preserving record identities and retry behavior.
- `modules/printify/src/order-costs.ts`: raw/validated amounts, identities, provenance,
  currency conflict and conservative totals.
- `modules/printify/src/order-observations.ts`: authorized paginated capability and
  permission-aware native presentation.
- `modules/shopify/src/order-item-costs.ts`: pinned read actions, durable receipt
  validation, private cached evidence, pagination and conservative line matching.
- `modules/shopify/src/order-monitoring.ts`: integrate the existing combined view
  without exposing private cost responses to ordinary order readers.
- `packages/commerce-kit/src/order-item-costs.ts`: additive closed capability contract.
- `packages/commerce-kit/src/index.ts`: export the additive contract.
- `modules/printify/manifest.json`, `modules/shopify/manifest.json`: signed capability,
  permission, action and expandable UI declarations.
- Each module's `Dockerfile`, `package.json` and `package-lock.json`: immutable 1.6.0
  metadata; no new third-party dependency.
- `scripts/test-order-item-costs.mjs`: focused interpretation, UI-data privacy and
  compatibility tests.
- `scripts/verify-order-monitoring-fixture.mjs`: database-backed governed cost reads.
- `scripts/test-shopify-live.mjs`: read-only capability gating regression assertion.
- `docs/order-item-costs.md` and this report: operation and actual acceptance evidence.

Evidence files use the `artifacts/item-costs-` prefix: `focused-final.log`,
`commerce-committed.log`, `migrations.log`, `migration-report.json`, both build logs,
`deployment.log`, `deployment.json`, `live.log`, `live.json`, `native.png`,
`combined.png`, `preservation.json`, `single-stack.json`, `resources.txt`, and
retained failure logs. Private backups and deployment helpers remain uncommitted.
