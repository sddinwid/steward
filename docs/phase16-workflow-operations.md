# Workflow operations and recovery

User/presenter guide for v0.16.0. Actual installed acceptance and limitations are
recorded in [the final report](phase16-final-acceptance.md).

## Authority and prerequisites

Business Automation is a separately signed module, not a built-in business screen.
Its module database owns definitions, immutable publications, human reviews and
internal notifications. The Worker owns discovery, approved bindings, activation,
event subscriptions and durable execution coordination. Business effects remain in
the selected Sales, Inventory and Procurement provider databases.

Install packages through Module Manager. Enable only the required configuration
and approve each compatible SSMA binding through Smart Module administration.
A package being available does not install it, activate its capability, or grant
an account permission. Existing modules work without Business Automation.

Use a separate authorized reviewer for a publication. Its author, most recent
editor and publisher cannot approve it themselves. A module publication review
and Worker activation are separate decisions. Step approval is another decision;
a notification acknowledgment is never approval.

## Design and review

Create a draft using the module-contributed Workflow Designer. Select a declared
trigger, compatible registered capabilities and explicit provider bindings. Use
typed conditions and bounded action mappings. Templates produce unbound drafts;
they do not select authority or publish a workflow.

Validate the graph, then preview with explicit synthetic values, provider outcomes
and assumed human decisions. Preview creates no execution, permission, approval or
business record. It does not prove real provider behavior or restart recovery.
Changing the draft or assumptions invalidates the previous preview.

Publish a version, have the separate reviewer inspect its exact graph and approve
it with an expiration, then import that reviewed version into Worker governance.
Activate only after checking its bindings, source identity and limits. For an event
workflow, create the governed subscription to the original provider installation.
Inspect execution history and pending step reviews in the governance screen.

## Business paths

- Sales workflow continuation requires its explicit optional configuration. Sales
  retains its accepted price and original Inventory reservation/fulfillment authority.
  Channel and production orders are not a generic workflow manufacturing path.
- Inventory shortage workflows require integrations and
  `workflowReplenishmentEnabled`. Filter explicitly for `workflow_requested`;
  legacy replenishment statuses describe retained original obligations. Add human
  approval before the Procurement action. Procurement creates its own draft
  requisition or proposal; supplier terms and financial approval are still required.
- Internal notifications require `notificationsEnabled` and an approved binding.
  Recipients are current authorized local reviewers/administrators. Notices use a
  fixed category and opaque reference; they do not carry arbitrary participant or
  business data. Only the recipient may read or acknowledge the notice. This is
  an internal inbox, not email or SMS.

## Parallel work and recovery

Reviewed parallel limits allow at most four lanes. Only explicitly retry-safe,
idempotent operations on distinct providers run concurrently. Same-provider work
retains ordering. Each branch has its own attempt count and deadline; joins wait
for the required successful branches. A failed branch cannot erase a successful
sibling's committed business effects.

Retry a lost response with the original request identity. Do not manufacture a new
execution ID to bypass an uncertain result. Successful provider responses have
retained source/provider/configuration fingerprints. Changed terms require
reconciliation, not resubmission to a replacement provider. Original obligations
stay with the original installation and package. A replacement can serve new work
only after explicit approval.

Event delivery uses bounded retries and a retained dead-letter state. Inspect the
failure and original source record before using governed recovery/replay controls.
Replay retains the original request intent and source pins; it does not grant a
new retry budget on every click. Rejected or unserved Inventory shortage episodes
require operational reconciliation rather than silently creating another request.

Cancellation suspends further work; it does not undo effects already committed.
Deactivation stops eligible new work while preserving history. Master unavailability
does not remove Worker authority or local execution persistence. Provider outages
must remain visible as waiting, retrying, suspended or reconciliation-required work.

## Deployment recovery

Keep the selected deployment, original volumes and private configuration. Use the
existing release CLI backup/upgrade process; do not run `docker compose down -v`.
The release adds an HTTPS Workflow routing overlay after Catalog. It rejects a
changed identity or custom routing instead of overwriting that configuration.

After an interrupted upgrade, retain the private backup and candidate evidence.
Inspect the selected image IDs, release marker, health checks and module lifecycle
state before another attempt. Do not roll back applied SQL or blindly switch back
to old binaries after a forward migration. Restore only through the reviewed
backup/recovery procedure, preserving the failed acceptance evidence.
