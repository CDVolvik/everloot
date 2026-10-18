import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CREDIT_LINE, LICENCE, MCP_CREDIT, SITE } from "@everloot/protocol";
import { answerSources, answerSourcesFactsFromRecords, formatAnswerSources, type AnswerSourcesFacts } from "./answer-sources.js";
import { auctionSightingsFromRecords, handleAuctionHistory } from "./auction-history.js";
import { handlePlan } from "./bridge-plan.js";
import { handleRecentChanges, recentChangesStructured, type ChangeEntry } from "./changes.js";
import { handleEcosystemProjects, type EcosystemView } from "./ecosystem.js";
import { collectionFactsFromRecords, handleCollectionGap } from "./collection-gap.js";
import { handleCompletionProgress, type CompletionFacts } from "./completion.js";
import { goldFactsFromRecords, handleGoldLedger } from "./gold-ledger.js";
import { guildFactsFromRecords, handleGuildBoard } from "./guild-board.js";
import { itemFactsFromRecords } from "./drop-rollup.js";
import { handleItemPage } from "./item-page.js";
import { handleObjectPage, objectFactsFromRecords, type ObjectFacts } from "./object-page.js";
import { handleMarketValue, type MarketState } from "./market.js";
import { loadUploadRecords } from "./load-uploads.js";
import { KNOWLEDGE_KINDS, MCP_RESOURCE_URIS, MCP_RESOURCES, MCP_TOOL_NAMES, MCP_TOOLS, parseRecords, type McpToolArgs, type McpToolDef, type McpToolName } from "@everloot/protocol";
import { handleProfessionPath } from "./profession-path.js";
import { readResource } from "./resources.js";
import { handleTalentPlan, handleTalentTree } from "./talent-tools.js";
import { handleRecipeThresholds, pathFactsFromRecords, recipeFactsFromRecords } from "./recipe-thresholds.js";
import { handleNpcPage, handleQuestPage, handleVendorPage, worldFactsFromRecords } from "./world-pages.js";
import { handleWorldMapNear, mapFactsFromRecords } from "./world-map-near.js";
import { WORLD_MAP_DATA } from "./world-map-file.js";
import { CLIENT_EDGES, CLIENT_LAYER, CLIENT_TAXONOMY } from "./client-layer-file.js";
import { handleItemCategories } from "./item-taxonomy.js";
import { handleEntityRelations, observedEdgesFromRecords, type Edge } from "./edges.js";
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
  answer_sources: ["loot", "item_seen", "npc_sighting", "quest", "vendor"],
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
  answer_sources: answerSourcesFactsFromRecords,
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

/**
 * The facts one tool reads, with the corpus time, for a handler that renders more than text. Same
 * sources and memo as fromTooledUploads; null when no source is connected or readable.
 */
export async function readTooledFacts<T>(tool: ToolName, loader?: CorpusLoader): Promise<{ facts: T; dataAsOf: string | null } | null> {
  const build = TOOL_FACT_BUILDERS[tool] as (records: unknown[]) => T;
  if (loader) {
    let corpus;
    try { corpus = await loader(); } catch { return null; }
    if (!corpus) return null;
    return { facts: tooledFacts("loader", corpus, tool, build), dataAsOf: typeof corpus.dataAsOf === "string" ? corpus.dataAsOf : null };
  }
  const base = process.env.EVERLOOT_PUBLIC_CORPUS_URL?.trim();
  const url = base ? `${base}${base.includes("?") ? "&" : "?"}kinds=${TOOL_KINDS[tool].join(",")}` : undefined;
  if (url) {
    const corpus = await fetchPublicCorpus(url);
    if (!corpus) return null;
    const dataAsOf = typeof corpus.dataAsOf === "string" ? corpus.dataAsOf : null;
    return { facts: tooledFacts("url", { records: corpus.records, dataAsOf }, tool, build), dataAsOf };
  }
  const dir = process.env.EVERLOOT_UPLOADS?.trim();
  if (!dir) return null;
  return { facts: build(loadUploadRecords(dir)), dataAsOf: null };
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

type SearchArgs = McpToolArgs<"search_knowledge">;

function formatHit(h: SearchHit): string {
  return `[${h.kind}/${h.gameVersion}] ${h.name}\n${h.snippet}\nSource: ${h.sourceUrl} (${h.licence}, retrieved ${h.retrievedAt})`;
}

/** Pure handlers — tested directly; the MCP registration below is a thin wrapper. */
export function searchHits(db: DB, args: SearchArgs): SearchHit[] {
  return search(db, args.query, args.limit, {
    kinds: args.kind ? [args.kind] : undefined,
    versions: args.version ? [args.version] : undefined,
  });
}

export function handleSearch(db: DB, args: SearchArgs): string {
  const hits = searchHits(db, args);
  if (hits.length === 0) return "No matches. Try fewer or different words.";
  return hits.map(formatHit).join("\n\n");
}

/** A tool answer: the text every client gets, plus structured content for tools with an output schema. */
type Answer = string | { text: string; structured: object };

export function handleGetEntity(db: DB, args: { id: number }): string {
  const hit = getEntity(db, args.id);
  return hit ? formatHit(hit) : `No record with id ${args.id}.`;
}

export function handleGetByName(db: DB, args: { name: string; kind?: (typeof KNOWLEDGE_KINDS)[number] }): string {
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
  /** One handler per tool, typed by the protocol's input shape; the MCP registration below is a thin wrapper. */
  const handlers: { [K in McpToolName]: (args: McpToolArgs<K>) => Answer | Promise<Answer> } = {
    search_knowledge: (args) => ({ text: handleSearch(db, args), structured: { hits: searchHits(db, args) } }),
    get_entity: (args) => ({ text: handleGetEntity(db, args), structured: { hit: getEntity(db, args.id) ?? null } }),
    get_by_name: (args) => ({ text: handleGetByName(db, args), structured: { hits: getByName(db, args.name, args.kind) } }),
    answer_sources: async (args) => {
      const read = await readTooledFacts<AnswerSourcesFacts>("answer_sources", options.corpus);
      const result = answerSources(db, args, read?.facts ?? null, read?.dataAsOf ?? null);
      return { text: `${formatAnswerSources(result, read !== null)}\n${read ? answerFooter(read.dataAsOf) : MCP_CREDIT}`, structured: result };
    },
    profession_path: (args) => readFacts("profession_path", (facts: ReturnType<typeof pathFactsFromRecords>) =>
      handleProfessionPath(args, facts.sightings, facts.prices, facts.derived, facts.vendorPrices)),
    recipe_thresholds: (args) => readFacts("recipe_thresholds", (facts: ReturnType<typeof recipeFactsFromRecords>) =>
      handleRecipeThresholds(args, facts.observations, facts.prices, facts.vendorPrices)),
    item_page: (args) => readFacts("item_page", (facts: ReturnType<typeof itemFactsFromRecords>) => handleItemPage(args, facts)),
    npc_page: (args) => readFacts("npc_page", (facts: ReturnType<typeof worldFactsFromRecords>) => handleNpcPage(args, facts)),
    object_page: (args) => readFacts("object_page", (facts: ObjectFacts) => handleObjectPage(args, facts)),
    quest_page: (args) => readFacts("quest_page", (facts: ReturnType<typeof worldFactsFromRecords>) => handleQuestPage(args, facts)),
    vendor_page: (args) => readFacts("vendor_page", (facts: ReturnType<typeof worldFactsFromRecords>) => handleVendorPage(args, facts)),
    world_map_near: (args) => readFacts("world_map_near", (facts: ReturnType<typeof mapFactsFromRecords>) => handleWorldMapNear(args, WORLD_MAP_DATA, facts)),
    entity_relations: (args) => readFacts("entity_relations", (observed: Edge[]) => handleEntityRelations(args, observed, CLIENT_EDGES)),
    item_categories: (args) => handleItemCategories(args, CLIENT_TAXONOMY, CLIENT_LAYER.build.version),
    talent_tree: (args) => handleTalentTree(args),
    talent_plan: (args) => handleTalentPlan(args),
    collection_gap: (args) => readFacts("collection_gap", (facts: ReturnType<typeof collectionFactsFromRecords>) => handleCollectionGap(args, facts)),
    completion_progress: (args) => answerCompletionProgress(args, options.completion),
    guild_board: (args) => readFacts("guild_board", (facts: ReturnType<typeof guildFactsFromRecords>) => handleGuildBoard(args, facts)),
    auction_history: (args) => readFacts("auction_history", (facts: ReturnType<typeof auctionSightingsFromRecords>) => handleAuctionHistory(args, facts)),
    market_value: (args) => answerMarketValue(args, options.market),
    gold_ledger: (args) => readFacts("gold_ledger", (facts: ReturnType<typeof goldFactsFromRecords>) => handleGoldLedger(args, facts.snapshots, facts.events)),
    recent_changes: async (args) => {
      let entries: ChangeEntry[] | null = null;
      try { entries = (await options.changes?.()) ?? null; } catch { entries = null; }
      return { text: handleRecentChanges(entries, args), structured: recentChangesStructured(entries, args) };
    },
    ecosystem_projects: async (args) => {
      let view: EcosystemView | null = null;
      try { view = (await options.ecosystem?.()) ?? null; } catch { view = null; }
      return handleEcosystemProjects(view, args);
    },
    everloot_plan: () => handlePlan(),
  };
  for (const name of MCP_TOOL_NAMES) {
    const def: McpToolDef = MCP_TOOLS[name];
    server.registerTool(
      name,
      { title: def.title, description: def.description, inputSchema: def.inputSchema, ...(def.outputSchema ? { outputSchema: def.outputSchema } : {}), annotations: def.annotations },
      async (args: unknown) => {
        const answer = await (handlers[name] as (a: unknown) => Answer | Promise<Answer>)(args);
        const text = typeof answer === "string" ? answer : answer.text;
        // Structured content goes only with a declared schema; a text-only tool never sends an unvalidated object.
        const structuredContent = typeof answer === "string" || !def.outputSchema ? undefined : (answer.structured as Record<string, unknown>);
        return { content: [{ type: "text" as const, text }], ...(structuredContent ? { structuredContent } : {}) };
      },
    );
  }
  for (const uri of MCP_RESOURCE_URIS) {
    const def = MCP_RESOURCES[uri];
    server.registerResource(def.name, uri, { title: def.title, description: def.description, mimeType: def.mimeType }, () => {
      const { mimeType, text } = readResource(uri, SOURCE_URL);
      return { contents: [{ uri, mimeType, text }] };
    });
  }
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
