/**
 * Public rollups — sanitized gameplay data for MCP/public consumption.
 * Only exposes facts that pass corroboration, opt-out, and officer authority checks.
 * Does NOT read raw uploads; reads pre-computed public views.
 */

import type { DB } from "./db.js";

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
  lastUpdated: 0,
};

/** Load public rollups from the snapshot corpus. */
export function loadPublicRollups(db: DB): void {
  // This is a placeholder — the actual implementation reads from the public snapshot
  // which contains pre-computed rollups that have already passed corroboration/opt-out.
  // For now, return empty; the real impl queries the snapshot's public views.
  publicCache.lastUpdated = Date.now();
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
  return publicCache.goldFacts.get(key) ?? { snapshots: [], events: [] };
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