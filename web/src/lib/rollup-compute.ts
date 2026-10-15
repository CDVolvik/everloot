import { itemFactsFromRecords } from "../../../kb/src/drop-rollup";
import type { ItemFacts } from "../../../kb/src/item-page";
import { worldFactsFromRecords, type WorldFacts } from "../../../kb/src/world-pages";
import { lootWindowsFromRecords, rollupDrops, type RollupResult } from "./rollups";
import { uploadStore } from "./upload-store";

export interface CorpusStats {
  uploads: number;
  lootWindows: number;
  records: number;
  /** True when the store could not be read. The numbers beside it are not a count. */
  unreachable: boolean;
  /** When the uploads behind these numbers were current; null when unrecorded. */
  dataAsOf: string | null;
}

const UNREAD: CorpusStats = { uploads: 0, lootWindows: 0, records: 0, unreachable: true, dataAsOf: null };

interface AggregateSet {
  key: string;
  uploads: number;
  records: number;
  windows: number;
  dataAsOf: string | null;
  drops: { rates: RollupResult["rates"]; measuredZeros: RollupResult["measuredZeros"]; rejected: RollupResult["rejected"] };
  items: ItemFacts;
  world: WorldFacts;
}

/**
 * One aggregation set per corpus version, shared by every answer below. Item and NPC
 * answers used to rescan the whole public corpus each (the NPC page scanned it twice:
 * world facts plus the drop rollup). The shared references are read-only: callers
 * filter and find over them, never sort or push in place.
 */
let memoized: AggregateSet | null = null;

/**
 * Corpus version marker. Uploads, snapshot time and record count all move whenever the
 * store reloads (writes invalidate its cache, reads stamp a fresh time), so a matching
 * key means these aggregates are for this exact corpus. A miss rebuilds all three sets
 * together, so one request warms the other answers.
 */
function corpusKey(corpus: { uploads: number; records: readonly unknown[]; dataAsOf?: string | null }): string {
  return `${corpus.uploads}|${corpus.dataAsOf ?? ""}|${corpus.records.length}`;
}

async function loadAggregates(): Promise<AggregateSet | null> {
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) return null;
  const key = corpusKey(corpus);
  if (memoized === null || memoized.key !== key) {
    const windows = lootWindowsFromRecords(corpus.records);
    memoized = {
      key,
      uploads: corpus.uploads,
      records: corpus.records.length,
      windows: windows.length,
      dataAsOf: corpus.dataAsOf ?? null,
      drops: rollupDrops(windows),
      items: itemFactsFromRecords(corpus.records),
      world: worldFactsFromRecords(corpus.records),
    };
  }
  return memoized;
}

/** Every stored upload, loot windows pulled out, rolled up. */
export async function computeRollups(): Promise<RollupResult & { stats: CorpusStats }> {
  const agg = await loadAggregates();
  if (!agg) return { rates: [], measuredZeros: [], rejected: [], stats: UNREAD };
  return {
    rates: agg.drops.rates,
    measuredZeros: agg.drops.measuredZeros,
    rejected: agg.drops.rejected,
    stats: {
      uploads: agg.uploads,
      lootWindows: agg.windows,
      records: agg.records,
      unreachable: false,
      dataAsOf: agg.dataAsOf,
    },
  };
}

/** Names, pins, and public rates from the same uploads the drop table reads. */
export async function loadItemFacts(): Promise<ItemFacts & { unreachable: boolean }> {
  const agg = await loadAggregates();
  if (!agg) return { rates: [], names: [], npcs: [], unreachable: true };
  return { ...agg.items, unreachable: false };
}

/** NPC, quest, and vendor rows from the same uploads. */
export async function loadWorldFacts(): Promise<WorldFacts & { unreachable: boolean }> {
  const agg = await loadAggregates();
  if (!agg) return { npcs: [], quests: [], vendors: [], unreachable: true };
  return { ...agg.world, unreachable: false };
}
