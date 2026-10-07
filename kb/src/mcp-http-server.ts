import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { DB } from "./db.js";
import { createKnowledgeServer, SERVER_NAME, SERVER_VERSION } from "./mcp-server.js";
import { search, getEntity, getByName, type SearchHit } from "./search.js";

const KINDS = ["item", "npc", "quest", "zone", "spell", "lore_page", "creator", "realm"] as const;
const VERSIONS = ["forever", "classic", "retail", "lore"] as const;

const searchArgsSchema = z.object({
  query: z.string().describe("What to look up: names, questions, keywords. Question words are ignored."),
  kind: z.enum(KINDS).optional().describe("Narrow to one record kind."),
  version: z.enum(VERSIONS).optional().describe("Narrow to one game version."),
  limit: z.number().int().min(1).max(25).default(8),
});

const searchArgs = searchArgsSchema.shape;

function formatHit(h: SearchHit): string {
  return `[${h.kind}/${h.gameVersion}] ${h.name}\n${h.snippet}\nSource: ${h.sourceUrl} (${h.licence}, retrieved ${h.retrievedAt})`;
}

export function handleSearch(db: DB, args: z.infer<typeof searchArgsSchema>): string {
  const hits = search(db, args.query, args.limit, {
    kinds: args.kind ? [args.kind] : undefined,
    versions: args.version ? [args.version] : undefined,
  });
  if (hits.length === 0) return "No matches. Try fewer or different words.";
  return hits.map(formatHit).join("\n\n");
}

export function handleGetEntity(db: DB, args: { id: number }): string {
  const hit = getEntity(db, args.id);
  return hit ? formatHit(hit) : `No record with id ${args.id}.`;
}

export function handleGetByName(db: DB, args: { name: string; kind?: (typeof KINDS)[number] }): string {
  const hits = getByName(db, args.name, args.kind);
  if (hits.length === 0) return `No record named exactly "${args.name}". Try search_knowledge for close matches.`;
  return hits.map(formatHit).join("\n\n");
}

export interface PublicMcpConfig {
  db: DB;
  bearerToken: string;
  maxRequestBodyBytes: number;
  rateLimitPerMinute: number;
  allowedOrigins: string[];
}

const UPLOADS_UNSET = "Uploads are not connected. This is the public MCP server; gameplay data requires a private connection.";

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const window = (rateLimitMap.get(key) ?? []).filter((t) => now - t < 60_000);
  if (window.length >= limit) return false;
  window.push(now);
  rateLimitMap.set(key, window);
  return true;
}

function makeSearchHandler(db: DB) {
  return (args: z.infer<typeof searchArgsSchema>) => ({ 
    content: [{ type: "text" as const, text: handleSearch(db, args) }] 
  });
}

function makeGetEntityHandler(db: DB) {
  return (args: { id: number }) => ({ 
    content: [{ type: "text" as const, text: handleGetEntity(db, args) }] 
  });
}

function makeGetByNameHandler(db: DB) {
  return (args: { name: string; kind?: (typeof KINDS)[number] }) => ({ 
    content: [{ type: "text" as const, text: handleGetByName(db, args) }] 
  });
}

function makeGameplayHandler() {
  return () => ({ content: [{ type: "text" as const, text: UPLOADS_UNSET }] });
}

function makePlanHandler() {
  return () => {
    const { handlePlan } = require("./bridge-plan.js");
    return { content: [{ type: "text" as const, text: handlePlan() }] };
  };
}

export function createPublicMcpServer(config: { db: DB }): {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
} {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  
  server.registerTool(
    "search_knowledge",
    {
      title: "Search the Everloot knowledge base",
      description: "Search WoW lore and Forever reference data. Exact-name matches rank first. Every hit carries its source and licence.",
      inputSchema: searchArgs,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    makeSearchHandler(config.db),
  );
  server.registerTool(
    "get_entity",
    {
      title: "Get one knowledge record by id",
      description: "Fetch the full record behind a search hit id, for page rendering.",
      inputSchema: { id: z.number().int().describe("Record id from a search_knowledge hit.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    makeGetEntityHandler(config.db),
  );
  server.registerTool(
    "get_by_name",
    {
      title: "Get records by exact name",
      description: "Exact full-name match (case-insensitive) for disambiguation. Use search_knowledge for fuzzy matches.",
      inputSchema: {
        name: z.string().describe("Full record name."),
        kind: z.enum(KINDS).optional().describe("Narrow to one record kind."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    makeGetByNameHandler(config.db),
  );
  
  const UPLOADS_UNSET = "Uploads are not connected. This is the public MCP server; gameplay data requires a private connection.";
  
  const gameplayTools = [
    "profession_path", "item_page", "npc_page", "quest_page", "vendor_page",
    "collection_gap", "guild_board", "auction_history", "gold_ledger"
  ] as const;
  
  for (const toolName of gameplayTools) {
    server.registerTool(
      toolName,
      {
        title: toolName.replace(/_/g, " "),
        description: UPLOADS_UNSET,
        inputSchema: z.object({}).optional(),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      () => ({ content: [{ type: "text", text: UPLOADS_UNSET }] }),
    );
  }
  
  server.registerTool(
    "everloot_plan",
    {
      title: "Everloot implementation tracker",
      description: "The full Everloot build list: what is live, what is next, what is waiting on Carlos, and which reference sites are page shapes only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => {
      const { handlePlan } = require("./bridge-plan.js");
      return { content: [{ type: "text", text: handlePlan() }] };
    },
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
  });

  return { server, transport };
}

export function createMcpHttpHandler(config: {
  db: DB;
  bearerToken: string;
  maxRequestBodyBytes: number;
  rateLimitPerMinute: number;
  allowedOrigins: string[];
}) {
  const { server, transport } = createPublicMcpServer({ db: config.db });
  const { rateLimitMap, checkRateLimit } = createRateLimiter();
  
  return async function handleRequest(req: Request): Promise<Response> {
    // CORS
    const origin = req.headers.get("origin");
    if (origin && config.allowedOrigins.includes(origin)) {
      const corsHeaders = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
        "Access-Control-Max-Age": "86400",
      };
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
    }
    
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "WWW-Authenticate": "Bearer" },
      });
    }
    const token = authHeader.slice(7);
    if (token !== config.bearerToken) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Rate limit
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rateKey = `${token}:${clientIp}`;
    if (!checkRateLimit(rateKey, config.rateLimitPerMinute)) {
      return new Response(JSON.stringify({ error: "Rate limited" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "60" },
      });
    }
    
    // Body size limit
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > config.maxRequestBodyBytes) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }
    
    // Delegate to MCP transport
    try {
      const response = await transport.handleRequest(req);
      const origin = req.headers.get("origin");
      if (origin && config.allowedOrigins.includes(origin)) {
        response.headers.set("Access-Control-Allow-Origin", origin);
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }
      return response;
    } catch (err) {
      console.error("MCP request error:", err);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

function createRateLimiter() {
  const rateLimitMap = new Map<string, number[]>();
  
  function checkRateLimit(key: string, limit: number): boolean {
    const now = Date.now();
    const window = (rateLimitMap.get(key) ?? []).filter((t) => now - t < 60_000);
    if (window.length >= limit) return false;
    window.push(now);
    rateLimitMap.set(key, window);
    return true;
  }
  
  return { rateLimitMap, checkRateLimit };
}