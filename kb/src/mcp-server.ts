import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { auctionSightingsFromRecords, handleAuctionHistory } from "./auction-history.js";
import { handlePlan } from "./bridge-plan.js";
import { collectionFactsFromRecords, handleCollectionGap } from "./collection-gap.js";
import { guildFactsFromRecords, handleGuildBoard } from "./guild-board.js";
import { itemFactsFromRecords } from "./drop-rollup.js";
import { handleItemPage } from "./item-page.js";
import { loadUploadRecords } from "./load-uploads.js";
import { handleProfessionPath, professionFactsFromRecords } from "./profession-path.js";
import { handleNpcPage, handleQuestPage, handleVendorPage, worldFactsFromRecords } from "./world-pages.js";
import { openDb, type DB } from "./db.js";
import { getByName, getEntity, search, type SearchHit } from "./search.js";

export const SERVER_NAME = "everloot-knowledge";
export const SERVER_VERSION = "0.7.1";

export const UPLOADS_UNSET =
  "Uploads are not connected. EVERLOOT_UPLOADS is unset, so this is not a measured zero.";

/** Product tools read the upload directory. An unset directory is not an empty corpus. */
export function fromUploads(render: (records: unknown[]) => string): string {
  const dir = process.env.EVERLOOT_UPLOADS?.trim();
  if (!dir) return UPLOADS_UNSET;
  return render(loadUploadRecords(dir));
}

const KINDS = ["item", "npc", "quest", "zone", "spell", "lore_page", "creator", "realm"] as const;
const VERSIONS = ["forever", "classic", "retail", "lore"] as const;

const searchArgs = {
  query: z.string().describe("What to look up: names, questions, keywords. Question words are ignored."),
  kind: z.enum(KINDS).optional().describe("Narrow to one record kind."),
  version: z.enum(VERSIONS).optional().describe("Narrow to one game version."),
  limit: z.number().int().min(1).max(25).default(8),
};
type SearchArgs = z.infer<z.ZodObject<typeof searchArgs>>;

function formatHit(h: SearchHit): string {
  return `[${h.kind}/${h.gameVersion}] ${h.name}\n${h.snippet}\nSource: ${h.sourceUrl} (${h.licence}, retrieved ${h.retrievedAt})`;
}

/** Pure handlers — tested directly; the MCP registration below is a thin wrapper. */
export function handleSearch(db: DB, args: SearchArgs): string {
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

export function createKnowledgeServer(db: DB): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  server.registerTool(
    "search_knowledge",
    {
      title: "Search the Everloot knowledge base",
      description:
        "Search WoW lore and Forever reference data. Exact-name matches rank first. Every hit carries its source and licence.",
      inputSchema: searchArgs,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleSearch(db, args) }] }),
  );
  server.registerTool(
    "get_entity",
    {
      title: "Get one knowledge record by id",
      description: "Fetch the full record behind a search hit id, for page rendering.",
      inputSchema: { id: z.number().int().describe("Record id from a search_knowledge hit.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleGetEntity(db, args) }] }),
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
    (args) => ({ content: [{ type: "text" as const, text: handleGetByName(db, args) }] }),
  );
  server.registerTool(
    "profession_path",
    {
      title: "Profession leveling path",
      description:
        "Leveling path for one Forever profession from Everloot uploads. A step exists only after 3 installs agree. Gold exists only after 3 price uploads agree. No copied guide. Reads EVERLOOT_UPLOADS when that directory is set. If EVERLOOT_UPLOADS is unset, the answer says uploads are not connected.",
      inputSchema: {
        profession: z.string().describe("Profession name, such as Alchemy."),
        fromSkill: z.number().int().min(1).max(500).default(1).describe("Skill the character has now."),
        toSkill: z.number().int().min(1).max(500).describe("Skill to stop at. Must be above fromSkill."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => {
      return {
        content: [{
          type: "text" as const,
          text: fromUploads((records) => {
            const facts = professionFactsFromRecords(records);
            return handleProfessionPath(args, facts.sightings, facts.prices);
          }),
        }],
      };
    },
  );
  server.registerTool(
    "item_page",
    {
      title: "Item page for a drop",
      description:
        "One Forever item: agreed name, public drop rate with kill count, and an agreed map pin. A rate is public after 3 installs kill the source. A name or pin needs 3 installs agreeing. No Wowhead rows. Reads EVERLOOT_UPLOADS when that directory is set. If EVERLOOT_UPLOADS is unset, the answer says uploads are not connected.",
      inputSchema: { itemId: z.number().int().positive().describe("Item id from a drop row.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({
      content: [{ type: "text" as const, text: fromUploads((records) => handleItemPage(args, itemFactsFromRecords(records))) }],
    }),
  );
  server.registerTool(
    "npc_page",
    {
      title: "NPC page",
      description:
        "One Forever NPC: agreed name and map pins. A name or pin needs 3 installs agreeing. The pin does not require a drop. No copied spawn list. Reads EVERLOOT_UPLOADS when that directory is set. If EVERLOOT_UPLOADS is unset, the answer says uploads are not connected.",
      inputSchema: { npcId: z.number().int().positive().describe("NPC id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({
      content: [{ type: "text" as const, text: fromUploads((records) => handleNpcPage(args, worldFactsFromRecords(records))) }],
    }),
  );
  server.registerTool(
    "quest_page",
    {
      title: "Quest page",
      description:
        "One Forever quest: agreed title, level, giver, turn-in, and rewards. Each fact needs 3 installs agreeing. No copied quest text. Reads EVERLOOT_UPLOADS when that directory is set. If EVERLOOT_UPLOADS is unset, the answer says uploads are not connected.",
      inputSchema: { questId: z.number().int().positive().describe("Quest id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({
      content: [{ type: "text" as const, text: fromUploads((records) => handleQuestPage(args, worldFactsFromRecords(records))) }],
    }),
  );
  server.registerTool(
    "vendor_page",
    {
      title: "Vendor page",
      description:
        "Goods one Forever vendor sells. An item is listed when 3 installs agree on that item and its copper price. Two agreed prices both stay listed. No copied catalog. Reads EVERLOOT_UPLOADS when that directory is set. If EVERLOOT_UPLOADS is unset, the answer says uploads are not connected.",
      inputSchema: { vendorNpcId: z.number().int().positive().describe("Vendor NPC id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({
      content: [{ type: "text" as const, text: fromUploads((records) => handleVendorPage(args, worldFactsFromRecords(records))) }],
    }),
  );
  server.registerTool(
    "collection_gap",
    {
      title: "Owned versus missing in a collection",
      description:
        "Missing items in one collection for one install. A list row is public after 3 installs agree on the collection, the source, and the item. Owned is what that install uploaded. Not a Blizzard profile read and not a copied catalog. Reads EVERLOOT_UPLOADS when that directory is set. If EVERLOOT_UPLOADS is unset, the answer says uploads are not connected.",
      inputSchema: {
        collection: z.string().describe("Collection name, such as Mounts."),
        ownerInstallId: z.string().describe("Install id whose owned upload to compare."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({
      content: [{ type: "text" as const, text: fromUploads((records) => handleCollectionGap(args, collectionFactsFromRecords(records))) }],
    }),
  );
  server.registerTool(
    "guild_board",
    {
      title: "Officer guild board",
      description:
        "Roster, bosses, loot, attendance, and average item level from officer uploads. A figure is public after 2 uploads agree. The average names how many roster members were measured. There is no single score because score_v1 weights are not published. Reads EVERLOOT_UPLOADS when that directory is set. If EVERLOOT_UPLOADS is unset, the answer says uploads are not connected.",
      inputSchema: {
        guildName: z.string().describe("Guild name."),
        realm: z.string().describe("Realm name."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({
      content: [{ type: "text" as const, text: fromUploads((records) => handleGuildBoard(args, guildFactsFromRecords(records))) }],
    }),
  );
  server.registerTool(
    "auction_history",
    {
      title: "Auction history for one item",
      description:
        "Price history from auction scans players uploaded on purpose. A day is public after 3 installs scanned that item on that realm. Copper is the median. Reads EVERLOOT_UPLOADS when that directory is set. If EVERLOOT_UPLOADS is unset, the answer says uploads are not connected.",
      inputSchema: {
        realm: z.string().describe("Realm name."),
        itemId: z.number().int().positive().describe("Item id."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({
      content: [{ type: "text" as const, text: fromUploads((records) => handleAuctionHistory(args, auctionSightingsFromRecords(records))) }],
    }),
  );
  server.registerTool(
    "everloot_plan",
    {
      title: "Everloot implementation tracker",
      description:
        "The full Everloot build list: what is live, what is next, what is waiting on Carlos, and which reference sites are page shapes only. Read this before assuming a tool exists.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    () => ({ content: [{ type: "text" as const, text: handlePlan() }] }),
  );
  return server;
}

/** stdio transport: Claude, ChatGPT dev mode, and the Everloot companion all speak this. Never returns. */
export async function serveStdio(dbPath: string): Promise<never> {
  const server = createKnowledgeServer(openDb(dbPath));
  await server.connect(new StdioServerTransport());
  return new Promise<never>(() => {});
}
