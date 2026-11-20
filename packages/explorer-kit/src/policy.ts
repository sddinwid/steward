import ipaddr from "ipaddr.js";
import { canonical, digest } from "@steward/module-sdk";
import {
  ensure,
  defaults,
  type ExplorationPolicy,
  type RequestRule,
  type QueueItem,
} from "./contracts.js";
export const fingerprint = (v: unknown) => digest(canonical(v));
export function closed(v: any, keys: string[]) {
  ensure(
    v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.keys(v).every((k) => keys.includes(k)),
    "UNKNOWN_POLICY_FIELD",
  );
}
export function publicAddress(address: string) {
  try {
    return (
      ipaddr.parse(address).range() === "unicast" &&
      !address.includes("%") &&
      !(
        ipaddr.parse(address).kind() === "ipv6" &&
        (ipaddr.parse(address) as ipaddr.IPv6).isIPv4MappedAddress()
      )
    );
  } catch {
    return false;
  }
}
export function safeUrl(raw: string): URL {
  ensure(
    typeof raw === "string" &&
      raw.startsWith("https://") &&
      raw.length <= 2048 &&
      !/[\s\\]/.test(raw),
    "UNSAFE_URL",
  );
  const originalPath = raw.match(/^https:\/\/[^/?#]+([^?#]*)/)?.[1] ?? "";
  ensure(
    !/%(?:2f|5c|2e|25|00)/i.test(originalPath) &&
      !/(?:^|\/)\.\.(?:\/|$)/.test(originalPath),
    "UNSAFE_PATH",
  );
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw Error("Invalid URL");
  }
  ensure(
    u.protocol === "https:" && !u.username && !u.password && !u.hash,
    "UNSAFE_URL",
  );
  ensure(
    !/%(?:2f|5c|2e|25|00)/i.test(u.pathname) &&
      !/(?:^|\/)\.\.(?:\/|$)/.test(raw),
    "UNSAFE_PATH",
  );
  const h = u.hostname.replace(/^\[|\]$/g, "");
  ensure(
    !h.endsWith(".") && !h.endsWith(".localhost") && h !== "localhost",
    "NON_PUBLIC_DESTINATION",
  );
  if (ipaddr.isValid(h)) ensure(publicAddress(h), "NON_PUBLIC_DESTINATION");
  return u;
}
export const displayUrl = (raw: string) => {
  try {
    const u = safeUrl(raw);
    return u.origin + u.pathname;
  } catch {
    return "[blocked URL]";
  }
};
const id = (s: unknown) =>
  typeof s === "string" && /^[a-z][a-z0-9_-]{0,59}$/.test(s);
export function validatePolicy(value: unknown): ExplorationPolicy {
  const p = value as ExplorationPolicy;
  closed(p, [
    "version",
    "requests",
    "documentation",
    "budgets",
    "retentionDays",
    "samples",
  ]);
  ensure(
    p.version === 1 &&
      p.samples === "none" &&
      Number.isInteger(p.retentionDays) &&
      p.retentionDays >= 1 &&
      p.retentionDays <= 30,
    "INVALID_POLICY",
  );
  ensure(
    Array.isArray(p.requests) &&
      p.requests.length > 0 &&
      p.requests.length <= 25 &&
      new Set(p.requests.map((r) => r.id)).size === p.requests.length,
    "INVALID_REQUESTS",
  );
  closed(p.budgets, Object.keys(defaults));
  for (const [key, limit] of Object.entries(defaults)) {
    const n = p.budgets[key as keyof typeof defaults];
    ensure(
      Number.isInteger(n) &&
        (key === "depth" ? n >= 0 : n >= 1) &&
        (key === "intervalMs" ? n >= limit && n <= 60000 : n <= limit),
      "INVALID_BUDGET",
    );
  }
  ensure(p.budgets.concurrency === 1, "INVALID_BUDGET");
  for (const r of p.requests) {
    closed(r, [
      "id",
      "url",
      "method",
      "kind",
      "basis",
      "query",
      "paginationParameter",
      "credential",
    ]);
    ensure(
      id(r.id) &&
        ["GET", "HEAD"].includes(r.method) &&
        ["openapi", "html", "markdown", "api"].includes(r.kind) &&
        typeof r.basis === "string" &&
        r.basis.trim().length >= 20 &&
        r.basis.length <= 1000,
      "UNREVIEWED_OPERATION",
    );
    const u = safeUrl(r.url);
    ensure(
      r.query &&
        typeof r.query === "object" &&
        !Array.isArray(r.query) &&
        Object.keys(r.query).length <= 12,
      "INVALID_PARAMETERS",
    );
    for (const [k, v] of Object.entries(r.query)) {
      ensure(
        id(k) &&
          !/token|secret|password|key|auth|session/i.test(k) &&
          Array.isArray(v) &&
          v.length > 0 &&
          v.length <= 25 &&
          v.every(
            (s) =>
              typeof s === "string" && s.length <= 128 && !/[\r\n]/.test(s),
          ),
        "INVALID_PARAMETERS",
      );
    }
    for (const [k, v] of u.searchParams)
      ensure(
        r.query[k]?.includes(v) && u.searchParams.getAll(k).length === 1,
        "UNAPPROVED_PARAMETER",
      );
    if (r.paginationParameter)
      ensure(
        r.kind === "api" &&
          r.method === "GET" &&
          Object.hasOwn(r.query, r.paginationParameter),
        "INVALID_PAGINATION",
      );
    if (r.credential) {
      closed(r.credential, ["kind", "reference", "origin"]);
      ensure(
        r.credential.origin === u.origin &&
          ["env", "file"].includes(r.credential.kind) &&
          typeof r.credential.reference === "string" &&
          r.credential.reference.length <= 1024,
        "INVALID_CREDENTIAL_REFERENCE",
      );
      if (r.credential.kind === "env")
        ensure(
          /^[A-Z][A-Z0-9_]{0,99}$/.test(r.credential.reference),
          "INVALID_CREDENTIAL_REFERENCE",
        );
    }
  }
  ensure(
    Array.isArray(p.documentation) && p.documentation.length <= 8,
    "INVALID_DOCUMENTATION_SCOPE",
  );
  for (const d of p.documentation) {
    closed(d, ["origin", "pathPrefix", "basis"]);
    const u = safeUrl(d.origin);
    ensure(
      u.origin === d.origin &&
        typeof d.pathPrefix === "string" &&
        /^\/[A-Za-z0-9/_-]+\/$/.test(d.pathPrefix) &&
        d.basis?.trim().length >= 20,
      "INVALID_DOCUMENTATION_SCOPE",
    );
  }
  return structuredClone(p);
}
export function authorized(p: ExplorationPolicy, item: QueueItem): RequestRule {
  const r = p.requests.find((r) => r.id === item.ruleId);
  ensure(r, "UNAPPROVED_OPERATION");
  const u = safeUrl(item.url),
    initial = safeUrl(r.url);
  ensure(
    item.depth <= p.budgets.depth && item.page <= p.budgets.pages,
    "DEPTH_OR_PAGE_LIMIT",
  );
  if (item.relation === "documentation") {
    ensure(
      ["html", "markdown"].includes(r.kind) &&
        !r.credential &&
        u.origin === initial.origin &&
        !u.search &&
        p.documentation.some(
          (d) => d.origin === u.origin && u.pathname.startsWith(d.pathPrefix),
        ),
      "UNAPPROVED_DOCUMENTATION",
    );
  } else {
    ensure(
      u.origin === initial.origin && u.pathname === initial.pathname,
      "UNAPPROVED_DESTINATION",
    );
    for (const [k, v] of u.searchParams) {
      ensure(
        r.query[k]?.includes(v) && u.searchParams.getAll(k).length === 1,
        "UNAPPROVED_PARAMETER",
      );
      if (k !== r.paginationParameter)
        ensure(initial.searchParams.get(k) === v, "UNAPPROVED_PARAMETER");
    }
    for (const [k, v] of initial.searchParams)
      if (k !== r.paginationParameter)
        ensure(u.searchParams.get(k) === v, "UNAPPROVED_PARAMETER");
    if (item.relation === "pagination")
      ensure(r.paginationParameter, "PAGINATION_NOT_APPROVED");
  }
  return r;
}
