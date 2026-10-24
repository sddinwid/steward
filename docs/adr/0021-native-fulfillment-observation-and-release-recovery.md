# ADR 0021: Native fulfillment observation and release recovery

Status: accepted.

Commerce UI acceptance found that native/external fulfillment needed a readable, permission-scoped observation surface. Ship this through separately signed Shopify 1.0.1 and Printify 1.0.4 packages, retaining previous immutable packages. Do not add business-provider code or remote assets to Worker core.

Shopify exposes fulfillment ownership/status and rejects new Steward dispatch when source fulfillments or a Printify-assigned fulfillment location establish native/external ownership. Existing Steward-routed obligations continue using their original routing receipts. An ambiguous transfer requires reconciliation; observing another provider is not permission to manufacture.

Printify imports bounded external-order observations into its own database and exposes only source identity, ownership classification, status, currency and tracking. Native/external observations have no production controls. Customer addresses, connector credentials and raw provider responses are excluded. These observations do not become Master financial authority. Existing governed commerce projections retain their original exact-cent and cost-estimate contracts.

Repeated identical job patches are no-ops. Polling an unchanged reconciliation error must not continually rewrite a business record or increment its revision. Actual changes still retain optimistic concurrency and explicit external-issuance receipts. No destructive migration or rollback is needed.

New 0.9 synthetic simulator accounts default to USD, with an explicit provisioning override. Re-provisioning preserves existing account settings and historical currency. Upgrading a deployment preserves its existing simulator topology even when an operator omits the optional simulator flag. It does not silently turn a live connector into a simulator.

The release startup command repeats its idempotent Compose startup at most once after failure, accommodating a service that has restarted during cold initialization. Both attempts still require health/readiness and persistent failures still fail. It never resets volumes, credentials or identities. Database migrations remain append-only; schema-10 downgrade protection is unchanged.
