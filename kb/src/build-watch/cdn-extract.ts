/**
 * The production side of the build watch: read the product's current build from Blizzard's public CDN
 * and turn it into catalogs. It reuses the extractor and catalog code behind `client-extract` and
 * `client-catalog`; no decryption keys are loaded and encrypted blocks are counted, not read.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCatalogs } from "../client-catalog.js";
import { CASC_LIBRARY, extractTables, iconIds, NOT_IN_BUILD, openCdn, probeFiles } from "../client-extract.js";
import { clientSnapshotName, writeClientSnapshot } from "../client-snapshot.js";
import { RaidBuffTable } from "../raid-buffs.js";
import { CatalogIndex, ClassCatalog } from "../talents/catalog.js";
import type { Extracted } from "./watch.js";

/** WoWDBDefs commit the layouts come from, for the build stamp. Null when GitHub cannot be reached. */
async function definitionsCommit(): Promise<string | null> {
  try {
    const res = await fetch("https://api.github.com/repos/wowdev/WoWDBDefs/commits/master", { signal: AbortSignal.timeout(10_000) });
    return res.ok ? String((await res.json()).sha).slice(0, 12) : null;
  } catch {
    return null;
  }
}

export async function extractFromCdn(product: string, region: string, curatedPath: string): Promise<Extracted> {
  const { build, source } = await openCdn(product, region);
  const { tables, missing } = await extractTables(source);
  // A table that failed to read (not one the build simply lacks) would give a catalog with holes: fail instead.
  const failed = missing.filter((m) => m.reason !== NOT_IN_BUILD);
  if (failed.length) throw new Error(`could not read ${failed.map((m) => `${m.table} (${m.reason})`).join(", ")}`);
  const status = probeFiles(source, iconIds(tables));
  if (status) tables.push(status);

  const work = mkdtempSync(join(tmpdir(), "everloot-build-watch-"));
  try {
    const snapshot = join(work, clientSnapshotName(build));
    const manifest = writeClientSnapshot(snapshot, { ...build, extractedAt: new Date().toISOString(), library: CASC_LIBRARY, definitions: await definitionsCommit() }, tables);
    const run = writeCatalogs(snapshot, join(work, "catalog"), curatedPath);
    const classes = readdirSync(join(run.dir, "talents"))
      .filter((f) => f !== "index.json")
      .map((f) => ClassCatalog.parse(JSON.parse(readFileSync(join(run.dir, "talents", f), "utf8"))));
    return {
      build: run.index.build,
      classes,
      index: CatalogIndex.parse(run.index),
      raidBuffs: RaidBuffTable.parse(run.raidBuffs),
      encryptedTables: manifest.tables.map((t) => ({ table: t.table, blocks: t.encryptedBlocks })),
      warnings: [],
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
