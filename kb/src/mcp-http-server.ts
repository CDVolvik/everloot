import { createHash, timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { DB } from "./db.js";
import { createKnowledgeServer } from "./mcp-server.js";

export interface PublicMcpConfig {
  db: DB;
  bearerToken: string;
  maxRequestBodyBytes: number;
  rateLimitPerMinute: number;
  allowedOrigins: string[];
}

export function createPublicMcpServer(config: { db: DB }) {
  const server = createKnowledgeServer(config.db);
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
    if (new URL(req.url).pathname !== "/mcp") return reply(404, "Not found");
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (!bearerOk(req.headers.get("authorization"), config.bearerToken)) {
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
