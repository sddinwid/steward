# Phase 5B actual verification

**The real local-model acceptance workflow passed.** Installed Qwen 2.5 7B completed an evidence-backed cross-entity investigation through live Steward MCP, invoked the deterministic service, returned a schema-valid numerical narrative, and produced a finding delivered only to the affected Workers. This satisfies the previously outstanding real-model Phase 5 criterion for the tested local provider. Cloud-provider integration remains unverified.

Executed October 22, 2026 (October 23 UTC), on the existing Windows/Docker Desktop Linux-container development environment with Node 24.13.0, npm 10.3.0, Chromium/Playwright 1.58.2 and Ollama 0.40.4. [Sanitized machine evidence](phase5b-verification-evidence.json) contains actual model calls, arguments, token counts, timings, source payloads/revisions, calculations, prior failures, regression results and final runtime identities. [Exact configuration, commands, limits and recovery](phase5b.md); [ADR 0013](adr/0013-compact-analytical-context-and-local-models.md).

## Accepted real-model investigation

Investigation/finding ID: **`81b71576-7bca-42f3-9d61-834a0fd004a6`**. Provider: native `ollama`; `testModel: false`. Base model `qwen2.5:7b`; separate same-weights alias `steward-analyst-qwen2.5-ctx16384:7b`, context 16,384 tokens, temperature 0. The original installed model digest remained unchanged, and no weights were downloaded. The context alias was confirmed through Ollama's actual parameters.

The investigation completed in **55.136 seconds**, excluding its separately measured **9.048-second warmup**. Peak actual input was **3,171 tokens**. Six real model turns occurred:

| Turn | Actual model selection | Provider elapsed |
| --- | --- | --- |
| 1 | `list_entities` | 1,518 ms |
| 2 | `query_resource_matches` | 1,424 ms |
| 3 | `query_business_relationships` | 3,483 ms |
| 4 | `analyze_resource_sharing_by_id` with an invalid sensitivity entry | 9,286 ms; rejected by the tool schema |
| 5 | Corrected `analyze_resource_sharing_by_id` | 15,700 ms; actual deterministic calculation succeeded |
| 6 | JSON-schema final narrative, with further tools withheld | 22,885 ms |

The model selected every listed tool and its arguments. The initial automatic scope/discovery check is recorded separately and is not misrepresented as model selection. The invalid sensitivity argument did not create a result or mutate business data; the model received the actual tool error and corrected it within the existing budgets. The implementation did not construct a model answer or inject record IDs into the initial question.

The same final analytical implementation also completed earlier real investigations; the last run repeated the workflow after an audit compatibility guard was restricted to Master, preserving independently defined Worker module response shapes. Browser verification was then repeated against the final frontend.

## Retrieved evidence and arithmetic review

| Observation | Actual source |
| --- | --- |
| Supply: 700 m³ available, from capacity 1,000 m³ less 300 m³ utilized | Worker 1, `cee.operations/capacities`, record `0d87877a-2b02-4e31-987b-4234b49a1cd9`, revision **3** |
| Demand: 500 m³; EUR 10,000 external monthly expense | Worker 2, `cee.operations/storage_requirements`, record `17a2ba6a-1d6f-4f70-86da-6355119f6702`, revision **3** |
| Same site text and EUR currency; distinct legal entities | Actual source records; site text is not geographic/operational approval |
| Existing `supply_partner` relationship | Actual authorized relationship between the selected manufacturing and distribution entities |

Supply source Worker identity: `0ddfbf69-d878-42c2-b997-5984ac17efc9`; demand source Worker identity: `1315e3ba-eef3-4bdd-a0a7-6196c42858a5`. Original observation and ingestion timestamps, exact entity identities and complete payloads are retained in the evidence. They are synchronized non-authoritative projections, not a claim that the records were freshly measured during this investigation.

Explicit illustrative assumptions: EUR 3,000 internal monthly payment, EUR 1,000 incremental monthly cost, EUR 6,000 one-time transition, 12 months, full proportional external-cost avoidance, and conditional location compatibility. Observed total supplier operating cost (EUR 2,000) was **not** substituted for incremental cost.

The analytical service returned 500 m³ shared, consumer benefit **EUR 7,000/month**, provider benefit **EUR 2,000/month**, ecosystem benefit **EUR 9,000/month**, and **EUR 102,000 over 12 months** after transition. Internal payments cancel: 7,000 + 2,000 = 9,000; 9,000 × 12 − 6,000 = 102,000.

The requested sensitivity used EUR 2,000 incremental monthly cost and EUR 12,000 transition: consumer EUR 7,000/month, provider EUR 1,000/month, ecosystem EUR 8,000/month and **EUR 84,000 over 12 months**. The keep-external-storage baseline has zero **incremental comparative benefit**, not zero utility from warehousing. These equations were checked independently of the production calculation function in the evidence recorder, in addition to engine unit tests and source-revision checks.

The actual narrative quotes these figures and the selected legal entity names, compares the baseline and sensitivity, and preserves conditional location/cost assumptions and necessary human decisions. Its free-form assumptions array still repeats some observed facts and it uses the generic word “units.” The UI therefore separately renders authoritative source quantities in **m³** and the validated calculation assumptions, retaining model wording under an explicitly non-authoritative review section. No model text is silently rewritten into a purportedly verified answer. This is an evidence-supported conditional recommendation, not business approval or execution.

## Finding delivery and persistence

After successful source checks and recomputation, an explicit authenticated operator verification action called the existing finding-publication service. The model had no write/publication tool. The finding retained exact source references and the durable synchronization path delivered it to **Worker 1 and Worker 2**. **Worker 3 did not receive it.** Actual persisted rows were checked again when collecting the final evidence.

Investigations, original tool responses, source payloads, numerical results and model activity are stored in the existing owner-scoped PostgreSQL tables. Original full MCP tools remain operational. The main deployment was removed/recreated during regression testing without volume deletion; completed real investigations and their findings remained available. Schema version remains **6**; no new database migration was required.

Chromium verified the real-provider label without a TEST MODEL label, exact persisted narrative, deterministic figures, source Worker attribution, published finding identity, separate observed data/calculation assumptions/model wording, and explicit partial-failure display. No JavaScript errors occurred. Screenshots: `artifacts/phase5b-live-analyst.png` and `artifacts/phase5b-partial-analyst.png`.

## Actual builds and regressions

| Executed check | Actual result |
| --- | --- |
| `npm run build`; API/frontend Docker builds | All ten workspaces and application images passed |
| `npm test` | **34 passed, 0 failed, 0 skipped**: SDK 6, platform/security/analytics 18, installer 6, Inventory 2, Operations 2 |
| `verify-compact-mcp.mjs` | Real paginated queries, selected fields, exact provenance, full legacy evidence, unknown/unauthorized entities, stale revisions, invalid fields and unauthorized account checks passed |
| `verify-compact-analyst.mjs` | Provider-independent compact workflow with actual MCP/data passed using TEST MODEL; complete evidence retained while the model view shrank |
| Compact budget tests | `TOOL_BUDGET_EXCEEDED`, `STEP_BUDGET_EXCEEDED`, `CONTEXT_BUDGET_EXCEEDED`, actual 1-second model deadline and separate 10-second overall deadline all persisted explicitly with partial activity |
| `verify-phase5.mjs` | All **11** existing checks passed: actual MCP, allow/deny, tool/math/evidence/finding workflow, adversarial source text, malformed/undeclared/repeated calls, tool/provider failures, timeout, browser and restart persistence |
| `verify-phase4.mjs` | All **13** business/synchronization regressions passed, including PostgreSQL transaction termination, in-flight transport crash recovery, replay/revision controls and finding delivery/acknowledgment |
| `verify-legacy-regressions.mjs` | Complete original Phase 2/3 API and Chromium suites passed on a separate project/volumes; main deployment restored |
| Fresh legacy-run Phase 5 scenario | Inventory absent before browser installation; its actual MCP capability became available afterward; Worker core image/process unchanged |
| `verify-isolation.mjs` | Provisioning, Master outage, single-Worker database outage, recovery, connection termination and installation mismatch checks passed |
| `verify-outage-independence.mjs` | **540** checks passed with all Master services stopped, including a disconnected Worker restart |
| `verify-module-restart.mjs` | Full container/network teardown/recreation retained enrollment, configuration, module state, images and every inventory record |
| `verify-analyst-concurrency.mjs` | Two investigations admitted, third rejected; ordinary Worker write/synchronization/health continued during stalled models; bounded failures persisted |
| Seed, provisioning and secret checks | Idempotent seed preserved edits; repeat provisioning retained configuration/secret bytes and databases; actual credentials absent from bundles, item APIs and logs |
| Final HTTP/MCP/Chromium smoke and Analyst browser checks | All four applications passed; Master exposes nine MCP tools, Workers five each with Inventory active; real-model and TEST MODEL results remain distinct |

Deployment-changing checks ran sequentially. Historical suites used fresh identities/volumes without resetting the original deployment. Their generic Phase 5 artifact was saved separately so fresh-installation and preserved-main evidence remain distinguishable. No authentication/rate limit was weakened for testing.

## Failures, restoration and limits

Actual earlier failures are retained: oversized summaries at the original 25-second deadline; repeated calculation variants followed by invalid output; a source-search attempt that exhausted its step budget; malformed Responses-compatible final JSON; and a verification-helper error selecting an earlier rejected call's arguments instead of the successful call. These were not counted as live successes. The final helper uses the successful call, and the final narrative was reviewed against the actual observations/calculations.

Full original evidence stays internal while model context excludes duplicate JSON and irrelevant metadata. Candidate queries, narrower tool discovery, separate deadlines, bounded finalization and native schema enforcement resolved the demonstrated workflow. No canned model response, simulated MCP communication, guessed source record or model arithmetic was accepted as evidence.

The exact original model/key files are restored to the unconfigured state. The temporary loopback TLS bridge is closed; original model digest is unchanged; **no Ollama runner remains loaded**. Fifteen core/provider services are healthy and six Operations/Inventory containers are running. All Workers retain separate databases and use identical API/frontend images. No API key/token/private key was committed. The separate alias definition remains available without duplicate weights.

Validation covers this controlled local Qwen scenario on one Windows/Docker Desktop host. It does not establish general model reliability, exhaustive optimization, semantic/geospatial matching, cloud account/model compatibility, very-large-dataset query pushdown, production remote Ollama hosting, global quotas or production PKI rotation. Human confirmation of source freshness, location, avoidable expenses, incremental cost, tax/contracts/service levels and approval remains necessary. The temporary verifier is not a persistent production hosting service. **No Phase 6 functionality was introduced.**
