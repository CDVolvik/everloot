import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CREDIT_LINE, LICENCE, MCP_CREDIT, SITE } from "./attribution.js";
import { auctionSightingsFromRecords, handleAuctionHistory } from "./auction-history.js";
import { handlePlan } from "./bridge-plan.js";
import { CHANGE_FILTERS, handleRecentChanges, type ChangeEntry } from "./changes.js";
import { ECOSYSTEM_BOARD_FILTERS, handleEcosystemProjects, type EcosystemView } from "./ecosystem.js";
import { collectionFactsFromRecords, handleCollectionGap } from "./collection-gap.js";
import { handleCompletionProgress, type CompletionFacts } from "./completion.js";
import { goldFactsFromRecords, handleGoldLedger } from "./gold-ledger.js";
import { guildFactsFromRecords, handleGuildBoard } from "./guild-board.js";
import { itemFactsFromRecords } from "./drop-rollup.js";
import { handleItemPage } from "./item-page.js";
import { handleObjectPage, objectFactsFromRecords, type ObjectFacts } from "./object-page.js";
import { handleMarketValue, type MarketState } from "./market.js";
import { loadUploadRecords } from "./load-uploads.js";
import { parseRecords } from "../../web/src/lib/intake.js";
import { handleProfessionPath } from "./profession-path.js";
import { handleRecipeThresholds, pathFactsFromRecords, recipeFactsFromRecords } from "./recipe-thresholds.js";
import { handleNpcPage, handleQuestPage, handleVendorPage, worldFactsFromRecords } from "./world-pages.js";
import { handleWorldMapNear, mapFactsFromRecords, NEAR_DEFAULT_LIMIT, NEAR_DEFAULT_RADIUS, NEAR_MAX_LIMIT, NEAR_MAX_RADIUS } from "./world-map-near.js";
import { WORLD_MAP_DATA } from "./world-map-file.js";
import { CLIENT_EDGES, CLIENT_LAYER, CLIENT_TAXONOMY } from "./client-layer-file.js";
import { handleItemCategories, QUALITIES } from "./item-taxonomy.js";
import { handleEntityRelations, observedEdgesFromRecords, RELS, type Edge } from "./edges.js";
import type { DB } from "./db.js";
import { getByName, getEntity, search, type SearchHit } from "./search.js";

export const SERVER_NAME = "everloot-knowledge";
export const SERVER_VERSION = "0.8.0";
/** The source this server runs, offered to every client (AGPL section 13). */
export const SOURCE_URL = "https://github.com/CDVolvik/everloot";

/** Sent to every client on connect: how to credit what the tools return. */
export const SERVER_INSTRUCTIONS =
  `Everloot answers questions about WoW: Forever. Facts built on player uploads are Everloot's data under ${LICENCE}: ` +
  `when you show them, credit "${CREDIT_LINE}" or link ${SITE}. Lore hits carry their own source and licence; keep them with the text. ` +
  "Game-file facts and Blizzard's posts stay Blizzard's.";

export const UPLOADS_UNSET =
  "Uploads are not connected. Neither EVERLOOT_PUBLIC_CORPUS_URL nor EVERLOOT_UPLOADS is set, so this is not a measured zero.";

/** Record kinds each gameplay tool reads. tool-kinds.test.ts checks them against the fact functions. */
export const TOOL_KINDS = {
  profession_path: ["recipe_seen", "price_seen", "auction_scan", "item_seen", "recipe_observed", "trainer_seen", "vendor"],
  recipe_thresholds: ["recipe_observed", "price_seen", "auction_scan", "item_seen", "vendor"],
  item_page: ["loot", "item_seen", "npc_sighting"],
  npc_page: ["npc_sighting", "quest", "vendor"],
  object_page: ["loot", "item_seen"],
  quest_page: ["npc_sighting", "quest", "vendor"],
  vendor_page: ["npc_sighting", "quest", "vendor"],
  world_map_near: ["npc_sighting", "vendor"],
  entity_relations: ["loot", "vendor", "quest", "npc_sighting"],
  collection_gap: ["collection_catalog", "collection_owned"],
  guild_board: ["guild_snapshot", "raid_lockout", "attendance", "loot_award", "gear_snapshot"],
  auction_history: ["auction_scan"],
  gold_ledger: ["gold_snapshot", "money_event"],
} as const satisfies Record<string, readonly string[]>;

export type ToolName = keyof typeof TOOL_KINDS;

/**
 * Facts each gameplay tool aggregates from its kinds. tool-kinds.test.ts keeps an
 * independent copy of this mapping and checks the kinds against the fact functions,
 * so a wrong entry here still fails there.
 */
const TOOL_FACT_BUILDERS: Record<ToolName, (records: unknown[]) => unknown> = {
  profession_path: pathFactsFromRecords,
  recipe_thresholds: recipeFactsFromRecords,
  item_page: itemFactsFromRecords,
  npc_page: worldFactsFromRecords,
  object_page: objectFactsFromRecords,
  quest_page: worldFactsFromRecords,
  vendor_page: worldFactsFromRecords,
  world_map_near: mapFactsFromRecords,
  entity_relations: observedEdgesFromRecords,
  collection_gap: collectionFactsFromRecords,
  guild_board: guildFactsFromRecords,
  auction_history: auctionSightingsFromRecords,
  gold_ledger: goldFactsFromRecords,
};

interface TooledMemo {
  key: string;
  byTool: Map<string, unknown>;
}

/**
 * One fact set per tool per corpus version, shared by every answer. Each gameplay
 * tool used to filter and aggregate the whole corpus on every call; beta traffic
 * would pay that scan ten times over. The shared references are read-only: handlers
 * filter, map and copy over them, never sort or push in place.
 */
let tooledMemo: TooledMemo | null = null;

/**
 * Corpus version marker with its source. Snapshot time plus record count move
 * whenever the store reloads, so a matching key means these facts are for this
 * exact corpus. The source stays in the key so a remote corpus can never share a
 * local one's facts at the same version marker.
 */
function tooledKey(source: string, corpus: { records: readonly unknown[]; dataAsOf?: string | null }): string {
  return `${source}|${corpus.dataAsOf ?? ""}|${corpus.records.length}`;
}

function tooledFacts<T>(
  source: string,
  corpus: { records: readonly unknown[]; dataAsOf?: string | null },
  tool: ToolName,
  build: (records: unknown[]) => T,
): T {
  const key = tooledKey(source, corpus);
  if (!tooledMemo || tooledMemo.key !== key) tooledMemo = { key, byTool: new Map() };
  let facts = tooledMemo.byTool.get(tool) as T | undefined;
  if (facts === undefined) {
    const wanted = new Set<string>(TOOL_KINDS[tool]);
    facts = build(corpus.records.filter((r) => wanted.has((r as { kind?: string }).kind ?? "")));
    tooledMemo.byTool.set(tool, facts);
  }
  return facts;
}

/**
 * The site's own public records, read in process. The /mcp route on the web deployment passes one, so
 * gameplay answers skip the HTTP self-fetch and its byte ceiling. Null means the store was unreadable.
 */
export type CorpusLoader = () => Promise<{ records: unknown[]; dataAsOf?: string | null } | null>;

const UNAVAILABLE = "Public corpus unavailable. These figures are unrecorded, not zero.";

/** The site's market rollup, read in process by the web /mcp routes. Null means it was unreadable. */
export type MarketLoader = () => Promise<{ state: MarketState; dataAsOf: string | null } | null>;

export const MARKET_UNSET =
  "Market values are not connected to this server, so this is not a measured zero. They are on everloot.app/tools/auctions and its MCP.";

/** The site's completion rollup with owned progress already limited to granted installs. Null means it was unreadable. */
export type CompletionLoader = (ownerInstallId: string) => Promise<{ facts: CompletionFacts; dataAsOf: string | null } | null>;

export const COMPLETION_UNSET =
  "Completion progress is not connected to this server, so this is not a measured zero. It is on everloot.app/tools/collections and its MCP.";

/** completion_progress: the agreed lists and one install's own progress (kb/src/completion-rollup.ts). */
export async function answerCompletionProgress(args: { ownerInstallId: string; characterKey?: string }, loader?: CompletionLoader): Promise<string> {
  if (!loader) return COMPLETION_UNSET;
  let loaded: Awaited<ReturnType<CompletionLoader>>;
  try {
    loaded = await loader(args.ownerInstallId.trim());
  } catch {
    loaded = null;
  }
  if (!loaded) return "Completion progress unavailable. It is unrecorded, not zero.";
  return `${handleCompletionProgress(args, loaded.facts)}\n${dataAgeLine(loaded.dataAsOf)}`;
}

/** market_value: Forever market values from full scans (kb/src/market.ts). */
export async function answerMarketValue(args: { realm: string; itemId: number }, loader?: MarketLoader): Promise<string> {
  if (!loader) return MARKET_UNSET;
  let market: Awaited<ReturnType<MarketLoader>>;
  try {
    market = await loader();
  } catch {
    market = null;
  }
  if (!market) return "Market values unavailable. They are unrecorded, not zero.";
  return `${handleMarketValue(args, market.state, new Date())}\n${answerFooter(market.dataAsOf)}`;
}

/** Prefer the web's sanitized current view; raw local files can supply anonymous facts only. */
export function fromUploads(
  render: (records: unknown[]) => string, kinds?: readonly string[], loader?: CorpusLoader,
): string | Promise<string> {
  if (loader) return fromLoader(loader, render, kinds);
  const base = process.env.EVERLOOT_PUBLIC_CORPUS_URL?.trim();
  // Asking for only the kinds a tool reads keeps the body under the byte ceiling for longer.
  const url = base && kinds ? `${base}${base.includes("?") ? "&" : "?"}kinds=${kinds.join(",")}` : base;
  if (url) return fromPublicCorpus(url, render);
  const dir = process.env.EVERLOOT_UPLOADS?.trim();
  if (!dir) return UPLOADS_UNSET;
  return render(loadUploadRecords(dir));
}

async function fromLoader(loader: CorpusLoader, render: (records: unknown[]) => string, kinds?: readonly string[]): Promise<string> {
  let corpus;
  try {
    corpus = await loader();
  } catch {
    return UNAVAILABLE;
  }
  if (!corpus) return UNAVAILABLE;
  const wanted = kinds ? new Set<string>(kinds) : null;
  const records = wanted ? corpus.records.filter((r) => wanted.has((r as { kind?: string }).kind ?? "")) : corpus.records;
  return `${render(records)}\n${answerFooter(corpus.dataAsOf)}`;
}

/** Pages a self-hosted server follows at most; with a key (EVERLOOT_API_KEY) a page holds far more records. */
const MAX_CORPUS_PAGES = 50;

/** A page from a newer snapshot than the first page: start again, the corpus moved on mid-read. */
class SnapshotMoved extends Error {}

/**
 * Every page of the feed at `url`. The site pages it when its data guard is on: follow `next`
 * within one byte ceiling. A `next` that cannot be followed (another origin, a bad URL), or a page
 * that fails, fails the whole read, so an answer is never built on part of the corpus.
 */
async function readCorpusPages(url: string, key: string | undefined): Promise<{ records: unknown[]; dataAsOf: unknown }> {
  const init: RequestInit = { cache: "no-store", ...(key ? { headers: { authorization: `Bearer ${key}` } } : {}) };
  const origin = new URL(url).origin;
  const records: unknown[] = [];
  let dataAsOf: unknown;
  let size = 0;
  let next: string | null = url;
  for (let page = 0; next; page++) {
    if (page >= MAX_CORPUS_PAGES) throw new Error("Public corpus has too many pages");
    const response = await fetch(next, { ...init, signal: AbortSignal.timeout(10_000) });
    if (!response.ok || Number(response.headers.get("content-length")) > 2_000_000) throw new Error("Public corpus too large or unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Public corpus has no body");
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) { await reader.cancel(); throw new Error("Public corpus too large"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const corpus = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { ok?: boolean; records?: unknown; dataAsOf?: unknown; next?: unknown };
    if (corpus.ok !== true || !Array.isArray(corpus.records)) throw new Error("Invalid public corpus");
    if (page === 0) dataAsOf = corpus.dataAsOf;
    else if (corpus.dataAsOf !== dataAsOf) throw new SnapshotMoved("Public corpus changed while paging");
    records.push(...corpus.records);
    if (corpus.next === null || corpus.next === undefined) next = null;
    else if (typeof corpus.next === "string" && URL.canParse(corpus.next) && new URL(corpus.next).origin === origin) next = corpus.next;
    else throw new Error("Public corpus next link cannot be followed");
  }
  return { records, dataAsOf };
}

/** How long a read of the public corpus is reused. Zero (the default) reads it on every answer. */
let corpusCacheMs = 0;
const corpusCache = new Map<string, { at: number; corpus: { records: unknown[]; dataAsOf: unknown } }>();

/**
 * Reuse each public corpus read for `ms`. The stdio server sets this to the site's snapshot interval,
 * so a local server without a key does not page through the whole feed on every tool call.
 */
export function cachePublicCorpus(ms: number): void {
  corpusCacheMs = ms;
  corpusCache.clear();
}

async function fetchPublicCorpus(url: string): Promise<{ records: unknown[]; dataAsOf: unknown } | null> {
  const key = process.env.EVERLOOT_API_KEY?.trim();
  const cacheKey = `${key ? "key" : "anon"} ${url}`;
  const cached = corpusCache.get(cacheKey);
  if (cached && Date.now() - cached.at < corpusCacheMs) return cached.corpus;
  try {
    let read: { records: unknown[]; dataAsOf: unknown } | null = null;
    // One retry when the snapshot moved on mid-read; a second move fails rather than mixing snapshots.
    for (let attempt = 0; !read; attempt++) {
      try {
        read = await readCorpusPages(url, key);
      } catch (err) {
        if (!(err instanceof SnapshotMoved) || attempt >= 1) throw err;
      }
    }
    const parsed = parseRecords(read.records);
    if (parsed.receipt.rejected.length) throw new Error("Invalid public records");
    const corpus = { records: parsed.records, dataAsOf: read.dataAsOf };
    if (corpusCacheMs > 0) corpusCache.set(cacheKey, { at: Date.now(), corpus });
    return corpus;
  } catch { return null; }
}

async function fromPublicCorpus(url: string, render: (records: unknown[]) => string): Promise<string> {
  const corpus = await fetchPublicCorpus(url);
  if (!corpus) return UNAVAILABLE;
  return `${render(corpus.records)}\n${answerFooter(corpus.dataAsOf)}`;
}

async function answerFromTooledLoader<T>(
  loader: CorpusLoader, tool: ToolName, build: (records: unknown[]) => T, render: (facts: T) => string,
): Promise<string> {
  let corpus;
  try {
    corpus = await loader();
  } catch {
    return UNAVAILABLE;
  }
  if (!corpus) return UNAVAILABLE;
  return `${render(tooledFacts("loader", corpus, tool, build))}\n${answerFooter(corpus.dataAsOf)}`;
}

async function answerFromTooledPublicCorpus<T>(
  url: string, tool: ToolName, build: (records: unknown[]) => T, render: (facts: T) => string,
): Promise<string> {
  const corpus = await fetchPublicCorpus(url);
  if (!corpus) return UNAVAILABLE;
  const dataAsOf = typeof corpus.dataAsOf === "string" ? corpus.dataAsOf : null;
  return `${render(tooledFacts("url", { records: corpus.records, dataAsOf }, tool, build))}\n${answerFooter(corpus.dataAsOf)}`;
}

/**
 * Gameplay answers from pre-aggregated per-tool facts. Same sources as fromUploads
 * (in-process loader first, then the public URL with the tool's kinds, then local
 * files), but the facts build once per corpus version instead of on every call.
 * The local-files path is a version-less dev fallback and stays unmemoized.
 */
export function fromTooledUploads<T>(
  tool: ToolName, render: (facts: T) => string, loader?: CorpusLoader,
): string | Promise<string> {
  const kinds = TOOL_KINDS[tool];
  const build = TOOL_FACT_BUILDERS[tool] as (records: unknown[]) => T;
  if (loader) return answerFromTooledLoader(loader, tool, build, render);
  const base = process.env.EVERLOOT_PUBLIC_CORPUS_URL?.trim();
  // Asking for only the kinds a tool reads keeps the body under the byte ceiling for longer.
  const url = base ? `${base}${base.includes("?") ? "&" : "?"}kinds=${kinds.join(",")}` : undefined;
  if (url) return answerFromTooledPublicCorpus(url, tool, build, render);
  const dir = process.env.EVERLOOT_UPLOADS?.trim();
  if (!dir) return UPLOADS_UNSET;
  return render(build(loadUploadRecords(dir)));
}

/** What ends every answer built on player data: how old the data is, and the credit line it carries. */
function answerFooter(dataAsOf: unknown): string {
  return `${dataAgeLine(dataAsOf)}\n${MCP_CREDIT}`;
}

/** The web's snapshot time; a stalled snapshot must not read as current. */
function dataAgeLine(dataAsOf: unknown): string {
  if (typeof dataAsOf !== "string" || !Number.isFinite(Date.parse(dataAsOf))) return "Data age unrecorded.";
  const iso = new Date(dataAsOf).toISOString();
  return `Data as of ${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC.`;
}

const KINDS = ["item", "npc", "object", "quest", "zone", "spell", "lore_page", "creator", "realm"] as const;
const VERSIONS = ["forever", "classic", "retail", "lore"] as const;

const searchArgs = {
  query: z.string().max(1000).describe("What to look up: names, questions, keywords. Question words are ignored."),
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

/** The merged blue-post and build timeline. Null means it is not connected, which is not the same as empty. */
export type ChangesLoader = () => ChangeEntry[] | null | Promise<ChangeEntry[] | null>;

/** The ecosystem tracker with install counts joined. Null means it is not connected, which is not the same as empty. */
export type EcosystemLoader = () => EcosystemView | null | Promise<EcosystemView | null>;

export function createKnowledgeServer(db: DB, options: { corpus?: CorpusLoader; market?: MarketLoader; completion?: CompletionLoader; changes?: ChangesLoader; ecosystem?: EcosystemLoader } = {}): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, websiteUrl: SOURCE_URL }, { instructions: SERVER_INSTRUCTIONS });
  const readFacts = <T>(tool: ToolName, render: (facts: T) => string) => fromTooledUploads(tool, render, options.corpus);
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
        name: z.string().max(200).describe("Full record name."),
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
        "Leveling path for one Forever profession from Everloot uploads. A step exists only after 3 installs agree: on a reported recipe, or on the recipe colours that make it orange (a guaranteed skill-up), starting at the trainer's required rank. Gold exists only after 3 price uploads agree. No copied guide. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: {
        profession: z.string().describe("Profession name, such as Alchemy."),
        fromSkill: z.number().int().min(1).max(500).default(1).describe("Skill the character has now."),
        toSkill: z.number().int().min(1).max(500).describe("Skill to stop at. Must be above fromSkill."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      return {
        content: [{
          type: "text" as const,
          text: await readFacts("profession_path", (facts: ReturnType<typeof pathFactsFromRecords>) =>
            handleProfessionPath(args, facts.sightings, facts.prices, facts.derived, facts.vendorPrices)),
        }],
      };
    },
  );
  server.registerTool(
    "recipe_thresholds",
    {
      title: "Recipe skill ranges",
      description:
        "Where a Forever profession's recipes turn yellow, green and grey, inferred from the colours players' trade-skill windows showed. A recipe appears only after 3 installs agree, as ranges, never guessed exact numbers. Agreed reagents come with an estimated cost per craft when every reagent has an agreed price. Reads Everloot's current public corpus.",
      inputSchema: {
        profession: z.string().describe("Profession name, such as Alchemy."),
        recipe: z.string().optional().describe("Optional part of a recipe name to narrow the list."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{
        type: "text" as const,
        text: await readFacts("recipe_thresholds", (facts: ReturnType<typeof recipeFactsFromRecords>) =>
          handleRecipeThresholds(args, facts.observations, facts.prices, facts.vendorPrices)),
      }],
    }),
  );
  server.registerTool(
    "item_page",
    {
      title: "Item page for a drop",
      description:
        "One Forever item: agreed name, public drop rate with kill count, and an agreed map pin. A rate is public after 3 installs kill the source. A name or pin needs 3 installs agreeing. No Wowhead rows. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: { itemId: z.number().int().positive().describe("Item id from a drop row.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("item_page", (facts: ReturnType<typeof itemFactsFromRecords>) => handleItemPage(args, facts)) }],
    }),
  );
  server.registerTool(
    "npc_page",
    {
      title: "NPC page",
      description:
        "One Forever NPC: agreed name and map pins. A name or pin needs 3 installs agreeing. The pin does not require a drop. No copied spawn list. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: { npcId: z.number().int().positive().describe("NPC id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("npc_page", (facts: ReturnType<typeof worldFactsFromRecords>) => handleNpcPage(args, facts)) }],
    }),
  );
  server.registerTool(
    "object_page",
    {
      title: "Game object page",
      description:
        "One game object (a chest, herb, ore vein or fishing pool) by the id in its GUID: the items players looted from it, each with observed loot windows, windows with the item and distinct install reports. A frequency is public after 3 install reports; a public object with nothing in its windows reads as a measured zero. Objects have no names yet. Reads Everloot's current authorized public corpus when connected.",
      inputSchema: { objectId: z.number().int().positive().describe("The object's entry id, as in /database/objects/1731.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("object_page", (facts: ObjectFacts) => handleObjectPage(args, facts)) }],
    }),
  );
  server.registerTool(
    "quest_page",
    {
      title: "Quest page",
      description:
        "One Forever quest: agreed title, level, giver, turn-in, and rewards. Each fact needs 3 installs agreeing. No copied quest text. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: { questId: z.number().int().positive().describe("Quest id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("quest_page", (facts: ReturnType<typeof worldFactsFromRecords>) => handleQuestPage(args, facts)) }],
    }),
  );
  server.registerTool(
    "vendor_page",
    {
      title: "Vendor page",
      description:
        "Goods one Forever vendor sells. An item is listed when 3 installs agree on that item and its copper price. Two agreed prices both stay listed. No copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: { vendorNpcId: z.number().int().positive().describe("Vendor NPC id.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("vendor_page", (facts: ReturnType<typeof worldFactsFromRecords>) => handleVendorPage(args, facts)) }],
    }),
  );
  server.registerTool(
    "world_map_near",
    {
      title: "What is near a place on the map",
      description:
        `Entrances, NPCs and vendors near a spot, nearest first, with straight-line distances in yards. Give a zone (name or map id) with x and y from 0 to 100, or an NPC id to start from where that NPC stands. Entrances come from the game files and are unconfirmed. NPCs and vendors are player-observed and listed only where 3 installs agree on the position. Zones the files hold back as possibly unreleased are not offered. Game objects are not listed: no public record gives them a position. Reads Everloot's current authorized public corpus when connected.`,
      inputSchema: {
        zone: z.string().max(80).optional().describe("Zone name or map id, such as Elwynn Forest or 1429. Needs x and y."),
        x: z.number().min(0).max(100).optional().describe("Across the zone map, 0 (west) to 100 (east)."),
        y: z.number().min(0).max(100).optional().describe("Down the zone map, 0 (north) to 100 (south)."),
        npcId: z.number().int().positive().optional().describe("Start from this NPC's agreed position instead of a zone and x, y."),
        radius: z.number().positive().max(NEAR_MAX_RADIUS).default(NEAR_DEFAULT_RADIUS).describe("Search radius in yards."),
        limit: z.number().int().min(1).max(NEAR_MAX_LIMIT).default(NEAR_DEFAULT_LIMIT).describe("Most results per list."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("world_map_near", (facts: ReturnType<typeof mapFactsFromRecords>) => handleWorldMapNear(args, WORLD_MAP_DATA, facts)) }],
    }),
  );
  server.registerTool(
    "entity_relations",
    {
      title: "How an item, NPC, spell or quest connects to others",
      description:
        `Every typed relation of one entity, both directions: dropped by, sold by, reward from, located in (player-observed, listed where 3 installs agree, with the install count and last seen), and created by, reagent for, part of set, same icon (found in game files, unconfirmed, with the build they came from). Ids are the game's own. Reads Everloot's current authorized public corpus and the committed client layer.`,
      inputSchema: {
        kind: z.enum(["item", "spell", "npc", "object", "quest", "zone", "item_set", "icon"]).describe("What the id names. A zone is a UiMap id, as on /map."),
        id: z.number().int().positive().describe("The game's id for it, such as item 19019."),
        rel: z.enum(RELS).optional().describe("Only this relation."),
        direction: z.enum(["from", "to", "both"]).default("both").describe("from: what this entity points to (an item's sources). to: what points at it (what an NPC drops). Default both."),
        limit: z.number().int().min(1).max(100).default(25).describe("Most lines per relation."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("entity_relations", (observed: Edge[]) => handleEntityRelations(args, observed, CLIENT_EDGES)) }],
    }),
  );
  server.registerTool(
    "item_categories",
    {
      title: "Item categories: class, subclass, slot and quality",
      description:
        `Item categories from the game files (found in game files, unconfirmed, with the build): class and subclass with the client's English names and slugs, slot and quality. With no arguments, the whole tree with item counts. With item, that item's category path. With class (a slug such as weapon or armor), and optionally subclass, slot and quality slugs, the items in it. Ids only: item names come from player uploads (item_page).`,
      inputSchema: {
        item: z.number().int().positive().optional().describe("An item id: answers its class, subclass, slot and quality."),
        class: z.string().max(40).optional().describe("Class slug, such as weapon, armor, consumable or trade-goods."),
        subclass: z.string().max(40).optional().describe("Subclass slug or number within the class, such as one-handed-swords or cloth."),
        slot: z.string().max(40).optional().describe("Slot slug, such as head, chest, one-hand or trinket."),
        quality: z.enum(QUALITIES.map((q) => q.slug) as [string, ...string[]]).optional().describe("poor, common, uncommon, rare, epic, legendary, artifact or heirloom."),
        limit: z.number().int().min(1).max(100).default(25).describe("Most items listed."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => ({ content: [{ type: "text" as const, text: handleItemCategories(args, CLIENT_TAXONOMY, CLIENT_LAYER.build.version) }] }),
  );
  server.registerTool(
    "collection_gap",
    {
      title: "Owned versus missing in a collection",
      description:
        "Missing items in one collection for one install. A list row is public after 3 installs agree on the collection, the source, and the item. Owned is what that install uploaded. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: {
        collection: z.string().describe("Collection name, such as Mounts."),
        ownerInstallId: z.string().describe("Install id whose owned upload to compare."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("collection_gap", (facts: ReturnType<typeof collectionFactsFromRecords>) => handleCollectionGap(args, facts)) }],
    }),
  );
  server.registerTool(
    "completion_progress",
    {
      title: "Achievement, reputation, title and quest progress",
      description:
        "What one install's characters have finished, and what is closest to done: achievements with the largest share of criteria or progress met, reputations nearest the next standing, titles known, and quests finished in a chain. A list entry is public after 3 players (installs uploading from different addresses) report it identically. Progress is shown only when that install uploaded it with the collection sharing choice and a verified grant; without it the answer says so. Not a Blizzard profile read and not a copied catalog. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: {
        ownerInstallId: z.string().describe("Install id whose completion upload to read."),
        characterKey: z.string().max(8).optional().describe("One character's 8-digit key from the upload, when the install has several."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await answerCompletionProgress(args, options.completion) }],
    }),
  );
  server.registerTool(
    "guild_board",
    {
      title: "Officer guild board",
      description:
        "Roster, bosses, loot, attendance, and average item level from officer uploads. A figure is public after 2 uploads agree. The average names how many roster members were measured. There is no single score because score_v1 weights are not published. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: {
        guildName: z.string().describe("Guild name."),
        realm: z.string().describe("Realm name."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("guild_board", (facts: ReturnType<typeof guildFactsFromRecords>) => handleGuildBoard(args, facts)) }],
    }),
  );
  server.registerTool(
    "auction_history",
    {
      title: "Auction history for one item",
      description:
        "Price history from auction scans players uploaded on purpose. A day is public after 3 installs scanned that item on that realm. Copper is the median. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: {
        realm: z.string().describe("Realm name."),
        itemId: z.number().int().positive().describe("Item id."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: await readFacts("auction_history", (facts: ReturnType<typeof auctionSightingsFromRecords>) => handleAuctionHistory(args, facts)) }],
    }),
  );
  server.registerTool(
    "market_value",
    {
      title: "Forever market value for one item",
      description:
        "Market value, minimum buyout, historical value and units listed for one item on one WoW: Forever realm, from full auction scans players started and uploaded. A day is public after 3 reporters (distinct upload addresses) scanned the item; values are medians, thin days and outlier days are left out of the market value. Market value weights the last 14 public days, historical is the median of 60. Missing or unavailable data is reported explicitly.",
      inputSchema: {
        realm: z.string().describe("Realm name."),
        itemId: z.number().int().positive().describe("Item id."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({ content: [{ type: "text" as const, text: await answerMarketValue(args, options.market) }] }),
  );
  server.registerTool(
    "gold_ledger",
    {
      title: "Gold ledger for one character",
      description:
        "Peak gold and the money events that character's own upload recorded. Loot, quests, vendors, and auction sales stay on the money line. Gameplay stays on its own line. A missing line is unrecorded. The difference is not called bought and is not a ban. Installs are not merged. No scan of a player who did not upload. Reads Everloot's current authorized public corpus when connected. Missing or unavailable data is reported explicitly.",
      inputSchema: {
        character: z.string().describe("Character name."),
        realm: z.string().describe("Realm name."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{
        type: "text" as const,
        text: await readFacts("gold_ledger", (facts: ReturnType<typeof goldFactsFromRecords>) =>
          handleGoldLedger(args, facts.snapshots, facts.events)),
      }],
    }),
  );
  server.registerTool(
    "recent_changes",
    {
      title: "Recent official changes for WoW: Forever",
      description:
        "Newest first: Blizzard blue posts (title, author, time, a short excerpt and the link to the original), hotfix posts, and new game builds. Excerpts only: Blizzard's post text is Blizzard's, so open the link for the full post. A build's time is when Everloot first saw it, not Blizzard's release time.",
      inputSchema: {
        filter: z.enum(CHANGE_FILTERS as [string, ...string[]]).default("all").describe("posts (blue posts), hotfixes, builds, or all."),
        game: z.enum(["forever", "classic"]).optional().describe("Narrow to one game."),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      let entries: ChangeEntry[] | null = null;
      try { entries = (await options.changes?.()) ?? null; } catch { entries = null; }
      return { content: [{ type: "text" as const, text: handleRecentChanges(entries, { ...args, filter: args.filter as (typeof CHANGE_FILTERS)[number] }) }] };
    },
  );
  server.registerTool(
    "ecosystem_projects",
    {
      title: "WoW: Forever addons and open-source projects",
      description:
        "Forever addons and tools from the community registry, with a board ranking: most installed, rising, most active, freshest release or best maintained. Each project shows its GitHub repository, stars, latest release, last commit, whether its .toc declares a Forever interface number, and installs from Everloot uploads (counted from 3 installs; a missing count means not counted, not zero). Projects are ranked, never people. GitHub facts carry the time they were refreshed.",
      inputSchema: {
        board: z.enum(ECOSYSTEM_BOARD_FILTERS).default("all").describe("installed, rising, active, release, maintained, or all (A to Z)."),
        forever_ready_only: z.boolean().optional().describe("Only projects whose .toc lists a Forever interface number."),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      let view: EcosystemView | null = null;
      try { view = (await options.ecosystem?.()) ?? null; } catch { view = null; }
      return { content: [{ type: "text" as const, text: handleEcosystemProjects(view, args) }] };
    },
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
export async function serveStdio(db: DB, changes?: ChangesLoader): Promise<never> {
  // The site's snapshot changes about every ten minutes; reading it more often gains nothing.
  cachePublicCorpus(10 * 60_000);
  const server = createKnowledgeServer(db, { changes });
  await server.connect(new StdioServerTransport());
  return new Promise<never>(() => {});
}
