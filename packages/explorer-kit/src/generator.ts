import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  validateManifest,
  type ModulePackageManifest,
} from "@steward/module-sdk";
import { Workspace } from "./workspace.js";
import { fingerprint, validatePolicy } from "./policy.js";
import { ensure, type AdapterDraft, type ExplorationJob } from "./contracts.js";
export async function generate(w: Workspace, moduleId: string) {
  return w.lock(async () => {
    ensure(
      /^[a-z][a-z0-9-]{1,29}(?:\.[a-z][a-z0-9-]{1,29}){1,3}$/.test(moduleId),
      "INVALID_MODULE_ID",
    );
    const plan = validatePolicy(await w.read("plan.json")),
      approval = await w.read<any>("approval.json");
    ensure(
      approval.approved === true && approval.digest === fingerprint(plan),
      "APPROVAL_REQUIRED",
    );
    const job = await w.optional<ExplorationJob>("job.json");
    const selected = plan.requests.filter((r) => r.kind === "api");
    ensure(selected.length > 0, "NO_REVIEWED_API_SELECTION");
    const evidence = job?.evidence ?? [];
    const gaps = [
      "Unsigned and uninstalled. No external compatibility claim.",
      "Provider authentication/renewal not implemented; credentials must remain private.",
      "Normalized business mappings and persistence migrations require human implementation.",
      "No SSMA semantic equivalence established; no capabilities or mutation authority granted.",
      "Production module runtime must supply a reviewed reader; no default network implementation.",
      "Observation freshness, retention terms and API completeness require provider review.",
    ];
    const metadata: AdapterDraft = {
      version: 1,
      status: "unsigned-uninstalled-draft",
      moduleId,
      sourceIds: [...new Set(evidence.map((e) => e.sourceId))],
      operations: selected.map((r) => r.id),
      gaps,
    };
    const proposed = {
      manifestVersion: 1,
      sdkVersion: 1,
      moduleId,
      version: "0.0.0",
      name: "Reviewed API adapter draft",
      description: "Retained observation proposal, not installed or verified",
      minimumPlatformVersion: "0.16.0",
      dependencies: [],
      requiredPermissions: ["storage.own-database"],
      configurationSchema: {
        type: "object",
        additionalProperties: false,
        properties: { enabled: { const: false } },
      },
      api: selected.map((r) => ({
        operationId: r.id,
        method: "GET",
        path: "/observations/" + r.id,
        permission: moduleId + ".read",
      })),
      ui: selected.map((r) => ({
        screenId: r.id,
        title: "Observations " + r.id,
        navigationLabel: "Observations " + r.id,
        listOperation: r.id,
        fields: [
          {
            name: "evidence",
            label: "Retained evidence",
            type: "json",
            readOnly: true,
          },
        ],
        columns: ["evidence"],
      })),
      mcpTools: selected.map((r) => ({
        name: moduleId.replaceAll(".", "_").replaceAll("-", "_") + "_" + r.id,
        description:
          "Read retained evidence only; proposed contribution, not registered",
        operationId: r.id,
      })),
      integrationEvents: [],
      analyticalCapabilities: [],
    };
    let installable = true;
    try {
      validateManifest(proposed as unknown as ModulePackageManifest);
    } catch {
      installable = false;
    }
    ensure(!installable, "DRAFT_MUST_NOT_BE_INSTALLABLE");
    const directory = path.join(w.directory, "draft-" + randomUUID());
    await mkdir(directory, { mode: 0o700 });
    const put = (name: string, value: string) =>
      writeFile(path.join(directory, name), value, { mode: 0o600 });
    await put("draft.json", JSON.stringify(metadata, null, 2));
    await put(
      "manifest.draft.json",
      JSON.stringify(
        {
          status: "incomplete-not-installable",
          missing: [
            "persistence.schemaVersion",
            "persistence.migrations",
            "verified runtime implementation",
          ],
          proposed,
        },
        null,
        2,
      ),
    );
    await put(
      "configuration.schema.json",
      JSON.stringify(proposed.configurationSchema, null, 2),
    );
    await put(
      "mappings.proposed.json",
      JSON.stringify(
        selected.map((r) => ({
          operationId: r.id,
          mapping: "unresolved",
          evidenceIds: evidence
            .filter((e) => e.sourceId === r.id)
            .map((e) => e.id),
          qualification: evidence.some(
            (e) => e.sourceId === r.id && e.qualification === "observed",
          )
            ? "response-observed-semantics-unverified"
            : "unverified",
        })),
        null,
        2,
      ),
    );
    await put(
      "package.json",
      JSON.stringify(
        {
          name: moduleId + "-draft",
          version: "0.0.0",
          private: true,
          type: "module",
        },
        null,
        2,
      ),
    );
    // The only substituted code values are policy-validated identifiers serialized as JSON.
    await put(
      "adapter.ts",
      `/** QUARANTINED DRAFT. No default fetch, persistence or installation authority. */\nconst operations: readonly string[] = ${JSON.stringify(metadata.operations)};\nexport interface ReviewedReader { readApprovedOperation(operationId: string): Promise<unknown>; }\nexport class AdapterDraft {\n constructor(private reader?: ReviewedReader) {}\n async read(operationId: string): Promise<unknown> {\n  if (!operations.includes(operationId)) throw new Error('OPERATION_NOT_REVIEWED');\n  if (!this.reader) throw new Error('REVIEWED_READER_NOT_CONFIGURED');\n  return this.reader.readApprovedOperation(operationId);\n }\n}\n`,
    );
    await put(
      "adapter.test.mjs",
      `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {AdapterDraft} from './dist/adapter.js';\ntest('only selected read reaches injected reviewed transport',async()=>{let calls=0;const a=new AdapterDraft({readApprovedOperation:async id=>{calls++;return {synthetic:true,items:[]};}});assert.deepEqual(await a.read(${JSON.stringify(metadata.operations[0])}),{synthetic:true,items:[]});await assert.rejects(()=>a.read('unreviewed-write'),/NOT_REVIEWED/);assert.equal(calls,1);});\ntest('unconfigured adapter fails explicitly',async()=>{await assert.rejects(()=>new AdapterDraft().read(${JSON.stringify(metadata.operations[0])}),/NOT_CONFIGURED/);});\n`,
    );
    await put(
      "README.md",
      "# Quarantined adapter draft\n\n" +
        gaps.map((g) => "- " + g).join("\n") +
        "\n\nNo raw source payloads, secrets, customer samples or provider URLs are copied here. Tests use deliberately empty synthetic data; they do not establish provider compatibility.\n\nThe proposed API/UI/MCP reads must eventually serve retained module-owned observations through Business Kit and Module SDK. They must not refresh providers implicitly. Connect this draft only to a reader constrained by an approved exploration policy; no arbitrary URLs or headers are accepted by the draft. Implement and review authentication, schemas, mappings and module-owned migrations separately. Use existing signed-package and execution-continuity review only after all gaps are closed. Generation never installs dependencies, runs scripts, signs or publishes.\n",
    );
    return directory;
  });
}
