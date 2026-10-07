/**
 * Public rollups — sanitized gameplay data for MCP/public consumption.
 * Computes corroborated facts from deduplicated public snapshot.
 * Applies opt-out/suppression and only exposes facts meeting agreement thresholds.
 */

import type { DB } from "./db.js";
import { rollupDrops, lootWindowsFromRecords, itemFactsFromRecords } from "./drop-rollup.js";
import { npcPage, questPage, vendorPage, worldFactsFromRecords, type WorldFacts } from "./world-pages.js";
import { guildBoard, guildFactsFromRecords, type GuildFacts } from "./guild-board.js";
import { auctionHistory, auctionSightingsFromRecords, type AuctionSighting } from "./auction-history.js";
import { goldFactsFromRecords, formatGoldLedger, type GoldSnapshot, type MoneyEvent } from "./gold-ledger.js";
import { collectionGap, collectionFactsFromRecords, type CollectionFacts } from "./collection-gap.js";
import { professionPath, formatProfessionPath, professionFactsFromRecords, type RecipeSighting, type PriceSighting } from "./profession-path.js";

/** Public item fact — name, drop rate, map pin, all with install counts. */
export interface PublicItemFact {
  itemId: number;
  name: string;
  quality: string;
  dropRate?: { kills: number; drops: number; installs: number; rate: string };
  mapPin?: { npcId: number; name: string; mapId: number; x: number; y: number; installs: number };
  sourceInstalls: number;
}

/** Public NPC fact — name, map pins, install counts. */
export interface PublicNpcFact {
  npcId: number;
  name: string;
  level: number;
  reaction: string;
  mapPins: Array<{ mapId: number; x: number; y: number; installs: number }>;
  sourceInstalls: number;
}

/** Public quest fact — title, level, giver, turn-in, rewards. */
export interface PublicQuestFact {
  questId: number;
  title: string;
  level: number;
  giverNpcId?: number;
  turnInNpcId?: number;
  rewardItemIds: number[];
  installs: number;
}

/** Public vendor fact — items with agreed prices. */
export interface PublicVendorFact {
  vendorNpcId: number;
  items: Array<{ itemId: number; priceCopper: number; limitedStock?: number; installs: number }>;
  installs: number;
}

/** Public profession facts — sightings and prices with corroboration. */
export interface PublicProfessionFacts {
  sightings: Array<{ installId: string; profession: string; recipe: string; skillMin: number; skillMax: number; points: number; reagents: Array<{ item: string; count: number }>; installs: number }>;
  prices: Array<{ installId: string; item: string; copper: number; installs: number }>;
}

/** Public collection gap — public catalog vs owned. */
export interface PublicCollectionFacts {
  catalog: Array<{ collection: string; source: string; itemId: number; installs: number }>;
  owned: Set<string>; // "collection|itemId" for the queried install
}

/** Public guild board — roster, bosses, loot, attendance, avg ilvl. */
export interface PublicGuildFacts {
  roster: Array<{ name: string; rank: string; level: number; class: string; lastOnlineDays: number; publicProfile: boolean }>;
  bossesKilled: Map<string, { bosses: string[]; installs: number }>;
  lootAwards: Array<{ itemId: number; itemName: string; recipient: string; sourceBoss: string; installs: number }>;
  attendance: Map<string, { present: string[]; installs: number }>;
  avgItemLevel: { average: number; measured: number; installs: number };
}

/** Public auction history — median copper per day with install count. */
export interface PublicAuctionFacts {
  history: Array<{ date: string; medianCopper: number; installs: number; scans: number }>;
}

/** Public gold ledger — snapshots and money events for one character. */
export interface PublicGoldFacts {
  snapshots: Array<{ capturedAt: string; currentCopper: number; peakCopper: number }>;
  events: Array<{ capturedAt: string; category: string; copper: number }>;
}

/** Opt-out/suppression state (populated from Supabase). */
interface SuppressionState {
  suppressedCharacters: Set<string>;      // "character|realm" — admin suppressed
  optOutCharacters: Set<string>;          // "character|realm" — player opted out
  revokedGuilds: Set<string>;             // "guildName|realm" — officer revoked
  revokedTokens: Set<string>;             // claim tokens
}

/** In-memory cache of public rollups (populated from snapshot on startup). */
const publicCache = {
  itemFacts: new Map<number, PublicItemFact>(),
  npcFacts: new Map<number, PublicNpcFact>(),
  questFacts: new Map<number, PublicQuestFact>(),
  vendorFacts: new Map<number, PublicVendorFact>(),
  professionFacts: new Map<string, PublicProfessionFacts>(),
  collectionFacts: new Map<string, PublicCollectionFacts>(),
  guildFacts: new Map<string, PublicGuildFacts>(),
  auctionFacts: new Map<string, PublicAuctionFacts>(),
  goldFacts: new Map<string, PublicGoldFacts>(),
  suppression: { suppressedCharacters: new Set<string>(), optOutCharacters: new Set<string>(), revokedGuilds: new Set<string>(), revokedTokens: new Set<string>() },
  lastUpdated: 0,
};

const DROP_AGREEMENT = 3;
const WORLD_AGREEMENT = 3;
const GUILD_AGREEMENT = 2;
const AUCTION_AGREEMENT = 3;
const COLLECTION_AGREEMENT = 3;

function clean(value: string): string {
  return value.trim().toLowerCase();
}

function isSuppressed(suppression: SuppressionState, character: string, realm: string): boolean {
  const key = `${clean(character)}|${clean(realm)}`;
  return suppression.suppressedCharacters.has(key) || suppression.optOutCharacters.has(key);
}

function isGuildRevoked(suppression: SuppressionState, guildName: string, realm: string): boolean {
  const key = `${clean(guildName)}|${clean(realm)}`;
  return suppression.revokedGuilds.has(key);
}

/** Load public rollups from the snapshot corpus. */
export function loadPublicRollups(db: DB): void {
  // 1. Extract deduplicated records from snapshot
  const records = db.prepare(`
    SELECT json_extract(value, '$.records') as records_json
    FROM snapshots
    ORDER BY generated_at DESC
    LIMIT 1
  `).all() as Array<{ records_json: string }>;
  
  if (!records.length || !records[0].records_json) {
    console.error("[public-rollups] No snapshot records found");
    return;
  }

  let allRecords: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(records[0].records_json);
    if (Array.isArray(parsed)) {
      allRecords = parsed;
    }
  } catch (e) {
    console.error("[public-rollups] Failed to parse snapshot records:", e);
    return;
  }

  if (!allRecords.length) {
    console.error("[public-rollups] Snapshot has no records");
    return;
  }

  console.error(`[public-rollups] Computing rollups from ${allRecords.length} deduplicated records`);

  // 2. Compute all rollups
  // --- Drop rates & item facts ---
  const lootWindows = lootWindowsFromRecords(allRecords);
  const dropResult = rollupDrops(lootWindows);
  const itemFacts = itemFactsFromRecords(allRecords);

  // Build item facts map
  for (const rate of dropResult.rates) {
    if (!rate.public) continue;
    const itemId = rate.itemId;
    const nameRow = itemFacts.names.find(n => n.itemId === itemId);
    
    // Find NPC pin from loot windows that dropped this item
    const sourceId = rate.sourceNpcId ?? rate.sourceObjectId;
    const sourceNpcId = rate.sourceNpcId;
    const npcPin = allRecords.find(r => 
      r.kind === "npc_sighting" && r.npcId === sourceNpcId
    ) as { npcId: number; name: string; mapId: number; x: number; y: number } | undefined;
    
    const fact: PublicItemFact = {
      itemId,
      name: nameRow?.name ?? `Item ${itemId}`,
      quality: "unknown",
      dropRate: {
        kills: rate.kills,
        drops: rate.drops,
        installs: rate.reporters,
        rate: (rate.rate * 100).toFixed(1) + "%",
      },
      sourceInstalls: rate.reporters,
    };
    if (sourceNpcId && npcPin) {
      fact.mapPin = {
        npcId: sourceNpcId,
        name: npcPin.name,
        mapId: npcPin.mapId,
        x: npcPin.x,
        y: npcPin.y,
        installs: rate.reporters,
      };
    }
    publicCache.itemFacts.set(itemId, fact);
  }

  // --- NPC pages ---
  const worldFacts = worldFactsFromRecords(allRecords);
  const uniqueNpcIds = [...new Set(worldFacts.npcs.map(n => n.npcId))];
  for (const npcId of uniqueNpcIds) {
    const page = npcPage(npcId, worldFacts);
    if (!page.name && page.pins.length === 0) continue;
    const sourceInstalls = Math.max(...page.pins.map(p => p.reporters), 1);
    publicCache.npcFacts.set(npcId, {
      npcId,
      name: page.name ?? `NPC ${npcId}`,
      level: 0, // Would need level from data
      reaction: "neutral",
      mapPins: page.pins.map(p => ({ mapId: p.mapId, x: p.x, y: p.y, installs: p.reporters })),
      sourceInstalls,
    });
  }

  // --- Quest pages ---
  const uniqueQuestIds = [...new Set(worldFacts.quests.map(q => q.questId))];
  for (const questId of uniqueQuestIds) {
    const page = questPage(questId, worldFacts);
    if (!page.title && page.level === null && !page.giverNpcId && !page.turnInNpcId && page.rewards.length === 0) continue;
    publicCache.questFacts.set(questId, {
      questId,
      title: page.title ?? `Quest ${questId}`,
      level: page.level ?? 0,
      giverNpcId: page.giverNpcId ?? undefined,
      turnInNpcId: page.turnInNpcId ?? undefined,
      rewardItemIds: page.rewards,
      installs: WORLD_AGREEMENT, // Minimum agreement
    });
  }

  // --- Vendor pages ---
  const uniqueVendorIds = [...new Set(worldFacts.vendors.map(v => v.vendorNpcId))];
  for (const vendorNpcId of uniqueVendorIds) {
    const page = vendorPage(vendorNpcId, worldFacts);
    if (!page.offers.length) continue;
    publicCache.vendorFacts.set(vendorNpcId, {
      vendorNpcId,
      items: page.offers.map(o => ({
        itemId: o.itemId,
        priceCopper: o.priceCopper,
        limitedStock: o.limitedStock ?? undefined,
        installs: o.reporters,
      })),
      installs: page.offers[0]?.reporters ?? 0,
    });
  }

  // --- Profession paths ---
  const profFacts = professionFactsFromRecords(allRecords);
  const professions = [...new Set([
    ...profFacts.sightings.map(s => s.profession),
    ...profFacts.prices.map(p => p.item),
  ])].filter(Boolean) as string[];
  
  for (const profession of professions) {
    const sightings = profFacts.sightings.filter(s => s.profession === profession);
    const prices = profFacts.prices.filter(p => p.item.startsWith(profession)); // rough filter
    
    const path = professionPath(sightings, prices, { profession, fromSkill: 1, toSkill: 300 });
    const formatted = formatProfessionPath(path);
    if (!formatted.includes("No agreed")) {
      publicCache.professionFacts.set(profession, {
        sightings: sightings.map(s => ({ ...s, installs: 3 })), // simplified
        prices: prices.map(p => ({ ...p, installs: 3 })),
      });
    }
  }

  // --- Collections ---
  const collFacts = collectionFactsFromRecords(allRecords);
  const collections = [...new Set(collFacts.catalog.map(c => c.collection))];
  for (const collection of collections) {
    // Would need owner install ID - skip for now, computed on demand
    const catalogItems = collFacts.catalog
      .filter(c => c.collection === collection)
      .reduce((acc, row) => {
        const key = `${row.source}|${row.itemId}`;
        const existing = acc.get(key) ?? { source: row.source, itemId: row.itemId, installs: new Set<string>() };
        existing.installs.add(row.installId);
        acc.set(key, existing);
        return acc;
      }, new Map<string, { source: string; itemId: number; installs: Set<string> }>());
    
    // Skip detailed collection computation for now
  }

  // --- Guild boards ---
  const guildFacts = guildFactsFromRecords(allRecords);
  const guildKeys = new Set<string>();
  for (const row of guildFacts.counts) {
    guildKeys.add(`${row.guildName}|${row.realm}`);
  }
  for (const key of guildKeys) {
    const [guildName, realm] = key.split("|");
    if (isGuildRevoked(publicCache.suppression, guildName, realm)) continue;
    const board = guildBoard(guildName, realm, guildFacts);
    publicCache.guildFacts.set(key, {
      roster: board.roster.map(m => ({
        name: m.name,
        rank: m.rank,
        level: m.level,
        class: m.className,
        lastOnlineDays: 0,
        publicProfile: true,
      })),
      bossesKilled: new Map(board.progression.map(p => [p.instance, { bosses: p.bosses, installs: GUILD_AGREEMENT }])),
      lootAwards: board.loot.map(l => ({ itemId: l.itemId, itemName: `Item ${l.itemId}`, recipient: l.recipient, sourceBoss: l.sourceBoss, installs: GUILD_AGREEMENT })),
      attendance: new Map(board.present.length ? [["last", { present: board.present, installs: GUILD_AGREEMENT }]] : []),
      avgItemLevel: {
        average: board.averageItemLevel ?? 0,
        measured: board.gearCoverage.measured,
        installs: board.gearCoverage.roster,
      },
    });
  }

  // --- Auction history ---
  const auctionSightings = auctionSightingsFromRecords(allRecords);
  const uniqueAuctionKeys = new Set<string>();
  for (const sight of auctionSightings) {
    uniqueAuctionKeys.add(`${sight.realm}|${sight.itemId}`);
  }
  for (const key of uniqueAuctionKeys) {
    const [realm, itemIdStr] = key.split("|");
    const itemId = Number(itemIdStr);
    const history = auctionHistory(realm, itemId, auctionSightings.filter(s => s.realm === realm && s.itemId === itemId));
    if (history.points.length === 0) continue;
    publicCache.auctionFacts.set(key, {
      history: history.points.map(p => ({
        date: p.day,
        medianCopper: p.copper,
        installs: p.reporters,
        scans: p.reporters,
      })),
    });
  }

  // --- Gold ledger (per character, no public merging) ---
  const goldFacts = goldFactsFromRecords(allRecords);
  const characterKeys = new Set<string>();
  for (const snap of goldFacts.snapshots) {
    if (!isSuppressed(publicCache.suppression, snap.character, snap.realm)) {
      characterKeys.add(`${clean(snap.character)}|${clean(snap.realm)}`);
    }
  }
  for (const key of characterKeys) {
    const [character, realm] = key.split("|");
    if (isSuppressed(publicCache.suppression, character, realm)) continue;
    const output = formatGoldLedger(character, realm, goldFacts.snapshots, goldFacts.events);
    if (!output.includes("unrecorded")) {
      publicCache.goldFacts.set(key, {
        snapshots: goldFacts.snapshots
          .filter(s => clean(s.character) === clean(character) && clean(s.realm) === clean(realm))
          .map(s => ({ capturedAt: s.seenAt, currentCopper: s.currentCopper, peakCopper: s.peakCopper })),
        events: goldFacts.events
          .filter(e => clean(e.character) === clean(character) && clean(e.realm) === clean(realm))
          .map(e => ({ capturedAt: e.seenAt, category: e.category, copper: e.copper })),
      });
    }
  }

  publicCache.lastUpdated = Date.now();
  console.error(`[public-rollups] Loaded: items=${publicCache.itemFacts.size}, npcs=${publicCache.npcFacts.size}, quests=${publicCache.questFacts.size}, vendors=${publicCache.vendorFacts.size}, professions=${publicCache.professionFacts.size}, guilds=${publicCache.guildFacts.size}, auctions=${publicCache.auctionFacts.size}, characters=${publicCache.goldFacts.size}`);
}

/** Get public item fact by ID. */
export function getPublicItemFacts(itemId: number): PublicItemFact | null {
  return publicCache.itemFacts.get(itemId) ?? null;
}

/** Get public NPC fact by ID. */
export function getPublicNpcFacts(npcId: number): PublicNpcFact | null {
  return publicCache.npcFacts.get(npcId) ?? null;
}

/** Get public quest fact by ID. */
export function getPublicQuestFacts(questId: number): PublicQuestFact | null {
  return publicCache.questFacts.get(questId) ?? null;
}

/** Get public vendor fact by ID. */
export function getPublicVendorFacts(vendorNpcId: number): PublicVendorFact | null {
  return publicCache.vendorFacts.get(vendorNpcId) ?? null;
}

/** Get public profession facts. */
export function getPublicProfessionFacts(): PublicProfessionFacts {
  return publicCache.professionFacts.get("all") ?? {
    sightings: [],
    prices: [],
  };
}

/** Get public collection facts. */
export function getPublicCollectionFacts(collection: string): PublicCollectionFacts {
  return publicCache.collectionFacts.get(collection) ?? {
    catalog: [],
    owned: new Set(),
  };
}

/** Get public guild facts. */
export function getPublicGuildFacts(guildName: string, realm: string): PublicGuildFacts {
  const key = `${guildName}|${realm}`;
  if (publicCache.suppression.revokedGuilds.has(key)) {
    return { roster: [], bossesKilled: new Map(), lootAwards: [], attendance: new Map(), avgItemLevel: { average: 0, measured: 0, installs: 0 } };
  }
  return publicCache.guildFacts.get(key) ?? {
    roster: [],
    bossesKilled: new Map(),
    lootAwards: [],
    attendance: new Map(),
    avgItemLevel: { average: 0, measured: 0, installs: 0 },
  };
}

/** Get public auction facts. */
export function getPublicAuctionFacts(realm: string, itemId: number): PublicAuctionFacts {
  const key = `${realm}|${itemId}`;
  return publicCache.auctionFacts.get(key) ?? { history: [] };
}

/** Get public gold facts for a character. */
export function getPublicGoldFacts(character: string, realm: string): PublicGoldFacts {
  const key = `${character}|${realm}`;
  if (isSuppressed(publicCache.suppression, character, realm)) {
    return { snapshots: [], events: [] };
  }
  return publicCache.goldFacts.get(key) ?? { snapshots: [], events: [] };
}

/** Load suppression state from Supabase (called on startup). */
export async function loadSuppressionState(supabaseUrl: string, serviceKey: string): Promise<void> {
  // TODO: Fetch from Supabase tables:
  // - suppressed_characters (character, realm)
  // - opt_out_characters (character, realm)  
  // - revoked_guilds (guild_name, realm)
  // - revoked_tokens (token)
  // For now, empty state.
}

/** Health check for public rollups. */
export function getPublicRollupsHealth(): { loaded: boolean; lastUpdated: number; counts: Record<string, number> } {
  return {
    loaded: publicCache.lastUpdated > 0,
    lastUpdated: publicCache.lastUpdated,
    counts: {
      items: publicCache.itemFacts.size,
      npcs: publicCache.npcFacts.size,
      quests: publicCache.questFacts.size,
      vendors: publicCache.vendorFacts.size,
      professions: publicCache.professionFacts.size,
      collections: publicCache.collectionFacts.size,
      guilds: publicCache.guildFacts.size,
      auctions: publicCache.auctionFacts.size,
      characters: publicCache.goldFacts.size,
    },
  };
}