import { z } from "zod";

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

export const auctionScan = base.extend({
  kind: z.literal("auction_scan"),
  realm: z.string().min(2).max(60),
  itemId: z.number().int().positive(),
  copper: z.number().int().nonnegative(),
  // Addon 0.2.2+: copper is per unit of a `count`-sized stack. 0.2.1 rows omit both and stored the stack total.
  count: z.number().int().min(1).max(1000).optional(),
  priceBasis: z.literal("unit").optional(),
});

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
  auction_scan: auctionScan,
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

const anyRecord = z.discriminatedUnion("kind", [
  npcSighting, lootWindow, questEvent, vendorList, itemSeen,
  guildSnapshot, raidLockout, attendance, lootAward, gearSnapshot,
  collectionCatalog, collectionOwned, auctionScan, recipeSeen, priceSeen, recipeObserved, trainerSeen,
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
