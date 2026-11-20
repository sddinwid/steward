import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";
import { digest } from "@steward/module-sdk";
import {
  ensure,
  type SourceDescriptor,
  type OperationCandidate,
  type SourceKind,
} from "./contracts.js";
export interface ParsedSource {
  source: SourceDescriptor;
  operations: OperationCandidate[];
  links: string[];
  remoteReferences: string[];
}
const safeName = (s: string) =>
  /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(s) &&
  !/secret|password|token|authorization|cookie|email|phone|address/i.test(s);
export function structure(v: any, depth = 0): unknown {
  if (depth > 5) return "depth-limited";
  if (v === null) return "null";
  if (Array.isArray(v))
    return {
      type: "array",
      sampledItems: Math.min(v.length, 3),
      items: v.slice(0, 3).map((x) => structure(x, depth + 1)),
    };
  if (typeof v === "object")
    return {
      type: "object",
      fields: Object.fromEntries(
        Object.entries(v)
          .slice(0, 50)
          .map(([k, x], i) => [
            safeName(k) ? k : "redacted_field_" + i,
            structure(x, depth + 1),
          ]),
      ),
    };
  return typeof v;
}
export function parseSpec(raw: string): any {
  ensure(Buffer.byteLength(raw) <= 1048576, "SOURCE_LIMIT");
  const doc = parseDocument(raw, {
    schema: "core",
    uniqueKeys: true,
    strict: true,
  });
  ensure(!doc.errors.length && !doc.warnings.length, "INVALID_SPECIFICATION");
  // JSON schema YAML has no executable tags; reject aliases entirely, even bounded ones.
  ensure(
    !/(?:^|\s)[&*][A-Za-z0-9_-]+|!!|!<|__proto__|\bconstructor\s*:|\bprototype\s*:/.test(
      raw,
    ),
    "UNSAFE_SPECIFICATION",
  );
  const value = doc.toJS({ maxAliasCount: 0 });
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    "INVALID_SPECIFICATION",
  );
  const pending: [any, number][] = [[value, 0]];
  let count = 0;
  while (pending.length) {
    const [v, depth] = pending.pop()!;
    ensure(depth <= 32 && ++count <= 20000, "SPECIFICATION_COMPLEXITY");
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        ensure(
          !["__proto__", "constructor", "prototype"].includes(k),
          "UNSAFE_SPECIFICATION",
        );
        pending.push([x, depth + 1]);
      }
  }
  return value;
}
export function linksFrom(raw: string, kind: SourceKind) {
  if (kind === "html")
    raw = raw.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const matches =
    kind === "html"
      ? [...raw.matchAll(/\bhref\s*=\s*["']([^"']{1,2048})["']/gi)].map(
          (m) => m[1]!,
        )
      : [...raw.matchAll(/\]\(([^\s)]{1,2048})(?:\s[^)]*)?\)/g)].map(
          (m) => m[1]!,
        );
  return [...new Set(matches)].slice(0, 100);
}
export function interpret(
  raw: string,
  kind: SourceKind,
  id: string,
): ParsedSource {
  ensure(Buffer.byteLength(raw) <= 1048576, "SOURCE_LIMIT");
  const source: SourceDescriptor = {
    version: 1,
    id,
    kind,
    fingerprint: digest(raw),
    diagnostics: [],
  };
  if (kind !== "openapi")
    return {
      source,
      operations: [],
      links: linksFrom(raw, kind),
      remoteReferences: [],
    };
  const spec = parseSpec(raw);
  ensure(
    typeof spec.openapi === "string" && /^3\.(0|1)\.\d+$/.test(spec.openapi),
    "UNSUPPORTED_SPECIFICATION_VERSION",
  );
  source.specificationVersion = spec.openapi;
  const remoteReferences: string[] = [];
  let nodes = 0;
  function inspect(v: any, depth = 0) {
    ensure(depth <= 32 && ++nodes <= 20000, "SPECIFICATION_COMPLEXITY");
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (k === "$ref" && typeof x === "string" && /^https?:/.test(x)) {
        remoteReferences.push(x);
        source.diagnostics.push("REMOTE_REFERENCE_REQUIRES_APPROVED_RETRIEVAL");
      }
      if (
        [
          "callbacks",
          "webhooks",
          "links",
          "$dynamicRef",
          "externalValue",
          "discriminator",
        ].includes(k)
      )
        source.diagnostics.push("UNSUPPORTED_FEATURE_" + k);
      inspect(x, depth + 1);
    }
  }
  inspect(spec);
  const operations: OperationCandidate[] = [];
  for (const [route, item] of Object.entries(spec.paths ?? {})) {
    if (!/^\/[A-Za-z0-9_./{}-]{0,300}$/.test(route) || route.includes("..")) {
      source.diagnostics.push("UNSUPPORTED_PATH");
      continue;
    }
    if (!item || typeof item !== "object") continue;
    for (const [method, op] of Object.entries(item))
      if (
        [
          "get",
          "head",
          "post",
          "put",
          "patch",
          "delete",
          "options",
          "trace",
        ].includes(method) &&
        op &&
        typeof op === "object"
      ) {
        const parameters = [
          ...((item as any).parameters ?? []),
          ...((op as any).parameters ?? []),
        ];
        ensure(
          Array.isArray(parameters) && parameters.length <= 100,
          "INVALID_PARAMETERS",
        );
        const diagnostics = [
          "SAFETY_REQUIRES_OPERATOR_REVIEW",
          "RESPONSE_MAPPING_UNVERIFIED",
        ];
        if (!["get", "head"].includes(method))
          diagnostics.push("METHOD_NOT_EXECUTABLE");
        if (parameters.some((p) => p?.in !== "query" && p?.in !== "path"))
          diagnostics.push("UNSUPPORTED_PARAMETER_LOCATION");
        operations.push({
          id: "op_" + digest(method + route).slice(0, 12),
          method: method.toUpperCase(),
          path: route,
          status: "review_required",
          parameters: parameters
            .filter((p) => typeof p?.name === "string" && safeName(p.name))
            .map((p) => p.name),
          diagnostics,
          sourceId: id,
        });
      }
  }
  ensure(operations.length <= 200, "OPERATION_LIMIT");
  source.diagnostics = [...new Set(source.diagnostics)];
  return {
    source,
    operations,
    links: [],
    remoteReferences: [...new Set(remoteReferences)].slice(0, 25),
  };
}
/** Local references never perform network IO. Realpath confines symlinks as well. */
export async function importLocal(
  root: string,
  file: string,
  kind: SourceKind,
): Promise<ParsedSource> {
  root = await realpath(root);
  let total = 0;
  const active = new Set<string>(),
    cache = new Map<string, any>(),
    diagnostics: string[] = [],
    references: { id: string; fingerprint: string }[] = [];
  async function load(name: string, pointer = "", depth = 0): Promise<any> {
    ensure(depth <= 16, "REFERENCE_DEPTH");
    const resolved = await realpath(path.resolve(root, name)),
      rel = path.relative(root, resolved);
    ensure(
      !rel.startsWith("..") && !path.isAbsolute(rel),
      "REFERENCE_OUTSIDE_WORKSPACE",
    );
    const key = resolved + "#" + pointer;
    ensure(!active.has(key), "REFERENCE_CYCLE");
    active.add(key);
    try {
      let obj = cache.get(resolved);
      if (!obj) {
        const bytes = (await stat(resolved)).size;
        ensure(
          bytes <= 1048576 && (total += bytes) <= 10485760,
          "SOURCE_LIMIT",
        );
        const text = await readFile(resolved, "utf8");
        obj = parseSpec(text);
        references.push({
          id: "ref_" + digest(rel).slice(0, 16),
          fingerprint: digest(text),
        });
        cache.set(resolved, obj);
      }
      let target = obj;
      if (pointer) {
        ensure(pointer.startsWith("/"), "UNSUPPORTED_REFERENCE_ANCHOR");
        for (const part of pointer.slice(1).split("/")) {
          const decoded = part.replaceAll("~1", "/").replaceAll("~0", "~");
          ensure(
            !["__proto__", "constructor", "prototype"].includes(decoded) &&
              target &&
              Object.hasOwn(target, decoded),
            "INVALID_REFERENCE",
          );
          target = target[decoded];
        }
      }
      async function walk(v: any, d: number): Promise<any> {
        ensure(d <= 32, "REFERENCE_DEPTH");
        if (Array.isArray(v)) {
          const out = [];
          for (const x of v) out.push(await walk(x, d + 1));
          return out;
        }
        if (v && typeof v === "object") {
          if (typeof v.$ref === "string") {
            if (/^https?:/.test(v.$ref)) {
              diagnostics.push("REMOTE_REFERENCE_REQUIRES_APPROVED_RETRIEVAL");
              return v;
            }
            ensure(
              !v.$ref.includes("\\") && !/^[a-z]+:/i.test(v.$ref),
              "UNSAFE_REFERENCE",
            );
            const [f, p = ""] = v.$ref.split("#");
            const next = await load(
              f
                ? path.relative(
                    root,
                    path.resolve(path.dirname(resolved), decodeURIComponent(f)),
                  )
                : rel,
              decodeURIComponent(p),
              depth + 1,
            );
            return {
              ...next,
              ...Object.fromEntries(
                Object.entries(v).filter(([k]) => k !== "$ref"),
              ),
            };
          }
          const entries = [];
          for (const [k, x] of Object.entries(v))
            entries.push([k, await walk(x, d + 1)]);
          return Object.fromEntries(entries);
        }
        return v;
      }
      return await walk(target, 0);
    } finally {
      active.delete(key);
    }
  }
  const actual = await realpath(path.resolve(root, file));
  ensure(
    !path.relative(root, actual).startsWith(".."),
    "REFERENCE_OUTSIDE_WORKSPACE",
  );
  ensure((await stat(actual)).size <= 1048576, "SOURCE_LIMIT");
  const original = await readFile(actual, "utf8");
  const raw = kind === "openapi" ? JSON.stringify(await load(file)) : original;
  const result = interpret(
    raw,
    kind,
    "source_" + digest(original).slice(0, 16),
  );
  result.source.fingerprint = digest(original);
  result.source.references = references;
  result.source.diagnostics.push(...diagnostics);
  // Imported navigation hints are not retained with query credentials or fragments.
  const hint = (s: string) =>
    /^(?:https:\/\/[^/@?#\s]+)?\/[A-Za-z0-9/_.-]*$/.test(s)
      ? s
      : "[link requires review]";
  result.links = result.links.map(hint);
  result.remoteReferences = result.remoteReferences.map(hint);
  return result;
}
