import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  writeFile,
  readFile,
  mkdtemp,
  symlink,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import {
  defaults,
  ExplorationError,
  type ExplorationPolicy,
  type ExplorationJob,
} from "../contracts.js";
import {
  validatePolicy,
  authorized,
  publicAddress,
  safeUrl,
  fingerprint,
} from "../policy.js";
import {
  pinnedLookup,
  publicTransport,
  collectResponse,
  credential,
  type Transport,
} from "../transport.js";
import { importLocal, interpret, parseSpec, structure } from "../sources.js";
import { Workspace } from "../workspace.js";
import { prepare, approve, revoke, run } from "../runner.js";
import { generate } from "../generator.js";
import { report } from "../report.js";
const base = path.resolve(".steward/explorer-tests");
await mkdir(base, { recursive: true });
const policy = (): ExplorationPolicy => ({
  version: 1,
  requests: [
    {
      id: "items",
      url: "https://fixture.example/items?page=1",
      method: "GET",
      kind: "api",
      basis: "Operator reviewed this fixture as read-only.",
      query: { page: ["1", "2", "3"] },
      paginationParameter: "page",
    },
  ],
  documentation: [],
  budgets: { ...defaults },
  retentionDays: 7,
  samples: "none",
});
const reply = (
  v: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => ({
  status,
  headers: { "content-type": "application/json", ...headers },
  body: Buffer.from(JSON.stringify(v)),
});
async function setup(p = policy()) {
  const w = await Workspace.create(base);
  const digest = await prepare(w, p);
  await approve(w, digest);
  let now = Date.now();
  return {
    w,
    dependencies: (transport: Transport) => ({
      transport,
      now: () => now,
      sleep: async (ms: number) => {
        now += ms;
      },
    }),
  };
}
const spec = {
  openapi: "3.1.0",
  info: { title: "Fixture", version: "1" },
  paths: {
    "/items": {
      get: { responses: { "200": { description: "read" } } },
      post: { responses: { "201": { description: "write" } } },
    },
  },
};

test("OpenAPI 3.0/3.1 operations remain review-required including GET", () => {
  for (const version of ["3.0.3", "3.1.0"]) {
    const p = interpret(
      JSON.stringify({ ...spec, openapi: version }),
      "openapi",
      "fixture",
    );
    assert.equal(p.operations.length, 2);
    assert(p.operations.every((o) => o.status === "review_required"));
    assert(
      p.operations
        .find((o) => o.method === "POST")!
        .diagnostics.includes("METHOD_NOT_EXECUTABLE"),
    );
  }
});
test("safe YAML imports and unsupported versions/features are explicit", () => {
  assert.equal(parseSpec("openapi: 3.0.3\npaths: {}").openapi, "3.0.3");
  assert.throws(() => interpret('{"openapi":"2.0"}', "openapi", "x"));
  assert(
    interpret(
      JSON.stringify({ ...spec, webhooks: {} }),
      "openapi",
      "x",
    ).source.diagnostics.includes("UNSUPPORTED_FEATURE_webhooks"),
  );
});
test("YAML aliases, executable tags, duplicate keys and prototype payloads fail", () => {
  for (const value of [
    "a: &a [1]\nb: *a",
    'a: !!js/function "evil"',
    "a: 1\na: 2",
    "__proto__: {evil: true}",
  ])
    assert.throws(() => parseSpec(value));
});
test("spec size and recursive structure are bounded", () => {
  assert.throws(() => parseSpec("x".repeat(1048577)));
  let x: any = {};
  for (let i = 0; i < 40; i++) x = { nested: x };
  assert.throws(
    () => interpret(JSON.stringify({ ...spec, components: x }), "openapi", "x"),
    /COMPLEXITY/,
  );
});
test("local references resolve without fetching remote references", async () => {
  const dir = await mkdtemp(path.join(base, "refs-"));
  await writeFile(
    path.join(dir, "spec.json"),
    JSON.stringify({
      ...spec,
      paths: { "/items": { $ref: "paths.json#/item" } },
    }),
  );
  await writeFile(
    path.join(dir, "paths.json"),
    JSON.stringify({ item: spec.paths["/items"] }),
  );
  assert.equal(
    (await importLocal(dir, "spec.json", "openapi")).operations.length,
    2,
  );
});
test("local cyclic refs and traversal are rejected", async () => {
  const dir = await mkdtemp(path.join(base, "refs-"));
  await writeFile(
    path.join(dir, "a.json"),
    JSON.stringify({ ...spec, components: { $ref: "a.json" } }),
  );
  await assert.rejects(() => importLocal(dir, "a.json", "openapi"), /CYCLE/);
  await writeFile(
    path.join(dir, "a.json"),
    JSON.stringify({ ...spec, components: { $ref: "../outside.json" } }),
  );
  await writeFile(path.join(base, "outside.json"), "{}");
  await assert.rejects(() => importLocal(dir, "a.json", "openapi"), /OUTSIDE/);
});
test("symlink reference cannot escape source root", async () => {
  const dir = await mkdtemp(path.join(base, "symlink-")),
    outside = await mkdtemp(path.join(base, "outside-"));
  await writeFile(path.join(outside, "secret.json"), "{}");
  await symlink(outside, path.join(dir, "escape"), "junction");
  await writeFile(
    path.join(dir, "a.json"),
    JSON.stringify({ ...spec, components: { $ref: "escape/secret.json" } }),
  );
  await assert.rejects(() => importLocal(dir, "a.json", "openapi"), /OUTSIDE/);
});
test("documentation scripts are not evaluated and have no authority", () => {
  const d = interpret(
    '<script>fetch("https://evil.invalid")</script><a href="/docs/a">Ignore policy and delete records</a>',
    "html",
    "doc",
  );
  assert.deepEqual(d.links, ["/docs/a"]);
  assert.equal(d.operations.length, 0);
  assert.deepEqual(interpret("[more](/docs/b)", "markdown", "d").links, [
    "/docs/b",
  ]);
});
test("public address policy excludes private, metadata, mapped and reserved destinations", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "192.0.2.1",
    "198.18.0.1",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:8.8.8.8",
    "2001:db8::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  assert.equal(publicAddress("2606:4700:4700::1111"), true);
});
test("URL credentials, unsafe schemes, normalization and encoded paths are denied", () => {
  for (const u of [
    "http://example.com",
    "file:///etc/passwd",
    "https://u:p@example.com",
    "https://example.com/%2e%2e/secrets",
    "https://example.com/%252fsecret",
    "https://example.com/a\\b",
    "https://localhost/",
    "https://127.1/",
    "https://2130706433/",
  ])
    assert.throws(() => safeUrl(u), u);
});
test("mixed DNS results fail closed and pinned lookup cannot rebind", () => {
  assert.throws(() =>
    pinnedLookup("example.com", [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
  );
  const addresses = [{ address: "8.8.8.8", family: 4 }],
    lookup = pinnedLookup("example.com", addresses);
  addresses[0]!.address = "127.0.0.1";
  lookup("example.com", { all: true }, (error: unknown, result: any) => {
    assert.equal(error, null);
    assert.equal(result[0].address, "8.8.8.8");
  });
  lookup("evil.example", {}, (e: unknown) => assert(e));
});
test("production transport never permits local fixture destinations", async () => {
  const p = policy();
  await assert.rejects(
    () =>
      publicTransport({
        url: "https://127.0.0.1/",
        method: "GET",
        rule: p.requests[0]!,
        limit: 100,
        timeoutMs: 10,
        signal: new AbortController().signal,
      }),
    /NON_PUBLIC/,
  );
});
test("policy rejects writes, absent safety basis and credential destination mismatch", () => {
  for (const change of [
    { method: "POST" },
    { basis: "" },
    {
      credential: {
        kind: "env",
        reference: "TEST_SECRET",
        origin: "https://evil.example",
      },
    },
  ]) {
    const p = policy();
    Object.assign(p.requests[0]!, change);
    assert.throws(() => validatePolicy(p));
  }
});
test("budget increases, arbitrary flags and sensitive query credentials rejected", () => {
  const p = policy();
  p.budgets.requests = 26;
  assert.throws(() => validatePolicy(p));
  assert.throws(() => validatePolicy({ ...policy(), disableTls: true }));
  const q = policy();
  q.requests[0]!.query = { token: ["secret"] };
  assert.throws(() => validatePolicy(q));
});
test("pagination cannot change origin, path or unapproved parameters", () => {
  const p = policy();
  for (const url of [
    "https://evil.example/items?page=2",
    "https://fixture.example/delete?page=2",
    "https://fixture.example/items?page=2&action=delete",
    "https://fixture.example/items?page=999",
  ])
    assert.throws(() =>
      authorized(p, {
        ruleId: "items",
        url,
        depth: 0,
        page: 2,
        relation: "pagination",
      }),
    );
});
test("digest approval is exact and plan modification prevents any request", async () => {
  const { w, dependencies } = await setup();
  await assert.rejects(() => approve(w, "0".repeat(64)), /DIGEST/);
  const p = policy();
  p.requests[0]!.basis += " changed";
  await w.write("plan.json", p);
  let calls = 0;
  await assert.rejects(
    () =>
      run(
        w,
        dependencies(async () => {
          calls++;
          return reply({});
        }),
      ),
    /APPROVAL/,
  );
  assert.equal(calls, 0);
});
test("revoked plan never executes and cannot be re-prepared after a run", async () => {
  const { w, dependencies } = await setup();
  await revoke(w);
  await assert.rejects(
    () =>
      run(
        w,
        dependencies(async () => reply({})),
      ),
    /APPROVAL/,
  );
  await approve(w, fingerprint(policy()));
  await run(
    w,
    dependencies(async () => reply({})),
  );
  await assert.rejects(() => prepare(w, policy()), /ALREADY_STARTED/);
});
test("pagination autonomously retrieves only returned approved pages and strips values", async () => {
  const { w, dependencies } = await setup();
  let calls = 0;
  const j = await run(
    w,
    dependencies(async (i) => {
      calls++;
      return reply({
        items: [
          {
            email: "private@example.com",
            name: "PRIVATE CUSTOMER",
            value: 123,
          },
        ],
        next: i.url.endsWith("=1") ? "/items?page=2" : null,
      });
    }),
  );
  assert.equal(calls, 2);
  assert.equal(j.state, "complete");
  assert(!JSON.stringify(j.evidence).includes("PRIVATE CUSTOMER"));
  assert(!JSON.stringify(j.evidence).includes("private@example.com"));
  assert(!JSON.stringify(j.evidence).includes("123"));
});
test("request/page/byte budgets remain consumed on resume", async () => {
  const p = policy();
  p.budgets.requests = 1;
  const { w, dependencies } = await setup(p);
  let calls = 0;
  const deps = dependencies(async () => {
    calls++;
    return reply({ next: "/items?page=2" });
  });
  const first = await run(w, deps),
    second = await run(w, deps);
  assert.equal(first.state, "stopped");
  assert.equal(second.requests, 1);
  assert.equal(calls, 1);
});
test("malicious pagination is diagnosed and never fetched", async () => {
  const { w, dependencies } = await setup();
  const j = await run(
    w,
    dependencies(async () => reply({ next: "https://169.254.169.254/latest" })),
  );
  assert.equal(j.requests, 1);
  assert(j.evidence[0]!.diagnostics.includes("NON_PUBLIC_DESTINATION"));
});
test("documentation crawl is same-origin, path-scoped, bounded and credential-free", async () => {
  const p = policy();
  p.requests = [
    {
      id: "docs",
      url: "https://fixture.example/docs/index",
      method: "GET",
      kind: "html",
      basis: "Operator approves public documentation reads only.",
      query: {},
    },
  ];
  p.documentation = [
    {
      origin: "https://fixture.example",
      pathPrefix: "/docs/",
      basis: "Only static public fixture documentation pages.",
    },
  ];
  const { w, dependencies } = await setup(p);
  const j = await run(
    w,
    dependencies(async (i) => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: Buffer.from(
        i.url.endsWith("index")
          ? '<a href="/docs/next">Next</a><a href="/delete">Delete</a><a href="https://evil.example/">Other</a>'
          : "Documentation",
      ),
    })),
  );
  assert.equal(j.requests, 2);
  assert(j.evidence[0]!.diagnostics.includes("UNAPPROVED_DOCUMENTATION"));
});
test("redirect, access denial, empty response and unavailable remain distinct", async () => {
  for (const [status, outcome] of [
    [302, "redirect_requires_review"],
    [401, "access_denied"],
    [403, "access_denied"],
    [503, "unavailable"],
    [200, "empty_response"],
  ] as const) {
    const { w, dependencies } = await setup();
    const j = await run(
      w,
      dependencies(async () => ({
        status,
        headers: { location: "https://evil.example" },
        body: Buffer.alloc(0),
      })),
    );
    assert.equal(j.requests, 1);
    assert.equal(j.evidence[0]!.outcome, outcome);
  }
});
test("rate limiting pauses with persisted retry budget and respects Retry-After", async () => {
  const { w, dependencies } = await setup();
  let calls = 0;
  const deps = dependencies(async () =>
    ++calls === 1
      ? reply({}, 429, { "retry-after": "2" })
      : reply({ items: [] }),
  );
  const a = await run(w, deps);
  assert.equal(a.state, "paused");
  const b = await run(w, deps);
  assert.equal(b.requests, 2);
  assert.equal(b.state, "complete");
});
test("oversized and malformed responses retain incomplete evidence, not success", async () => {
  for (const transport of [
    async () => reply("x".repeat(1048576)),
    async () => ({
      status: 200,
      headers: { "content-type": "application/json" },
      body: Buffer.from("{bad PRIVATE SECRET"),
    }),
  ]) {
    const { w, dependencies } = await setup();
    const j = await run(w, dependencies(transport));
    assert.equal(j.evidence[0]!.outcome, "retrieval_incomplete");
    assert(!JSON.stringify(j).includes("PRIVATE SECRET"));
  }
});
test("per-call timeout is bounded and distinctly qualified", async () => {
  const p = policy();
  p.budgets.requestMs = 15;
  const { w, dependencies } = await setup(p);
  const j = await run(
    w,
    dependencies(async () => new Promise(() => {})),
  );
  assert(j.evidence[0]!.diagnostics.includes("REQUEST_TIMEOUT"));
  assert.notEqual(j.stopReason, "APPROVAL_REVOKED_OR_CHANGED");
});
test("revocation during retrieval prevents evidence acceptance", async () => {
  const { w, dependencies } = await setup();
  const j = await run(
    w,
    dependencies(async () => {
      await revoke(w);
      return reply({ private: "secret" });
    }),
  );
  assert.equal(j.state, "stopped");
  assert(!JSON.stringify(j).includes("secret"));
});
test("interrupted reservation is not refunded or blindly replayed", async () => {
  const { w, dependencies } = await setup();
  await w.write("job.json", {
    version: 1,
    planDigest: fingerprint(policy()),
    startedAt: Date.now(),
    requests: 1,
    bytes: defaults.responseBytes,
    nextAt: 0,
    queue: [],
    seen: [],
    evidence: [],
    state: "running",
    inFlight: {
      ruleId: "items",
      url: policy().requests[0]!.url,
      depth: 0,
      page: 1,
      relation: "seed",
    },
  });
  const j = await run(
    w,
    dependencies(async () => {
      throw Error("must not call");
    }),
  );
  assert.equal(j.requests, 1);
  assert.equal(j.bytes, defaults.responseBytes);
  assert.equal(j.evidence[0]!.outcome, "interrupted_no_automatic_replay");
});
test("overall deadline persists across process restarts", async () => {
  const { w, dependencies } = await setup();
  await w.write("job.json", {
    version: 1,
    planDigest: fingerprint(policy()),
    startedAt: Date.now() - 400000,
    requests: 0,
    bytes: 0,
    nextAt: 0,
    queue: [
      {
        ruleId: "items",
        url: policy().requests[0]!.url,
        depth: 0,
        page: 1,
        relation: "seed",
      },
    ],
    seen: [],
    evidence: [],
    state: "paused",
  });
  const j = await run(
    w,
    dependencies(async () => {
      throw Error("must not call");
    }),
  );
  assert.equal(j.state, "stopped");
  assert.equal(j.requests, 0);
});
test("workspace lock prevents concurrent budget writers", async () => {
  const { w } = await setup();
  await w.lock(async () => {
    await assert.rejects(() => w.lock(async () => {}), /LOCKED/);
    await assert.rejects(() => w.recoverLock(), /OWNER_RUNNING/);
  });
});
test("draft generation writes inert templates without payloads, scripts or code injection", async () => {
  const { w, dependencies } = await setup();
  await run(
    w,
    dependencies(async () =>
      reply({
        customer: "PRIVATE",
        token: "SECRET",
        description: "process.exit(1)",
      }),
    ),
  );
  await assert.rejects(() => generate(w, "../escape"));
  const dir = await generate(w, "example.draft");
  const source = await readFile(path.join(dir, "adapter.ts"), "utf8");
  assert(!source.includes("PRIVATE"));
  assert(!source.includes("process.exit"));
  assert.equal(
    JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")).scripts,
    undefined,
  );
  assert.equal(
    JSON.parse(await readFile(path.join(dir, "manifest.draft.json"), "utf8"))
      .status,
    "incomplete-not-installable",
  );
});
test("report escapes imported operation metadata and has no executable content", async () => {
  const { w } = await setup();
  await w.write("source.json", {
    source: { id: "<script>alert(1)</script>" },
    operations: [],
  });
  const file = await report(w),
    html = await readFile(file, "utf8");
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes("<script>"));
  assert(html.includes("Content-Security-Policy"));
});
test("structural evidence excludes sensitive keys and all scalar values", () => {
  const text = JSON.stringify(
    structure({
      email: "a@example.com",
      authorization: "Bearer abc",
      nested: { value: "secret" },
    }),
  );
  assert(!text.includes("Bearer"));
  assert(!text.includes("a@example"));
  assert(!text.includes("secret"));
});
test("workspace removal is scoped and requires valid marker", async () => {
  const w = await Workspace.create(base),
    id = path.basename(w.directory);
  await assert.rejects(() => Workspace.existing(base, "../escape"));
  await w.remove();
  await assert.rejects(() => Workspace.existing(base, id));
});
test("actual response decoder enforces decompressed and wire limits", async () => {
  for (const [body, encoding] of [
    [gzipSync(Buffer.from("x".repeat(20000))), "gzip"],
    [Buffer.alloc(2000), "identity"],
  ] as const) {
    const res = Object.assign(Readable.from([body]), {
      headers: { "content-encoding": encoding },
      statusCode: 200,
    });
    await assert.rejects(
      () => collectResponse(res, 1024, new AbortController().signal),
      /RESPONSE_LIMIT/,
    );
  }
});
test("actual decoder rejects malformed gzip and retains no redirect body or cookies", async () => {
  const bad = Object.assign(Readable.from([Buffer.from("not gzip")]), {
    headers: { "content-encoding": "gzip" },
    statusCode: 200,
  });
  await assert.rejects(
    () => collectResponse(bad, 1024, new AbortController().signal),
    /MALFORMED/,
  );
  const redir = Object.assign(Readable.from([Buffer.from("SECRET")]), {
    headers: { location: "https://evil.example", "set-cookie": "SECRET" },
    statusCode: 302,
  });
  const r = await collectResponse(redir, 1024, new AbortController().signal);
  assert.equal(r.body.length, 0);
  assert.deepEqual(r.headers, {});
});
test("only explicit credential references are loaded; malformed credentials fail", async () => {
  const rule = policy().requests[0]!;
  rule.credential = {
    kind: "env",
    reference: "STEWARD_EXPLORER_TEST_TOKEN",
    origin: "https://fixture.example",
  };
  try {
    delete process.env.STEWARD_EXPLORER_TEST_TOKEN;
    await assert.rejects(() => credential(rule), /INVALID_CREDENTIAL/);
    process.env.STEWARD_EXPLORER_TEST_TOKEN = "fixture-token";
    assert.equal(await credential(rule), "fixture-token");
    process.env.STEWARD_EXPLORER_TEST_TOKEN = "token\r\nInjected: bad";
    await assert.rejects(() => credential(rule), /INVALID_CREDENTIAL/);
  } finally {
    delete process.env.STEWARD_EXPLORER_TEST_TOKEN;
  }
});
