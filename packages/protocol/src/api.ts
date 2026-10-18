import { z } from "zod";
import { ENTITY_KINDS, RELS } from "./mcp.js";
import { anyRecord, PUBLIC_RECORD_KINDS } from "./records.js";

/**
 * The shapes everloot.app's JSON endpoints answer with. The routes build their bodies as they always
 * have; each route's test parses a real response with the matching schema here, so a route that drifts
 * from the protocol fails its own test. schema/api/<name>.json is generated from these, and the OpenAPI
 * document on the site is assembled from API_ROUTES.
 *
 * Everloot's own data (player observations) carries `attribution`: CC BY-SA 4.0 and the credit line.
 * Game-file data carries `gameData` instead: Blizzard's, found in game files, unconfirmed, with the build.
 */

const ISO_TIME = z.string().datetime({ offset: true });

/** The licence and credit line on every answer built from player data. `source` is a page a person can open. */
export const attributionSchema = z.object({
  licence: z.string(),
  licenceUrl: z.string().url(),
  credit: z.string(),
  source: z.string().url(),
  terms: z.string().url(),
});
export type Attribution = z.infer<typeof attributionSchema>;

/** The notice on game-file data instead of attribution. */
export const gameDataNoticeSchema = z.object({
  label: z.string().describe("The evidence label pages show, such as \"found in game files, unconfirmed\"."),
  build: z.string().describe("The game build the rows were read from."),
  extractedAt: z.string().nullable().optional(),
  credit: z.string().optional(),
}).passthrough();

/** Every refusal: `ok: false` and a sentence. `getAKey` appears only while free keys exist. */
export const apiErrorSchema = z.object({
  ok: z.literal(false),
  error: z.string(),
  getAKey: z.string().url().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Paging over a list: `next` is the full URL of the following page, or null on the last one. */
export const pageSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  next: z.string().url().nullable(),
});
export type Page = z.infer<typeof pageSchema>;

/** GET /api/corpus/public: public records without install ids, optionally only some kinds. */
export const corpusPublicResponse = z.object({
  ok: z.literal(true),
  uploads: z.number().int().nonnegative(),
  records: z.array(z.record(z.string(), z.unknown())).describe("Records of the public kinds, each without its installId. Shapes: schema/records/<kind>.json."),
  dataAsOf: ISO_TIME.nullish().describe("When these records were current. Null or absent when unrecorded, never \"now\"."),
  kinds: z.array(z.enum(PUBLIC_RECORD_KINDS as [string, ...string[]])).optional().describe("Present when the request asked for some kinds."),
  legacyRecords: z.number().int().nonnegative().optional(),
  attribution: attributionSchema,
}).extend(pageSchema.shape);
export type CorpusPublicResponse = z.infer<typeof corpusPublicResponse>;

/** GET /api/market/prices without `realm`: the realms that have public market values. */
export const marketRealmsResponse = z.object({
  ok: z.literal(true),
  dataAsOf: ISO_TIME.nullable(),
  realms: z.array(z.string()),
  attribution: attributionSchema,
});

export const MARKET_PRICE_FIELDS = ["itemId", "market", "min", "historical", "quantity", "day", "reporters"] as const;

/** GET /api/market/prices?realm=: the items with the most units listed, as tuples in `fields` order. */
export const marketPricesResponse = z.object({
  ok: z.literal(true),
  dataAsOf: ISO_TIME.nullable(),
  rule: z.string().describe("How a day becomes public and how the values are computed."),
  fields: z.tuple([z.literal("itemId"), z.literal("market"), z.literal("min"), z.literal("historical"), z.literal("quantity"), z.literal("day"), z.literal("reporters")]),
  realm: z.string().nullable(),
  items: z.array(z.tuple([
    z.number().int().positive(), z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative(),
    z.number().int().nonnegative(), z.string(), z.number().int().nonnegative(),
  ])).describe("[itemId, market, min, historical, quantity, day, reporters]; copper per unit."),
  attribution: attributionSchema,
});
export type MarketPricesResponse = z.infer<typeof marketPricesResponse>;

const dropRate = z.object({
  sourceNpcId: z.number().int().positive().optional(),
  sourceObjectId: z.number().int().positive().optional(),
  itemId: z.number().int().positive(),
  kills: z.number().int().nonnegative().describe("Loot windows players opened on this source, not kills counted by the game."),
  drops: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
  reporters: z.number().int().nonnegative().describe("Distinct installs that looted the source."),
  public: z.literal(true),
});

const measuredZero = z.object({
  sourceNpcId: z.number().int().positive().optional(),
  sourceObjectId: z.number().int().positive().optional(),
  kills: z.number().int().nonnegative(),
  reporters: z.number().int().nonnegative(),
  public: z.literal(true),
});

/** GET /api/rollups/drops: corroborated drop rates, then sources looted with nothing in their windows. */
export const dropsResponse = z.object({
  generatedAt: ISO_TIME,
  dataAsOf: ISO_TIME.nullable(),
  stats: z.object({
    uploads: z.number().int().nonnegative(),
    lootWindows: z.number().int().nonnegative(),
    records: z.number().int().nonnegative(),
    unreachable: z.boolean(),
    dataAsOf: ISO_TIME.nullable(),
  }),
  unreachable: z.boolean().describe("True when storage could not be read: the lists are then empty, not zero."),
  rates: z.array(dropRate),
  measuredZeros: z.array(measuredZero),
  queued: z.number().int().nonnegative().nullable().describe("Rates and zeros waiting for their third install; null when unreachable."),
  totalRates: z.number().int().nonnegative(),
  totalMeasuredZeros: z.number().int().nonnegative(),
  attribution: attributionSchema,
}).extend(pageSchema.shape);
export type DropsResponse = z.infer<typeof dropsResponse>;

const edge = z.object({
  fromKind: z.enum(ENTITY_KINDS),
  fromId: z.number().int().positive(),
  rel: z.enum(RELS),
  toKind: z.enum(ENTITY_KINDS),
  toId: z.number().int().positive(),
  evidence: z.enum(["observed", "client"]),
  build: z.string().nullable().describe("Game build of a client edge; null for observed edges."),
  installs: z.number().int().nonnegative().nullable().describe("Distinct installs behind an observed edge; null for client edges."),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
});
export type EdgeRow = z.infer<typeof edge>;

/** GET /api/edges: typed relations, observed first, then game-file ones. */
export const edgesResponse = z.object({
  generatedAt: ISO_TIME,
  dataAsOf: ISO_TIME.nullable(),
  unreachable: z.boolean(),
  edges: z.array(edge),
  attribution: attributionSchema,
  gameData: gameDataNoticeSchema.nullable().describe("Present when the page holds at least one game-file edge."),
}).extend(pageSchema.shape);
export type EdgesResponse = z.infer<typeof edgesResponse>;

/** GET /api/items: items of the current build with class, subclass, slot and quality. Game-file data. */
export const itemsResponse = z.object({
  generatedAt: ISO_TIME,
  items: z.array(z.record(z.string(), z.unknown())),
  gameData: gameDataNoticeSchema,
}).extend(pageSchema.shape);

/** One accepted or rejected row in an intake receipt, by its index in the request. */
const receiptEntry = z.object({ index: z.number().int(), kind: z.string().optional(), reason: z.string().optional() });

/** POST /api/intake, 200: stored. */
export const intakeReceipt = z.object({
  ok: z.literal(true),
  persisted: z.literal(true),
  uploadId: z.string().uuid(),
  accepted: z.array(receiptEntry),
  rejected: z.array(receiptEntry),
}).passthrough();

/** POST /api/intake, 4xx or 503: refused; `accepted` and `rejected` say why when the envelope parsed. */
export const intakeRefused = z.object({
  ok: z.literal(false),
  error: z.string().optional(),
  persisted: z.literal(false).optional(),
  uploadId: z.string().uuid().optional(),
  accepted: z.array(receiptEntry).optional(),
  rejected: z.array(receiptEntry).optional(),
});

/** POST /api/intake request body: the envelope, with the sharing choices and grants the upload page adds. */
export const intakeRequest = z.object({
  addonVersion: z.string().min(1).max(20),
  clientBuild: z.string().optional(),
  protocol: z.string().optional(),
  records: z.array(anyRecord).min(1).max(2000),
  sharing: z.record(z.string(), z.boolean()).optional().describe("Named categories the player chose to share: guild, gear, gold, collection."),
  grantTokens: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(4).optional(),
});

/** GET /api/health: 200 when the public snapshot is fresh, 503 otherwise. */
export const healthResponse = z.object({
  ok: z.boolean(),
  snapshot: z.object({
    status: z.enum(["fresh", "stale", "missing", "unavailable", "local"]),
    updatedAt: ISO_TIME.nullable(),
    ageSeconds: z.number().nonnegative().nullable(),
  }),
});
export type HealthResponse = z.infer<typeof healthResponse>;

/** The response schemas by name, the names schema/api/<name>.json uses. */
export const API_SCHEMAS = {
  attribution: attributionSchema,
  gameDataNotice: gameDataNoticeSchema,
  apiError: apiErrorSchema,
  page: pageSchema,
  corpusPublicResponse,
  marketRealmsResponse,
  marketPricesResponse,
  dropsResponse,
  edgesResponse,
  itemsResponse,
  intakeRequest,
  intakeReceipt,
  intakeRefused,
  healthResponse,
} as const;
export type ApiSchemaName = keyof typeof API_SCHEMAS;

export interface ApiQueryParam {
  name: string;
  description: string;
  /** JSON Schema fragment for the parameter. */
  schema: Record<string, unknown>;
  required?: boolean;
}

export interface ApiRoute {
  method: "GET" | "POST";
  path: string;
  summary: string;
  description: string;
  /** Who may call it and how much. */
  access: "open" | "rate-limited" | "key-or-rate-limited" | "cron";
  /** Which data layer the answer carries. */
  data: "observed" | "game-files" | "mixed" | "none";
  query?: ApiQueryParam[];
  requestBody?: ApiSchemaName;
  responses: Record<string, { description: string; schema?: ApiSchemaName }>;
  /** Whether `?offset=` and `?limit=` page the answer. */
  paged?: boolean;
}

const PAGING: ApiQueryParam[] = [
  { name: "offset", description: "First row to return, 0 or more.", schema: { type: "integer", minimum: 0 } },
  { name: "limit", description: "Rows per page. Capped at the caller's page size when the data guard is on.", schema: { type: "integer", minimum: 1 } },
];

const ERROR_RESPONSES = {
  "400": { description: "A parameter is wrong; `error` says which.", schema: "apiError" as const },
  "429": { description: "Rate limited. `Retry-After` says when to try again.", schema: "apiError" as const },
  "503": { description: "A dependency is unavailable. The answer is unrecorded, not zero.", schema: "apiError" as const },
};

/** The public JSON endpoints, in the order the documentation lists them. Auth and cron routes are not public API. */
export const API_ROUTES: readonly ApiRoute[] = [
  {
    method: "GET", path: "/api/corpus/public",
    summary: "The public corpus: every public record players reported, without install ids",
    description: "Anonymous observations as records, so anyone can check the counts behind a published fact. `kinds` narrows the body to the record kinds a reader needs. Named records appear only with a grant.",
    access: "key-or-rate-limited", data: "observed", paged: true,
    query: [
      { name: "kinds", description: "Comma-separated record kinds to include. Unknown kinds are a 400.", schema: { type: "string", examples: ["loot,vendor"] } },
      ...PAGING,
    ],
    responses: { "200": { description: "The page of records.", schema: "corpusPublicResponse" }, ...ERROR_RESPONSES },
  },
  {
    method: "GET", path: "/api/rollups/drops",
    summary: "Corroborated drop rates with loot-window counts",
    description: "A rate is public once three installs looted its source. Rates come first, then sources looted with nothing in their windows (measured zeros). `kills` counts loot windows players opened, not kills.",
    access: "key-or-rate-limited", data: "observed", paged: true,
    query: PAGING,
    responses: { "200": { description: "The page of rates and zeros.", schema: "dropsResponse" }, ...ERROR_RESPONSES },
  },
  {
    method: "GET", path: "/api/edges",
    summary: "Typed relations between items, NPCs, spells, quests, zones and sets",
    description: "Observed edges (dropped by, sold by, reward from, located in) come first and carry install counts; game-file edges (created by, reagent for, part of set, same icon) follow and carry the build. With no filter the whole table pages like the corpus.",
    access: "key-or-rate-limited", data: "mixed", paged: true,
    query: [
      { name: "from_kind", description: "Kind of the entity the edge starts from.", schema: { type: "string", enum: [...ENTITY_KINDS] } },
      { name: "from_id", description: "The game's id of that entity.", schema: { type: "integer", minimum: 1 } },
      { name: "to_kind", description: "Kind of the entity the edge points to.", schema: { type: "string", enum: [...ENTITY_KINDS] } },
      { name: "to_id", description: "The game's id of that entity.", schema: { type: "integer", minimum: 1 } },
      { name: "rel", description: "Only this relation.", schema: { type: "string", enum: [...RELS] } },
      { name: "evidence", description: "observed (players) or client (game files).", schema: { type: "string", enum: ["observed", "client"] } },
      ...PAGING,
    ],
    responses: { "200": { description: "The page of edges.", schema: "edgesResponse" }, ...ERROR_RESPONSES },
  },
  {
    method: "GET", path: "/api/edges/client-layer",
    summary: "The whole game-file relation layer of the current build",
    description: "The committed client layer as one object: Blizzard's data, found in game files, unconfirmed. Public in the repository too, so it is neither paged nor limited. Cached for an hour.",
    access: "open", data: "game-files",
    responses: { "200": { description: "The client layer file." } },
  },
  {
    method: "GET", path: "/api/items",
    summary: "Every item of the current build with its class, subclass, slot and quality",
    description: "From the game files. Filters by one item id, or by class and subclass slugs, slot and quality. Ids only: item names come from player uploads.",
    access: "key-or-rate-limited", data: "game-files", paged: true,
    query: [
      { name: "item", description: "One item id.", schema: { type: "integer", minimum: 1 } },
      { name: "class", description: "Class slug, such as weapon or armor.", schema: { type: "string" } },
      { name: "subclass", description: "Subclass slug or number within the class. Needs class.", schema: { type: "string" } },
      { name: "slot", description: "Slot slug, such as head or trinket.", schema: { type: "string" } },
      { name: "quality", description: "Quality slug.", schema: { type: "string", enum: ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"] } },
      ...PAGING,
    ],
    responses: { "200": { description: "The page of items.", schema: "itemsResponse" }, ...ERROR_RESPONSES },
  },
  {
    method: "GET", path: "/api/market/prices",
    summary: "Forever market values from full auction scans players started",
    description: "Without `realm`, the realms that have public values. With it, the items with the most units listed on that realm as tuples in `fields` order, copper per unit. A day is public when three reporters scanned the item.",
    access: "rate-limited", data: "observed",
    query: [{ name: "realm", description: "Realm name. Omit it to list realms.", schema: { type: "string", minLength: 2, maxLength: 40 } }],
    responses: {
      "200": { description: "Realms when `realm` is absent (marketRealmsResponse), prices when present.", schema: "marketPricesResponse" },
      ...ERROR_RESPONSES,
    },
  },
  {
    method: "POST", path: "/api/intake",
    summary: "Upload records from an Everloot SavedVariables file",
    description: "One envelope of at most 2,000 records and 1 MB. Every record is checked against its kind's schema; the receipt lists what was accepted and what was rejected and why. Named categories need the matching sharing choice and a verified grant. Anonymous, keyed by a random install id; quotas per request and per install.",
    access: "rate-limited", data: "none",
    requestBody: "intakeRequest",
    responses: {
      "200": { description: "Stored.", schema: "intakeReceipt" },
      "400": { description: "The body is not JSON, or the grants are malformed.", schema: "intakeRefused" },
      "413": { description: "The body is over 1 MB.", schema: "intakeRefused" },
      "422": { description: "The envelope or every record was refused; the receipt says why.", schema: "intakeRefused" },
      "429": { description: "Rate limited; keep the file and retry after `Retry-After`.", schema: "intakeRefused" },
      "503": { description: "Storage could not confirm the write; keep the file and retry.", schema: "intakeRefused" },
    },
  },
  {
    method: "GET", path: "/api/health",
    summary: "Whether the public snapshot is fresh",
    description: "200 when the corpus snapshot was written recently, 503 otherwise. Metadata only.",
    access: "open", data: "none",
    responses: { "200": { description: "Fresh.", schema: "healthResponse" }, "503": { description: "Stale, missing or unavailable.", schema: "healthResponse" } },
  },
];
