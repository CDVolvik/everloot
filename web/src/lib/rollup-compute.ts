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
}

const UNREAD: CorpusStats = { uploads: 0, lootWindows: 0, records: 0, unreachable: true };

/** Every stored upload, loot windows pulled out, rolled up. */
export async function computeRollups(): Promise<RollupResult & { stats: CorpusStats }> {
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) return { rates: [], measuredZeros: [], rejected: [], stats: UNREAD };
  const windows = lootWindowsFromRecords(corpus.records);
  const { rates, measuredZeros, rejected } = rollupDrops(windows);
  return {
    rates,
    measuredZeros,
    rejected,
    stats: { uploads: corpus.uploads, lootWindows: windows.length, records: corpus.records.length, unreachable: false },
  };
}

/** Names, pins, and public rates from the same uploads the drop table reads. */
export async function loadItemFacts(): Promise<ItemFacts & { unreachable: boolean }> {
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) return { rates: [], names: [], npcs: [], unreachable: true };
  return { ...itemFactsFromRecords(corpus.records), unreachable: false };
}

/** NPC, quest, and vendor rows from the same uploads. */
export async function loadWorldFacts(): Promise<WorldFacts & { unreachable: boolean }> {
  const corpus = await uploadStore.loadCorpus();
  if (corpus.unreachable) return { npcs: [], quests: [], vendors: [], unreachable: true };
  return { ...worldFactsFromRecords(corpus.records), unreachable: false };
}
