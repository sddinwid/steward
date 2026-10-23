# MVP presenter guide

Use a **dedicated** combined Master + three Worker release deployment. All commands below run from the repository or copied release `toolkit` root; replace `.steward/phase6-demo` with the actual deployment directory. An existing operator installation cannot be appropriated by `setup`: fresh bootstrap rejects existing accounts. Presenter credentials are cryptographically random, private to the operator and stored at `DEPLOYMENT/demo/presenter.json`; never project that file, log it, paste it into chat, or commit it. Use the registry account only on Master and each local administrator only on its own Worker.

## Prepare and demonstrate

```powershell
node scripts/demo.mjs .steward/phase6-demo preflight
node scripts/demo.mjs .steward/phase6-demo setup
node scripts/demo.mjs .steward/phase6-demo module
node scripts/demo.mjs .steward/phase6-demo seed
node scripts/demo.mjs .steward/phase6-demo check
```

Preflight checks Node/OpenSSL/Docker, all API health/readiness and frontends; it diagnoses missing Ollama/model separately so the non-AI demo can proceed. `setup` creates real presenter accounts using the administrator CLI, registers the synthetic manufacturer, grants explicit entity scope and performs trusted device enrollment/approval. Retrying setup recovers partial account creation without replacing credentials. `module` exercises real Chromium installation of signed Inventory 1.2.1 into running Worker 1, creates a persistent record and verifies identical core hashes before/after. Its first run requires Inventory absent on all three Workers and confirms the API returns 404. Workers 2 and 3 remain without Inventory. Repeating the segment reviews the retained first-installation evidence; it does not pretend a later installation is a first run.

`seed` registers the distributor and asset-holding companies, enrolls Workers 2/3 with entity-scoped authorization, installs/activates Operations independently on all three, creates the controlled scenario through authenticated module APIs, and waits for Master analytical copies. The first seed requires empty Operations and no preexisting synthetic Inventory SKU so the reset ledger cannot adopt unrelated records. Later seeds preserve edits and record IDs. The scenario's supplier has 1,200 m³ unused warehouse capacity, the distributor needs 500 m³ and spends EUR 10,000/month externally. Matching location text is screening evidence, not operational approval. All names, quantities and relationship definitions come from `datasets/phase4.json`, not core application logic.

Open these independent HTTPS frontends:

- Master: `https://master.localhost:6100`
- Worker 1: `https://worker-1.localhost:6201`
- Worker 2: `https://worker-2.localhost:6202`
- Worker 3: `https://worker-3.localhost:6203`

Trust the generated development CA only in the controlled local environment. Automated Node clients verify CA and host identity. The Chromium acceptance harness explicitly allows the generated local development certificate; production browsers require properly issued trusted certificates.

Presenter checklist:

1. Show Master legal entities and explicit enrollment eligibility/authorization; show all three independent enrolled Worker identities.
2. On a **fresh** project, show Worker 1 has no Inventory navigation, then install and activate its trusted package in Module Manager. The automated `module` command performs and captures this same UI flow. Show the new record and Worker 2/3 absence, with unchanged Worker core image digests.
3. Show Operations screens for capacity, storage requirements and assets; show Master copies with source Worker, entity, revision and freshness. The authoritative records remain Worker-local.
4. Run the outage segment and show Worker operations remain available while the entire Master stack is stopped. Reconnection catches up durably.
5. Run the real model investigation; show actual tool selections, source references, deterministic results, explicit assumptions and narrative. A model response is a conditional recommendation requiring review.
6. Show only affected Workers receive the published finding, acknowledge it as an operator, and show Master receipts.

```powershell
node scripts/demo.mjs .steward/phase6-demo outage
node scripts/demo.mjs .steward/phase6-demo reset
node scripts/demo.mjs .steward/phase6-demo ai
node scripts/demo.mjs .steward/phase6-demo acknowledge
```

The outage command changes only the owned synthetic manufacturer's operating cost, restarts its API while Master is offline, confirms all Worker readiness endpoints and then verifies the exact revision at Master. It restores Master services in `finally`. `reset` restores **only ledger-owned scenario fields**, using current revisions; repeated reset is a no-op after catch-up. It never deletes other records, credentials, trust, identities, module configuration, findings, event/audit history or enrollment. Historical investigations/findings intentionally remain and are labeled by their UUID/time. Reset is not a database wipe or a mechanism to replay initial module absence. For that first-installation demonstration, provision a new project/directory and stop the old project without deleting its volumes.

## Real AI operation and recovery

AI uses installed `qwen2.5:7b`, creates/reuses a separate 16,384-context alias referencing the original weights and never overwrites/downloads the base model. Optional environment settings: `STEWARD_OLLAMA_MODEL`, `STEWARD_OLLAMA_CONTEXT` (4096–32768), `STEWARD_OLLAMA_TIMEOUT_MS` (1000–120000). The verified defaults are 16,384 and 90,000 ms per model call, 600,000 ms overall, 8,000 ms/tool, 12 steps and 16 calls. Compact MCP results retain complete source evidence internally. Arithmetic is executed by the deterministic service. The model has no write tools; the runner explicitly publishes the result using the registry administrator, then `acknowledge` uses each affected Worker's local administrator.

The runner temporarily hosts the existing fixed-target authenticated TLS bridge on loopback port 19443; Docker Desktop must support `host.docker.internal` access. A random temporary bearer is written to the private mounted secret file. Original provider configuration/key bytes are restored and the alias unloaded on normal completion or handled failure. Inspect actual timings/tool arguments/evidence in `DEPLOYMENT/demo/live-ai.json` (business data, not credentials) and Master investigation history. The original unconfigured/deferred provider mode returns after the run, while investigation and finding evidence stays visible. The runner does not leave a general-purpose model service behind.

If the model is absent, start Ollama and install the selected model separately. If port 19443 is occupied, stop the prior presenter session or conflicting service. Missing/slow/malformed provider responses and exhausted tool/context budgets produce explicit partial/failed investigations; do not present them as successful recommendations. Keep the failed UUID and retry only after resolving the cause. A successful run still requires narrative review against the displayed calculations and assumptions. Cloud credentials are not required and cloud operation is not validated.

If the presenter process is forcibly killed, verify the process has exited, then:

```powershell
node scripts/recover-local-provider.mjs .steward/phase6-demo
node scripts/release.mjs start --directory .steward/phase6-demo
```

Provider recovery refuses to overwrite configuration while the recorded PID is alive. Its private recovery record contains the original configuration/secret and must be protected like credentials. After a hard kill of the top-level demo runner, inspect active Node processes before removing only `DEPLOYMENT/demo/.lock` (an empty directory). Do not remove a lock belonging to an active process. Authentication/admission throttles are real: after repeated testing, allow the one-minute window to expire rather than disabling limits.

For a partial first seed without a completed ownership ledger, preserve the deployment for diagnosis; the runner refuses to adopt unknown rows into a reset ledger. Correct the interrupted seed explicitly after reviewing its private scenario state, or create a separate fresh demo project. It does not guess which records may be safe to erase. For module migration failure, inspect Module Manager and retry with an explicitly corrected signed version/recovery action; disabling retains data. See existing Phase 3/4/5B guides for detailed runtime failure recovery.
