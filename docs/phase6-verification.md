# Phase 6 MVP release acceptance

Functional MVP acceptance passed. Final distribution hashes, the seeded-installation upgrade check and runtime state are recorded in the accompanying post-packaging verification sidecar. This is not commercial production certification.

Phase 5B was preserved as commit **`9aa2a94`** before Phase 6 changes. The preflight build, all 34 automated backend/SDK/installer/module tests and four-instance smoke/isolation checks passed. Phase 6 introduces packaging and presenter/recovery tooling around the same verified applications, with no platform schema, MCP, enrollment or module contract redesign.

Environment: Windows host, Docker Desktop Linux containers (Engine 29.9.1, Compose 5.6.0), Node 24.13.0, npm 10.3.0, Playwright/Chromium 1.58.2 and installed Ollama 0.40.4 / `qwen2.5:7b`. Execution date: October 23, 2026. Platform compatibility stays **0.5.0**, schema **6**; distribution version is **0.6.0**.

## Release and installation evidence

The release directory is `artifacts/releases/steward-0.6.0`. It contains two role-specific distribution manifests, separately versioned Master API/frontend and Worker API/frontend/module-host images in `images.tar`, PostgreSQL and independently packaged Inventory 1.2.1 / Operations 1.0.0, a portable source/installer toolkit, and file checksums. No deployment directory, credentials, private keys or model weights are included. Large binaries remain ignored by Git. The actual archive/manifest SHA-256 values and exact image identities are recorded in the accompanying `steward-0.6.0-verification.json` sidecar, also stored in the repository as `docs/phase6-verification-evidence.json`. The sidecar is generated after packaging and is not recursively embedded in its own manifest.

Fresh candidate installation used the release archive in the new project `steward-phase6-acceptance`. All four databases and installation identities were new and separate. Presenter setup created real random-password administrator accounts, registered the manufacturer, granted explicit authorization and completed trusted enrollment. Scenario seeding registered the distributor/asset company, enrolled Workers 2/3, installed Operations independently, and synchronized real module-owned records. Repeated seeding produced no duplicate operational records and preserved edits.

Inventory was initially absent on all three Workers, including its API returning 404. Chromium installed and activated the trusted, independently packaged Inventory 1.2.1 through running Worker 1's Module Manager, then created and displayed a persistent record. Workers 2/3 remained without Inventory. Every Worker API image remained exactly **`sha256:6ce2cf210360aa77db4e3b2dd0c4b392d4050ffb1184f952ce484dd01345c9b1`** before/after. The historical Phase 3 suite separately demonstrated live installation on Workers 1 and 3 while Worker 2 remained unchanged, plus concurrent-install rejection, API permissions, migration failure/recovery, disable/reenable preservation and restart independence.

The scoped reset test changed a ledger-owned synthetic record, restored its configured baseline through revision-checked APIs, and verified an unrelated record and every existing private configuration/account/enrollment remained intact. A second reset changed zero records. It intentionally retains findings, audit and event history; initial module absence must be repeated in a new deployment.

Repeated release installation, explicit upgrade and full container removal/recreation preserved private configuration bytes, accounts, certificates, module versions/configuration/activation and all Inventory records. A tampered payload failed checksum verification before deployment mutation. The release uses `build: !reset null`, image IDs and `--no-build`; its application images remain byte-identical to Phase 5B. This validates packaging redeployment and persistence, not a future schema-changing binary upgrade.

An additional clean installation was run from the **copied distribution toolkit**, after its own `npm ci` and ten-workspace build, in project `steward-phase6-portable`. All four smoke and Chromium desktop/mobile checks passed. The effective 15-service Compose configuration had no builds; its only toolkit mounts were four copies of `infra/init-db.sh`. Other mounts were deployment-owned configuration/state or the documented privileged Docker socket. It had no source-checkout mount/build dependency. This verifies actual relocated toolkit operation, not merely generated YAML.

## Durable business operation

The dedicated demo stopped the entire Master stack, wrote an owned Worker operational change, restarted the Worker API while disconnected, confirmed all Worker readiness endpoints, then restored Master and observed the exact committed revision and value. This completed in **28.260 seconds** for the accepted run. Reset restored the scenario afterward.

The Phase 4 regression exercises real browser operational CRUD, source/entity attribution, duplicate/older/conflicting revisions, invalid signed entity claims and transport replay, Master outage writes, Worker SIGKILL, PostgreSQL transaction termination with atomic row/outbox rollback, SIGKILL during an in-flight exchange, incremental catch-up, scoped finding delivery, controlled redelivery and offline acknowledgment/restart. It preserves original enrollment and preexisting Inventory records.

## Real local AI investigation

Accepted investigation and finding: **`6f0de728-912d-4013-a605-e91a0783532e`**, on the dedicated demo database, `testModel: false`. Native Ollama/Qwen completed the investigation in **55.825 seconds**, excluding separate warmup. The source weights were unchanged; the separate 16,384-context alias was unloaded afterward and original provider/key bytes restored. No cloud key was required.

| Turn | Actual model selection | Provider time |
| --- | --- | --- |
| 1 | `list_entities` | 1,578 ms |
| 2 | `query_resource_matches` | 1,419 ms |
| 3 | `query_business_relationships` | 3,516 ms |
| 4 | `analyze_resource_sharing_by_id`, invalid sensitivity entry without a label | 9,230 ms; schema rejected it |
| 5 | Corrected `analyze_resource_sharing_by_id` with explicit assumptions/sensitivities | 16,284 ms; deterministic calculation succeeded |
| 6 | Structured final narrative, with further tools withheld | 23,213 ms |

The model selected source IDs itself; they were not injected into the initial question. Actual source observations:

- Worker 3 / Synthetic Asset Holding: warehouse capacity 1,500 m³, utilized 300 m³, available **1,200 m³**, observed total operating cost EUR 4,500. Record **`b0dc85ef-7915-47e4-bbaa-4ef62bf50ac5`**, revision **1**, `cee.operations/warehouse_assets`; Worker installation **`40c8f018-ea79-46b5-be24-71bca6c582ac`**.
- Worker 2 / Synthetic Distributor: required storage **500 m³**, existing external monthly expense **EUR 10,000**. Record **`7ebc80fd-f6b1-4283-9841-558d401a5d57`**, revision **1**, `cee.operations/storage_requirements`; Worker installation **`883733a9-957c-4e61-9032-dca8953ad12d`**.
- Both records have EUR currency and the site text “Regional logistics hub”; the authorized `potential_storage_partner` relationship was retrieved. Source timestamps, ingestion timestamps, complete payloads and exact references remain in actual investigation evidence.

Explicit illustrative assumptions: EUR 3,000 monthly internal payment, EUR 1,000 incremental monthly operating cost, EUR 6,000 transition expense, twelve months, full proportional external-cost avoidance and **conditional** location compatibility. Observed total operating cost was not substituted for incremental cost. The analytical service computed 500 m³ shared, consumer **EUR 7,000/month**, provider **EUR 2,000/month**, ecosystem **EUR 9,000/month**, and **EUR 102,000** over twelve months after transition. Independent equations: 10,000 − 3,000 = 7,000; 3,000 − 1,000 = 2,000; internal transfers cancel; 9,000 × 12 − 6,000 = 102,000.

The higher-cost sensitivity used EUR 2,000 incremental monthly cost and EUR 12,000 transition: ecosystem **EUR 8,000/month**, **EUR 84,000** over twelve months. The model also requested a labeled base-case sensitivity, which the service calculated consistently. Its actual final narrative quotes these figures, compares the zero-change **incremental comparative benefit** baseline and states conditional assumptions. It uses generic “units”; authoritative UI source/calculation cards show m³. Humans must still assess location, transport, contracts, service levels, taxes, safety and approval. No business decision was executed.

The runner explicitly published the finding through the existing authorized registry API; the model has no write tool. **Workers 2 and 3 received and acknowledged it**, with receipts synchronized to Master; **Worker 1 did not receive it**. Chromium verified the persisted real-model attribution, narrative, MCP evidence, deterministic figures, source identities and acknowledged Worker findings, with zero uncaught JavaScript errors.

## Recovery and test evidence

The provider recovery check used an explicitly identified interrupted-state fixture, not a simulated real-model result. It confirmed recovery refuses an active PID, permits recovery after that process exits, restores exact original private configuration/secret bytes, and unloads the alias. Existing real Worker/database/process termination tests supply the runtime fault-injection evidence.

Earlier attempts are not counted as successful acceptance:

| Attempt | Observed result and resolution |
| --- | --- |
| First module automation | Package installed/activated, but the harness omitted required Reserved quantity so the browser form did not submit. Fixed the harness and used a new empty project for the accepted first-installation/CRUD test; retained the first project's data. |
| First preservation harness | Compared module `updated_at` after repeated activation. Corrected the assertion to preserve identity, account/certificate, version, descriptor, configuration and lifecycle state; reran the acceptance suite successfully. |
| Rapid repeated authentication | Actual 429 throttling. Presenter login helper now waits for the existing one-minute window and retries once; no rate limits or database rate buckets were weakened/reset. |
| First historical-suite provisioning | Security CLI returned its generic provisioning failure before application startup. Existing fixture/base configuration remained; an explicit security-provisioning rerun succeeded and suites resumed on the same fresh fixture. Root cause was not established. The failed attempt is retained in regression evidence. |
| Real Qwen turn 4 | Missing sensitivity label was rejected by the real tool schema. The next genuine model turn corrected it; no partial calculation or fabricated conclusion was accepted. |

The sequential regression runner completed **all 18 suites successfully**, including the complete original Phase 2/3 and fresh-topology Phase 5 suites inside its historical-isolation stage. Unit tests were rerun: **34 passed, 0 failed, 0 skipped**. The initial root and copied-toolkit builds each passed all ten workspaces. Exact regression commands:

```powershell
npm run build
npm test
node scripts/verify-phase6-regressions.mjs
node scripts/verify-phase6.mjs .steward/phase6-acceptance
node scripts/demo.mjs .steward/phase6-acceptance ai
node scripts/demo.mjs .steward/phase6-acceptance acknowledge
node scripts/verify-phase6-ai-browser.mjs .steward/phase6-acceptance
node scripts/verify-provider-recovery.mjs .steward/phase6-acceptance
node scripts/verify-release-portability.mjs .steward/phase6-portable
node scripts/release.mjs pack --bundle artifacts/releases/steward-0.6.0
node scripts/verify-existing-release-upgrade.mjs
node scripts/record-phase6-evidence.mjs
```

The regression runner performs deployment-mutating suites sequentially and writes elapsed times/status for each. It includes smoke, browser smoke, original Phase 2/3 plus fresh Phase 5 on a new topology, repeated seed, Phase 4 fault recovery, Inventory/MCP upgrade retention, MCP discovery, complete Phase 5 wire/test-model/security/failure coverage, browser finding publication, compact MCP/Analyst budgets and timeouts, concurrency, isolation, Master outage independence, full module restart, repeat provisioning, actual secret absence checks and deferred-provider setup. Reproducible test-model results are explicitly labeled; they are not counted as real-provider validation. Resume commands and fixture names used for this run are retained in ignored logs and the sanitized report.

## Running environment and limits

The original development deployment is restored after isolated verification. The dedicated accepted demo and portable installation retain separate databases/configuration on disk; default ports permit one topology at a time. Use the [presenter guide](phase6-presenter.md) and [installation/upgrade/recovery commands](phase6-release.md) to switch deliberately. The original provider configuration is restored; the historical real investigation stays in the dedicated demo's database. It is not falsely attributed to the original development database.

This acceptance is for a controlled **MVP**, not commercial production readiness. Remaining limits include generated development PKI and privileged Docker module hosts; unsigned release provenance/checksums requiring a separately trusted channel; npm dependency availability for the toolkit; Linux/amd64 images and Docker Desktop loopback routing; fixed local ports and stable provisioned paths; no validated remote-host rollout, cloud model provider, HA/load, key/certificate rotation or backup-restore drill; and no schema-changing upgrade validation. Synthetic reset retains history and does not reconstruct initial module absence. The full Worker-assisted offline-enrollment workflow remains deferred; its signed time-limited authorization contracts are preserved. No unrelated Phase 6 subsystems were introduced.
