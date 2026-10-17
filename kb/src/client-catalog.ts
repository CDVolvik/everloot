/**
 * Turns a client snapshot into the two build-stamped outputs: a talent catalog per class and a raid
 * buff table. Reads only the snapshot file; it never touches the game or the network.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { buildRaidBuffTable, Curated, RaidBuffTable } from "./raid-buffs.js";
import { readClientManifest, readClientMeta, readClientRows, readClientTables } from "./client-snapshot.js";
import { buildTalentCatalog } from "./talents/build-catalog.js";
import { CatalogIndex, ClassCatalog, type BuildStamp } from "./talents/catalog.js";

export interface CatalogRun {
  dir: string;
  index: CatalogIndex;
  raidBuffs: RaidBuffTable;
}

export function writeCatalogs(snapshotPath: string, outDir: string, curatedPath: string): CatalogRun {
  const meta = readClientMeta(snapshotPath);
  const build: BuildStamp = {
    product: meta.product, buildId: meta.buildId, version: meta.version, buildConfig: meta.buildConfig,
    definitions: meta.definitions, extractedAt: meta.extractedAt,
  };
  const present = new Set(readClientTables(snapshotPath));
  const cache = new Map<string, ReturnType<typeof readClientRows>>();
  const get = (table: string) => {
    if (!present.has(table)) return undefined;
    if (!cache.has(table)) cache.set(table, readClientRows(snapshotPath, table));
    return cache.get(table);
  };
  const encrypted = new Map((readClientManifest(snapshotPath)?.tables ?? []).map((t) => [t.table, t.encryptedBlocks]));

  const { index: rawIndex, classes } = buildTalentCatalog({ get, build, tables: [] });
  const used = ["ChrClasses", "ChrSpecialization", "SkillLine", "SkillRaceClassInfo", "SkillLineXTraitTree", "SpellName", "Spell", "SpellEffect", "SpellRadius", "SpellMisc", "SpellDuration", "FileStatus"]
    .concat([...present].filter((t) => t.startsWith("Trait")).sort());
  const index = CatalogIndex.parse({
    ...rawIndex,
    tables: [...new Set(used)].filter((t) => present.has(t)).map((table) => ({ table, rows: get(table)!.size, encryptedBlocks: encrypted.get(table) ?? null })),
  });

  const curated = Curated.parse(parse(readFileSync(curatedPath, "utf8")));
  const raidBuffs = RaidBuffTable.parse(buildRaidBuffTable(get, build, curated));

  const dir = join(outDir, `${meta.product}-${meta.buildId}-${meta.buildConfig.slice(0, 8)}`);
  mkdirSync(join(dir, "talents"), { recursive: true });
  for (const c of classes) {
    const file = index.classes.find((i) => i.classId === c.classId)!.file;
    writeFileSync(join(dir, "talents", file), `${JSON.stringify(ClassCatalog.parse(c), null, 2)}\n`);
  }
  writeFileSync(join(dir, "talents", "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  writeFileSync(join(dir, "raid-buffs.json"), `${JSON.stringify(raidBuffs, null, 2)}\n`);
  return { dir, index, raidBuffs };
}
