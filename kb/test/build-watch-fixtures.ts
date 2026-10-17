/** Small synthetic builds for the build watch tests. Nothing here comes from game files. */
import { LABEL, type BuildStamp, type CatalogIndex, type ClassCatalog } from "../src/talents/catalog.js";
import { RAID_BUFF_SCHEMA, type RaidBuffTable } from "../src/raid-buffs.js";
import type { Extracted } from "../src/build-watch/watch.js";

export const CONFIG_A = "a".repeat(32);
export const CONFIG_B = "b".repeat(32);

export const stamp = (buildId: number, buildConfig = CONFIG_A, version = `1.60.1.${buildId}`): BuildStamp => ({
  product: "wow_classic_beta", buildId, version, buildConfig, definitions: "abc123abc123", extractedAt: "2026-10-17T00:00:00.000Z",
});

type Over = Partial<ClassCatalog["trees"][number]["nodes"][number]>;

export function node(id: number, name: string, over: Over = {}): ClassCatalog["trees"][number]["nodes"][number] {
  return {
    id, x: 1000 + id, y: 2000, row: 0, col: 0, kind: "single", maxRanks: 1,
    entries: [{
      definitionId: id + 1, spellId: id + 100, name, maxRanks: 1, iconFileId: 1, iconFile: "present",
      description: `${name} tooltip with $s1`, auraDescription: null,
      effects: [{ index: 0, basePoints: 5, dieSides: 0, periodMs: 0, chainTargets: 0, miscValue: 0, radiusYards: null }],
      durationMs: null,
    }],
    prereqs: [], unlock: {}, ...over,
  };
}

export function catalog(buildId: number, nodes: ReturnType<typeof node>[], over: Partial<ClassCatalog> = {}): ClassCatalog {
  return {
    schema: "everloot.talent-catalog/1", label: LABEL, build: stamp(buildId), classId: 4, className: "Rogue", specId: 1, traitTreeId: 1,
    pointLevels: [10, 11, 12],
    trees: [{ id: 1, name: "Assassination", skillLineId: 253, order: 0, nodes, edges: [] }],
    warnings: [], ...over,
  };
}

export function raid(buildId: number, scope: "party" | "raid"): RaidBuffTable {
  return {
    schema: RAID_BUFF_SCHEMA, label: LABEL, build: stamp(buildId),
    entries: [{ id: "battle-shout", label: "Battle Shout", kind: "buff", class: "Warrior", scope, scopes: { [scope]: 1 }, spells: [] }],
    notFound: [],
  };
}

export function extracted(buildId: number, nodes: ReturnType<typeof node>[], opts: { config?: string; scope?: "party" | "raid"; classes?: ClassCatalog[] } = {}): Extracted {
  const build = stamp(buildId, opts.config ?? CONFIG_A);
  const classes = (opts.classes ?? [catalog(buildId, nodes)]).map((c) => ({ ...c, build }));
  const index: CatalogIndex = {
    schema: "everloot.talent-catalog/1", label: LABEL, build,
    classes: classes.map((c) => ({ classId: c.classId, className: c.className, file: `${(c.className ?? "x").toLowerCase()}.json`, trees: 1, nodes: nodes.length })),
    otherTraitTrees: [], tables: [{ table: "TraitNode", rows: nodes.length, encryptedBlocks: 0 }], warnings: [],
  };
  return {
    build, classes, index, raidBuffs: { ...raid(buildId, opts.scope ?? "party"), build },
    encryptedTables: [{ table: "SpellName", blocks: 14 }, { table: "TraitNode", blocks: 0 }], warnings: [],
  };
}

/** The version service's table for one build. */
export function versionsText(buildId: number, buildConfig = CONFIG_A, version = `1.60.1.${buildId}`): string {
  return [
    "Region!STRING:0|BuildConfig!HEX:16|CDNConfig!HEX:16|KeyRing!HEX:16|BuildId!DEC:4|VersionsName!String:0|ProductConfig!HEX:16",
    "## seqn = 1",
    `us|${buildConfig}|${"c".repeat(32)}||${buildId}|${version}|${"d".repeat(32)}`,
  ].join("\n");
}
