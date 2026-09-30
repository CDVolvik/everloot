import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createKnowledgeServer } from "./mcp-server.js";
import type { DB } from "./db.js";

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function handleMcp(db: DB, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readBody(req);
  const server = createKnowledgeServer(db);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
}

/** Read-only MCP on loopback. ChatGPT needs the public HTTPS mount, which is a later row. */
export function startHttpBridge(db: DB, port = 8787): Promise<Server> {
  const http = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (req.method === "POST" && req.url === "/mcp") {
      handleMcp(db, req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    http.listen(port, "127.0.0.1", () => resolve(http));
  });
}
