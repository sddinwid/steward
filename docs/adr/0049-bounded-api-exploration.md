# 0049 — Bounded exploration outside operational module authority

Status: accepted for the first development-tool increment.

## Context

Steward needs evidence-backed adapter scaffolds without allowing documentation, models or generated code to acquire operational authority. Existing signed modules, SSMA bindings, module-owned databases and Worker authorization remain authoritative. Carrier contracts describe observations; they do not make arbitrary external APIs safe to explore.

## Decision

Add a private TypeScript `explorer-kit` workspace and CLI. Reuse Module SDK canonical digests and manifest validation; do not alter the production module catalog, connector egress enum, MCP runtime or carrier implementations. Store jobs and evidence in private ignored workspaces rather than authoritative business databases.

Separate parsing, operator-approved policy, public HTTPS transport, durable job accounting, evidence rendering and deterministic draft generation. Bind approval to the complete plan digest. Do not infer read safety from HTTP method or source prose. Reject redirects and nonpublic destinations; pin checked DNS addresses. Discard response scalar values. Persist reservations before requests so crashes cannot replenish budgets.

Generate intentionally incomplete draft metadata and a reader interface, not an installable signed package. Fixed templates contain only validated identifiers. Independently review generated fixture code before compiling/testing it in a network-disabled container. A future interpreter can propose evidence-linked suggestions but cannot approve or execute requests.

## Consequences

The retrieval/evidence primitives can support later bounded research without creating a competing operational integration system. The first increment cannot produce a complete provider adapter or claim live compatibility. Remote schema merging, provider OAuth, data mappings, persistence and SSMA semantics require further implementation and review. Local operator filesystem access is trusted; a server/UI integration would require its own authorization design. No deployment or release promotion is implied by passing fixture acceptance.
