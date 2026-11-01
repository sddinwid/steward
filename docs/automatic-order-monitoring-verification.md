# Automatic order monitoring verification — 2026-11-01

Implementation commit: `2688febcdf453c078ba72b2515b242e69875cc39`.
Prior commits `a875156` and `4c9554b` remain intact. No tag or GitHub push.

## Deployment and configuration

Selected installation: `steward-phase8-upgrade-reg`. Only Worker 3's Shopify and
Printify packages upgraded; both are active at **1.5.0**. Core applications were
not rebuilt. Existing image-bound egress grants were renewed using
`scripts/configure-connector-egress.mjs`, without expanding provider permissions.

- Shopify image: `sha256:2dddffc4f0602ec89fc2f8eb825778d0bdc786d1b5307f5fb59463d1ba66f4d1`
- Printify image: `sha256:d140ddb75ccf5af262b50fd40fb692e8c3570cab4e1ecf391200de37f02683e4`
- Policy: `919666b2-6b57-40b6-925b-218d0a9eef48`.
- Approved current association: `a3b71b9f-c7d6-4edf-8554-6cff1c5539b8`,
  Shopify `shopify-dev` to Printify `printify-dev`.
- Enabled through browser: interval 60 seconds, batch 10, grace 1,800 seconds,
  freshness 300 seconds, delay 172,800 seconds, include pending payment,
  exclude identifiable test orders. The existing 30-second tick may execute a
  due comparison on the following tick; this is not a real-time guarantee.
- Destination: Worker 3 / Shopify / **Order Monitoring Exceptions**, accessible
  to authorized local Shopify readers; acknowledgment requires configure permission.
  Conditions are unpublished. No email, external notification or Master finding
  delivery was attempted or claimed.

Private configuration and Worker 3 database backup completed before upgrade.
Seven original volumes, 38 private-file hashes, both module configurations,
10 previous Printify record identities and 31 previous Shopify record identities
were preserved. Existing records can acquire new source observations; preservation
does not mean freezing legitimate operational updates. Unaffected images matched
the snapshot. Original associations and provider pins were retained; new work
received an explicitly approved current binding and association.

## Automated results

**70 passing tests, zero failures in final runs**:

| Command | Passed |
|---|---:|
| `node --test scripts/test-monitor-policy.mjs scripts/test-connector-order-monitoring.mjs scripts/test-shopify-live.mjs` | 25 |
| `node scripts/test-commerce.mjs` against committed source | 28 |
| `node scripts/test-workflow-notifications.mjs` | 7 |
| `node scripts/test-phase15-source-migrations.mjs --committed --catalog .steward/phase8-upgrade-regressions/modules/public/catalog.json --trust .steward/phase8-upgrade-regressions/modules/public/trust.json` | 10 |

Shared commerce-kit and both module TypeScript builds passed. Both Docker package
builds passed from clean committed source. No new SQL migration was needed.

Coverage includes authorized discovery, wrong entity/store/provider rejection,
immutable associations, bounded pages and mismatched snapshots, retries, duplicate
receipts, automatic comparison adoption/deduplication, condition acknowledgment,
resolution and recurrence, grace/freshness boundaries, pending/refunded/canceled
eligibility, split/partial fulfillment review, unknown financials and retail-price
misuse prevention. Existing real TLS simulators exercise production/shipment,
refunds/cancellation, forged webhooks, provider failures, credential failures and
recovery. Shopify transport tests cover throttling and malformed responses.

These are affected suites, not a new full-platform regression run. New condition
classification cases include deterministic fixtures; do not mislabel every case
as a provider lifecycle exercised end to end.

## Browser and installed acceptance

Eight browser checks passed: two retained commerce screens, three matching screens,
policy editing/enabling, automatic exception acknowledgment, and combined financial
evidence presentation. No page errors were observed in passing runs. Screenshots
are in the evidence files below. The generic signed module renderer was retained.

Installed module restart resumed the durable policy. During a real Master API
outage it advanced its last-run timestamp and continued Worker-local comparisons.
Master was restored in `finally` and verified healthy afterward. The comparison
count remained one for the policy; episode 1 and its acknowledgment survived.

## Actual live observations

Shopify order `18986570154348` / **#1001** matched the existing Printify observation
through the authorized read-only SSMA route. Printify remained **on-hold**.
Automatic condition `cb85b381-2fbc-4d24-a075-c1c088592a8f` opened once and was
acknowledged in the browser. There were no live order, production, fulfillment,
payment, refund or webhook-registration mutations.

Shopify source record `a9be0037-fd37-49ee-a695-1e4d00516cf4`, revision 2:
three unit lines of 1,899 + 1,899 + 3,099 cents = **6,897 cents USD booked
merchandise**, zero source discount and zero total source refund. Recognition,
merchandise refund allocation, tax, customer shipping, fees and margin remain
unknown. This is not a profit or tax-exclusive accounting statement.

Printify's separate module-owned evidence reports 2,545 cents production and
1,533 cents shipping from complete unit-quantity lines, using the existing
administrator-confirmed USD configuration. Its basis is **incomplete** while on
hold; these are not claimed as settled expenses. Retail `total_price` was not
used. Costs are not silently merged into the existing matching contract.

## Failures corrected and remaining limits

- The old migration test assumed exactly 84 declarations. It now compares original
  declarations to the immutable v0.15.0 tag and permits verified appended entries.
- Clean-checkout verification exposed CRLF/LF drift for Shopify 006 and Printify
  007 from the previous increment. Git attributes now reproduce their existing
  signed bytes. SQL and manifest migration hashes were not rewritten.
- A browser test initially expected a checkbox; the existing generic renderer uses
  a Yes/No select. The locator was corrected; no renderer workaround was added.
- A TypeScript check caught an untyped validated pagination offset; explicit numeric
  conversion corrected it before packaging.
- Live production, split shipment, delivery, cancellation and refund progression
  remain **unverified**: the available live order is on hold. Simulator success is
  not proof of those commercial provider outcomes.
- The API visibility gap for Printify Other orders remains. Absence is qualified,
  never proof the order did not arrive.
- Test-order identity is excluded only when the stored source identifies it; the
  current live collector does not retrieve Shopify's test flag.
- Recognition and cross-module cost allocation remain unknown where current source
  evidence/contracts do not support them. Multi-quantity supplier cost allocation
  is deliberately unknown. No complete profit, accounting or tax claim is made.
- Notifications are the local condition inbox, not recipient-specific Automation
  notifications or published Master findings. Acknowledgment is not order action.
- Provider outage/recovery and throttling use existing automated fixtures. No live
  credential revocation or deliberate commercial API throttling was performed.
- More than 1,000 matching supplier records stays ambiguous/incomplete, rather than
  silently truncating to a successful match. New page snapshots restart safely.

Final topology: **61 running containers**, one selected stack, no unexpected stack.
Resource sample: approximately **6,387 MiB** total container memory. No persistent
volume deletion or test-stack replacement occurred.

## Evidence and implementation files

Evidence prefix: `artifacts/automatic-monitoring-`:
`focused-tests.log`, `committed-commerce.log`, `notifications.log`,
`migrations-committed.log`, `migration-report.json`, `shopify-build.log`,
`printify-build.log`, `deployment.json`, `matching-live.json`, `live-policy.json`,
`recovery.json`, `preservation.json`, `single-stack.json`, `resources.txt`,
and browser PNGs. Earlier migration and browser failure logs are retained.

Implementation changed:

- `.gitattributes`: preserve previously signed migration checkout bytes.
- `modules/shopify/{Dockerfile,manifest.json,package.json,package-lock.json}`:
  immutable package version and signed policy/exception/financial UI contributions.
- `modules/shopify/src/order-monitoring.ts`: attach automatic policies, paged
  receipt progress and financial evidence to existing matching.
- `modules/shopify/src/monitor-policy.ts`: approved policies, durable tick progress,
  eligibility, backoff, local condition episodes and acknowledgment.
- `modules/shopify/src/monitor-pages.ts`: bounded same-snapshot page accumulation.
- `modules/shopify/src/monitor-financials.ts`: conservative deterministic evidence.
- `modules/printify/{Dockerfile,manifest.json,package.json,package-lock.json}`:
  immutable package version and native cost evidence UI.
- `modules/printify/src/definition.ts`: retain order cost evidence during existing reads.
- `modules/printify/src/order-costs.ts`: documented cost fields and unknown handling.
- `packages/commerce-kit/src/monitoring.ts`: prevent legacy condition resolution
  from incorrectly closing monitoring-owned episodes.
- `scripts/test-monitor-policy.mjs`: deterministic policy, pagination and finance tests.
- `scripts/verify-order-monitoring-fixture.mjs`: database-backed automatic lifecycle tests.
- `scripts/test-phase15-source-migrations.mjs`: released ancestry instead of frozen total.
- `docs/automatic-order-monitoring.md`, this report and `docs/order-matching.md`:
  operation, verification and limitations.
