import { createHash, timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { DB } from "./db.js";
import { createKnowledgeServer, type ChangesLoader, type CompletionLoader, type CorpusLoader, type EcosystemLoader, type MarketLoader } from "./mcp-server.js";
import type { CensusLoader } from "./population.js";

export interface PublicMcpConfig {
  db: DB;
  /** Null means a public, read-only mount: no bearer, rate-limited by the caller before this handler. */
  bearerToken: string | null;
  /** The path this mount answers; anything else is 404. */
  path?: string;
  maxRequestBodyBytes: number;
  rateLimitPerMinute: number;
  allowedOrigins: string[];
  /** The web route's in-process reader; the standalone server reads the public corpus URL instead. */
  corpus?: CorpusLoader;
  /** The web route's market rollup reader; without it market_value says it is not connected. */
  market?: MarketLoader;
  /** The web route's completion rollup reader, owned progress already limited to granted installs. */
  completion?: CompletionLoader;
  /** The merged changes timeline, when the host has one. */
  changes?: ChangesLoader;
  /** The ecosystem tracker's view with install counts joined, when the host has one. */
  ecosystem?: EcosystemLoader;
  /** The web route's census rollup reader, aggregate only; without it population says it is not connected. */
  census?: CensusLoader;
}

export function createPublicMcpServer(config: { db: DB; corpus?: CorpusLoader; market?: MarketLoader; completion?: CompletionLoader; changes?: ChangesLoader; ecosystem?: EcosystemLoader; census?: CensusLoader }) {
  const server = createKnowledgeServer(config.db, { corpus: config.corpus, market: config.market, completion: config.completion, changes: config.changes, ecosystem: config.ecosystem, census: config.census });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true,
  });
  return { server, transport };
}

function bearerOk(header: string | null, token: string): boolean {
  const presented = header?.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && presented.length > 0 && timingSafeEqual(
    createHash("sha256").update(presented).digest(),
    createHash("sha256").update(token).digest(),
  );
}

export function createMcpHttpHandler(config: PublicMcpConfig) {
  let hits: number[] = [];
  return async function handleRequest(req: Request): Promise<Response> {
    const origin = req.headers.get("origin");
    const headers = new Headers({ "Vary": "Origin", "Cache-Control": "no-store" });
    const reply = (status: number, error: string) => Response.json({ error }, { status, headers });
    if (origin && !config.allowedOrigins.includes(origin)) return reply(403, "Invalid origin");
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id");
    if (new URL(req.url).pathname !== (config.path ?? "/mcp")) return reply(404, "Not found");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (config.bearerToken !== null && !bearerOk(req.headers.get("authorization"), config.bearerToken)) {
      headers.set("WWW-Authenticate", "Bearer");
      return reply(401, "Unauthorized");
    }
    if (req.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      return reply(405, "Method not allowed");
    }
    // The shared token's quota cannot be reset by spoofing a forwarding header.
    const now = Date.now();
    hits = hits.filter((time) => now - time < 60_000);
    if (hits.length >= config.rateLimitPerMinute) {
      headers.set("Retry-After", "60");
      return reply(429, "Rate limited");
    }
    hits.push(now);
    if (Number(req.headers.get("content-length")) > config.maxRequestBodyBytes) return reply(413, "Request body too large");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const reader = req.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > config.maxRequestBodyBytes) { await reader.cancel(); return reply(413, "Request body too large"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const { server, transport } = createPublicMcpServer(config);
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(new Request(req.url, { method: "POST", headers: req.headers, body }));
      headers.forEach((value, key) => response.headers.set(key, value));
      return response;
    } catch {
      return reply(500, "Internal server error");
    } finally {
      await server.close();
    }
  };
}
