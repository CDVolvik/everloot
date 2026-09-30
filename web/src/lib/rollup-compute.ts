import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { rollupDrops, type LootRow, type RollupResult } from "./rollups";

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
  const windows: LootRow[] = [];
  let records = 0;
  for (const f of files) {
    try {
      const payload = JSON.parse(await readFile(join(dataDir, f), "utf8")) as {
        records?: Array<{ kind?: unknown; installId?: unknown; sourceNpcId?: unknown; sourceObjectId?: unknown; items?: unknown }>;
      };
      if (!Array.isArray(payload.records)) continue;
      records += payload.records.length;
      for (const r of payload.records) {
        if (r?.kind === "loot" && typeof r.installId === "string" && Array.isArray(r.items)) {
          windows.push({
            installId: r.installId,
            ...(typeof r.sourceNpcId === "number" ? { sourceNpcId: r.sourceNpcId } : {}),
            ...(typeof r.sourceObjectId === "number" ? { sourceObjectId: r.sourceObjectId } : {}),
            items: (r.items as Array<{ itemId?: unknown; count?: unknown }>)
              .filter((it) => typeof it?.itemId === "number" && typeof it?.count === "number")
              .map((it) => ({ itemId: it.itemId as number, count: it.count as number })),
          });
        }
      }
    } catch {
      continue; // a corrupt file never breaks the rollup
    }
  }
  const { rates, rejected } = rollupDrops(windows);
  return { rates, rejected, stats: { uploads: files.length, lootWindows: windows.length, records } };
}
