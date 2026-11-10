# Carrier simulator 1.0.3

This independently packaged module is synthetic only. It makes no UPS/FedEx requests, uses no carrier credentials and cannot purchase labels or schedule pickups. It does not connect to Shopify, Printify, Sales or Master publication.

The shared `@steward/carrier-kit` implements closed event validation, scoped registration identities, deduplication, conservative reconciliation and retry/freshness rules. The module owns its PostgreSQL records, jobs, attempt receipts and immutable allowlisted observations. Unknown timestamps and conflicting evidence remain qualified; one delivered package never proves completion of a shipment with an unknown package count.

## Build and test

From the repository root:

```powershell
npm run build:carrier
npm run test:carrier
npm test -w @steward/module-sdk
npm test -w @steward/platform
```

`test:carrier` uses an isolated temporary PostgreSQL container and removes it in cleanup. It never connects to the operator databases. The 13 design scenarios are exercised by the shared unit tests and actual SQL/API tests, with additional schema and authorization checks.

## Installation and operation

Publish from a clean committed source checkout using the existing `scripts/publish-module.mjs`, supplying `modules/carrier-simulator` and the selected operator directory. Back up the selected installation before installation. In Worker 2 Administration → Modules install and activate **Carrier Simulator** 1.0.3. Configuration is restricted to `mode: simulator`; this is not an authentication claim.

Business → Carrier Simulator → Synthetic Shipments accepts a local reference and a tracking number beginning `SIM-`. **Sync tracking** queues a persisted read. **Advance synthetic status** changes synthetic provider evidence; synchronize afterward to ingest it. Other simulator actions introduce duplicates, late events, corrections, ambiguous events, partial results, outages and throttling through that same ingestion path. Recovery clears the injected failure; existing failed jobs retain their history and a new sync may be requested after retry exhaustion.

The separate Tracking Events, Synchronization Attempts and Delivery/Sync Exceptions views retain evidence. Simulator Connection is an administration screen. Registration, synchronization, configuration and scenario controls have distinct Worker-local permissions. Read permission does not authorize changes.

## SSMA and MCP

Signed contracts declare `shipping.tracking.register`, `shipping.tracking.sync` and `shipping.observations.read`. A governed sync requires an approved compatible binding and active workflow through the existing registry/resolver. Its expected provider pins the original installation and authority package. The simulator's self-binding is an integration demonstration, not proof of interchangeability with a real carrier.

Worker MCP contributions `carrier_simulator_shipments`, `carrier_simulator_events`, `carrier_simulator_exceptions` and `carrier_simulator_attempts` read retained local data only. They cannot register, sync, simulate or call an external API. Pages are limited to 20; `q` is an exact authorized registration UUID where supported, not a global tracking search.

## Bounds and limitations

Maximum 200 registrations and 500 retained event observations per registration; pages of 20; five attempts per job; persisted 30-second lease; five-second transport timeout; exponential bounded retry; one-hour freshness. Refresh is explicit, not continuous carrier polling. Attempt history is retained without automatic deletion. Account generation changes invalidate in-flight results. Provider scope includes entity, Worker, module installation, package authority, connection, account and environment.

Real carrier transports, sandbox authentication, external egress approval, carrier-specific retention terms, rates, labels, pickups, Master disclosure and multi-provider substitution acceptance remain separate work. No live compatibility is claimed.
