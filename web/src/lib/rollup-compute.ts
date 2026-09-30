import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { itemFactsFromRecords } from "../../../kb/src/drop-rollup";
import type { ItemFacts } from "../../../kb/src/item-page";
import { worldFactsFromRecords, type WorldFacts } from "../../../kb/src/world-pages";
import { lootWindowsFromRecords, rollupDrops, type RollupResult } from "./rollups";

export interface CorpusStats {
  uploads: number;
  lootWindows: number;
  records: number;
}

/** Read every stored upload, pull loot windows, roll them up. File store today. */
export async function computeRollups(dataDir = join(process.cwd(), "data", "uploads")): Promise<RollupResult & { stats: CorpusStats }> {
  let files: string[] = [];
  try {
    files = (await readdir(dataDir)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const rows: unknown[] = [];
  for (const f of files) {
    try {
      const payload = JSON.parse(await readFile(join(dataDir, f), "utf8")) as { records?: unknown };
      if (!Array.isArray(payload.records)) continue;
      rows.push(...payload.records);
    } catch {
      continue; // a corrupt file never breaks the rollup
    }
  }
  const records = rows.length;
  const windows = lootWindowsFromRecords(rows);
  const { rates, rejected } = rollupDrops(windows);
  return { rates, rejected, stats: { uploads: files.length, lootWindows: windows.length, records } };
}

/** Names, pins, and public rates from the same upload files the drop table reads. */
export async function loadItemFacts(dataDir = join(process.cwd(), "data", "uploads")): Promise<ItemFacts> {
  let files: string[] = [];
  try {
    files = (await readdir(dataDir)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const rows: unknown[] = [];
  for (const f of files) {
    try {
      const payload = JSON.parse(await readFile(join(dataDir, f), "utf8")) as { records?: unknown };
      if (Array.isArray(payload.records)) rows.push(...payload.records);
    } catch {
      continue;
    }
  }
  return itemFactsFromRecords(rows);
}

/** NPC, quest, and vendor rows from the same upload files. */
export async function loadWorldFacts(dataDir = join(process.cwd(), "data", "uploads")): Promise<WorldFacts> {
  let files: string[] = [];
  try {
    files = (await readdir(dataDir)).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const rows: unknown[] = [];
  for (const f of files) {
    try {
      const payload = JSON.parse(await readFile(join(dataDir, f), "utf8")) as { records?: unknown };
      if (Array.isArray(payload.records)) rows.push(...payload.records);
    } catch {
      continue;
    }
  }
  return worldFactsFromRecords(rows);
}
