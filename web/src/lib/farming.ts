import { CLIENT_TAXONOMY } from "./items";
import type { NpcRow } from "./world-lists";
import type { ZoneContents, ZoneSummary } from "./zones";

/**
 * What players farm, in the order the farming page shows it. A category is backed by real data or by
 * nothing: mobs with public loot in a placed zone (gold, and cloth or leather by the Trade Goods subclass
 * of what they dropped), or the dungeon entrances in the game files. Herbs and ore come from nodes, and
 * reputation from kills and quests, none of which can be placed in a zone yet, so those stay empty.
 */
export const FARM_CATEGORIES = [
  { slug: "gold", label: "Gold", noun: "gold" },
  { slug: "herbs", label: "Herbs", noun: "herbs" },
  { slug: "ore", label: "Ore", noun: "ore" },
  { slug: "leather", label: "Skins and leather", noun: "skins and leather" },
  { slug: "cloth", label: "Cloth", noun: "cloth" },
  { slug: "reputation", label: "Reputation", noun: "reputation" },
  { slug: "dungeons", label: "Dungeons", noun: "dungeon farms" },
] as const;

export type FarmCategory = (typeof FARM_CATEGORIES)[number]["slug"];

/** Trade Goods (item class 7) subclasses that make a mob a cloth or leather farm. */
const TRADE_GOODS = 7;
const SUBCLASS: Partial<Record<FarmCategory, number>> = { cloth: 5, leather: 6 };

export interface Levels { min: number; max: number }

/** One area in a category: a zone with the mobs that back it, or a dungeon and the zone it is entered from. */
export interface FarmArea {
  key: string;
  zone: ZoneSummary;
  /** The dungeon's name; absent for a zone row. */
  dungeon?: string;
  /** The lowest and highest level players agree on for the mobs here; null when none is agreed. */
  levels: Levels | null;
  /** Mobs placed here with public loot of the category's kind. */
  mobs: number;
}

const itemSubclass = new Map(CLIENT_TAXONOMY.items.filter((r) => r[1] === TRADE_GOODS).map((r) => [r[0], r[2]]));

function byZone(npcs: readonly NpcRow[], items: Map<number, Set<number>>, keep: (items: Set<number>) => boolean): FarmArea[] {
  const zones = new Map<number, { zone: ZoneSummary; levels: number[]; mobs: number }>();
  for (const n of npcs) {
    const dropped = items.get(n.npcId);
    if (!n.zone || !dropped || !keep(dropped)) continue;
    const here = zones.get(n.zone.mapId) ?? { zone: n.zone, levels: [], mobs: 0 };
    here.mobs++;
    if (n.level !== null) here.levels.push(n.level);
    zones.set(n.zone.mapId, here);
  }
  return [...zones.values()].map((z) => ({
    key: String(z.zone.mapId), zone: z.zone, mobs: z.mobs,
    levels: z.levels.length ? { min: Math.min(...z.levels), max: Math.max(...z.levels) } : null,
  }));
}

/**
 * Every category's areas from the NPC list rows, the public loot rates and the zones' contents (for the
 * dungeon entrances). `npcs` and `rates` are empty when storage is down; the dungeons still come through.
 * Rows are by lowest level, unknown levels last, then by name.
 */
export function farmingAreas(
  npcs: readonly NpcRow[],
  rates: readonly { sourceNpcId?: number; itemId: number; drops: number; public: boolean }[],
  zones: readonly ZoneSummary[],
  contents: Map<number, ZoneContents>,
): Record<FarmCategory, FarmArea[]> {
  const items = new Map<number, Set<number>>();
  for (const r of rates) if (r.public && r.drops > 0 && r.sourceNpcId !== undefined) items.set(r.sourceNpcId, (items.get(r.sourceNpcId) ?? new Set()).add(r.itemId));
  const holds = (subclass: number) => (dropped: Set<number>) => [...dropped].some((id) => itemSubclass.get(id) === subclass);

  const dungeons: FarmArea[] = zones.flatMap((zone) => (contents.get(zone.mapId)?.entrances ?? []).filter((e) => !e.raid)
    .map((e) => ({ key: `${zone.mapId}-${e.names.join("|")}`, zone, dungeon: e.names.join(", "), levels: null, mobs: 0 })));

  const order = (rows: FarmArea[]) => rows.sort((a, b) => (a.levels?.min ?? 999) - (b.levels?.min ?? 999) || (a.dungeon ?? a.zone.name).localeCompare(b.dungeon ?? b.zone.name));
  return {
    gold: order(byZone(npcs, items, () => true)),
    herbs: [],
    ore: [],
    leather: order(byZone(npcs, items, holds(SUBCLASS.leather!))),
    cloth: order(byZone(npcs, items, holds(SUBCLASS.cloth!))),
    reputation: [],
    dungeons: order(dungeons),
  };
}

/** An area is in a level range when its levels overlap it; an area with no agreed level never is. */
export const inLevels = (area: FarmArea, range: Levels) => area.levels !== null && area.levels.min <= range.max && area.levels.max >= range.min;
