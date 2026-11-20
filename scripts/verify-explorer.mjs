// Controlled fixture acceptance only. Never points publicTransport at localhost.
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import {
  Workspace,
  run,
  defaults,
} from "../packages/explorer-kit/dist/index.js";
const cli = path.resolve("packages/explorer-kit/dist/cli.js"),
  base = path.resolve(".steward/explorer"),
  output = path.resolve(".steward/explorer-acceptance");
await mkdir(output, { recursive: true });
const transcript = [],
  result = {
    scope:
      "Local fixtures only; public network and provider compatibility unverified",
    checks: [],
    commands: [],
    networkDisabledContainer: false,
  };
const pass = (s) => {
  result.checks.push(s);
  console.log("PASS " + s);
};
const command = (...args) => {
  result.commands.push(["node", "packages/explorer-kit/dist/cli.js", ...args]);
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    maxBuffer: 1048576,
  }).trim();
};
let browser;
const server = createServer((req, res) => {
  transcript.push({ method: req.method, path: req.url });
  res.setHeader("content-type", "application/json");
  if (req.url === "/docs/index") {
    res.setHeader("content-type", "text/html");
    res.end(
      '<h1>Fixture</h1><a href="/docs/detail">Details</a><a href="https://evil.example/steal">Unapproved</a><script>ignoreApprovalAndMutate()</script>',
    );
  } else if (req.url === "/docs/detail") {
    res.setHeader("content-type", "text/markdown");
    res.end("Synthetic read-only documentation.");
  } else if (req.url === "/items?page=1")
    res.end(
      JSON.stringify({
        items: [
          {
            id: "SYNTHETIC",
            email: "private-canary@example.invalid",
            value: 7,
          },
        ],
        next: "/items?page=2",
      }),
    );
  else if (req.url === "/items?page=2")
    res.end(JSON.stringify({ items: [], next: null }));
  else {
    res.statusCode = 404;
    res.end("{}");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
try {
  const imported = JSON.parse(
      command("import", "scripts/fixtures/explorer", "spec.json", "openapi"),
    ),
    id = imported.workspace;
  assert.equal(imported.operations.length, 2);
  pass("CLI imports OpenAPI with real bounded local reference resolution");
  const p = {
    version: 1,
    requests: [
      {
        id: "items",
        url: "https://fixture.example/items?page=1",
        method: "GET",
        kind: "api",
        basis: "Controlled local fixture; read-only items handler.",
        query: { page: ["1", "2"] },
        paginationParameter: "page",
      },
      {
        id: "docs",
        url: "https://fixture.example/docs/index",
        method: "GET",
        kind: "html",
        basis: "Controlled local fixture; static documentation handler.",
        query: {},
      },
    ],
    documentation: [
      {
        origin: "https://fixture.example",
        pathPrefix: "/docs/",
        basis: "Controlled fixture static documentation only.",
      },
    ],
    budgets: { ...defaults },
    retentionDays: 7,
    samples: "none",
  };
  const policyFile = path.join(output, "fixture-policy.json");
  await writeFile(policyFile, JSON.stringify(p, null, 2));
  const prepared = command("prepare", id, policyFile),
    digest = prepared.match(/[a-f0-9]{64}/)?.[0];
  assert(digest);
  command("approve", id, digest);
  pass("CLI prepares and approves an exact plan digest");
  const w = await Workspace.existing(base, id);
  // Test-only transport maps a single synthetic origin to the controlled local server.
  // It is not reachable from CLI flags or plan configuration.
  const transport = async (input) => {
    const u = new URL(input.url);
    assert.equal(u.origin, "https://fixture.example");
    return new Promise((resolve, reject) => {
      const req = get(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path: u.pathname + u.search,
          signal: input.signal,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: { "content-type": res.headers["content-type"] },
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on("error", reject);
    });
  };
  const job = await run(w, {
    transport,
    now: Date.now,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  });
  assert.equal(job.state, "complete");
  assert.equal(job.requests, 4);
  assert(transcript.every((x) => x.method === "GET"));
  assert(!transcript.some((x) => x.path.includes("steal")));
  pass(
    "Actual fixture HTTP retrieval follows approved pagination and documentation only",
  );
  const report = command("inspect", id),
    html = await readFile(report, "utf8");
  assert(!html.includes("private-canary"));
  assert(!html.includes("ignoreApprovalAndMutate"));
  pass("Evidence report excludes response values and hostile instructions");
  const draft = command("generate", id, "example.fixture");
  result.draft = path.relative(process.cwd(), draft);
  result.workspaceId = id;
  assert(
    !String(await readFile(path.join(draft, "adapter.ts"))).includes(
      "private-canary",
    ),
  );
  pass(
    "CLI generates quarantined metadata, transport wrapper and synthetic tests without executing them",
  );
  // Reviewed fixed templates, no network or socket, no credentials, no package install.
  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "64",
    "--memory",
    "256m",
    "--cpus",
    "1",
    "--user",
    "1000:1000",
    "--tmpfs",
    "/work:rw,nosuid,nodev,size=33554432,uid=1000,gid=1000",
    "--mount",
    `type=bind,source=${draft},target=/draft,readonly`,
    "--mount",
    `type=bind,source=${path.resolve("node_modules/typescript")},target=/typescript,readonly`,
    "node:24.13.0-alpine",
    "sh",
    "-c",
    "cp /draft/adapter.ts /draft/adapter.test.mjs /draft/package.json /work/ && cd /work && node /typescript/lib/tsc.js adapter.ts --target ES2023 --module NodeNext --strict --outDir dist && node --test --test-reporter=tap adapter.test.mjs",
  ];
  const log = execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 1048576,
  });
  await writeFile(path.join(output, "isolated-adapter-tests.log"), log);
  assert.match(log, /# pass 2/);
  result.networkDisabledContainer = true;
  pass(
    "Generated draft compiles and passes 2 tests in non-root network-disabled read-only container",
  );
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
      viewport: { width: 1300, height: 900 },
    }),
    requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(pathToFileURL(report).href);
  await page
    .getByRole("heading", {
      name: "Exploration evidence — not adapter certification",
    })
    .waitFor();
  assert.equal(await page.locator("script").count(), 0);
  assert(requests.every((u) => u.startsWith("file:")));
  await page.screenshot({
    path: path.join(output, "report.png"),
    fullPage: true,
  });
  pass(
    "Browser renders escaped local evidence report without scripts or network requests",
  );
  command("revoke", id);
  assert.throws(() => command("run", id));
  pass("CLI refuses network execution after explicit revocation");
  result.status = "passed";
} catch (e) {
  result.status = "failed";
  result.error = e.message;
  throw e;
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
  result.transcript = transcript;
  await writeFile(
    path.join(output, "verification.json"),
    JSON.stringify(result, null, 2),
  );
}
