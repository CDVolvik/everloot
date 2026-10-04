/**
 * Drop rollup shared by the site and the item_page tool.
 * A rate is public when 3 distinct installs have killed the source.
 * One loot window is one kill. A window that contains the item is one drop.
 * A source whose windows contain no valid item is a measured zero
 * (0 drops in N kills). A source nobody killed is absent, not zero.
 */

export const INDEPENDENT_INSTALLS = 3;

export interface LootRow {
  installId: string;
  sourceNpcId?: number;
  sourceObjectId?: number;
  items: Array<{ itemId: number; count: number }>;
}

export interface DropRate {
  sourceNpcId?: number;
  sourceObjectId?: number;
  itemId: number;
  kills: number;
  drops: number;
  rate: number;
  reporters: number;
  public: boolean;
}

/** Kills of one source, and no valid item in any of those windows. */
export interface MeasuredZero {
  sourceNpcId?: number;
  sourceObjectId?: number;
  kills: number;
  reporters: number;
  public: boolean;
}

export interface RollupResult {
  rates: DropRate[];
  measuredZeros: MeasuredZero[];
  rejected: string[];
}

export type ItemNameRow = { installId: string; itemId: number; name: string };
export type NpcPinRow = { installId: string; npcId: number; name: string; mapId: number; x: number; y: number };
export type ItemFactRows = { rates: DropRate[]; names: ItemNameRow[]; npcs: NpcPinRow[] };

/** One loot window = one kill against its source. Windows without a source are rejected. */
export function rollupDrops(windows: LootRow[]): RollupResult {
  const rejected: string[] = [];
  const kills = new Map<string, { n: number; reporters: Set<string> }>();
  const drops = new Map<string, { n: number; reporters: Set<string> }>();
  const sourcesWithDrops = new Set<string>();
  const meta = new Map<string, { sourceNpcId?: number; sourceObjectId?: number; itemId: number }>();

  const sourceKey = (w: LootRow): string | null => {
    if (w.sourceNpcId !== undefined) return `npc:${w.sourceNpcId}`;
    if (w.sourceObjectId !== undefined) return `obj:${w.sourceObjectId}`;
    return null;
  };

  for (const w of windows) {
    const s = sourceKey(w);
    if (!s) {
      rejected.push("loot window without a source is not a kill");
      continue;
    }
    const sourceId = w.sourceNpcId ?? w.sourceObjectId;
    if (!Number.isInteger(sourceId) || sourceId! < 1) {
      rejected.push("implausible source id");
      continue;
    }
    const k = kills.get(s) ?? { n: 0, reporters: new Set<string>() };
    k.n += 1;
    k.reporters.add(w.installId);
    kills.set(s, k);
    const seen = new Set<number>();
    for (const it of w.items) {
      if (!Number.isInteger(it.itemId) || it.itemId < 1 || !Number.isInteger(it.count) || it.count < 1) {
        rejected.push(`implausible item entry: ${JSON.stringify(it)}`);
        continue;
      }
      const key = `${s}|item:${it.itemId}`;
      const d = drops.get(key) ?? { n: 0, reporters: new Set<string>() };
      if (!seen.has(it.itemId)) {
        seen.add(it.itemId);
        d.n += 1;
      }
      d.reporters.add(w.installId);
      drops.set(key, d);
      sourcesWithDrops.add(s);
      const [src, item] = key.split("|");
      const [kind, id] = src.split(":");
      meta.set(key, {
        ...(kind === "npc" ? { sourceNpcId: Number(id) } : { sourceObjectId: Number(id) }),
        itemId: Number(item.split(":")[1]),
      });
    }
  }

  const rates: DropRate[] = [];
  for (const [key, d] of drops) {
    const [src] = key.split("|");
    const k = kills.get(src) ?? { n: 0, reporters: new Set<string>() };
    const reporters = k.reporters.size;
    rates.push({
      ...meta.get(key)!,
      kills: k.n,
      drops: d.n,
      rate: k.n > 0 ? d.n / k.n : 0,
      reporters,
      public: reporters >= INDEPENDENT_INSTALLS,
    });
  }
  rates.sort((a, b) => b.kills - a.kills || b.rate - a.rate);

  const measuredZeros: MeasuredZero[] = [];
  for (const [src, k] of kills) {
    if (sourcesWithDrops.has(src)) continue;
    const [kind, idText] = src.split(":");
    const id = Number(idText);
    measuredZeros.push({
      ...(kind === "npc" ? { sourceNpcId: id } : { sourceObjectId: id }),
      kills: k.n,
      reporters: k.reporters.size,
      public: k.reporters.size >= INDEPENDENT_INSTALLS,
    });
  }
  measuredZeros.sort((a, b) => b.kills - a.kills || (a.sourceNpcId ?? a.sourceObjectId ?? 0) - (b.sourceNpcId ?? b.sourceObjectId ?? 0));
  return { rates, measuredZeros, rejected };
}

export function lootWindowsFromRecords(records: unknown[]): LootRow[] {
  const windows: LootRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row.kind !== "loot" || typeof row.installId !== "string" || !Array.isArray(row.items)) continue;
    windows.push({
      installId: row.installId,
      ...(typeof row.sourceNpcId === "number" ? { sourceNpcId: row.sourceNpcId } : {}),
      ...(typeof row.sourceObjectId === "number" ? { sourceObjectId: row.sourceObjectId } : {}),
      items: (row.items as Array<{ itemId?: unknown; count?: unknown }>)
        .filter((item) => typeof item?.itemId === "number" && typeof item?.count === "number")
        .map((item) => ({ itemId: item.itemId as number, count: item.count as number })),
    });
  }
  return windows;
}

/** Rates, names, and pins from one upload record list. Same rows the item page renders. */
export function itemFactsFromRecords(records: unknown[]): ItemFactRows {
  const names: ItemNameRow[] = [];
  const npcs: NpcPinRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.installId !== "string") continue;
    if (row.kind === "item_seen" && typeof row.itemId === "number" && typeof row.name === "string") {
      names.push({ installId: row.installId, itemId: row.itemId, name: row.name });
    }
    if (
      row.kind === "npc_sighting" &&
      typeof row.npcId === "number" &&
      typeof row.name === "string" &&
      typeof row.mapId === "number" &&
      typeof row.x === "number" &&
      typeof row.y === "number"
    ) {
      npcs.push({ installId: row.installId, npcId: row.npcId, name: row.name, mapId: row.mapId, x: row.x, y: row.y });
    }
  }
  return { rates: rollupDrops(lootWindowsFromRecords(records)).rates, names, npcs };
}
