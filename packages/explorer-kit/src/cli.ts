import path from "node:path";
import { readFile } from "node:fs/promises";
import { Workspace } from "./workspace.js";
import { importLocal } from "./sources.js";
import { approve, prepare, revoke, run } from "./runner.js";
import { generate } from "./generator.js";
import { report } from "./report.js";
import { ensure, safeCode, type SourceKind } from "./contracts.js";
const base = path.resolve(".steward/explorer");
const [command, id, a, b] = process.argv.slice(2);
try {
  if (command === "import") {
    ensure(
      id && a && ["openapi", "html", "markdown"].includes(b ?? ""),
      "USAGE_import_ROOT_FILE_KIND",
    );
    const source = await importLocal(path.resolve(id), a, b as SourceKind),
      w = await Workspace.create(base);
    await w.write("source.json", source);
    console.log(
      JSON.stringify(
        {
          workspace: path.basename(w.directory),
          source: source.source,
          operations: source.operations,
        },
        null,
        2,
      ),
    );
  } else if (command === "help" || !command)
    console.log(
      "import <source-root> <file> <openapi|html|markdown> | prepare <workspace-id> <policy.json> | plan <id> | approve <id> <digest> | revoke <id> | run <id> | inspect <id> | generate <id> <proposed.module-id> | recover-lock <id> | remove <id> <same-id>",
    );
  else {
    ensure(id, "WORKSPACE_ID_REQUIRED");
    const w = await Workspace.existing(base, id);
    if (command === "prepare") {
      ensure(a, "POLICY_FILE_REQUIRED");
      console.log(
        "Review plan digest: " +
          (await prepare(w, JSON.parse(await readFile(a, "utf8")))),
      );
    } else if (command === "plan")
      console.log(JSON.stringify(await w.read("plan.json"), null, 2));
    else if (command === "approve") {
      ensure(a, "EXACT_DIGEST_REQUIRED");
      await approve(w, a);
      console.log("Exact plan approved by local operator");
    } else if (command === "revoke") {
      await revoke(w);
      console.log("Approval revoked");
    } else if (command === "run") {
      const result = await run(w);
      console.log(
        JSON.stringify({
          state: result.state,
          requests: result.requests,
          chargedBytes: result.bytes,
          reason: result.stopReason,
        }),
      );
      await report(w);
    } else if (command === "inspect") console.log(await report(w));
    else if (command === "generate") {
      ensure(a, "MODULE_ID_REQUIRED");
      console.log(await generate(w, a));
    } else if (command === "recover-lock") {
      await w.recoverLock();
      console.log(
        "Dead process lock removed; budgets and interrupted request remain retained",
      );
    } else if (command === "remove") {
      ensure(a === id, "CONFIRM_EXACT_WORKSPACE_ID");
      await w.remove();
      console.log("Selected explorer workspace removed");
    } else ensure(false, "UNKNOWN_COMMAND");
  }
} catch (e) {
  console.error(safeCode(e));
  process.exitCode = 1;
}
