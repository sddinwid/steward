# API Explorer — bounded increment verification

Verified locally on 2026-11-10 America/Los_Angeles (2026-11-11 UTC). Baseline HEAD: `9ee47c6`, branch `codex/phase16-business-automation`; implementation remains uncommitted. Existing Inventory, SDK, platform and UI edits were present before this task and were preserved. No release, push, module installation or operator deployment was performed.

## Actual results

| Command / check | Result |
| --- | --- |
| `npm run test:explorer` | Module SDK and Explorer TypeScript builds passed; 36 Explorer tests passed, zero failed/skipped |
| `npm test -w @steward/module-sdk` | 65 passed, zero failed/skipped |
| `node scripts/verify-explorer.mjs` | Eight acceptance checks passed |
| Generated adapter compile and tests within acceptance | TypeScript passed; two synthetic tests passed in isolated container |
| Playwright browser within acceptance | Local report rendered; zero script elements; no non-file requests; screenshot inspected |
| `node scripts/verify-single-stack.mjs` | Passed: selected `steward-phase8-upgrade-reg`, 63 running containers, no unexpected running containers |
| `npm audit --json` | One moderate existing `@hono/node-server` advisory; no high/critical advisories |

The eight acceptance checks cover CLI import with real local reference resolution, exact-digest approval, four actual fixture HTTP GETs (two item pages and two documents), redacted evidence, quarantined generation, isolated draft compilation/testing, browser report rendering, and execution rejection after revocation. `APPROVAL_REVOKED_OR_CHANGED` in the acceptance log is the expected negative check.

The disposable container uses `node:24.13.0-alpine`, `--network none`, a read-only root, UID 1000, no capabilities, no-new-privileges, 64 PID/256 MiB/one CPU limits, a 32 MiB temporary work directory and read-only mounts of the reviewed draft and local TypeScript compiler. No package scripts, package installation, production credentials or Docker socket are passed into it. `--rm` removes the container on exit.

Security tests exercise private/reserved destinations, mixed DNS answers and pinned lookup, unsafe paths, redirect handling, credential scoping, non-read and unreviewed operations, pagination scope, plan mutation/revocation, limits across retries/resume, timeouts, interrupted requests, concurrent execution, hostile documents, YAML/prototype hazards, local reference traversal/cycles/symlinks, actual gzip decoder limits, redaction and generated-code injection.

## Evidence and corrections

Private evidence is retained under `.steward`: `explorer-tests-final.log`, `explorer-sdk-regression.log`, `explorer-acceptance-final.log`, `explorer-audit.json`, and `explorer-acceptance/{verification.json,isolated-adapter-tests.log,report.png}`. Fixture workspaces are retained with approval revoked. A sanitized report and complete synthetic policy are checked in at `scripts/fixtures/explorer/report.example.html` and `policy.example.json`.

An initial URL test exposed normalization of encoded traversal before validation; raw-path checks now precede URL parsing and the regression passes. Early TypeScript errors involving intentionally incomplete manifest metadata and optional transport status types were corrected. Initial acceptance compiled the generated draft and passed its tests but incorrectly expected TAP from Node's default reporter; the fixed command explicitly requests TAP. Its failed evidence remains at `explorer-acceptance/verification-failed-reporter.json` and `explorer-acceptance.log`. Final acceptance was rerun successfully after report changes.

The initial new YAML dependency selection was replaced with 2.9.1 after an audit advisory. Existing dependencies were not upgraded. Final audit still reports moderate `GHSA-rmxm-3fg6-px4f` for existing `@hono/node-server` (double decoding in serveStatic); assess/update that unrelated dependency separately. Explorer does not use it to serve reports.

## Explicit limitations

No external target or live credential was authorized; no live provider retrieval, public TLS compatibility or real-provider adapter is claimed. Public-network defenses have controlled unit coverage, while end-to-end retrieval uses an isolated test transport unavailable from CLI configuration. No complete platform regression or production deployment acceptance was run: this task adds a development package and leaves production integrations unchanged.

Generated manifests are deliberately rejected by the real Module SDK validator. Drafts require authentication, mapping, persistence, runtime and SSMA review before any future packaging. The reader wrapper has no default provider transport. Remote schema graphs are not fully resolved; separately retrieved references remain evidence requiring interpretation. General research reuse currently comprises retrieval policy, document-link discovery, provenance and bounded job infrastructure, not autonomous semantic research. See [usage and boundaries](api-explorer.md).
