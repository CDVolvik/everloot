import { z } from "zod";
import { validRealm } from "../../../kb/src/market";

/**
 * Everloot intake contract (Track 2, step 1).
 * The addon (Track 1) writes these records to SavedVariables; the uploader POSTs them here.
 * Validation only — storage sits behind the `Store` interface so local file storage swaps
 * for Supabase without touching the contract. Rollups (drop rates, spawns, scores) are step 2.
 */

export const INSTALL_ID = z.string().min(8).max(64).describe("Random install id, no account needed.");

const base = z.object({
  installId: INSTALL_ID,
  // Optional only to retain legacy files; public readers withhold rows without stable identity.
  eventId: z.string().min(3).max(96).regex(/^[A-Za-z0-9:_-]+$/).optional(),
  capturedAt: z.string().datetime({ offset: true }).describe("ISO time the event happened in-game."),
});

// --- Open-world records (anonymous: no character or guild names, no chat) ---

export const npcSighting = base.extend({
  kind: z.literal("npc_sighting"),
  npcId: z.number().int().positive(),
  name: z.string().min(1).max(120),
  mapId: z.number().int().nonnegative(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  level: z.number().int().min(1).max(100),
  reaction: z.enum(["friendly", "neutral", "hostile"]),
  positionKind: z.enum(["player", "npc"]).optional().describe("Whose coordinates were measured; legacy unknown positions never become spawn pins."),
});

export const lootWindow = base.extend({
  kind: z.literal("loot"),
  sourceNpcId: z.number().int().positive().optional(),
  sourceObjectId: z.number().int().positive().optional(),
  sourceEvidence: z.literal("loot-api").optional().describe("Legacy target guesses are withheld from public loot observations."),
  items: z.array(z.object({ itemId: z.number().int().positive(), count: z.number().int().min(1).max(1000) })).max(50),
}).refine((r) => r.sourceNpcId !== undefined || r.sourceObjectId !== undefined, {
  message: "loot needs a source: npc or object",
});

export const questEvent = base.extend({
  kind: z.literal("quest"),
  questId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  level: z.number().int().min(1).max(100),
  giverNpcId: z.number().int().positive().optional(),
  turnInNpcId: z.number().int().positive().optional(),
  rewardItemIds: z.array(z.number().int().positive()).max(20).default([]),
});

export const vendorList = base.extend({
  kind: z.literal("vendor"),
  vendorNpcId: z.number().int().positive(),
  items: z.array(z.object({
    itemId: z.number().int().positive(),
    priceCopper: z.number().int().nonnegative(),
    limitedStock: z.number().int().positive().optional(),
  })).min(1).max(200),
});

export const itemSeen = base.extend({
  kind: z.literal("item_seen"),
  itemId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  quality: z.enum(["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact", "heirloom"]),
  itemLevel: z.number().int().min(1).max(1000).optional(),
});

// --- Guild-consented records (named: published only by an officer upload) ---

export const guildSnapshot = base.extend({
  kind: z.literal("guild_snapshot"),
  guildName: z.string().min(2).max(60),
  realm: z.string().min(2).max(60),
  faction: z.enum(["alliance", "horde"]),
  claimToken: z.string().min(16).optional().describe("Legacy field; never proof of officer authority."),
  members: z.array(z.object({
    name: z.string().min(2).max(30),
    rank: z.string().min(1).max(60),
    level: z.number().int().min(1).max(100),
    class: z.string().min(1).max(30),
    lastOnlineDays: z.number().min(0).max(3650),
  })).min(1).max(2000),
});

export const raidLockout = base.extend({
  kind: z.literal("raid_lockout"),
  guildName: z.string().min(2).max(60),
  realm: z.string().min(2).max(60),
  instance: z.string().min(1).max(120),
  difficulty: z.string().min(1).max(60),
  bossesKilled: z.array(z.string().min(1).max(120)).max(60),
  resetAt: z.string().datetime({ offset: true }),
});

export const attendance = base.extend({
  kind: z.literal("attendance"),
  guildName: z.string().min(2).max(60),
  realm: z.string().min(2).max(60),
  instance: z.string().min(1).max(120),
  present: z.array(z.string().min(2).max(30)).min(1).max(100),
});

export const lootAward = base.extend({
  kind: z.literal("loot_award"),
  guildName: z.string().min(2).max(60),
  realm: z.string().min(2).max(60),
  itemId: z.number().int().positive(),
  itemName: z.string().min(1).max(200),
  recipient: z.string().min(2).max(30),
  sourceBoss: z.string().min(1).max(120),
});

export const gearSnapshot = base.extend({
  kind: z.literal("gear_snapshot"),
  character: z.string().min(2).max(30),
  realm: z.string().min(2).max(60),
  equipped: z.array(z.object({
    slot: z.string().min(1).max(40),
    itemId: z.number().int().positive(),
    itemLevel: z.number().int().min(1).max(1000),
  })).min(1).max(30),
});

export const collectionCatalog = base.extend({
  kind: z.literal("collection_catalog"),
  collection: z.string().min(1).max(40),
  source: z.string().min(1).max(80),
  itemId: z.number().int().positive(),
});

export const collectionOwned = base.extend({
  kind: z.literal("collection_owned"),
  collection: z.string().min(1).max(40),
  itemId: z.number().int().positive(),
});

// --- Addon 0.3.3: completion tracker (achievements, reputation, titles, quest chains) ---
// Catalog rows are game facts with no player data: readers list an entry once 3 installs agree on it.
// Owned rows are one character's own progress. They follow collection_owned: named data, shared only with
// the "collection" choice and a verified install grant (kb/src/publication.ts).

/**
 * Opaque per-install label for one character: 8 hex digits the addon derives from the install id and the
 * character's GUID. It is not a name and is not meant to be turned back into one.
 */
export const CHARACTER_KEY = z.string().regex(/^[0-9a-f]{8}$/);

const COUNT = z.number().int().min(0).max(5000);
const GAME_ID = z.number().int().positive().max(2_000_000_000);

export const achievementCatalog = base.extend({
  kind: z.literal("achievement_catalog"),
  achievementId: GAME_ID,
  name: z.string().min(1).max(120),
  categoryId: z.number().int().nonnegative().max(2_000_000_000),
  category: z.string().min(1).max(80),
  parentCategory: z.string().min(1).max(80).optional(),
  points: z.number().int().min(0).max(1000),
  criteriaCount: COUNT.describe("The achievement's real criteria count; `criteria` keeps the first 100."),
  criteria: z.array(z.object({
    text: z.string().max(120),
    required: z.number().int().min(0).max(2_000_000_000),
  })).max(100),
}).refine((row) => row.criteria.length <= row.criteriaCount, { message: "criteria cannot outnumber criteriaCount", path: ["criteria"] });

export const reputationCatalog = base.extend({
  kind: z.literal("reputation_catalog"),
  factionId: GAME_ID,
  name: z.string().min(1).max(80),
  header: z.string().min(1).max(80).optional(),
  major: z.boolean().optional().describe("A renown faction: its ranks are not the eight standings."),
});

export const titleCatalog = base.extend({
  kind: z.literal("title_catalog"),
  titleId: z.number().int().positive().max(5000),
  name: z.string().min(1).max(80),
});

export const questChainCatalog = base.extend({
  kind: z.literal("quest_chain_catalog"),
  questLineId: GAME_ID,
  name: z.string().min(1).max(120),
  questIds: z.array(GAME_ID).min(1).max(80),
});

const ownedBase = base.extend({
  characterKey: CHARACTER_KEY,
  class: z.string().min(2).max(20).regex(/^[A-Za-z]+$/).describe("Class token from UnitClass, e.g. MAGE."),
  level: z.number().int().min(1).max(100),
});

export const achievementOwned = ownedBase.extend({
  kind: z.literal("achievement_owned"),
  achievementId: GAME_ID,
  completed: z.boolean(),
  earnedByMe: z.boolean().optional().describe("False when the achievement is complete on the account but not by this character."),
  earnedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  criteriaMet: COUNT,
  criteriaTotal: COUNT,
}).superRefine((row, ctx) => {
  if (row.criteriaMet > row.criteriaTotal) ctx.addIssue({ code: "custom", message: "criteriaMet cannot exceed criteriaTotal", path: ["criteriaMet"] });
  if (row.earnedOn && !row.completed) ctx.addIssue({ code: "custom", message: "only a completed achievement has a date", path: ["earnedOn"] });
});

export const reputationOwned = ownedBase.extend({
  kind: z.literal("reputation_owned"),
  factionId: GAME_ID,
  reaction: z.number().int().min(1).max(20).describe("The client's standing index: 1 Hated up to 8 Exalted."),
  standing: z.number().int().min(-1_000_000).max(10_000_000),
  floor: z.number().int().min(-1_000_000).max(10_000_000),
  ceiling: z.number().int().min(-1_000_000).max(10_000_000),
}).refine((row) => row.floor <= row.ceiling, { message: "floor cannot exceed ceiling", path: ["floor"] });

/** Titles and completed quests are sent as additions: the union of a character's rows is what it has. */
export const titleOwned = ownedBase.extend({
  kind: z.literal("title_owned"),
  titleIds: z.array(z.number().int().positive().max(5000)).min(1).max(200),
});

export const questOwned = ownedBase.extend({
  kind: z.literal("quest_owned"),
  questIds: z.array(GAME_ID).min(1).max(200),
});

/** The kinds that hold one character's own progress. Named data, like collection_owned. */
export const COMPLETION_OWNED_KINDS: readonly string[] = ["achievement_owned", "reputation_owned", "title_owned", "quest_owned"];

export const auctionScan = base.extend({
  kind: z.literal("auction_scan"),
  realm: z.string().min(2).max(60),
  itemId: z.number().int().positive(),
  copper: z.number().int().nonnegative(),
  // Addon 0.2.2+: copper is per unit of a `count`-sized stack. 0.2.1 rows omit both and stored the stack total.
  count: z.number().int().min(1).max(1000).optional(),
  priceBasis: z.literal("unit").optional(),
});

// Whole-record validation: one out-of-range tuple would drop a part's 1,000 items, so any safe integer
// passes. Troll listings far above 200k gold are real auction-house prices.
const SCAN_COUNT = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const SCAN_COPPER = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/**
 * One part of a full auction-house scan the player started (addon 0.3.0+). Each item is
 * [itemId, auctions, quantity, minUnit, marketUnit], copper per unit. A scan is split into parts of
 * at most 1,000 items. These rows feed the market rollup, not the general corpus (kb/src/corpus.ts).
 */
export const auctionSnapshot = base.extend({
  kind: z.literal("auction_snapshot"),
  // Plain realm names only (kb/src/market.ts): the name is published once 3 reporters scanned there.
  realm: z.string().min(2).max(60).refine(validRealm, { message: "not a realm name" }),
  scanId: z.string().min(3).max(96).regex(/^[A-Za-z0-9:_-]+$/),
  part: z.number().int().min(1).max(100),
  parts: z.number().int().min(1).max(100),
  items: z.array(z.tuple([z.number().int().positive(), SCAN_COUNT, SCAN_COUNT, SCAN_COPPER, SCAN_COPPER])).min(1).max(1000),
}).refine((row) => row.part <= row.parts, { message: "part cannot exceed parts" });

export const recipeSeen = base.extend({
  kind: z.literal("recipe_seen"),
  profession: z.string().min(1).max(40),
  recipe: z.string().min(1).max(120),
  skillMin: z.number().int().min(1).max(500),
  skillMax: z.number().int().min(1).max(500),
  points: z.number().int().min(1).max(10),
  reagents: z.array(z.object({
    item: z.string().min(1).max(80),
    count: z.number().int().min(1).max(1000),
  })).min(1).max(20),
});

/** What a trade-skill or craft window showed: a recipe's colour at the player's rank. Thresholds are inferred server-side. */
export const recipeObserved = base.extend({
  kind: z.literal("recipe_observed"),
  profession: z.string().min(1).max(40),
  rank: z.number().int().min(1).max(500),
  maxRank: z.number().int().min(1).max(500).optional(),
  recipe: z.string().min(1).max(120),
  difficulty: z.enum(["optimal", "medium", "easy", "trivial"]),
  productItemId: z.number().int().positive().optional(),
  reagents: z.array(z.object({
    item: z.string().min(1).max(80),
    count: z.number().int().min(1).max(1000),
  })).max(20),
});

/** What a trainer window listed: a profession recipe's required rank and training cost. */
export const trainerSeen = base.extend({
  kind: z.literal("trainer_seen"),
  profession: z.string().min(1).max(40),
  recipe: z.string().min(1).max(120),
  requiredRank: z.number().int().min(1).max(500),
  costCopper: z.number().int().nonnegative().max(2_000_000_000).optional(),
});

export const priceSeen = base.extend({
  kind: z.literal("price_seen"),
  item: z.string().min(1).max(80),
  copper: z.number().int().nonnegative(),
});

const COPPER = z.number().int().nonnegative().max(2_000_000_000);
const MONEY_CATEGORY = z.enum(["loot", "quest", "vendor", "auction", "flight", "postage", "barber", "respec", "auction_spend"]);

export const goldSnapshot = base.extend({
  kind: z.literal("gold_snapshot"),
  character: z.string().min(2).max(30),
  realm: z.string().min(2).max(60),
  currentCopper: COPPER,
  peakCopper: COPPER,
}).refine((row) => row.peakCopper >= row.currentCopper, {
  message: "peak gold cannot be below current gold",
});

export const moneyEvent = base.extend({
  kind: z.literal("money_event"),
  character: z.string().min(2).max(30),
  realm: z.string().min(2).max(60),
  category: MONEY_CATEGORY,
  copper: COPPER.min(1),
});

// --- Addon 0.2.6: installed addons (only when the player turned it on) and zone bounds ---

/** One installed addon as the AddOns list shows it. No settings, no other addon's SavedVariables. */
export const addonSeen = base.extend({
  kind: z.literal("addon_seen"),
  name: z.string().min(1).max(100).describe("The addon's folder name."),
  title: z.string().min(1).max(120),
  version: z.string().min(1).max(40).optional().describe("The .toc Version field."),
  loaded: z.boolean(),
});

const WORLD_UNITS = z.number().min(-100_000).max(100_000);

/** A zone's corners in world coordinates, from C_Map.GetWorldPosFromMapPos at (0,0) and (1,1). */
export const mapBounds = base.extend({
  kind: z.literal("map_bounds"),
  mapId: z.number().int().positive(),
  continentId: z.number().int().nonnegative(),
  left: WORLD_UNITS,
  top: WORLD_UNITS,
  right: WORLD_UNITS,
  bottom: WORLD_UNITS,
}).refine((row) => row.left !== row.right && row.top !== row.bottom, {
  message: "map bounds need a width and a height",
});

/** The game client's version and build from GetBuildInfo(), e.g. 1.60.1.70450. Addon 0.2.6+. */
export const CLIENT_BUILD = z.string().max(32).regex(/^\d+(\.\d+)+$/);

// --- Addon 0.2.7: the player's own talent build, read through the game's trait API ---

/** One spent talent node. `nodeId` is the client's trait node id; `choice` is the zero-based entry of a choice node. */
const talentNode = z.object({
  nodeId: z.number().int().positive(),
  ranks: z.number().int().min(1).max(50),
  choice: z.number().int().min(0).max(3).optional(),
});

/**
 * One talent build: one spec group of one character, no name. `loadoutString` is Blizzard's own export from
 * C_Traits.GenerateImportString when the client allowed it; `exportStatus` says how that went.
 */
export const talentSnapshot = base.extend({
  kind: z.literal("talent_snapshot"),
  class: z.string().min(2).max(20).regex(/^[A-Za-z]+$/).describe("Class token from UnitClass, e.g. MAGE."),
  level: z.number().int().min(1).max(100),
  group: z.number().int().min(1).max(2).describe("Spec group: 1 primary, 2 secondary (dual spec from level 40)."),
  active: z.boolean(),
  configId: z.number().int().nonnegative(),
  treeId: z.number().int().positive(),
  specId: z.number().int().positive().optional(),
  clientBuild: CLIENT_BUILD.optional(),
  serializationVersion: z.number().int().nonnegative().max(255).optional(),
  loadoutString: z.string().min(1).max(2000).regex(/^[A-Za-z0-9+/]+$/).optional(),
  exportStatus: z.enum(["ok", "unavailable", "failed", "empty", "unexpected"]),
  points: z.number().int().nonnegative().max(500),
  nodes: z.array(talentNode).max(600),
}).superRefine((row, ctx) => {
  if (row.points !== row.nodes.reduce((sum, node) => sum + node.ranks, 0)) {
    ctx.addIssue({ code: "custom", message: "talent points must equal the sum of node ranks", path: ["points"] });
  }
  if (new Set(row.nodes.map((node) => node.nodeId)).size !== row.nodes.length) {
    ctx.addIssue({ code: "custom", message: "talent node ids must be unique", path: ["nodes"] });
  }
});

const recordSchemas = {
  npc_sighting: npcSighting,
  loot: lootWindow,
  quest: questEvent,
  vendor: vendorList,
  item_seen: itemSeen,
  guild_snapshot: guildSnapshot,
  raid_lockout: raidLockout,
  attendance,
  loot_award: lootAward,
  gear_snapshot: gearSnapshot,
  collection_catalog: collectionCatalog,
  collection_owned: collectionOwned,
  achievement_catalog: achievementCatalog,
  reputation_catalog: reputationCatalog,
  title_catalog: titleCatalog,
  quest_chain_catalog: questChainCatalog,
  achievement_owned: achievementOwned,
  reputation_owned: reputationOwned,
  title_owned: titleOwned,
  quest_owned: questOwned,
  auction_scan: auctionScan,
  auction_snapshot: auctionSnapshot,
  recipe_seen: recipeSeen,
  price_seen: priceSeen,
  recipe_observed: recipeObserved,
  trainer_seen: trainerSeen,
  gold_snapshot: goldSnapshot,
  money_event: moneyEvent,
  addon_seen: addonSeen,
  map_bounds: mapBounds,
  talent_snapshot: talentSnapshot,
} as const;

export type RecordKind = keyof typeof recordSchemas;
export const ALL_RECORD_KINDS = Object.keys(recordSchemas) as RecordKind[];
/**
 * The kinds the public corpus API may return. An allowlist: a new kind is private until someone adds it
 * here. Addon lists (`addon_seen`) are published only as the leaderboard's counts at three or more
 * installs, never row by row.
 */
const PUBLIC_KIND_LIST = [
  "npc_sighting", "loot", "quest", "vendor", "item_seen", "guild_snapshot", "raid_lockout", "attendance",
  "loot_award", "gear_snapshot", "collection_catalog", "collection_owned", "auction_scan", "recipe_seen",
  "price_seen", "recipe_observed", "trainer_seen", "gold_snapshot", "money_event", "map_bounds",
  // Completion tracker. The catalogs are anonymous game facts. The owned kinds are listed the way
  // collection_owned is: the corpus withholds them unless a verified install grant covers them.
  "achievement_catalog", "reputation_catalog", "title_catalog", "quest_chain_catalog",
  "achievement_owned", "reputation_owned", "title_owned", "quest_owned",
] as const satisfies readonly RecordKind[];
export const PUBLIC_RECORD_KINDS: readonly string[] = PUBLIC_KIND_LIST;

const anyRecord = z.discriminatedUnion("kind", [
  npcSighting, lootWindow, questEvent, vendorList, itemSeen,
  guildSnapshot, raidLockout, attendance, lootAward, gearSnapshot,
  collectionCatalog, collectionOwned, achievementCatalog, reputationCatalog, titleCatalog, questChainCatalog,
  achievementOwned, reputationOwned, titleOwned, questOwned, auctionScan, auctionSnapshot, recipeSeen, priceSeen, recipeObserved, trainerSeen,
  goldSnapshot, moneyEvent, addonSeen, mapBounds, talentSnapshot,
]);

export type IntakeRecord = z.infer<typeof anyRecord>;

export const uploadPayload = z.object({
  addonVersion: z.string().min(1).max(20),
  clientBuild: CLIENT_BUILD.optional(),
  records: z.array(z.unknown()).min(1).max(2000),
});

export interface AcceptedRecord {
  index: number;
  kind: RecordKind;
}

export interface RejectedRecord {
  index: number;
  reason: string;
}

export interface ValidationResult {
  accepted: AcceptedRecord[];
  rejected: RejectedRecord[];
}

/** An upload reduced to its accepted records: what a store may persist, what a corpus may serve. */
export interface CanonicalUpload {
  addonVersion: string;
  clientBuild?: string;
  /**
   * Keyed hash of the upload address (see `reporterHash`), added by the intake route, never read from
   * the request body. The market counts installs behind one address once. Never published.
   */
  reporter?: string;
  records: IntakeRecord[];
}

export interface ParsedRecords {
  records: IntakeRecord[];
  receipt: ValidationResult;
}

export type ParsedUpload =
  | { ok: true; upload: CanonicalUpload; receipt: ValidationResult }
  | { ok: false; receipt: ValidationResult };

/** The record's own `kind`; a prototype or inherited key never names a schema. */
function ownKindOf(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || !Object.hasOwn(raw, "kind")) return undefined;
  return (raw as { kind: unknown }).kind;
}

/**
 * Parse every record against its own kind schema, keeping the parsed value and the original
 * index. Only own `kind` keys name a schema: inherited or prototype keys are unknown kinds.
 */
export function parseRecords(records: readonly unknown[]): ParsedRecords {
  const parsed: IntakeRecord[] = [];
  const accepted: AcceptedRecord[] = [];
  const rejected: RejectedRecord[] = [];
  records.forEach((raw, index) => {
    const kind = ownKindOf(raw);
    const schema =
      typeof kind === "string" && Object.hasOwn(recordSchemas, kind)
        ? recordSchemas[kind as RecordKind]
        : undefined;
    if (!schema) {
      rejected.push({ index, reason: `unknown kind: ${String(kind)}` });
      return;
    }
    const r = schema.safeParse(raw);
    if (r.success) {
      parsed.push(r.data as IntakeRecord);
      accepted.push({ index, kind: kind as RecordKind });
    } else {
      rejected.push({ index, reason: r.error.issues[0]?.message ?? "invalid record" });
    }
  });
  return { records: parsed, receipt: { accepted, rejected } };
}

/**
 * Parse an upload envelope. `ok` means the envelope itself parsed, so a valid envelope whose
 * rows were all rejected still returns an upload with zero records — callers decide what that means.
 */
export function parseUpload(payload: unknown): ParsedUpload {
  const parsed = uploadPayload.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      receipt: { accepted: [], rejected: [{ index: -1, reason: "payload needs addonVersion + records[1..2000]" }] },
    };
  }
  const { records, receipt } = parseRecords(parsed.data.records);
  const { addonVersion, clientBuild } = parsed.data;
  return { ok: true, upload: { addonVersion, ...(clientBuild ? { clientBuild } : {}), records }, receipt };
}

/**
 * Validate an upload: every record is checked against its kind schema.
 * Implausible data is rejected with a reason; nothing is stored here.
 * Rate limits (per install / per IP) are enforced at the route layer.
 */
export function validateUpload(payload: unknown): ValidationResult {
  return parseUpload(payload).receipt;
}

/** Summarize accepted records for the pre-send preview: counts per kind, never names. */
export function summarizeKinds(records: IntakeRecord[]): Partial<Record<string, number>> {
  const counts: Partial<Record<string, number>> = {};
  for (const r of records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}
