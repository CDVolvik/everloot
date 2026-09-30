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
});

export const lootWindow = base.extend({
  kind: z.literal("loot"),
  sourceNpcId: z.number().int().positive().optional(),
  sourceObjectId: z.number().int().positive().optional(),
  items: z.array(z.object({ itemId: z.number().int().positive(), count: z.number().int().min(1).max(1000) })).min(1).max(50),
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
  claimToken: z.string().min(16).describe("Officer claim token: proves this upload may publish."),
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

export const priceSeen = base.extend({
  kind: z.literal("price_seen"),
  item: z.string().min(1).max(80),
  copper: z.number().int().nonnegative(),
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
} as const;

export type RecordKind = keyof typeof recordSchemas;
export const ALL_RECORD_KINDS = Object.keys(recordSchemas) as RecordKind[];

const anyRecord = z.discriminatedUnion("kind", [
  npcSighting, lootWindow, questEvent, vendorList, itemSeen,
  guildSnapshot, raidLockout, attendance, lootAward, gearSnapshot,
  collectionCatalog, collectionOwned, auctionScan, recipeSeen, priceSeen,
]);

export type IntakeRecord = z.infer<typeof anyRecord>;

export const uploadPayload = z.object({
  addonVersion: z.string().min(1).max(20),
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

/**
 * Validate an upload: every record is checked against its kind schema.
 * Implausible data is rejected with a reason; nothing is stored here.
 * Rate limits (per install / per IP) are enforced at the route layer.
 */
export function validateUpload(payload: unknown): ValidationResult {
  const parsed = uploadPayload.safeParse(payload);
  if (!parsed.success) {
    return { accepted: [], rejected: [{ index: -1, reason: "payload needs addonVersion + records[1..2000]" }] };
  }
  const accepted: AcceptedRecord[] = [];
  const rejected: RejectedRecord[] = [];
  parsed.data.records.forEach((raw, index) => {
    const kind = (raw as { kind?: unknown } | null)?.kind;
    const schema = typeof kind === "string" ? recordSchemas[kind as RecordKind] : undefined;
    if (!schema) {
      rejected.push({ index, reason: `unknown kind: ${String(kind)}` });
      return;
    }
    const r = schema.safeParse(raw);
    if (r.success) accepted.push({ index, kind: kind as RecordKind });
    else rejected.push({ index, reason: r.error.issues[0]?.message ?? "invalid record" });
  });
  return { accepted, rejected };
}

/** Summarize accepted records for the pre-send preview: counts per kind, never names. */
export function summarizeKinds(records: IntakeRecord[]): Partial<Record<string, number>> {
  const counts: Partial<Record<string, number>> = {};
  for (const r of records) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}
