import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { DB } from "./db.js";
import { createKnowledgeServer, SERVER_NAME, SERVER_VERSION, UPLOADS_UNSET, fromUploads } from "./mcp-server.js";
import { loadUploadRecords } from "./load-uploads.js";
import { handlePlan } from "./bridge-plan.js";
import { itemFactsFromRecords } from "./drop-rollup.js";
import { handleItemPage } from "./item-page.js";
import { collectionFactsFromRecords, handleCollectionGap } from "./collection-gap.js";
import { goldFactsFromRecords, handleGoldLedger } from "./gold-ledger.js";
import { guildFactsFromRecords, handleGuildBoard } from "./guild-board.js";
import { auctionSightingsFromRecords, handleAuctionHistory } from "./auction-history.js";
import { professionFactsFromRecords, handleProfessionPath } from "./profession-path.js";
import { handleNpcPage, handleQuestPage, handleVendorPage, worldFactsFromRecords } from "./world-pages.js";
import { getByName, getEntity, search, type SearchHit } from "./search.js";

const KINDS = ["item", "npc", "quest", "zone", "spell", "lore_page", "creator", "realm"] as const;
const VERSIONS = ["forever", "classic", "retail", "lore"] as const;

const searchArgs = {
  query: z.string().describe("What to look up: names, questions, keywords. Question words are ignored."),
  kind: z.enum(KINDS).optional().describe("Narrow to one record kind."),
  version: z.enum(VERSIONS).optional().describe("Narrow to one game version."),
  limit: z.number().int().min(1).max(25).default(8),
};

function formatHit(h: SearchHit): string {
  return `[${h.kind}/${h.gameVersion}] ${h.name}\n${h.snippet}\nSource: ${h.sourceUrl} (${h.licence}, retrieved ${h.retrievedAt})`;
}

/** Pure handlers — tested directly; the MCP registration below is a thin wrapper. */
export function handleSearch(db: DB, args: z.infer<typeof searchArgs>): string {
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

/** In-memory rate limiter (per token/IP). */
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const window = (rateLimitMap.get(key) ?? []).filter((t) => now - t < 60_000);
  if (window.length >= limit) return false;
  window.push(now);
  rateLimitMap.set(key, window);
  return true;
}

/** Create an HTTP MCP server with auth, rate limiting, and body size limits. */
export function createPublicMcpServer(config: PublicMcpConfig): {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
} {
  const server = createKnowledgeServer(config.db);
  
  // Override the fromUploads function to use sanitized public gameplay views
  // This replaces the internal `fromUploads` which reads raw EVERLOOT_UPLOADS directory
  // The public server should only expose verified public facts
  
  // We need to re-register tools with sanitized handlers
  // Since createKnowledgeServer registers tools internally, we'll create a fresh server
  // with the same knowledge tools but sanitized gameplay tools
  
  const publicServer = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  
  // Knowledge tools (unchanged - read from filtered KB snapshot)
  publicServer.registerTool(
    "search_knowledge",
    {
      title: "Search the Everloot knowledge base",
      description: "Search WoW lore and Forever reference data. Exact-name matches rank first. Every hit carries its source and licence.",
      inputSchema: searchArgs,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleSearch(config.db, args) }] }),
  );
  publicServer.registerTool(
    "get_entity",
    {
      title: "Get one knowledge record by id",
      description: "Fetch the full record behind a search hit id, for page rendering.",
      inputSchema: { id: z.number().int().describe("Record id from a search_knowledge hit.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleGetEntity(config.db, args) }] }),
  );
  publicServer.registerTool(
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
    (args) => ({ content: [{ type: "text" as const, text: handleGetByName(config.db, args) }] }),
  );
  
  // Gameplay tools — SANITIZED: only expose public facts after corroboration/opt-out
  // These use the public snapshot's pre-computed rollups, not raw uploads
  
  // Import public rollup handlers (to be created)
  const { 
    getPublicItemFacts, 
    getPublicNpcFacts, 
    getPublicQuestFacts, 
    getPublicVendorFacts,
    getPublicProfessionFacts,
    getPublicCollectionFacts,
    getPublicGuildFacts,
    getPublicAuctionFacts,
    getPublicGoldFacts,
  } = require("./public-rollups.js");
  
  publicServer.registerTool(
    "profession_path",
    {
      title: "Profession leveling path",
      description: "Leveling path for one Forever profession from Everloot uploads. A step exists only after 3 installs agree. Gold exists only after 3 price uploads agree.",
      inputSchema: {
        profession: z.string().describe("Profession name, such as Alchemy."),
        fromSkill: z.number().int().min(1).max(500).default(1),
        toSkill: z.number().int().min(1).max(500),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => {
      const facts = getPublicProfessionFacts();
      return { content: [{ type: "text" as const, text: handleProfessionPath(args, facts.sightings, facts.prices) }] });
    },
  );
  
  publicServer.registerTool(
    "item_page",
    {
      title: "Item page for a drop",
      description: "One Forever item: agreed name, public drop rate with kill count, and an agreed map pin. A rate is public after 3 installs kill the source.",
      inputSchema: { itemId: z.number().int().positive().describe("Item id from a drop row.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleItemPage(args, getPublicItemFacts(args.itemId)) }] }),
  );
  
  publicServer.registerTool(
    "npc_page",
    {
      title: "NPC page",
      description: "One Forever NPC: agreed name and map pins. A name or pin needs 3 installs agreeing.",
      inputSchema: { npcId: z.number().int().positive().describe("NPC id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleNpcPage(args, getPublicNpcFacts(args.npcId)) }] }),
  );
  
  publicServer.registerTool(
    "quest_page",
    {
      title: "Quest page",
      description: "One Forever quest: agreed title, level, giver, turn-in, and rewards. Each fact needs 3 installs agreeing.",
      inputSchema: { questId: z.number().int().positive().describe("Quest id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleQuestPage(args, getPublicQuestFacts(args.questId)) }] }),
  );
  
  publicServer.registerTool(
    "vendor_page",
    {
      title: "Vendor page",
      description: "Goods one Forever vendor sells. An item is listed when 3 installs agree on that item and its copper price.",
      inputSchema: { vendorNpcId: z.number().int().positive().describe("Vendor NPC id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleVendorPage(args, getPublicVendorFacts(args.vendorNpcId)) }] }),
  );
  
  publicServer.registerTool(
    "collection_gap",
    {
      title: "Owned versus missing in a collection",
      description: "Missing items in one collection for one install. A list row is public after 3 installs agree.",
      inputSchema: {
        collection: z.string().describe("Collection name, such as Mounts."),
        ownerInstallId: z.string().describe("Install id whose owned upload to compare."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleCollectionGap(args, getPublicCollectionFacts(args.collection)) }] }),
  );
  
  publicServer.registerTool(
    "guild_board",
    {
      title: "Officer guild board",
      description: "Roster, bosses, loot, attendance, and average item level from officer uploads. A figure is public after 2 uploads agree.",
      inputSchema: {
        guildName: z.string().describe("Guild name."),
        realm: z.string().describe("Realm name."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleGuildBoard(args, getPublicGuildFacts(args.guildName, args.realm)) }] }),
  );
  
  publicServer.registerTool(
    "auction_history",
    {
      title: "Auction history for one item",
      description: "Price history from auction scans players uploaded on purpose. A day is public after 3 installs scanned that item on that realm.",
      inputSchema: {
        realm: z.string().describe("Realm name."),
        itemId: z.number().int().positive().describe("Item id."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleAuctionHistory(args, getPublicAuctionFacts(args.realm, args.itemId)) }] }),
  );
  
  publicServer.registerTool(
    "gold_ledger",
    {
      title: "Gold ledger for one character",
      description: "Peak gold and the money events that character's own upload recorded. Installs are not merged.",
      inputSchema: {
        character: z.string().describe("Character name."),
        realm: z.string().describe("Realm name."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleGoldLedger(args, getPublicGoldFacts(args.character, args.realm)) }] }),
  );
  
  publicServer.registerTool(
    "everloot_plan",
    {
      title: "Everloot implementation tracker",
      description: "The full Everloot build list: what is live, what is next, what is waiting on Carlos, and which reference sites are page shapes only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => ({ content: [{ type: "text" as const, text: handlePlan() }] }),
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
  });

  return { server: publicServer, transport };
}

/** Create the HTTP request handler with auth, rate limiting, and body size limits. */
export function createMcpHttpHandler(config: PublicMcpConfig) {
  const { server, transport } = createPublicMcpServer(config);
  
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
      // Add CORS headers to response
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