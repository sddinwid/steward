# Carrier simulator acceptance — 2026-11-10

Scope: shared carrier observation library and an independently signed synthetic provider. No real carrier transport, authentication, label purchase, pickup, commercial API call, Master publication or model investigation was performed.

## Packaged and installed

- `@steward/carrier-kit` 1.0.0.
- `steward.carrier.simulator` 1.0.3 active on the selected installation's Worker 2.
- Clean committed image source: `e29ad564d0488b2ffad09b390e1f198c05f25dc7`.
- Image: `sha256:44b258cf39ed37233de9ac6b08379dc4da7b9ce771b21a98409aa7f320b1e6ab`.
- Worker 3 early simulator retained disabled: authority 1.0.0, execution 1.0.2. Its local records and signed identities were preserved, not transferred to Worker 2.
- No core image rebuild or replacement; no release tag or remote push.

## Automated evidence

| Command / suite | Actual result |
| --- | --- |
| `npm run build:carrier` | TypeScript library and independent module builds passed |
| `npm test -w @steward/carrier-kit` | 16 passed |
| `node scripts/test-carrier-simulator.mjs` | 16 actual PostgreSQL/API checks passed |
| `node --test scripts/test-carrier-publication.mjs` | 2 passed |
| `npm test -w @steward/module-sdk` | 65 passed |
| `npm test -w @steward/platform` | 98 passed outside sandbox |
| `node --test scripts/test-module-execution-contract.mjs` | 10 passed |
| Clean-source Docker build / signed publication | Passed |

These are targeted suites (207 passing tests/checks), not a rerun of all historical phase acceptance. The 13 design scenarios are covered across library and PostgreSQL checks: duplicates, chronology, explicit correction, conflicts, unknown time, tracking reuse, partial reads, outages/backoff, scope isolation, configuration races, restart/idempotency, unknown multi-package completion and synthetic progression. Additional checks exercise closed schemas, permission denial, concurrency, background revision races and catalog capacity.

## Installed acceptance

The actual Worker UI discovered the signed contribution and created a synthetic registration. Persisted synchronization advanced announced → in transit → out for delivery → delivered. Whole-shipment completion remained unknown because package-set completeness was not established.

An actual registry/resolver lookup, approved simulator-only binding and active workflow delivered a durable `shipping.tracking.sync` command. Genuine Worker MCP discovery and `carrier_simulator_shipments` invocation returned retained delivered evidence. No model was run and MCP performed no external read or synchronization.

The synthetic outage preserved last known observations; durable retry recovered after the explicit recovery action. Restarting only the simulator preserved the registration and events. The browser row synchronization command succeeded after background revision changes. Screenshots and structured results are retained in the selected installation under `demo/carrier-acceptance-worker-2/`; execution-upgrade assessment evidence remains under `demo/carrier-acceptance/` and private run logs under `.steward/carrier-*.log`.

## Preservation

All four PostgreSQL clusters and selected configuration were backed up before installation/upgrade. Verified afterward:

- All 16 original core/database/host containers retained their exact container IDs and image IDs.
- Seven original Docker volumes retained unchanged.
- 58 original security/private/commerce/network/configuration files retained identical hashes.
- Database account rows (including credential hashes), core identities and all preexisting module installation rows matched the original backup.
- Single-stack audit passed: 63 selected running containers, no unexpected stack, exactly one active carrier simulator. Worker 3's superseded simulator was disabled without deleting data.

## Failures found and resolved

1. Publication refused an unintended root application dependency introduced by npm prefix behavior. Removed it and regenerated the module lockfile from its own directory; source-integrity checks pass.
2. Initial platform tests could not launch OpenSSL in the sandbox. The unrestricted rerun passed all 98 tests; no TLS/security relaxation was made.
3. The first browser test collapsed an already-open navigation group. The runner now uses the existing page search and actual link.
4. Background retries caused a genuine recovery-action revision conflict. Simulator commands now use the existing locked-current-state facility with unchanged authorization and request-id deduplication; regression and browser checks pass.
5. Intermediate publications exceeded the 100-entry active catalog limit. Restored the limit by archiving only this task's intermediate simulator artifacts; all signed artifacts/images remain retained. Added a tested pre-publication capacity guard. Original authority entries remain available for lifecycle control.
6. The first simulator's signed contracts resolved but lacked explicit capability activation gates. Routing correctly remained unavailable. Added signed gates and positive/negative tests in 1.0.3, then verified actual routing on Worker 2. The original Worker 3 authority was never rewritten or silently transferred.

## Remaining boundaries

UPS/FedEx credentials, sandbox/live compatibility, carrier-specific retention obligations, actual external egress, multi-carrier substitution, rates/labels/pickups and Master disclosure remain unimplemented. The self-binding proves governed routing through the existing platform, not real-provider interchangeability. Refresh is explicit, with bounded jobs; this is not continuous live shipment monitoring. Attempt history has no automatic pruning. The active catalog is at its existing 100-entry limit; future publications require reviewed archival of unused entries, preserving installed authority references.
