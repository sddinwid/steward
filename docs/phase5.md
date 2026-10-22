# Phase 5 operations, trust and verification

Phase 4 baseline commit: `a7d6cc1`. Phase 5 adds genuine Streamable HTTP MCP, a bounded Master Analyst, explicit finding publication and signed module MCP contributions. It preserves existing enrollment, identities, database volumes, module data, independent Workers and synchronization.

## Installation and startup

From the repository root, using Node 24, npm, Docker Desktop Linux containers and the documented Phase 2 OpenSSL prerequisite:

```powershell
npm ci
npm run build
npm run build:inventory
npm run build:operations
npm run provision
npm run security:provision
npm run modules:provision
npm run data:provision
npm run analyst:provision
npm run dev:up
```

For an existing Phase 4 deployment only the last two commands are required after building. Provisioning creates `.steward/dev/analyst/compose.yaml` and private configuration once, validates installation identities and preserves every byte on repeat. Existing overlays are retained and layered in original order. A worker-only deployment needs its existing enrollment trust installation; MCP itself has no Master dependency.

The default three Workers use the identical `steward-worker-api:0.5.0` image. Module hosts also need the new SDK validator for signed MCP contributions. Inventory **1.2.1** is a separate package/image with the existing immutable migrations and declarative `get_inventory_summary` contribution; legacy installed packages remain usable without that new contribution.

Publish a new version once, then install/activate through Worker administration:

```powershell
node scripts/publish-module.mjs modules/inventory
node scripts/publish-module.mjs modules/operations
```

Published versions are immutable. Do not rebuild and replace a published image; publish a new version when its contents change. In an existing catalog, reuse its existing signed package. Use the Phase 4 seed procedure for first-time entity registration/enrollment/Operations installation and the controlled dataset (`npm run seed:phase4`). It uses real administrator flows; no enrollment is bypassed.

Endpoints: Master `https://master.localhost:6100`; Workers `https://worker-1.localhost:6201`, `https://worker-2.localhost:6202`, `https://worker-3.localhost:6203`. Local health/readiness remain on API ports 4100 and 4201–4203. HTTPS `/api/v5/mcp` is present on each independent application; no v5 administrative endpoint is exposed on plain HTTP.

## Model configuration and secrets

By default no model is configured. The workspace reports this clearly, and attempts create a failed persistent investigation with `MODEL_NOT_CONFIGURED`, never a substitute analysis.

Edit the ignored, private `.steward/dev/analyst/config/model.json` and put the operator's API key in `api-key.txt` in the same directory. These are mounted read-only only into Master. On Windows, the provisioner restricts directory ACLs to the current user; on Unix use the provisioned private-directory permissions. Production should supply an equivalent read-only secret-manager mount. Never put credentials in Compose environment text, frontend configuration, prompts, Git or request logs.

Example real OpenAI adapter configuration (select a model available to your account):

```json
{
  "provider": "openai-responses",
  "model": "YOUR_OPERATOR_SELECTED_MODEL",
  "endpoint": "https://api.openai.com/v1/responses",
  "apiKeyFile": "/etc/steward/analyst/api-key.txt",
  "testModel": false,
  "maxSteps": 8,
  "maxToolCalls": 16,
  "maxOutputTokens": 2000,
  "investigationTimeoutMs": 120000
}
```

`responses-compatible` supports a reviewed operator-controlled HTTPS endpoint implementing the same tool-calling wire format. Optional `caFile` and `servername` support private PKI. Endpoints cannot be set by users or tools, redirects are not followed, TLS verification stays enabled, and API errors never include provider bodies or secrets. No provider SDK or multi-agent framework is needed. Config is read on investigation start; restart is unnecessary. Follow-up questions can refer to an owned completed investigation, with source access rechecked and new calculations required.

The adapter follows the official [Responses function-calling flow](https://developers.openai.com/api/docs/guides/function-calling). Provider integration is distinct from model quality and requires a live credentialed run. The automated HTTPS protocol fixture is explicitly labeled TEST MODEL, runs only when launched by verification, and is never shipped as a production fallback.

## MCP authentication and disclosure

The official [v2 Fastify/Node serving bridge](https://ts.sdk.modelcontextprotocol.io/v2/serving/fastify.html) preserves the existing TLS listener. A new `McpServer` is created per request. MCP POST requests require a valid enabled local account/session cookie, exact configured HTTPS Origin, matching CSRF header, approved Host and `x-steward-client: steward-mcp-cli-v1` (or the internal `steward-analyst-v1` with a session-bound, expiring, replay-protected signed process proof). The client label attributes the AI actor, not additional privilege. Non-browser clients obtain sessions through the established HTTPS login and keep credentials in their transport, outside all model messages.

Master registry administrators have the existing registry-wide analytical scope; enrollment administrators see only explicitly authorized entities; viewers are denied. Relationships require both entity scopes. Cross-entity calculations recheck each source through existing analytical services. Local Worker administrators have local service access; module users discover only granted read operations. Enrollment alone grants no MCP analysis rights, and Master cannot borrow a Worker enrollment key for live analytical access.

Current analysis uses Master’s non-authoritative synchronized projections. Tool results retain source Worker installation IDs, revisions, event IDs and timestamps. It does not implement live Master-to-Worker delegated analytics. Every existing service invocation rechecks session, scope and module permissions. Authenticated requests, successes and authorization failures are audited with requesting account, constrained agent identity, tool and target scope; secrets are never included. Signed MCP declarations only map to an existing parameterless GET operation. No arbitrary network targets, executable contributions or assets are loaded.

Budgets: at most two investigations and four MCP requests concurrently per process; five investigation starts and 120 MCP requests per account per minute; at most 12 model steps, 24 tool calls, 8 calls per model turn, 8,000 output tokens per turn, 200 KB input history and 1 MB transport responses. Default MCP deadline is eight seconds; module gateway reads have a four-second absolute deadline, independent of ordinary synchronization. Model calls have 25-second deadlines within the investigation budget (maximum 180 seconds). Repeated identical calls terminate a run. These are local-process limits, not a distributed global quota; deploy one Master process until global admission control is introduced.

Business text is untrusted data. Tools are read-only. Model output must match a bounded narrative schema, and completion requires a successful deterministic calculation with server-derived references. Findings are created only after an authorized human clicks Publish, through the existing idempotent service, retaining source revisions and the durable delivery/acknowledgment path. Publication never executes a business decision. Human reviewers must compare AI narrative against deterministic evidence; prompt instructions alone are not a guarantee of factual accuracy.

## Economics and assumptions

Capacity, required capacity, currency and external bill come from two authorized source records. Explicit assumptions are: location suitability, avoidable external-bill fraction, proposed internal payment, actual incremental operating cost, one-time transition expense and horizon. Total warehouse operating expense remains an observation, not an inferred incremental cost. Sharing uses the lesser of supply and demand; external avoidance scales by that volume fraction and the stated avoidable fraction. Contract nonlinearity, transport, tax, compliance, service levels and investment approval require human validation.

Consumer monthly benefit = external expense avoided − internal payment. Provider monthly benefit = internal payment − incremental operating cost. Ecosystem benefit = external expense avoided − incremental operating cost. The internal payment cancels. Horizon benefit subtracts transition expense once, allocated explicitly to the consumer. The result includes a zero-change baseline, sensitivities, unmet capacity and break-even. No Python runtime is introduced for this calculation.

## Verification and recovery commands

```powershell
npm run build
npm test
npm run smoke
npm run smoke:mcp
node scripts/browser-smoke.mjs
node scripts/verify-module-provision.mjs
node scripts/verify-module-secrets.mjs
node scripts/verify-phase5.mjs
node scripts/verify-analyst-browser.mjs
node scripts/verify-analyst-concurrency.mjs
node scripts/verify-model-provider.mjs
node scripts/verify-phase4.mjs
node scripts/verify-isolation.mjs
node scripts/verify-outage-independence.mjs
node scripts/verify-module-restart.mjs
node scripts/verify-legacy-regressions.mjs
node scripts/record-phase5-evidence.mjs
```

The historical Phase 2/3 suites require rejected/unenrolled and module-free Workers. The last command temporarily removes the seeded application containers and networks while retaining all volumes, uses a **new Compose project and separate persistent volumes for each run**, runs the original suites with the retained Inventory 1.0.0 package, and restores the original deployment in `finally`. It does not reset existing enrollment or business data. It requires the historical package descriptor/image retained from Phase 3. Its test volumes are retained for inspection. Run only while ordinary development testing is idle.

Phase 5 verification requires the real Phase 4 seed and private local verification accounts. It temporarily configures an explicitly labeled HTTPS Responses fixture in Master, tests real MCP and business data, and restores the exact operator model configuration/key in `finally`. The fixture is not a live-model result. Tests may wait for production rate-limit windows rather than weakening authentication. Evidence is in `artifacts/phase5-results.json` and `artifacts/phase5-analyst.png`; the tracked verification report states actual results and any limitations.

Process restart marks in-flight investigations interrupted. Completed records and activity persist in PostgreSQL. Failed tools/provider calls leave a failed run and partial history; start a new question or follow up on a completed run. There are no automatic financial decisions, destructive rollbacks or autonomous finding writes. If source revisions have changed, finding publication rejects stale references; rerun the investigation. Disabling a module preserves its data and removes its MCP contribution immediately.

Shutdown: `npm run dev:down`. Restart with existing state: `node scripts/compose.mjs up -d --wait --wait-timeout 180`. Reset remains the explicitly destructive, deployment-specific procedure in the README; back up identities, all core/module volumes, secrets and seed ledger before using it. No Phase 5 step requires a reset.
