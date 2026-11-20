import { Resolver } from "node:dns/promises";
import { request } from "node:https";
import type { Readable } from "node:stream";
import { readFile, stat } from "node:fs/promises";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import { ensure, ExplorationError, type RequestRule } from "./contracts.js";
import { publicAddress, safeUrl } from "./policy.js";
export interface Retrieval {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}
export interface RetrievalRequest {
  url: string;
  method: "GET" | "HEAD";
  rule: RequestRule;
  limit: number;
  timeoutMs: number;
  signal: AbortSignal;
}
export type Transport = (request: RetrievalRequest) => Promise<Retrieval>;
export function pinnedLookup(
  host: string,
  addresses: { address: string; family: number }[],
) {
  ensure(
    addresses.length > 0 && addresses.every((a) => publicAddress(a.address)),
    "NON_PUBLIC_DNS",
  );
  const pinned = { ...addresses[0]! };
  return (name: string, options: any, cb: any) => {
    if (name !== host) {
      cb(new ExplorationError("DESTINATION_CHANGED"));
      return;
    }
    if (options.all) cb(null, [pinned]);
    else cb(null, pinned.address, pinned.family);
  };
}
export async function resolvePublic(host: string) {
  const resolver = new Resolver({ timeout: 1000, tries: 1 });
  const results = await Promise.allSettled([
    resolver.resolve4(host),
    resolver.resolve6(host),
  ]);
  const addresses = results.flatMap((r, i) =>
    r.status === "fulfilled"
      ? r.value.map((address) => ({ address, family: i ? 6 : 4 }))
      : [],
  );
  ensure(
    addresses.length > 0 && addresses.every((a) => publicAddress(a.address)),
    "NON_PUBLIC_DNS",
  );
  return addresses[0]!;
}
export async function credential(r: RequestRule) {
  if (!r.credential) return undefined;
  let token: string | undefined;
  if (r.credential.kind === "env") token = process.env[r.credential.reference];
  else {
    ensure(
      (await stat(r.credential.reference)).size <= 8192,
      "INVALID_CREDENTIAL",
    );
    token = await readFile(r.credential.reference, "utf8");
  }
  ensure(
    token && token.length <= 8192 && !/[\r\n\s]/.test(token),
    "INVALID_CREDENTIAL",
  );
  return token;
}
/** No redirects, no proxy environment, no connection pooling. DNS is checked once
 * and the actual socket is pinned to that checked address with normal TLS/SNI. */
export const publicTransport: Transport = async (input) => {
  const u = safeUrl(input.url);
  ensure(input.method === "GET" || input.method === "HEAD", "METHOD_FORBIDDEN");
  ensure(
    !input.rule.credential || input.rule.credential.origin === u.origin,
    "CREDENTIAL_ORIGIN_MISMATCH",
  );
  const signal = AbortSignal.any([
    input.signal,
    AbortSignal.timeout(input.timeoutMs),
  ]);
  const address = await resolvePublic(u.hostname);
  signal.throwIfAborted();
  const token = await credential(input.rule);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (code: string) => {
      if (!settled) {
        settled = true;
        reject(new ExplorationError(code));
      }
    };
    const req = request(
      u,
      {
        method: input.method,
        agent: false,
        rejectUnauthorized: true,
        servername: u.hostname,
        signal,
        lookup: pinnedLookup(u.hostname, [address]),
        headers: {
          accept:
            "application/json, text/html, text/markdown, text/plain;q=0.8",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": "Steward-Explorer/0.1 (bounded reviewed retrieval)",
          ...(token ? { authorization: "Bearer " + token } : {}),
        },
      },
      (res) => {
        void collectResponse(res, input.limit, signal).then(
          (value) => {
            if (!settled) {
              settled = true;
              resolve(value);
            }
          },
          (error) => {
            fail(
              error instanceof ExplorationError
                ? error.code
                : "MALFORMED_RESPONSE",
            );
            req.destroy();
          },
        );
      },
    );
    req.on("socket", (socket) =>
      socket.on("secureConnect", () => {
        if (
          socket.remoteAddress !== address.address &&
          socket.remoteAddress !== "::ffff:" + address.address
        ) {
          fail("DESTINATION_CHANGED");
          req.destroy();
        }
      }),
    );
    req.on("error", () =>
      fail(signal.aborted ? "REQUEST_TIMEOUT" : "RETRIEVAL_FAILED"),
    );
    req.end();
  });
};

/** Shared bounded decoder used by real HTTPS transport and isolated stream tests. */
export async function collectResponse(
  res: Readable & {
    headers: Record<string, string | string[] | undefined>;
    statusCode?: number | undefined;
  },
  limit: number,
  signal: AbortSignal,
): Promise<Retrieval> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    for (const key of [
      "content-type",
      "retry-after",
      "x-ratelimit-remaining",
      "link",
    ]) {
      const v = res.headers[key];
      if (typeof v === "string" && v.length <= 4096) headers[key] = v;
    }
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
      res.destroy();
      resolve({ status: res.statusCode, headers, body: Buffer.alloc(0) });
      return;
    }
    let settled = false,
      stream: Readable = res;
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", aborted);
      reject(new ExplorationError(code));
      res.destroy();
      if (stream !== res) stream.destroy();
    };
    const aborted = () => fail("REQUEST_TIMEOUT");
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) {
      aborted();
      return;
    }
    const encoding = res.headers["content-encoding"];
    if (encoding && encoding !== "identity") {
      if (
        typeof encoding !== "string" ||
        !["gzip", "deflate", "br"].includes(encoding)
      ) {
        fail("UNSUPPORTED_ENCODING");
        return;
      }
      stream =
        encoding === "gzip"
          ? createGunzip()
          : encoding === "deflate"
            ? createInflate()
            : createBrotliDecompress();
      res.pipe(stream as any);
    }
    let wire = 0,
      size = 0;
    const chunks: Buffer[] = [];
    res.on("data", (chunk: Buffer) => {
      wire += chunk.length;
      if (wire > limit) fail("RESPONSE_LIMIT");
    });
    res.on("error", () => fail("RESPONSE_INTERRUPTED"));
    res.on("aborted", () => fail("RESPONSE_INTERRUPTED"));
    stream.on("error", () => fail("MALFORMED_RESPONSE"));
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        fail("RESPONSE_LIMIT");
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", aborted);
      resolve({
        status: res.statusCode ?? 0,
        headers,
        body: Buffer.concat(chunks),
      });
    });
  });
}
