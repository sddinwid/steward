# Store Marketing verification ledger

Status: implementation acceptance in progress. This is not a release or a claim of live GA4 compatibility.

Baseline: `2b1b213` on `codex/phase16-business-automation`. Selected installation: `steward-phase8-upgrade-reg`; original seven volumes and existing Shopify/Printify 1.7.0 profiles must remain intact.

## Completed checks so far

- Baseline commerce recovery/monitoring: 21 tests passed.
- Marketing contracts/provider plus Master source/calculation tests: 32 passed.
- SDK regression: 65 passed; module host regression: 31 passed.
- Platform backend regression: 98 passed.
- Commerce/live transport/actions/cost/presentation/egress regressions: 60 passed.
- Isolated PostgreSQL API: 11 checks passed; real generic-renderer browser: 3 checks passed. Includes missing configuration, retained reports, campaign creation, planning-only budgets, local permission rejection, association approval, retries/backoff, immutable observations, explicit publication/withdrawal, invalidated in-flight association, condition deduplication/acknowledgment/unavailability, and restart persistence.
- Root build completed. Final source checks and signed-image/deployment acceptance remain pending.

Evidence is retained under `artifacts/marketing-*`. Fixture results do not establish live Google connectivity. No provider credentials have been invented or requested in chat.

## Defects found and corrected during implementation

- New module date-format schemas were incompatible with the existing strict module validator. Changed only the new module to established pattern validation, retaining calendar checks.
- Nullable optional references were incorrectly required by the new module schema, preventing browser creation. Optional fields now match existing shared-renderer omission behavior. Initial failure retained in `marketing-browser-initial-failure.log`.
- Old property reports could appear after reassociation; reads now filter the current association.
- Missing private configuration could trigger repeated automatic refresh; automatic retries now require a previously successful connection or a pending transient retry.
- Unavailable comparison evidence could resolve a prior condition; resolution now requires that condition's evaluable evidence.
- Snapshots explicitly retain original immutable IDs/revisions in approved publications; withdrawal of an unpublished report is rejected.

## Remaining gates

Final signed package, selected-installation backup/upgrade, deployed browser and preservation acceptance are pending. Google account/property/service-account/measurement configuration and live read-only acceptance are separate unverified gates. Do not infer completion from this ledger until final results are appended.

Pre-signing migration validation: existing and new working-tree SQL checksum/ancestry check passed. The clean-checkout comparison initially found 92 committed migrations versus 93 working migrations because Marketing was not yet in HEAD. No migration bytes or acceptance rules were changed; the committed-source gate must be rerun after the implementation checkpoint. Recovery backup completed with four PostgreSQL dumps, configuration copies and all seven original volume identities. Worker 3 has no GA4 private credential file; account/live gates remain not configured.
