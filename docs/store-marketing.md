# Store Marketing and Google Analytics 4

This bounded increment adds `cee.marketing` 1.0.1. It plans campaigns and reads aggregate GA4 reports; it does not execute advertising, install tracking tags, change prices, or establish attribution or profit. See [verification](marketing-verification.md) for actual deployment and acceptance status.

## Ownership and use

The independently signed module owns its database. Its manifest contributes Marketing Overview, Campaigns and Tracking Links, Campaign Budget Plans, Marketing Actions, Snapshots and Conditions under Business → Store Marketing. Marketing Connection and Marketing Monitoring Policy are administration screens. The shared renderer remains unchanged.

Campaigns generate home-page UTM links from non-personal campaign/source/medium codes. This first increment deliberately accepts HTTPS storefront origins only, excluding arbitrary paths, query strings, credentials and fragments. Operators must not put personal information in campaign codes. Optional Catalog/Pricing UUID references are descriptive; they neither validate another module's records nor activate promotions. Budgets are plans, not actual spend, authorization, encumbrances or expenses. Recorded actions never execute anything externally.

Worker permissions are separate: `cee.marketing.read`, `.write`, `.configure`, `.approve`, `.publish`. Module Manager grants these through existing local account governance. Models receive only bounded read-only Master tools, never local write or publish permissions.

## Gate 2: configure a real operator-owned GA4 property

1. In Google Cloud, select the appropriate project and enable **Google Analytics Data API** (`analyticsdata.googleapis.com`). Create a service account. Download its JSON private key into a protected local directory outside source control. Organization policy may prohibit service-account keys; resolve that policy with your administrator rather than weakening it.
2. In the intended GA4 property, open Admin → Property access management and add the service account email as **Viewer**. Cloud IAM membership alone does not grant Analytics property access. Use the numeric GA4 property ID, not the `G-` measurement ID.
3. On the owning Worker, edit Administration → Store Marketing → Marketing Connection. Enter the numeric property ID, HTTPS storefront origin, and explicit reporting dates (at most 31 inclusive days). Save, inspect the association, then explicitly approve it. Every edit revokes that approval. This human-approved association is not a claim that a supplied ID proves store ownership.
4. From the repository root, with the module built, install the existing local credential file:

   ```powershell
   node scripts/configure-ga4-private.mjs --directory "<selected installation directory>" --worker worker-3 --service-account-file "<protected service-account JSON path>" --property "<numeric GA4 property ID>" --store-origin "https://<your-store-domain>"
   ```

   This uses the selected installation's existing private connector mount. It refuses to overwrite an existing GA4 file and never prints the key. Rotation requires a reviewed backup and replacement of that exact private module file; do not delete other connector files. Credentials never belong in module configuration forms, chat, Git, or browser storage.
5. Approve this installed module's exact signed image through existing egress governance, using an unused subnet:

   ```powershell
   node scripts/configure-connector-egress.mjs --directory "<selected installation directory>" --worker worker-3 --module cee.marketing --subnet "<unused private 10.x.x.x/28 subnet>"
   ```

   The network is installation/module/image-bound. The connector itself only permits TLS POST calls to `https://oauth2.googleapis.com/token` and `https://analyticsdata.googleapis.com/v1beta/properties/<approved-ID>:checkCompatibility` or `:runReport`. No redirects or configurable endpoints are supported. The read-only OAuth scope is `https://www.googleapis.com/auth/analytics.readonly`. Service-account authentication has no redirect URL, callback, consent-screen customer installation, or webhook. Future customer OAuth is an interface extension, not implemented here.
6. In Module Manager, set mode to `live` only after those prerequisites exist. A rejected save displays the existing host's private-file/egress prerequisite error. In Marketing Connection use Test connection, then Sync connection. Missing configuration is not success. Valid empty reports are distinguished from provider failures and cannot prove missing instrumentation or zero customers.

The private bundle includes the exact property/store association; the connector refuses a mismatch with the approved module record. Automatic refresh is opt-in, uses the same explicit date window, and starts only after a successful manual read. It does not silently advance the date range.

## Measurement is a separate setup task

Steward reads existing measurements; it does not create them. Configure Shopify measurement using Shopify's supported Google & YouTube integration and the intended GA4 web stream. Check consent behavior, avoid duplicate tagging, and confirm `view_item`, `add_to_cart`, `begin_checkout`, and `purchase` events in Analytics using appropriate test traffic. An empty event report does not identify which part of tagging, consent, reporting delay, or traffic coverage is responsible. Do not assume every event exists merely because access succeeds.

Official references checked during implementation:

- [Google Data API quickstart and property access](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart)
- [Service-account authentication](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Report compatibility](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/checkCompatibility)
- [Report request and pagination](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport)
- [Sampling, thresholding and response qualifications](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData)
- [Shopify Google Analytics setup](https://help.shopify.com/en/manual/reports-and-analytics/google-analytics/google-analytics-setup)

## Evidence and review

Reports are daily sessions by default session channel, and daily occurrences of the four allowlisted ecommerce events. No visitor IDs, raw page URLs, raw source strings, order joins, reported revenue or non-additive user metrics are imported. Reporting currency is retained as metadata, not money. A report is bounded to four 250-row pages and a 31-day window. Each request has a 12-second timeout. Transient failures retain the last observations and persist exponential backoff from one minute up to one hour; permanent configuration/access failures require correction and a manual retry.

Snapshots are immutable. Completeness describes retrieved report coverage, not finalized accounting or guaranteed measurement coverage. Sampling, thresholding, row loss, provider truncation, restrictions and missing metadata qualify results. Observations expire for comparison after 24 hours. Provider data can be revised later; repeated reads create separately timestamped observations, while processing retries do not duplicate a completed request.

Publish a specific snapshot explicitly to synchronize `marketing_reports_v1`. Withdrawals retain history and remove current authorization. The projection includes the immutable snapshot ID/revision plus exact entity, Worker installation, module, stream, publication record and revision. Master Reports shows these separately from commerce accounting. `query_marketing_reports` and `analyze_marketing_periods` resolve exact authorized references. Comparisons require the same entity/installation/property/store, report definition, currency/timezone, equal duration and non-overlapping periods. Zero denominators, incompatible or qualified data produce unknown calculations. No campaign-to-order attribution, ROAS, CAC, causal lift, sequential funnel or net profit is calculated.

The Marketing measurement investigation profile uses the existing Analyst and requires human review before finding publication. Review the complete narrative against retained source evidence; automated checks are not a substitute for that review. Recommendations do not execute decisions.

Monitoring is disabled until a local policy is enabled. Conditions remain local until explicitly published. Existing Master per-entity monitoring authorization controls notification creation; existing affected-only findings and acknowledgments are reused. Unavailable evidence is never treated as resolution. No Business Automation installation is required.

## Verification and limits

```powershell
npm run build
npm run build:marketing
npm run test:marketing
node scripts/verify-single-stack.mjs
```

`test:marketing` uses an isolated temporary PostgreSQL container and explicit GA4 fixtures, with cleanup. It never inserts simulated Analytics results into the operator installation. Gate 3 requires real access, actual allowlisted reports, comparison with the corresponding GA4 UI, evidence review, and separately authorized publication/delivery. Without those prerequisites, report live acceptance as not configured/unverified.

No Google Ads, Meta, Search Console, email/SMS, social publishing, automatic spending, Shopify theme changes, fulfillment, accounting, or commercial OAuth installation is included.

Snapshot presentation (1.0.4): Business → Store Marketing → Snapshots shows report contents, usefulness, next steps and Master sharing state before opening source evidence. Empty reports are setup evidence, not proof of zero activity. Reports appear newest first; old and qualified evidence remains preserved and labeled.
