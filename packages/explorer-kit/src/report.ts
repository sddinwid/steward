import { writeFile } from "node:fs/promises";
import { Workspace } from "./workspace.js";
import type { ExplorationJob, ExplorationPolicy } from "./contracts.js";
import type { ParsedSource } from "./sources.js";
export const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
export async function report(w: Workspace) {
  const source = await w.optional<ParsedSource>("source.json"),
    job = await w.optional<ExplorationJob>("job.json");
  const plan = await w.optional<ExplorationPolicy>("plan.json");
  const content = {
    source: source
      ? { source: source.source, operations: source.operations }
      : null,
    job: job
      ? {
          state: job.state,
          stopReason: job.stopReason,
          requests: job.requests,
          chargedBytes: job.bytes,
          evidence: job.evidence,
        }
      : null,
    safety: {
      methods: "Explicitly reviewed GET/HEAD only",
      redirects: "Never followed",
      samples: "Scalar response values not retained",
      authority:
        "Local operator approval; source content cannot grant authority",
    },
    proposedContributions: (plan?.requests ?? [])
      .filter((r) => r.kind === "api")
      .map((r) => ({
        operation: r.id,
        api: "Proposed retained-observation read",
        ui: "Proposed declarative observation list",
        mcp: "Proposed retained-evidence query; not registered",
      })),
    gaps: [
      "Authentication renewal, business mappings and persistence remain unimplemented in generated drafts.",
      "No semantic SSMA equivalence, external compatibility or production readiness established.",
      "Remote references require separately approved retrieval and semantic review.",
    ],
  };
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>Steward exploration evidence</title></head><body><h1>Exploration evidence — not adapter certification</h1><p>Documented means stated in a source. Observed means retrieved within the approved scope. Neither establishes complete history, business semantics or safe write operations.</p><p>No response values or credentials are retained in this report. Empty, incomplete, denied and unavailable results are distinct. Draft contributions require human implementation and review.</p><pre>' +
    escapeHtml(JSON.stringify(content, null, 2)) +
    "</pre></body></html>";
  await writeFile(w.file("report.html"), html, { mode: 0o600 });
  return w.file("report.html");
}
