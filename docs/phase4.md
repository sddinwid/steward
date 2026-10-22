# Phase 4 operations and durable synchronization

Release `0.4.0` builds on preserved Phase 3 commit **`55ec7ef`**. It adds a separately packaged Business operations module, an additive Inventory upgrade, entity-attributed analytical copies, durable bidirectional findings and a PostgreSQL outbox/inbox transport. No AI Analyst, savings calculation, MCP implementation or offline enrollment workflow is included.

## Exact setup and installation

Use Node 24, npm 10+, Docker Linux containers/API 1.51 and Compose. From repository root:

```powershell
npm ci
npm run build
npm run build:inventory
npm run build:operations
npm test
npm run provision
npm run security:provision
npm run modules:provision
npm run data:provision
node scripts/compose.mjs config --quiet
npm run dev:up
npm run smoke
```

The data provisioner adds `.steward/dev/data/compose.yaml` and HTTPS routing without rewriting base/security/module configurations, identities, secrets or installed module state. Existing modules keep running on their original immutable images until explicitly upgraded. Migration history appends platform schema 4 (outbox/inbox, projections, relationships/findings) and 5 (durable downstream acknowledgment ledger and fair module polling). Earlier migrations are unchanged. The generic platform/provider images are upgraded once; module publication/installation does not rebuild Worker core.

Trust the generated development CA for interactive browser use. Existing [Phase 2 authentication and enrollment](phase2.md) applies. Sensitive v4 APIs are available only on the HTTPS listener; no new default account/password exists. Master administration: `https://master.localhost:6100`; Worker local administration: `https://worker-1.localhost:6201`, `https://worker-2.localhost:6202`, `https://worker-3.localhost:6203`.

Publish the independent packages after core startup:

```powershell
node scripts/publish-module.mjs modules/inventory
node scripts/publish-module.mjs modules/operations
```

Published versions are immutable. If a version is already published, preserve its descriptor/image; changed source/dependencies require a new version. Do not replace a signed descriptor to make a rebuild look like the same release.

Enrolled Worker local administrators can install **Business operations 1.0.0** with `{"currency":"EUR"}` through Module Manager, then activate it. Its package provides **Capacity**, **Storage requirements** and **Warehouse assets** navigation/screens, authenticated CRUD APIs, its own database and migrations. Capacity/assets display total, utilized and available cubic metres and monthly operating costs. Distribution records show required/utilized storage and monthly external cost/currency. All behavior is in the module; Worker core has no company classifications or operational table names.

**Inventory 1.1.0** adds reserved/available quantities and signed projection metadata. On an enrolled Worker with 1.0.0, inspect its package and choose **Upgrade to Inventory**, then activate. Its first migration is unchanged; the second adds reserved quantity with default zero. Existing records, IDs, database, secrets and configuration persist. The module is briefly unavailable during upgrade. Core and other Workers remain available. Failed/interrupted attempts require explicit compatible recovery; no destructive down migration or automatic rollback is run. Unenrolled legacy Inventory 1.0.0 remains locally available and is not silently upgraded or exported.

## Repeatable synthetic scenario

`datasets/phase4.json` owns the demonstration company roles, costs, units, relationships and assumptions. It is not imported by core or module application logic. The seed requires real Master registry/local Worker accounts and a manufacturer already enrolled on Worker 1. It preserves Worker 1's existing legal entity/enrollment/name rather than rebinding its identity. Workers 2/3 enroll to dataset-configured entities using normal trusted authorization/approval APIs. Existing enrolled entities are reused.

For this development verification environment, the private account fixture from `npm run verify:phase2` supplies those credentials. On a fresh deployment run that command before seeding. It tests real authentication and creates random passwords privately, not demo authentication shortcuts. Alternatively set `STEWARD_SEED_CREDENTIALS_FILE` to an operator-private JSON file with `accounts.registry`, `accounts.worker-1`, `accounts.worker-2`, `accounts.worker-3`, each containing username/password. The host CLI signs into Master directly; no Master password is sent to a Worker. Browser users still use normal Master-hosted enrollment.

```powershell
npm run seed:phase4
npm run seed:phase4
```

The seed installs/activates Operations on each Worker, explicitly upgrades manufacturer Inventory, creates missing synthetic records and relationships, and waits for real analytical catch-up. An installation-bound seed ledger stores stable source record IDs under `data/scenario-state.json`; reruns preserve edits and do not duplicate renamed records. A seed lock rejects concurrent runs. Back up the ledger with deployment configuration. Use this command only for a controlled development dataset.

The scenario has manufacturing stock of 800 units with 200 reserved, manufacturing storage of 1200 m³/900 utilized, external distributor storage requirement 500 m³ with EUR 10,000/month cost, and warehouse assets with 1500 m³/300 utilized and EUR 4,500/month operating cost. Costs are synthetic monthly values; there is no assumed conversion of stock units into volume and no claim that total asset operating cost equals incremental cost. Tax, transport, fit-out and feasibility need later analysis. Supply and potential storage-partner relationships are explicit registry data.

## Analytical representation and findings

Master's **Entity analytical records** view labels records as nonauthoritative copies. It shows legal entity, source Worker/module/stream/record ID, revision, exported values, source timestamp, ingestion timestamp, event ID and latest peer contact. The organization model includes Master's own configuration-owned operating entity. Registry administrators manage entity relationships. Scoped administrators can only read their authorized entities/relationships; general viewers have no analytical access. A recent contact is not itself proof that every queued record has been delivered: record revisions/timestamps and Worker queue state supply that distinction.

Master registry administrators issue findings with severity (`info`, `warning`, `critical`), explanation, one or more affected entities and optional supporting references. A reference has `{entityId,moduleId,streamId,recordId,revision}` and must identify an existing analytical record within the affected set. The browser can enter references as JSON. Master tracks open/closed state and revisions; affected Workers see only their own supporting references.

Workers present local findings and can acknowledge or resolve them without Master connectivity. Each local change and its outgoing event commit together. Master shows per-Worker/entity receipts after catch-up. Local status revisions and Master finding revisions are separate, so closing a finding on Master does not erase a Worker's acknowledgment. Stale concurrent edits return 409. The findings channel cannot mutate operational records, and no Master operational-write endpoint exists.

## Transport, trust and persistence

SDK `@steward/module-sdk` 1.1.0 extends manifest v1 with optional `replication.contractVersion:1` and explicitly validated projections. API/UI contracts remain compatible; read-only numeric fields support available quantities/capacity. Each projection declares table, stream, record identity/revision columns and exported columns. The provider installs shared SDK SQL triggers after module migration success and captures existing rows once per revision. A trigger writes a versioned event into the **same module database transaction** as its operational mutation. Capture/backfill has a capture timestamp; it does not reconstruct historical changes from before installation.

Core finding status transactions use the same outbox schema in core PostgreSQL. A single Worker synchronization transport drains module queues through the existing signed provider channel and core finding queues directly. Operational events are never copied to a second core operational outbox. Every envelope extends the shared synchronization contract with event ID, source identity/entity, destination, source timestamp, module/stream/record, monotonic revision, payload version and data. Supported event kinds are `record.upsert`, `finding.issued`, `finding.status`.

HTTPS exchanges use enrolled installation keys, fresh signed time-bound proofs, durable nonces, pinned Master signing identity and verified CA/hostname. Master resolves authoritative entity ownership from its enrollment registry, not a client-selected entity. Signed replies bind issuer, destination and request nonce. Replayed proofs, wrong entity/installation, altered event identity, unsupported envelope versions and unauthorized access are rejected.

The receiver inserts inbox provenance and updates its projection in one transaction. Exact duplicate events return acknowledgments without reprocessing. Older revisions cannot overwrite newer ones. Different payloads at an equal revision return a conflict; operators must investigate instead of silently dropping the event. There is no global ordering dependency between independent records. Full inbox/outbox retention supports audit and retry; compaction/deletion is not automated.

Worker polling runs every two seconds with persisted bounded exponential backoff up to 30 seconds on delivery failure. PostgreSQL advisory/process locks prevent parallel pumps for one installation. Persistent poll order avoids module starvation. Batches are bounded to ten events and 12 KB of event data, within request/response limits. Attempts, next retry, errors, acknowledged timestamps, last attempt and last success persist. Downstream finding acknowledgments have an explicit pending ledger, not a fixed recent-event window. Restart or a lost receipt can cause redelivery, which is safe. No Redis, message broker or extra network service is introduced.

Outbound Master/provider DNS uses bounded asynchronous A/AAAA resolution rather than blocking getaddrinfo in Node's shared worker pool. Literal addresses and startup hosts-file entries are respected; changing hosts-file aliases requires API restart. Master requests have a four-second absolute deadline in addition to socket timeouts. A remote DNS outage therefore cannot consume all shared DNS workers and delay new local PostgreSQL connections. TLS certificate/hostname and signed identity validation remain enabled.

Worker `/health`, basic local availability and operational writes never require Master. `GET /api/v4/sync/status` exposes local transport state; module outbox rows retain their own attempt/acknowledgment history. A persistent error requires review of enrollment/trust, provider health, network reachability and signed projection/schema compatibility. Fix the cause and allow retry; never delete an outbox to make a failed synchronization appear successful. Conflicting or malformed events are retained and can block a batch; no automated dead-letter repair is implemented.

Production retains the [Phase 3 provider trust boundary](phase3.md): Docker socket access is host-root-equivalent and requires a dedicated trusted Worker host. Module credentials/keys never enter frontend bundles or API responses. Internal module traffic is authenticated single-host Docker networking; distributed deployment needs encrypted service transport and a constrained orchestration provider. Production PKI renewal, backup/restore, secret rotation and disaster recovery remain operator responsibilities.

## Verification, shutdown and reset

```powershell
npm run build
npm run build:inventory
npm run build:operations
npm test
npm run smoke
npm run verify:phase4
node scripts/verify-phase4-seed.mjs
npm run verify:isolation
node scripts/verify-outage-independence.mjs
node scripts/browser-smoke.mjs
node scripts/verify-module-provision.mjs
node scripts/verify-module-secrets.mjs
node scripts/verify-module-restart.mjs
```

Phase 4 verification requires the private development fixture (including scoped and viewer accounts) and seeded scenario. It uses Chromium plus actual TLS, PostgreSQL and Docker process interruption. It intentionally stops Master and kills Worker processes, and restores services in cleanup. Run only in development. The original Phase 2/3 browser scripts assume their historical unenrolled/rejected/Inventory-only topology; run those against the preserved baseline **before** the Phase 4 seed enrolls Workers 2/3 and installs Operations. Their executed results on the upgraded platform are documented in the report; do not reset established enrollment to satisfy an old fixture assumption.

Shutdown and restart preserve all operational records, outboxes/inboxes, projections and findings:

```powershell
npm run dev:down
node scripts/compose.mjs up -d --wait --wait-timeout 180
```

Use the repository wrapper so dynamically created module containers are handled. For an intentional destructive reset, `node scripts/compose.mjs down --volumes` deletes PostgreSQL and module-state volumes, then restart. A complete identity/configuration reset uses the README's path-checked directory removal after volume teardown, followed by base/security/module/data provisioning. Never retain old databases while replacing their identity keys/configuration.

See [actual verification](phase4-verification.md), [ADR 0010](adr/0010-transactional-record-capture-and-sync.md) and [ADR 0011](adr/0011-analytical-projections-and-findings.md). Native non-Windows hosts/ARM, remote registries, multi-host deployment, AI/MCP, deletes/tombstones, automatic conflict repair, retention compaction and rolling module upgrades were not implemented or verified.
