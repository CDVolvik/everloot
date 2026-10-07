/**
 * Public MCP HTTP server entry point (Node.js).
 * Run with: npm run serve:mcp
 * Or: node --import=tsx dist/mcp-http-main.js
 * Or: npx tsx src/mcp-http-main.ts
 */

import { createServer } from "node:http";
import { openPublicSnapshot } from "./public-snapshot.js";
import { createMcpHttpHandler } from "./mcp-http-server.js";
import { loadPublicRollups } from "./public-rollups.js";
import type { PublicSnapshot } from "./public-snapshot.js";

interface EnvConfig {
  PORT: number;
  EVERLOOT_MCP_TOKEN: string;
  ALLOWED_ORIGINS: string[];
  RATE_LIMIT_PER_MINUTE: number;
  MAX_REQUEST_BODY_BYTES: number;
}

function loadEnv(): EnvConfig {
  const port = parseInt(process.env.PORT?.trim() ?? "8787", 10);
  const token = process.env.EVERLOOT_MCP_TOKEN?.trim();
  const origins = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [
    "https://chatgpt.com",
    "https://chat.openai.com",
    "https://claude.ai",
    "https://perplexity.ai",
  ];
  const rateLimit = parseInt(process.env.RATE_LIMIT_PER_MINUTE?.trim() ?? "60", 10);
  const maxBody = parseInt(process.env.MAX_REQUEST_BODY_BYTES?.trim() ?? "1048576", 10); // 1 MB

  if (!token) {
    throw new Error("EVERLOOT_MCP_TOKEN is required");
  }

  return {
    PORT: port,
    EVERLOOT_MCP_TOKEN: token,
    ALLOWED_ORIGINS: origins,
    RATE_LIMIT_PER_MINUTE: rateLimit,
    MAX_REQUEST_BODY_BYTES: maxBody,
  };
}

function readBody(req: any, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("BODY_TOO_LARGE"));
        return;
      }
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function main(): Promise<void> {
  const env = loadEnv();

  // Open the public snapshot (validates manifest, hash, schema, licence)
  let snapshot: PublicSnapshot;
  try {
    const snapshotPath = process.env.KB_SNAPSHOT_PATH ?? "./data/release/everloot-public.sqlite";
    snapshot = openPublicSnapshot(snapshotPath);
    console.error(`[mcp-http] Loaded public snapshot: ${snapshotPath}`);
  } catch (err) {
    console.error("[mcp-http] Failed to open public snapshot:", err);
    process.exit(1);
  }

  // Load public rollups from snapshot
  loadPublicRollups(snapshot.db);
  console.error("[mcp-http] Public rollups loaded");

  // Create HTTP handler
  const handler = createMcpHttpHandler({
    db: snapshot.db,
    bearerToken: env.EVERLOOT_MCP_TOKEN,
    maxRequestBodyBytes: env.MAX_REQUEST_BODY_BYTES,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    allowedOrigins: env.ALLOWED_ORIGINS,
  });

  // Create Node HTTP server
  const server = createServer(async (req, res) => {
    // Handle /health separately
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }));
      return;
    }

    // Body size check
    const contentLength = req.headers["content-length"];
    if (contentLength && parseInt(contentLength, 10) > env.MAX_REQUEST_BODY_BYTES) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request body too large" }));
      return;
    }

    try {
      const body = await readBody(req, env.MAX_REQUEST_BODY_BYTES);
      
      // Convert Node req to Web Request
      const webReq = new Request(`http://localhost${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
      });

      const response = await handler(webReq);

      // Write response
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      const responseBody = await response.text();
      res.end(responseBody);
    } catch (err) {
      if ((err as Error).message === "BODY_TOO_LARGE") {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Request body too large" }));
        return;
      }
      console.error("[mcp-http] Request error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  server.listen(env.PORT, () => {
    console.error(`[mcp-http] Public MCP server listening on http://localhost:${env.PORT}`);
    console.error(`[mcp-http] Allowed origins: ${env.ALLOWED_ORIGINS.join(", ")}`);
    console.error(`[mcp-http] Rate limit: ${env.RATE_LIMIT_PER_MINUTE} req/min per token+IP`);
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