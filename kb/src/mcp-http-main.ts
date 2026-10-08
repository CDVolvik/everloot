/**
 * Public MCP HTTP server entry point (Node.js).
 * Run with: npm run serve:mcp
 * Or: node --import=tsx dist/mcp-http-main.js
 * Or: npx tsx src/mcp-http-main.ts
 */

import { createServer } from "node:http";
import { Readable } from "node:stream";
import { openPublicSnapshot } from "./public-snapshot.js";
import { createMcpHttpHandler } from "./mcp-http-server.js";
import type { PublicSnapshot } from "./public-snapshot.js";

interface EnvConfig {
  PORT: number;
  EVERLOOT_MCP_TOKEN: string;
  ALLOWED_ORIGINS: string[];
  RATE_LIMIT_PER_MINUTE: number;
  MAX_REQUEST_BODY_BYTES: number;
}

function loadEnv(): EnvConfig {
  const port = Number(process.env.PORT?.trim() ?? "8787");
  const token = process.env.EVERLOOT_MCP_TOKEN?.trim();
  const origins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [
    "https://chatgpt.com",
    "https://chat.openai.com",
    "https://claude.ai",
    "https://perplexity.ai",
  ];
  const rateLimit = Number(process.env.RATE_LIMIT_PER_MINUTE?.trim() ?? "60");
  const maxBody = Number(process.env.MAX_REQUEST_BODY_BYTES?.trim() ?? "1048576"); // 1 MB

  if (!token) {
    throw new Error("EVERLOOT_MCP_TOKEN is required");
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535 ||
    !Number.isSafeInteger(rateLimit) || rateLimit < 1 || !Number.isSafeInteger(maxBody) || maxBody < 1) {
    throw new Error("Invalid MCP port, rate limit or request body limit");
  }

  return {
    PORT: port,
    EVERLOOT_MCP_TOKEN: token,
    ALLOWED_ORIGINS: origins,
    RATE_LIMIT_PER_MINUTE: rateLimit,
    MAX_REQUEST_BODY_BYTES: maxBody,
  };
}

async function main(): Promise<void> {
  const env = loadEnv();

  // Open the public snapshot (validates manifest, hash, schema, licence)
  let snapshot: PublicSnapshot;
  try {
    const snapshotPath = process.env.KB_SNAPSHOT_PATH?.trim();
    if (!snapshotPath) throw new Error("KB_SNAPSHOT_PATH must name an explicit approved public release");
    snapshot = openPublicSnapshot(snapshotPath);
    console.error(`[mcp-http] Loaded public snapshot: ${snapshotPath}`);
  } catch (err) {
    console.error("[mcp-http] Failed to open public snapshot:", err);
    process.exit(1);
  }

  // The SQLite release contains knowledge only. Gameplay lives in R2/Supabase;
  // do not assume a gameplay table exists or mount private raw uploads here.

  // Create HTTP handler
  const handler = createMcpHttpHandler({
    db: snapshot.db,
    bearerToken: env.EVERLOOT_MCP_TOKEN,
    maxRequestBodyBytes: env.MAX_REQUEST_BODY_BYTES,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    allowedOrigins: env.ALLOWED_ORIGINS,
  });

  // Create Node HTTP server
  let inFlight = 0;
  const server = createServer(async (req, res) => {
    // Handle /health separately
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", knowledge: { createdAt: snapshot.manifest.createdAt,
        sha256: snapshot.manifest.sha256, counts: snapshot.manifest.counts },
        gameplay: "disconnected", timestamp: new Date().toISOString() }));
      return;
    }

    if (inFlight >= 32) {
      res.writeHead(503, { "Content-Type": "application/json", "Connection": "close" });
      res.end(JSON.stringify({ error: "Server busy" }), () => req.destroy());
      return;
    }
    inFlight++;
    try {
      // Authentication and quota checks precede reading this bounded stream.
      const init: RequestInit & { duplex: "half" } = {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method !== "GET" && req.method !== "HEAD" ? Readable.toWeb(req) as ReadableStream<Uint8Array> : undefined,
        duplex: "half",
      };
      const webReq = new Request(`http://localhost${req.url}`, init);

      const response = await handler(webReq);

      // Write response
      const responseBody = await response.text();
      const unread = !req.complete;
      if (unread) response.headers.set("Connection", "close");
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(responseBody, () => { if (unread) req.destroy(); });
    } catch (err) {
      console.error("[mcp-http] Request error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    } finally {
      inFlight--;
    }
  });

  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.maxConnections = 64;
  server.listen(env.PORT, () => {
    const address = server.address();
    console.error(`[mcp-http] Public MCP server listening on http://localhost:${typeof address === "object" && address ? address.port : env.PORT}`);
    console.error(`[mcp-http] Allowed origins: ${env.ALLOWED_ORIGINS.join(", ")}`);
    console.error(`[mcp-http] Rate limit: ${env.RATE_LIMIT_PER_MINUTE} req/min per service token`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.error("[mcp-http] SIGTERM received, shutting down...");
    server.close(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    console.error("[mcp-http] SIGINT received, shutting down...");
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("[mcp-http] Fatal error:", err);
  process.exit(1);
});
