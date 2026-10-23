# Phase 7 presenter checklist and recovery

Use a dedicated synthetic deployment. The [release guide](phase7-release.md) gives exact initialization/install commands. Default secure addresses are Master `https://master.localhost:6100`, Workers `https://worker-1.localhost:6201`, `https://worker-2.localhost:6202`, `https://worker-3.localhost:6203`. Trust the generated development CA for manual browsing; automated browser checks use a dedicated local test context. Node/MCP/enrollment/provider requests verify the configured CA and server identity.

Run commands from the repository/toolkit root. Replace `.steward/demo7` with the chosen deployment path.

1. Run `node scripts/demo.mjs .steward/demo7 preflight`. Verify four healthy APIs/frontends and installed Ollama. No model is configured by default; that is an explicit deferred state, not a failed Worker.
2. Run `node scripts/demo.mjs .steward/demo7 setup` only for a fresh demo. It creates random private presenter accounts, registers the first entity, grants explicit scope and completes real trusted enrollment. No default password exists.
3. Run `node scripts/demo-phase7.mjs .steward/demo7 install`. Chromium installs/activates packages using the running Module Manager. The retained Inventory 1.2.1 item survives its 1.3 upgrade. Procurement/Sales/Assets/Workforce are installed on Worker 1; Procurement and standalone Sales on Worker 2; Assets/Workforce on Worker 3. Operations and trusted enrollment are set up on all three. Workers 2/3 retain no Inventory. Repeated installation requests are safe; Worker core image hashes remain unchanged.
4. Run `node scripts/demo-phase7.mjs .steward/demo7 seed` twice, then `check`. The second seed preserves existing records and edits. Open each module navigation screen, inspect records and delivery status. Configuration editors are local-administrator operations; normal module users see only explicitly granted APIs/screens/tools.
5. Show the controlled business workflows: competing Sales orders reserve 8 and 2 of 10 units; cancellation releases the larger reservation; fulfillment consumes 2; partial purchase receipts add 3 and 2. Stock finishes at 13 with zero reserved. A threshold event creates a linked draft requisition, not a purchase order. Worker 2 completes a standalone Sales order without Inventory.
6. Inspect approved Master copies and relationships. Shared procurement uses 300 units: EUR 3,520 separate external baseline, EUR 2,780 quoted external purchase, EUR 30 transition, EUR 2,810 total and EUR 710 potential ecosystem saving. Assets supply 800 m³ against 500 m³ external demand. Workforce demonstrates 5 openings, 3 available qualified people, 3 overlapping completions, 5 training seats and a remaining gap of 2; no individual records are disclosed.

## Genuine AI and reviewed delivery

Ensure native Ollama is available at loopback port 11434 with `qwen2.5:7b` already installed. The runner reuses its weights through a 16k-context alias, creates a temporary authenticated TLS bridge, records actual native-model turns/tool calls, and restores original provider configuration/secret bytes and unloads its model afterward. No cloud key is needed; model weights are not included in the release.

```powershell
node scripts/demo-phase7.mjs .steward/demo7 ai
```

The configured prompts are in `datasets/phase7-investigations.json`. They require actual source IDs, one dependent tool call per turn, deterministic calculations, and conditional human review. Monetary text copies service-formatted amounts; original integer cents remain in evidence. The resource profile preserves the earlier local-Qwen investigation path and includes a labelled sensitivity case. Local model calls can still fail or produce wording errors: do not present a failed/partial run as a recommendation.

Each successful run writes `artifacts/phase7-ollama-PROFILE.json` and a persistent investigation visible in Master. Review its narrative, assumptions, source references, freshness and deterministic evidence. A valid JSON response alone is insufficient: check units, combined quantities, overlap/suppression, conditional approval and any qualitative wording. Raw source/calculation activity remains available even when a model times out or is rejected. The model never approves, buys, hires or publishes a finding.

After review, publish through Master's existing browser control, or use the equivalent explicit presenter action:

```powershell
$report=Get-Content artifacts/phase7-ollama-shared-procurement.json -Raw | ConvertFrom-Json
node scripts/publish-reviewed-finding.mjs .steward/demo7 $report.investigationId 'Reviewed source revisions, combined quantity, correctly scaled amounts and conditional human approval against the deterministic evidence.'
```

Repeat for the other reviewed profiles. This helper uses the actual browser publication button, repeats the idempotent request, checks affected-only delivery and records Worker acknowledgments returning through durable synchronization. A review note is required. It does not rewrite model prose or conceal failed attempts. Rejected findings must be closed through Master; retained audit history is intentional.

## Repeatable reset and failure recovery

```powershell
node scripts/demo-phase7.mjs .steward/demo7 reset
node scripts/demo-phase7.mjs .steward/demo7 seed
node scripts/demo-phase7.mjs .steward/demo7 check
```

Reset retires only ledger-owned approved synthetic projections, eligible open Sales reservations and findings whose references are entirely owned by that generation. It restores the owned external-cost scenario through revision-checked APIs, then creates a new generation of synthetic business documents. Received/fulfilled/completed documents, private synthetic people, events and audit remain as history. Credentials, accounts, enrollment, module installation/configuration and unrelated records are never erased. This is a scenario reset, not table truncation. Replaying initial module absence requires a separate fresh deployment.

If interrupted during seed/reset, rerun `seed` or the interrupted reset. The ledger persists creation intents and action request IDs before writes; retries do not duplicate orders, receipts, reservations, completions or findings. Missing owned records or conflicting identities stop recovery instead of silently adopting unrelated data.

For a missing/disabled integration peer, inspect the source module delivery screen. Pending commands retain identity and retry/backoff. Restore/activate the compatible peer and operator configuration. A rejected Procurement stock receipt requires correction of the cause (for example, create the referenced SKU) and its authorized `retry stock` action. Never delete inbox rows or manually replay a new receipt identity to hide a failure. Disable/reenable preserves data.

For failed module migration, review its signed package/image/schema and use Module Manager's explicit recovery with a corrected version. Do not perform an automatic destructive database rollback. Other modules and Worker health remain independent. For an interrupted local-provider test, run `node scripts/recover-local-provider.mjs .steward/demo7` after the owning process has exited; it refuses to restore over a live owner.

The demo runner uses `.steward/demo7/phase7/.lock` to serialize changes. If the owning process was killed, verify it is no longer running before removing only that empty lock directory. Preserve `scenario.json` and review/credential files. Stop/start with the release commands, never volume deletion.

## Automated verification

```powershell
node scripts/verify-phase7-browser.mjs .steward/demo7
node scripts/verify-phase7-mcp.mjs .steward/demo7
node scripts/verify-phase7-recovery.mjs .steward/demo7
node scripts/verify-module-provision.mjs .steward/demo7
node scripts/verify-isolation.mjs .steward/demo7
```

Browser tests create/edit real records in all four screens and exercise business transitions. Recovery tests stop all Master services while Workers continue local fulfillment, verify module-owned durable backlog/catch-up, pause/restart an Inventory target, deny premature fulfillment, verify exactly-once reservation/compensation, and compare all business-record hashes, module configurations and enrollment certificates through Worker restarts. Run deployment-mutating suites sequentially. The separate Phase 1–6 regression runner belongs on its expected baseline scenario, not on an already expanded/modified Phase 7 presenter dataset.
