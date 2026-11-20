# API Explorer and Adapter Draft Generator

This development-only increment imports specifications, executes an explicitly reviewed read plan, retains redacted evidence and generates an unsigned adapter scaffold. It does not install a module, register MCP tools, alter the operator deployment or certify an API. No model is required.

## Commands

Run from the repository root using Node 24 and the existing workspace dependencies:

```powershell
npm ci
npm run build:explorer
npm run explorer -- help
npm run explorer -- import scripts/fixtures/explorer spec.json openapi
```

Import returns a workspace UUID. Substitute that UUID for `<id>` below. Import supports `openapi`, `html` and `markdown`; it does not contact a server. Local references must stay inside the supplied source root after resolving symlinks.

Create a private policy JSON file using the schema in `packages/explorer-kit/src/contracts.ts`. The fixture policy produced by `npm run verify:explorer` at `.steward/explorer-acceptance/fixture-policy.json` is a complete sanitized example, **not a live target**. Its origin is deliberately synthetic. For a real target, independently review the documentation and each endpoint before replacing that example. GET alone does not establish that an endpoint is non-mutating. Document the read-only basis in each request rule. Do not approve logout, trigger, export-job or other side-effecting endpoints disguised as reads.

```powershell
npm run explorer -- prepare <id> <private-policy.json>
npm run explorer -- plan <id>
# Review the exact origins, paths, parameters, read-only basis and budgets first.
npm run explorer -- approve <id> <exact-digest-from-prepare>
npm run explorer -- run <id>
npm run explorer -- inspect <id>
npm run explorer -- generate <id> example.provider
npm run explorer -- revoke <id>
```

`inspect` prints the path of an escaped local HTML report. `generate` returns a private draft directory, with proposed API/UI/MCP metadata, configuration schema, unresolved mappings, a constrained reader wrapper and synthetic tests. Generation never runs those tests. Proposed UI lists and MCP reads are intended to read future module-owned retained observations, not implicitly refresh a provider.

## Safety and scope

Plans are immutable once a job exists and approvals bind their exact digest. A changed or revoked approval prevents further requests. Public HTTPS destinations only: private/reserved addresses, mixed public/private DNS answers, unsafe paths and credentials in URLs are rejected. Checked addresses are pinned to the TLS connection. Redirects are recorded but never followed. Documentation crawling requires a reviewed same-origin path prefix; credentialed documentation is not crawled. Pagination requires an explicit parameter and finite approved values. Remote references are never fetched implicitly; separately approved specification seeds may be retrieved, but arbitrary remote schema graphs are not merged or claimed resolved.

Default ceilings: 25 requests, five pages per operation, depth two, one concurrent request, one-second minimum spacing, ten-second request timeout, five-minute job lifetime, 1 MiB per response and 10 MiB total. Both compressed and decoded sizes are bounded. Policies can tighten ceilings. Rate limiting pauses the job. Requests and maximum response bytes are reserved before dispatch; uncertain failures retain their reservation. Resume uses the same counters, deadline and queue. Interrupted in-flight requests are recorded and are not blindly replayed.

Credentials are optional private bearer-token references: `{ "kind": "env", "reference": "EXPLORER_PROVIDER_TOKEN", "origin": "https://approved.example" }`, or `kind: file` with an explicit private token-file path. Never put token values in policy files, URLs or chat. No provider-specific OAuth flow or automatic token renewal is implemented. Secrets are only loaded for their exact approved origin and are not copied to reports or drafts. Existing Steward provider secrets are not automatically discovered or reused.

Response scalar values are discarded. Evidence retains timestamps, hashes, shapes, bounded status/rate-limit information and explicit qualifications. Source metadata and field names may still be sensitive: workspaces use private OS permissions and remain under ignored `.steward/explorer`. Reports omit query values, credential references and raw bodies. Retention is 1–30 days; expired workspaces cannot continue retrieval. Expiry does not silently delete evidence. Remove an individual workspace explicitly:

```powershell
npm run explorer -- remove <id> <same-id>
```

If a process crashed, `recover-lock <id>` removes only a lock whose recorded PID no longer exists. It does not reset budgets or approval. Preserve failed evidence; start a separately reviewed workspace for materially changed scope. Local filesystem access is the operator trust boundary; this is not a multi-user authorization server.

## Validation and extension boundaries

```powershell
npm run test:explorer
npm run verify:explorer
```

Acceptance requires Docker, the `node:24.13.0-alpine` image and Playwright Chromium. It uses controlled HTTP fixtures through a test-only injected transport; production CLI exposes no localhost or transport bypass. The generated fixed-template draft is compiled and tested in a non-root, network-disabled, read-only, resource-limited disposable container with no Docker socket or production credentials. Browser checks open the local report. Evidence appears under `.steward/explorer-acceptance`; the fixture approval is revoked afterward. The selected platform stack is not redeployed.

Reusable for future research: source/evidence contracts, bounded public retrieval, approval digests, queues, resumable budgets, redaction, document-link discovery and reports. API-specific: OpenAPI operation extraction and adapter templates. Deferred: browser execution, broad web search, prose interpretation, model planning, GraphQL introspection, authenticated crawling, complete schema/code generation, production transports, module persistence, signing and installation. HTML/Markdown are treated as untrusted source material, never instructions. Unsupported specification features remain diagnostics rather than invented implementations.

See [ADR 0049](adr/0049-bounded-api-exploration.md) and [verification](api-explorer-verification.md). A generated draft is neither a verified provider adapter nor a production-ready module.
