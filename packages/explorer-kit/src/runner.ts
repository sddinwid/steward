import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { digest } from "@steward/module-sdk";
import { Workspace } from "./workspace.js";
import {
  authorized,
  validatePolicy,
  fingerprint,
  displayUrl,
  safeUrl,
} from "./policy.js";
import { interpret, structure, parseSpec } from "./sources.js";
import {
  ensure,
  safeCode,
  ExplorationError,
  type ExplorationPolicy,
  type ExplorationJob,
  type QueueItem,
  type EvidenceRecord,
} from "./contracts.js";
import { publicTransport, type Transport } from "./transport.js";
export async function prepare(w: Workspace, value: unknown) {
  return w.lock(async () => {
    ensure(
      !(await w.optional("job.json")),
      "PLAN_ALREADY_STARTED_NEW_WORKSPACE_REQUIRED",
    );
    const p = validatePolicy(value);
    await w.write("plan.json", p);
    await w.write("approval.json", { approved: false });
    return fingerprint(p);
  });
}
export async function approve(w: Workspace, expected: string) {
  const p = validatePolicy(await w.read("plan.json"));
  ensure(expected === fingerprint(p), "PLAN_DIGEST_CHANGED");
  await w.write("approval.json", {
    approved: true,
    digest: expected,
    at: Date.now(),
  });
}
export async function revoke(w: Workspace) {
  await w.write("approval.json", { approved: false });
}
async function check(w: Workspace, expected: string) {
  const a = await w.read<any>("approval.json");
  ensure(
    a.approved === true &&
      a.digest === expected &&
      fingerprint(validatePolicy(await w.read("plan.json"))) === expected,
    "APPROVAL_REVOKED_OR_CHANGED",
  );
}
export interface RunnerDependencies {
  transport: Transport;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}
/** The CLI always uses publicTransport. Dependency injection is for controlled tests only. */
export async function run(w: Workspace, injected?: RunnerDependencies) {
  return w.lock(async () => {
    const p = validatePolicy(await w.read("plan.json")),
      pd = fingerprint(p);
    await check(w, pd);
    const deps = injected ?? {
      transport: publicTransport,
      now: Date.now,
      sleep: async (ms) => {
        await delay(ms);
      },
    };
    const marker = await w.read<{ createdAt: number; deleting?: boolean }>(
      "workspace.json",
    );
    ensure(!marker.deleting, "WORKSPACE_REMOVING");
    ensure(
      Date.now() - marker.createdAt < p.retentionDays * 86400000,
      "WORKSPACE_RETENTION_EXPIRED",
    );
    const j = (await w.optional<ExplorationJob>("job.json")) ?? {
      version: 1,
      planDigest: pd,
      startedAt: deps.now(),
      requests: 0,
      bytes: 0,
      nextAt: 0,
      queue: p.requests.map((r) => ({
        ruleId: r.id,
        url: r.url,
        depth: 0,
        page: 1,
        relation: "seed" as const,
      })),
      seen: [],
      evidence: [],
      state: "ready" as const,
    };
    ensure(j.planDigest === pd, "JOB_PLAN_CHANGED");
    if (j.inFlight) {
      j.evidence.push({
        version: 1,
        id: randomUUID(),
        sourceId: j.inFlight.ruleId,
        retrievedAt: new Date(deps.now()).toISOString(),
        url: displayUrl(j.inFlight.url),
        urlFingerprint: digest(j.inFlight.url),
        qualification: "unverified",
        outcome: "interrupted_no_automatic_replay",
        diagnostics: ["Reserved request and bytes remain consumed"],
      });
      delete j.inFlight;
    }
    const save = () => w.write("job.json", j);
    const add = (item: QueueItem, e: EvidenceRecord) => {
      try {
        authorized(p, item);
        const key = item.ruleId + ":" + item.url;
        if (
          !j.seen.includes(key) &&
          !j.queue.some((q) => q.ruleId + ":" + q.url === key) &&
          j.queue.length < 100
        )
          j.queue.push(item);
      } catch (err) {
        e.diagnostics.push(safeCode(err));
      }
    };
    while (j.queue.length) {
      if (
        j.requests >= p.budgets.requests ||
        j.bytes + p.budgets.responseBytes > p.budgets.totalBytes ||
        deps.now() - j.startedAt >= p.budgets.overallMs
      ) {
        j.state = "stopped";
        j.stopReason = "BUDGET_EXHAUSTED";
        break;
      }
      await check(w, pd);
      if (j.nextAt > deps.now()) {
        const wait = j.nextAt - deps.now();
        if (
          wait > 60000 ||
          deps.now() + wait - j.startedAt >= p.budgets.overallMs
        ) {
          j.state = "paused";
          j.stopReason = "RATE_LIMIT_OR_DEADLINE";
          break;
        }
        await deps.sleep(wait);
        await check(w, pd);
      }
      if (deps.now() - j.startedAt >= p.budgets.overallMs) {
        j.state = "stopped";
        j.stopReason = "DEADLINE";
        break;
      }
      const item = j.queue.shift()!,
        r = authorized(p, item);
      j.seen.push(item.ruleId + ":" + item.url);
      j.requests++;
      j.bytes += p.budgets.responseBytes;
      j.inFlight = item;
      j.state = "running";
      delete j.stopReason;
      await save();
      const evidence: EvidenceRecord = {
        version: 1,
        id: randomUUID(),
        sourceId: r.id,
        retrievedAt: new Date(deps.now()).toISOString(),
        url: displayUrl(item.url),
        urlFingerprint: digest(item.url),
        qualification: "unverified",
        outcome: "unavailable",
        diagnostics: [],
      };
      const abort = new AbortController();
      let checking = false,
        revoked = false;
      const timer = setInterval(() => {
        if (checking) return;
        checking = true;
        void check(w, pd)
          .catch(() => {
            revoked = true;
            abort.abort();
          })
          .finally(() => {
            checking = false;
          });
      }, 100);
      timer.unref();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutMs = Math.min(
          p.budgets.requestMs,
          p.budgets.overallMs - (deps.now() - j.startedAt),
        );
        const reply = await Promise.race([
          deps.transport({
            url: item.url,
            method: r.method,
            rule: r,
            limit: p.budgets.responseBytes,
            timeoutMs,
            signal: abort.signal,
          }),
          new Promise<never>((_, reject) => {
            deadline = setTimeout(() => {
              reject(new ExplorationError("REQUEST_TIMEOUT"));
              abort.abort();
            }, timeoutMs);
          }),
        ]);
        await check(w, pd);
        ensure(reply.body.length <= p.budgets.responseBytes, "RESPONSE_LIMIT");
        j.bytes -= p.budgets.responseBytes - reply.body.length;
        evidence.status = reply.status;
        const media = (reply.headers["content-type"] ?? "unknown")
          .split(";")[0]!
          .trim();
        evidence.contentType =
          /^(application\/(json|yaml|x-yaml)|text\/(html|plain|markdown|yaml))$/.test(
            media,
          )
            ? media
            : "unsupported";
        evidence.fingerprint = digest(reply.body.toString("utf8"));
        if (reply.status >= 300 && reply.status < 400) {
          evidence.outcome = "redirect_requires_review";
        } else if (reply.status === 401 || reply.status === 403)
          evidence.outcome = "access_denied";
        else if (reply.status === 429) {
          const h = reply.headers["retry-after"] ?? "",
            seconds = /^\d+$/.test(h)
              ? Math.min(Number(h), 86400)
              : Math.max(0, Math.ceil((Date.parse(h) - deps.now()) / 1000));
          evidence.outcome = "rate_limited";
          evidence.rateLimit = {
            retryAfterSeconds: Number.isFinite(seconds) ? seconds : 60,
          };
          j.nextAt =
            deps.now() +
            Math.max(1000, evidence.rateLimit.retryAfterSeconds! * 1000);
          j.queue.unshift(item);
          j.state = "paused";
        } else if (reply.status < 200 || reply.status >= 300)
          evidence.outcome = "unavailable";
        else if (!reply.body.length) {
          evidence.outcome = "empty_response";
          evidence.qualification = "observed";
        } else {
          const text = reply.body.toString("utf8");
          evidence.qualification = r.kind === "api" ? "observed" : "documented";
          evidence.outcome = "retrieved_scope_only";
          if (r.kind === "api") {
            ensure(
              /json/i.test(evidence.contentType),
              "UNSUPPORTED_CONTENT_TYPE",
            );
            const data = JSON.parse(text);
            evidence.structure = structure(data);
            const next =
              data?.next ??
              (typeof reply.headers.link === "string"
                ? reply.headers.link.match(/<([^>]+)>;\s*rel="?next"?/)?.[1]
                : undefined);
            if (next !== undefined && next !== null) {
              ensure(typeof next === "string", "UNSUPPORTED_PAGINATION");
              const target = new URL(next, item.url).href;
              add(
                {
                  ...item,
                  url: target,
                  page: item.page + 1,
                  relation: "pagination",
                },
                evidence,
              );
              evidence.diagnostics.push(
                "PAGINATION_OBSERVED_NOT_COMPLETE_HISTORY",
              );
            }
          } else {
            ensure(
              r.kind === "openapi" ||
                /^(text\/html|text\/markdown|text\/plain)$/.test(
                  evidence.contentType,
                ),
              "UNSUPPORTED_CONTENT_TYPE",
            );
            const parsed = interpret(text, r.kind, r.id);
            evidence.operations = parsed.operations;
            evidence.diagnostics.push(...parsed.source.diagnostics);
            evidence.structure = {
              kind: r.kind,
              specificationVersion: parsed.source.specificationVersion ?? null,
            };
            for (const link of parsed.links) {
              try {
                add(
                  {
                    ...item,
                    url: new URL(link, item.url).href,
                    depth: item.depth + 1,
                    relation: "documentation",
                  },
                  evidence,
                );
              } catch {
                evidence.diagnostics.push("UNSAFE_LINK");
              }
            }
            for (const ref of parsed.remoteReferences) {
              try {
                const u = safeUrl(ref.split("#")[0]!);
                const grant = p.requests.find(
                  (g) => g.kind === "openapi" && g.url === u.href,
                );
                if (grant)
                  add(
                    {
                      ruleId: grant.id,
                      url: u.href,
                      depth: item.depth + 1,
                      page: 1,
                      relation: "reference",
                    },
                    evidence,
                  );
                else evidence.diagnostics.push("REMOTE_REFERENCE_NOT_APPROVED");
              } catch {
                evidence.diagnostics.push("UNSAFE_REFERENCE");
              }
            }
            // References stay qualified: retrieving a referenced document is not proof
            // that every pointer or provider-specific schema semantic was resolved.
            if (r.kind === "openapi") parseSpec(text);
          }
        }
        const remaining = Number(reply.headers["x-ratelimit-remaining"]);
        if (
          reply.headers["x-ratelimit-remaining"] !== undefined &&
          Number.isSafeInteger(remaining) &&
          remaining >= 0
        ) {
          evidence.rateLimit = { ...evidence.rateLimit, remaining };
          if (remaining === 0) {
            j.state = "paused";
            j.nextAt = Math.max(j.nextAt, deps.now() + 60000);
          }
        }
      } catch (e) {
        evidence.outcome = "retrieval_incomplete";
        evidence.diagnostics.push(safeCode(e));
        if (revoked || safeCode(e) === "APPROVAL_REVOKED_OR_CHANGED") {
          j.state = "stopped";
          j.stopReason = "APPROVAL_REVOKED_OR_CHANGED";
        }
      } finally {
        clearInterval(timer);
        clearTimeout(deadline);
        delete j.inFlight;
        j.evidence.push(evidence);
        j.nextAt = Math.max(j.nextAt, deps.now() + p.budgets.intervalMs);
        await save();
      }
      if (j.state === "paused" || j.state === "stopped") break;
    }
    if (!j.queue.length && j.state !== "stopped" && j.state !== "paused")
      j.state = "complete";
    await save();
    return j;
  });
}
