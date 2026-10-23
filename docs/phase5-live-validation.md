# Phase 5 real local-model validation — incomplete

Executed October 22, 2026 (October 23 UTC). [Actual sanitized evidence](phase5-live-validation-evidence.json) separates live local-model execution from reproducible test-model coverage.

## Discovery and actual results

Ollama **0.40.4** is installed at `C:\Users\sddin\AppData\Local\Programs\Ollama\ollama.exe` and running on host loopback `127.0.0.1:11434`. Installed models were `qwen2.5:7b` and `qwen2.5-coder:7b`, approximately 4.7 GB each; neither was initially loaded. Both advertise tool support. No cloud credential is configured or available; the operator explicitly deferred cloud setup.

A genuine `/v1/responses` request to `qwen2.5:7b` returned HTTP 200 and generated `ready`. The existing Steward `responses-compatible` adapter then sent real requests to this model through the temporary bridge described below. No application adapter, MCP infrastructure, analytical calculation, permission or timeout was changed.

| Attempt | Actual model-selected successful MCP calls | Outcome |
| --- | --- | --- |
| Original `qwen2.5:7b`, active context 4,096 tokens | `list_entities`, `get_entity_summary` for the distributor | Subsequent model turn exceeded the existing 25-second deadline; persisted `TRANSPORT_TIMEOUT` |
| Separate alias `steward-analyst-qwen2.5:7b`, same weights, 16,384-token context, temperature 0 | `list_entities`, `get_entity_summary` for the asset holder, `get_entity_summary` for the distributor | Subsequent model turn exceeded the same deadline; persisted `TRANSPORT_TIMEOUT` |

The second attempt's successful provider calls took approximately 1.4, 3.8 and 13.0 seconds; the failing turn was aborted at 25 seconds. The distributor summary contained 19 real synchronized records and approximately 25 KB of tool-result JSON. Context size and hardware capacity are relevant observations; the underlying cause of the later inference latency was not isolated. Expanding context did not complete the investigation.

Both attempts used model-generated tool arguments, the official Steward MCP client, authenticated live MCP execution, and actual synchronized business records. The evidence records exact investigation IDs, selected tools/arguments, observed source-reference samples, revisions and Worker attribution. The failed investigations and activity also remain in Master PostgreSQL.

**Not validated:** model-driven deterministic calculation, evidence-supported final recommendation, and live-model finding creation/delivery. Neither attempt reached `analyze_resource_sharing`; no final recommendation was generated and no finding was published from these failed investigations. Existing deterministic unit and test-model findings results are separate evidence, not substitutes for these missing live results. Phase 5 is not declared fully complete.

## Security and repeatable commands

Official Ollama documentation describes a [local API without authentication](https://docs.ollama.com/api/authentication) and [stateless Responses compatibility](https://docs.ollama.com/api/openai-compatibility). Steward's existing adapter requires verified HTTPS and a credential file. The validation helper creates a temporary HTTPS bridge listening **only on host loopback port 19443**, using the existing private development TLS certificate and a newly generated random bearer token stored only in the existing ignored private secret mount. Docker Desktop can reach this listener through `host.docker.internal`; TLS verifies the development CA and `master.localhost` certificate identity. No TLS verification is disabled.

The bridge forwards only authenticated POSTs to `/v1/responses`, to the fixed host-loopback Ollama endpoint and selected installed model. It rejects browser Origins, unexpected Hosts, other routes/models, concurrent requests and oversized data. It does not forward the bridge credential to Ollama, rewrite model replies, choose tools, inject business results, or simulate responses. Its HTTP upstream is restricted to the same host's loopback interface. This is a one-host Docker Desktop development validation helper, not a production remote-model deployment.

From the repository root with the existing seeded development deployment running and idle:

```powershell
ollama list
ollama ps
node scripts/verify-ollama-provider.mjs
```

To reproduce the larger-context attempt without downloading or changing the original weights:

```powershell
$modelDefinition = @{ model = 'steward-analyst-qwen2.5:7b'; from = 'qwen2.5:7b'; parameters = @{ num_ctx = 16384; num_predict = 1000; temperature = 0 }; stream = $false } | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:11434/api/create -ContentType application/json -Body $modelDefinition
$env:STEWARD_OLLAMA_MODEL = 'steward-analyst-qwen2.5:7b'
node scripts/verify-ollama-provider.mjs
ollama stop steward-analyst-qwen2.5:7b
Remove-Item Env:STEWARD_OLLAMA_MODEL
```

The helper always restores the exact original model/key files and closes its temporary bridge in `finally`. It exits 1 on failed investigation. A future successful run recomputes every calculation independently, checks source revisions, explicitly publishes a finding as an operator verification action and verifies affected-only Worker delivery; it still requires human review of narrative support before claiming full validation. Those success-path checks have not executed successfully against this local model.

No live cloud API key or other token was committed. Original model files and Steward core images remained unchanged. The separate Ollama alias is retained for reproducibility; its runner was unloaded after testing. Steward remains in the supported unconfigured AI state, and all ordinary services remain available.

## Regression results from this run

- `npm test`: **28 passed**, zero failures.
- `npm run verify:phase5`: all **11** existing checks passed using the explicitly labeled test model, including genuine MCP/data, deterministic calculations, finding delivery/retries, authorization, adversarial business text, provider error, malformed output, undeclared tools, failed tools, repeated-call rejection, actual 25-second timeout, browser investigation and restart persistence.
- `node scripts/verify-analyst-unconfigured.mjs`: restored unconfigured state visible in Chromium; persistent explicit failure, no fabricated result, unchanged config/key bytes, no browser errors, Master and all Workers healthy/ready.
- `node scripts/mcp-smoke.mjs`: official MCP discovery and real tool execution on all four applications passed.

The complete Phase 2/3 and Phase 4 regression reruns immediately preceding this task remain documented in [the Phase 5 verification report](phase5-verification.md); they were not repeated again in this local-model check. No Phase 6 work was introduced.
