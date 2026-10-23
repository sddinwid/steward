# Phase 5B local AI Analyst operations

Phase 4 baseline: `a7d6cc1`. Phase 5 baseline: `001e5bf`; deferred setup: `0fedd38`; partial local-validation baseline preserved before Phase 5B: `8dc37c7`.

The platform retains release compatibility `0.5.0`, existing installation identities, database volumes, enrollment and module packages. Phase 5B adds compact analytical queries and context, independent budgets, and a native Ollama adapter. [Decision and tradeoffs](adr/0013-compact-analytical-context-and-local-models.md). [Actual verification](phase5b-verification.md).

## Startup and local real-model validation

Use the existing [Phase 5 startup](phase5.md#installation-and-startup); no new migration, secret prerequisite or module upgrade is needed. Rebuild the development application images after building the source:

```powershell
npm run build
npm test
npm run dev:up
ollama list
$env:STEWARD_OLLAMA_CONTEXT = '16384'
$env:STEWARD_OLLAMA_TIMEOUT_MS = '90000'
node scripts/verify-ollama-provider.mjs
Remove-Item Env:STEWARD_OLLAMA_CONTEXT
Remove-Item Env:STEWARD_OLLAMA_TIMEOUT_MS
```

The base model defaults to installed `qwen2.5:7b`. Optional `STEWARD_OLLAMA_MODEL` selects another already-installed base; this phase was validated with Qwen 2.5 7B only. Context must be 4,096–32,768 tokens. The helper creates/reuses a separate `steward-analyst-qwen2.5-ctx<tokens>:7b` alias using the same existing weights, temperature 0, and the selected context. It does not download weights or edit the original installed model. Run only while other deployment-changing tests/investigations are idle.

The helper warms the alias, launches a temporary authenticated HTTPS listener on **127.0.0.1:19443**, configures only Master, runs a real investigation, independently recomputes the deterministic result from the successful tool call and observed source quantities/costs, rechecks revisions, explicitly publishes a finding, and checks affected-only Worker delivery. Finding publication is an operator verification action, not a model write tool. Its automated result remains `passed_pending_narrative_review` until the actual narrative is inspected against the evidence; the tracked report records that review separately.

It restores the exact original ignored `model.json`/`api-key.txt` and closes the bridge in `finally`, then unloads its alias runner. The original empty configuration remains supported. The alias definition remains available for repeat testing without additional weights; `ollama ps` should show no unnecessary loaded runner afterward. Abort/failure leaves a persistent explicit investigation record, and raw verification evidence is saved under ignored `artifacts/phase5-ollama-provider.json`.

## Provider configuration and trust

The existing provider-independent interface supports `openai-responses`, `responses-compatible`, and now `ollama`. The native Ollama endpoint must be verified HTTPS ending in `/api/chat`. Example private operator configuration, suitable only while an authenticated local TLS endpoint is actually running:

```json
{
  "provider": "ollama",
  "model": "steward-analyst-qwen2.5-ctx16384:7b",
  "endpoint": "https://host.docker.internal:19443/api/chat",
  "apiKeyFile": "/etc/steward/analyst/api-key.txt",
  "caFile": "/etc/steward/analyst/ca.pem",
  "servername": "master.localhost",
  "testModel": false,
  "toolProfile": "compact",
  "modelCallTimeoutMs": 90000,
  "toolTimeoutMs": 8000,
  "investigationTimeoutMs": 600000,
  "maxSteps": 12,
  "maxToolCalls": 16,
  "maxOutputTokens": 1200,
  "maxContextChars": 48000
}
```

No cloud API key is needed for local inference. The verification bridge uses a fresh real bearer credential, created only in the ignored private secret mount, validates it before proxying, and never forwards it to Ollama. It forwards only the selected model and `/api/chat` to fixed `http://127.0.0.1:11434`. TLS verifies the existing development CA and `master.localhost` certificate; the Docker Desktop host bridge allows the Master container to reach the host-loopback listener. No listener is opened on LAN addresses and TLS verification is never disabled. This is a one-host development procedure. A persistent or remote production Ollama deployment needs an operator-managed authenticated TLS endpoint and managed secrets/PKI; the temporary verifier is not a production hosting service.

Native Ollama uses the documented [chat tool interface](https://docs.ollama.com/api/chat) and [JSON-schema structured output](https://docs.ollama.com/capabilities/structured-outputs). Compact finalization on the Responses adapter uses the official [structured output format](https://developers.openai.com/api/docs/guides/structured-outputs). Syntax constraints do not establish semantic correctness; actual source/calculation review is still required.

## Additive MCP contracts

Every existing tool and envelope remains available, with `schemaVersion: 1`. Master exposes four additional read-only tools; Workers retain their original core/module discovery.

| Tool | Inputs and behavior |
| --- | --- |
| `query_entity_resources` | Optional authorized `entityId`, `category` all/supply/demand, exact case-insensitive `site`, `fields` from seven declared resource fields, `limit` 1–20 (default 4), `offset`; always retains source IDs/revision/Worker/time |
| `query_resource_matches` | Optional authorized `entityId`, `limit` 1–10 (default 2), `offset`; returns source-backed supply/demand pairs with matching currency/site text and separate entities; ranks observed external expense, then stable record IDs |
| `query_business_relationships` | Optional authorized `entityId`, `limit` 1–20 (default 4), `offset`; both endpoints must be disclosed to the caller |
| `analyze_resource_sharing_by_id` | Exact supply/demand record IDs and revisions; explicit internal payment, incremental cost, transition, horizon, avoidance, location suitability and sensitivity array; invokes the unchanged deterministic service |

Pages include `total` and `nextOffset` and reflect current synchronized data rather than a snapshot transaction. Unknown entities, unauthorized scopes, stale source revisions and invalid fields fail explicitly. Matching is capped at 10,000 input records and one million supply/demand comparisons; broader queries fail and require narrower scope. New queries use the same existing analytical APIs and disclosure policy, including scoped filtering before record resolution; they do not acquire authority through enrollment or agent identity.

Candidate screening is a deterministic join/filter over real observations. It does not generate recommendations, infer actual incremental costs, prove geographic suitability, or bypass relationships/human decisions. Original complete analytical projections/events remain in persistence. Successful calculations snapshot full source payloads/references/relationships in investigation evidence; the compact model receives relevant fields and one structured representation rather than duplicate JSON text. The original full tools remain available for inspection.

Response pagination bounds what is disclosed to the model. These queries reuse the existing authorized projection service, which still loads its scoped view before filtering/paging in memory. Database query pushdown and very-large-dataset performance were not implemented or validated in this phase.

## Budgets and partial results

| Configuration | Default | Allowed range |
| --- | --- | --- |
| `modelCallTimeoutMs` | 25,000 | 1,000–120,000 ms |
| `toolTimeoutMs` | 8,000 | 1,000–30,000 ms |
| `investigationTimeoutMs` | 120,000 | 10,000–900,000 ms |
| `maxSteps` | 8 | 2–12 |
| `maxToolCalls` | 16 | 1–24 |
| `maxOutputTokens` | 2,000 | 256–8,000 per turn |
| `maxContextChars` | 200,000 | 8,000–200,000 history characters |
| `toolProfile` | `full` | `full` or `compact` |

The overall abort bounds every operation even if a configured per-call timeout is longer. Existing module reads retain their separate four-second gateway limit. Admission, session/CSRF/Origin/Host checks, signed agent attribution and per-account rate limits are unchanged. No background model work is allowed unlimited steps or time. Provider-native input tokens, generated tokens and durations are captured by the local verifier; production activity records history characters, schema size, tool/result byte sizes and elapsed milliseconds. Character counts are not token counts.

Full original tool responses remain in owner-scoped investigation activity. The browser explicitly labels failed/interrupted runs as partial with no final recommendation, shows operation timing, and retains source evidence and any successful calculations for inspection. A single JSON code fence may be removed before strict narrative validation; malformed JSON, extra fields/commands and invalid schemas are rejected. There is no canned or repaired substitute analysis.

## Verification and recovery

Run deployment-changing suites sequentially:

```powershell
npm run build
npm test
node scripts/verify-compact-mcp.mjs
node scripts/verify-compact-analyst.mjs
node scripts/verify-ollama-provider.mjs
node scripts/verify-local-analyst-browser.mjs
npm run verify:phase5
npm run verify:phase4
node scripts/verify-legacy-regressions.mjs
node scripts/verify-isolation.mjs
node scripts/verify-outage-independence.mjs
node scripts/verify-module-restart.mjs
node scripts/verify-module-provision.mjs
node scripts/verify-module-secrets.mjs
npm run smoke
npm run smoke:mcp
node scripts/browser-smoke.mjs
node scripts/verify-analyst-unconfigured.mjs
```

The legacy suite uses a fresh Compose project and separate volumes, temporarily removes/restores the main containers/networks, and retains all original volumes. Its fixture run also writes the generic `artifacts/phase5-results.json`; preserve the main deployment's report separately when collecting both histories. Actual reports distinguish live Ollama from TEST MODEL results. Test fixtures temporarily mount private model configuration and restore it without weakening real authentication or rate limits.

Normal shutdown/restart remains `npm run dev:down` and `node scripts/compose.mjs up -d --wait --wait-timeout 180`. No reset is needed. On process restart, running investigations remain explicitly interrupted; after a model failure or source revision change, start a new investigation. Recommendations and published findings never execute a business decision.
