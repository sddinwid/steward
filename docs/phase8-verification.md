# Phase 8 acceptance verification

Date: 2026-10-23 local / 2026-10-24 UTC. Branch: phase8/smart-modules-commerce. Continuation began at fa79ac7; no Phase 8 components were restarted or discarded. The retained Phase 7 deployment was preserved.

All mandatory Phase 8 gates passed, including the exact final archive. An accepted distribution must have acceptanceStatus=accepted and acceptanceEvidenceCommit in release.json; that commit identifies the completed repository verification report. Historical checkpoint evidence is retained in phase8-checkpoint-verification.md.

## Implemented release

Core/host 0.8.0; SDK 1.4.0; module-only business kit 1.3.0 and commerce kit 1.0.0. Latest packages: Inventory 1.4.0, Sales 1.1.1, Shopify 1.0.0, Printify 1.0.2, Stock Ledger 1.0.0. Retained Operations 1.0.0, Procurement 1.0.2, Assets 1.0.3 and Workforce 1.0.2 continue running. Older immutable Inventory/Sales/Printify packages are retained in the catalog and archive for provenance and compatible installations.

The implementation adds independently packaged adapters and TLS simulators, explicit variant mappings, HMAC webhook ingress, bounded API reconciliation, permission-protected production approval, independently committed issued-effect journals, configured-shop screens, signed SSMA capabilities, original-workflow/provider retention and approved commerce projections/MCP calculations. No operational business implementation is embedded in Worker core. Platform migrations append 7-9; earlier migrations remain unchanged. Registry/routing/execution scope follows the persisted enrolled legal entity without requiring Master connectivity.

## Actual commands and results

| Verification | Actual result |
|---|---|
| npm run build | Passed all applications/shared packages and business modules |
| npm test | **80 passed, zero failed**: SDK 14, host 2, platform 28, installer 7, Inventory 2, Operations 2, business 7, SSMA 8, commerce 10 |
| npm run test:smart:browser | **9 passed**, including the eight backend cases repeated and one Chromium governance check; not nine additional independent backend tests |
| verify-phase8-regressions.mjs on the separate upgraded fixture | **17 suites passed**, covering Phase 1/4/5/5B behavior, model failures, concurrency, isolation, outages, module restart/provisioning/secrets and unconfigured-provider behavior |
| Historical verify-phase2, verify-phase3 and verify-phase5 on a separate v0.8 fixture | Passed real browser authentication/enrollment, authorization/replay/trust denials, dynamic installation/CRUD, real failing migration/recovery, module isolation and Analyst/MCP/provider failure checks |
| Phase 7 browser, MCP, recovery, configuration and test-model suites | All five passed on Phase 8 with the retained separately versioned packages |
| verify-phase8-commerce.mjs enroll/modules/commerce | Three trusted enrollments; ten actual browser module installations; two complete initial browser commerce flows; core API/frontend image IDs unchanged during addition; Worker 2 remains without Inventory |
| verify-phase8-provider-browser.mjs | Passed deployed browser discovery, explicit provider approval and workflow activation, independent Stock Ledger substitution and compensation at original providers; Sales OCI image unchanged |
| verify-phase8-commerce-upgrades.mjs | Browser upgrades preserved all existing Sales/Printify business rows and Worker core image IDs; configured-shop navigation appeared dynamically |
| verify-phase8-commerce.mjs recovery | Passed Master/simulator outages, Worker/API/module-host/module restarts, shipment while coordinator stopped, durable resumption and analytical catch-up |
| verify-phase8-connector-failures.mjs | Passed actual deployed 429, credential/scope rejection, malformed JSON and timeout failures, visible error states, bounded recovery and unchanged Sales hashes |
| verify-phase8-mcp.mjs | Passed real scoped MCP discovery/calculation, independently recomputed exact cents, duplicate/stale source rejection and scoped account denials |
| verify-phase8-upgrade.mjs | Actual populated v0.7 runtime upgraded to candidate v0.8/schema 9; every retained configuration/secret/identity byte and account/enrollment/module/business-record hash preserved |
| Copied candidate toolkit npm ci/build, install/start, smoke/browser-smoke, repeated provisioning | Passed separate clean initialization, four independent databases and identical Worker core images; no developer checkout build dependency |

Raw reports are local artifacts/phase8-*.json and .log files. Sanitized durable evidence is phase8-verification-evidence.json. Exact setup, upgrade, verification, shutdown and candidate-promotion commands are in phase8-release.md; connector security/recovery is in phase8-commerce.md; architecture and third-party contracts are in phase8-architecture.md and phase8-ssma.md.

## Commerce and integrity evidence

The initial Worker 1 and Worker 3 flows each ingested a synthetic Shopify product/order, mapped distinct Shopify and Printify variant IDs, imported through approved SSMA, reserved two units, requested production, required explicit local production approval, created/submitted exactly one simulated production order, observed tracking/shipment, consumed stock 20 to 18, synchronized exactly one Shopify fulfillment and approved publication. Worker 2 had no Inventory and no commerce configuration/database changes from those installations.

Separate module/PG tests lost responses after external create, production submission and Shopify fulfillment. Each reconciled authoritative IDs/lines/status/tracking with one effect per source identity. Tests also cover refunds, cancellation before and after import, stock compensation, replayed/altered signed webhooks, stale source observations, provider identity/version/configuration/permission changes, malformed results and bounded retry exhaustion. Unknown external outcomes suspend; no receipt is erased and no destructive rollback or blind manufacturing retry is used.

Repeated deployed recovery-harness attempts deliberately retained six distinct Worker 1 source orders. Their final counts were six creates, six production submissions, six fulfillments and stock 20 to 8, rather than repeated effects on one identity. An independent SQL/module receipt and source-status check established uniqueness. Browser provider substitution then reserved/released independent synthetic stock with no consumer image changes.

Master's approved three-order sample currently computes revenue EUR 150.00, estimated production EUR 64.00, shipping EUR 12.00 and estimated margin EUR 74.00. Unknown costs remain null; currencies are never combined. Product/channel metrics and chronological same-entity margin anomalies preserve source references, cost coverage, units, periods and explicit allocation limitations.

## Genuine local model and review

Real qwen2.5:7b with the existing 16384-context alias successfully selected and invoked live authorized Steward MCP tools. Investigation fd26030c-ccf0-4114-b2b4-75fe32c7dd5e completed in 26,531 ms and selected two actual orders from Workers 1 and 3. Its independently recomputed sample was revenue EUR 100.00, estimated production EUR 48.00, shipping EUR 8.00 and estimated margin EUR 44.00. Narrative review verified the exact values, estimate qualifications and tax/refund limitations. Actual browser publication delivered only to Workers 1 and 3; both acknowledged durably; Worker 2 received none. No business action was executed by the model.

A repeat on the corrected final core also completed in 27,346 ms with correct selected-sample financial values. Review did not endorse its vague timing-absence remark, and that repeat was not published. This is evidence that narrative review remains necessary. Final accepted investigation evidence is recorded separately when the last review finishes. Configuration bytes were restored and models unloaded after each call. Test-model runs remain explicitly labeled reproducible protocol fixtures, separate from these genuine model calls.

## Defects corrected during acceptance

- Routing now requires an approved workflow and preserves original aggregate workflow/provider identities across explicit new-work substitution. Rejected-before-effect sequence gaps require committed source rejection evidence.
- Module-host connection outages return clear HTTP 503 rather than internal HTTP 500.
- Commerce source resolution includes its declared stream, avoiding ambiguity with a legacy projection using the same record ID/revision.
- SSMA uses the persisted enrolled legal entity rather than the initial installation entity. Scope changes fail closed before effects; checkpoint approvals require explicit re-review for new work, not silent migration of historical obligations.
- Sales 1.1.1 imports already-canceled orders as canceled. Printify 1.0.1 exposes configured shop identity; 1.0.2 additionally refuses unconfirmed/mismatched live cost currency and requires currency-bound private production grants.
- Docker default subnet exhaustion is handled with explicitly selected non-overlapping private subnets, with no pruning. Simulators use a separate loopback-published TLS network because internal-only Docker networks do not publish ports.
- Historical verification hardcoded ports and a baseline file from another deployment were corrected. Browser/module readiness and source-revision races were corrected in the runner; failed attempts were retained and rerun honestly.

## Preserved deployment and limitations

The original Phase 7 project remains separate with its 27 containers, original ports, four PostgreSQL volumes, credentials, identities, configuration and business records. No retained volume was deleted, reset, upgraded or pruned. The Phase 8 demonstration has 37 containers on separate ports. A test-time snapshot measured 1,666.39 MiB and 48.94% aggregate Docker CPU; this includes active acceptance traffic and is not a capacity benchmark.

Shopify/Printify connectivity was verified against local authenticated TLS simulators only. No live commercial credentials, real customer data, paid cloud services or manufacturing orders were used. Live OAuth/account setup, real scopes/webhook registration, native currency confirmation, restricted egress and commercial account acceptance remain operator work. Catalog/line/page/job budgets are explicit and oversized/ambiguous cases stop for reconciliation. Costs are estimates excluding fees/taxes/shipping income, not invoices or accounting-grade net profit. Full FX, tax/refund allocation, multi-shop tenancy per module, invoice reconciliation and automatic resolution of uncertain external effects are not implemented. Drain obligations before provider upgrades; upgrades may require explicit review and safe suspension. No automatic transfer of reservations or destructive rollback is provided. Offline enrollment remains deferred. Successful MVP acceptance does not establish commercial production readiness.

## Final archive acceptance continuation

The exact application images completed a fresh installation with three enrolled Workers, all ten browser module additions and two complete commerce flows. A legitimate optimistic revision conflict exposed a browser-runner race: the runner now waits for list refresh and explicitly re-reads/retries only a confirmed no-effect revision conflict. It never retries an uncertain manufacturing call. Final archive tooling is refreshed before promotion.

Direct final-image upgrade from a newly populated actual v0.7 installation passed, including real operator accounts, trusted enrollment, custom module configuration, stock and synchronized capacity records. Retained-data redeployment also passed after correcting the snapshot boundary: connection health/revision observations may change during restart; connector identity and all authoritative business rows, receipts, accounts, identities and files remain compared. The first failed snapshot is retained as artifacts/phase8-redeployment-first-attempt.json.

On the corrected final core, the original published real-model finding and every original calculation/source revision were independently recomputed again. Only Workers 1 and 3 still have it, both acknowledged; Worker 2 has none. A further 35,336 ms model repeat mislabeled the high-cost entity and net revenue, so review rejected it and no finding was published. These are documented model-quality limitations, not silently accepted recommendations.

## Final acceptance

All gates A-F passed for clean source commit 84034aab73645111e03a9fc1d18dbf5e0f17a7d2. The final archive is artifacts/releases/steward-0.8.0, with separate Master/Worker distribution manifests, seven pinned core/database/simulator images and 15 separately versioned module payloads. The copied final toolkit completed npm ci/build, fresh installation, three trusted enrollments, ten actual browser module additions, both initial commerce workflows, an additional outage/restart workflow, source-backed MCP calculations and byte-preserving repeat provisioning. The final three-order analytical sample is revenue EUR 150.00, estimated production EUR 64.00, shipping EUR 12.00 and estimated margin EUR 74.00. The model-backed two-order finding remains a separately attributed EUR 100/56/44 sample, rechecked on final core.

The accepted Phase 7 baseline comparison passed: 23 authoritative module table hashes, 79 private configuration/secret file hashes, all enrollment certificates, every core image ID and 27 running containers match its accepted snapshot. Temporary verification deployments are stopped without deleting their database volumes/configuration. The primary Phase 8 deployment remains at API 14100/web 15100/HTTPS 16100; Workers at APIs 14201-14203, webs 15201-15203 and HTTPS 16201-16203. Its 37 containers include both TLS simulators. Final test-time observation: 1,528.04 MiB aggregate container memory and 54.92% Docker CPU; not a capacity benchmark. Ollama has zero loaded models.

The accepted archive is promoted only after this evidence commit; promotion preserves all payload checksums/image IDs and binds acceptanceEvidenceCommit. Candidate manifest SHA-256: 30b13916544f3066e1f386b6062e6bc6ac28a78774f710d73d36b4f119b08e8f. Image archive SHA-256: 4eb52251095a16902e9b0f1110cdd92f8eb3f93e62e9c90114b3996eb4bd8c58. The final accepted manifest hash and release tag are recorded in the completion commit and verification sidecar outside the archive. The original failed candidate is retained under artifacts/candidates/steward-0.8.0-final-attempt1 and is not an accepted release.

Accepted release manifest SHA-256: a20876ccaac94fa817ec84e887cf7f9916fc841b5f598e0fd98a4b6a4b312141. All payload hashes were reverified after promotion. The release verification sidecar is artifacts/releases/steward-0.8.0-verification.json, outside the checksummed archive. Temporary verification containers/networks were removed without deleting volumes or private installation files. The retained Phase 7 (27 containers) and primary Phase 8 (37 containers) remain running. Annotated tag v0.8.0 identifies the final verification commit.
