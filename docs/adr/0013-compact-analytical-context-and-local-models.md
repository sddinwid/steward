# ADR 0013: Compact analytical context and native local-model output

Status: accepted for Phase 5B.

## Context

The installed Qwen 2.5 7B model selected genuine MCP tools but exceeded the original fixed 25-second deadline after receiving full entity summaries. MCP responses duplicated business JSON in `content` and `structuredContent`. Repeated verification data also made broad summaries an inefficient way to identify a storage-sharing candidate. Increasing Ollama context alone did not complete the investigation.

## Decision

Preserve every existing MCP tool/schema and service permission boundary. Add version-1 paginated resource and relationship queries and a deterministic candidate-screening query. Candidate screening uses actual authorized records with positive supply/demand/external expense, separate entities, the same contributing module, and matching currency/site text. Site text equality is evidence only, not operational approval. Candidate queries are bounded and can explicitly require narrower scope.

Add a calculation entry point accepting record IDs and exact revisions plus explicit assumptions. It resolves only authorized sources and invokes the same existing analytical service as the original reference-based tool. No calculation is delegated to the language model. The original tool's strict reference contract remains unchanged.

Persist full MCP results and observed source payloads in the existing investigation activity/result records. Send one structured representation to the model, with smaller entity and calculation views when the operator selects the compact profile. Final evidence, revisions, source Workers and original data remain available for inspection and finding publication. Character budgets bound model history; actual provider token counts and elapsed times are recorded separately during validation.

The optional compact profile advertises four tools selected from authenticated MCP discovery: entity discovery, candidate screening, relationship query and deterministic calculation. The model selects the calls and arguments. After a successful calculation and its declared sensitivities, the orchestrator withholds further tools and requests a structured final narrative. This bounded finalization prevents repeated variants of an already successful calculation. Full mode retains the existing broader tool set and behavior.

Separate model-call, tool, overall investigation, step, tool-count, output-token and context-history limits. Defaults remain compatible with earlier operator configuration. Overall abort takes precedence over a longer per-call limit. Timeouts and partial results remain explicit and persistent.

Add a native Ollama adapter behind the existing model interface. It preserves actual model-selected tool arguments/results, uses native tool-message history, and requests JSON-schema output only for compact finalization. The existing Responses adapter uses the corresponding structured final-output contract in compact mode; its full mode remains compatible. The Responses-compatible test provider validates the shared orchestration independently of Ollama.

The development validation helper creates a separate alias from the installed Qwen weights with an operator-selected context size. Original model manifests are not changed and no weights are downloaded. The helper uses an authenticated, verified-TLS bridge bound to host loopback; its only plaintext hop is fixed host-loopback Ollama. Exact operator configuration/secret bytes are restored and the validation alias runner unloaded after testing.

## Consequences

Existing clients, installations, module discovery, entity isolation and Worker independence remain intact. No database migration, framework, module rebuild or Phase 6 infrastructure is required. Real local-model end-to-end validation can be performed without a cloud account/key. This does not establish live compatibility with an untested cloud account/model.

Compact mode investigates one candidate with baseline and sensitivity alternatives. It is not an exhaustive optimizer or a semantic/geospatial matching engine. Large or changing datasets may require narrower queries/new investigations; offset pages are live and not transaction snapshots. Invalid arguments, stale revisions, budget exhaustion and malformed output are failures, never grounds to invent a recommendation. Human review remains necessary even for schema-valid narratives.
