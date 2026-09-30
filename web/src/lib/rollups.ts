import { z } from "zod";

/**
 * Track 2, step 2: rollups. Stored uploads in → public facts out.
 * Rules (from the 9/28 brainstorm + guild-system spec):
 * - A fact goes public only after INDEPENDENT_INSTALLS distinct installs report it.
 * - Drop rates always ship with their kill count (one loot window = one kill).
 * - Implausible rows are rejected with a reason; nothing is averaged blindly.
 * Storage-agnostic: reads validated upload payloads, writes rollup JSON.
 * (File store today, Supabase rows tomorrow — the shapes below are the column map.)
 */

export const INDEPENDENT_INSTALLS = 3;
export const MAX_LEVEL = 100;

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

export interface RollupResult {
  rates: DropRate[];
  rejected: string[];
}

/** One loot window = one kill against its source. Windows without a source are rejected. */
export function rollupDrops(windows: LootRow[]): RollupResult {
  const rejected: string[] = [];
  const kills = new Map<string, { n: number; reporters: Set<string> }>();
  const drops = new Map<string, { n: number; reporters: Set<string> }>();
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
    if (!Number.isInteger(w.sourceNpcId ?? w.sourceObjectId) || (w.sourceNpcId ?? 0) < 1) {
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
        d.n += 1; // drop = windows containing the item (rate per kill), counts stay separate
      }
      d.reporters.add(w.installId);
      drops.set(key, d);
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
    // Public when the DENOMINATOR is corroborated: kills from 3+ independent installs.
    // A rare drop seen by one reporter is still real — what needs independence is the sample.
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
  return { rates, rejected };
}

export const rollupFile = z.object({
  generatedAt: z.string(),
  rates: z.array(z.object({
    sourceNpcId: z.number().optional(),
    sourceObjectId: z.number().optional(),
    itemId: z.number(),
    kills: z.number(),
    drops: z.number(),
    rate: z.number(),
    reporters: z.number(),
    public: z.boolean(),
  })),
});
export type RollupFile = z.infer<typeof rollupFile>;
