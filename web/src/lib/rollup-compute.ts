import { itemFactsFromRecords } from "../../../kb/src/drop-rollup";
import type { ItemFacts } from "../../../kb/src/item-page";
import { worldFactsFromRecords, type WorldFacts } from "../../../kb/src/world-pages";
import { lootWindowsFromRecords, rollupDrops, type RollupResult } from "./rollups";
import { uploadStore } from "./upload-store";

export interface CorpusStats {
  uploads: number;
  lootWindows: number;
  records: number;
}

/** Every stored upload, loot windows pulled out, rolled up. */
export async function computeRollups(): Promise<RollupResult & { stats: CorpusStats }> {
  const { uploads, records } = await uploadStore.loadCorpus();
  const windows = lootWindowsFromRecords(records);
  const { rates, rejected } = rollupDrops(windows);
  return { rates, rejected, stats: { uploads, lootWindows: windows.length, records: records.length } };
}

/** Names, pins, and public rates from the same uploads the drop table reads. */
export async function loadItemFacts(): Promise<ItemFacts> {
  return itemFactsFromRecords((await uploadStore.loadCorpus()).records);
}

/** NPC, quest, and vendor rows from the same uploads. */
export async function loadWorldFacts(): Promise<WorldFacts> {
  return worldFactsFromRecords((await uploadStore.loadCorpus()).records);
}
