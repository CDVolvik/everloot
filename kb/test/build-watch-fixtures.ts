/** Small synthetic builds for the build watch tests. Nothing here comes from game files. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LABEL, type BuildStamp } from "../src/talents/catalog.js";
import type { WorldMapData } from "../src/world-map-data.js";
import { GAME_DATA_DIR, RAID_LUA, RAID_TS, SPELL_VALUES_SCHEMA, raidFileName, writeSpellValues, type SiteData, type SpellValueTable, type TrimmedClass, type WebRaid } from "../src/build-watch/site-data.js";
import { clientDigestsOf, writeClientDigests, type DigestInput } from "../src/build-watch/client-digests.js";
import type { Extracted } from "../src/build-watch/watch.js";

/** Two small tables, one of them changed by a test that says so. */
export const DIGESTS: DigestInput[] = [
  { table: "ItemSparse", rows: new Map<number, Record<string, unknown>>([[1, { Name_lang: "A", ItemLevel: 1 }], [2, { Name_lang: "B", ItemLevel: 2 }]]) },
  { table: "SpellName", rows: new Map<number, Record<string, unknown>>([[1, { Name_lang: "Spell" }]]) },
];

export const CONFIG_A = "a".repeat(32);
export const CONFIG_B = "b".repeat(32);

export const stamp = (buildId: number, buildConfig = CONFIG_A, version = `1.60.1.${buildId}`): BuildStamp => ({
  product: "wow_classic_beta", buildId, version, buildConfig, definitions: "abc123abc123", extractedAt: "2026-10-17T00:00:00.000Z",
});

type TNode = TrimmedClass["trees"][number]["nodes"][number];

export function node(id: number, name: string, over: Partial<TNode> = {}): TNode {
  return {
    id, x: 1000 + id, y: 2000, row: 0, col: 0, kind: "single", maxRanks: 1,
    entries: [{ definitionId: id + 1, spellId: id + 100, name, maxRanks: 1 }],
    prereqs: [], unlock: {}, ...over,
  };
}

export function trimmed(buildId: number, nodes: TNode[], over: Partial<TrimmedClass> = {}, config = CONFIG_A): TrimmedClass {
  return {
    schema: "everloot.talent-catalog/2", label: LABEL, build: stamp(buildId, config), classId: 4, className: "Rogue", specId: 1, traitTreeId: 1,
    pointLevels: [10, 11, 12], pointCurrencyId: 1,
    trees: [{ id: 1, name: "Assassination", order: 0, nodes }], ...over,
  };
}

export function raid(version: string, scope = "party", spellIds = [1, 2]): WebRaid {
  return {
    schema: "everloot.web-raid-data/1", build: version, notFound: [],
    entries: [{ id: "battle-shout", label: "Battle Shout", kind: "buff", class: "warrior", family: "battle-shout", scope, tree: "baseline", names: ["Battle Shout"], spellIds }],
  };
}

export function spellValues(buildId: number, spells: Record<number, { basePoints?: number; durationMs?: number | null; textHash?: string | null; name?: string }>, config = CONFIG_A): SpellValueTable {
  return {
    schema: SPELL_VALUES_SCHEMA, label: LABEL, build: stamp(buildId, config),
    spells: Object.fromEntries(Object.entries(spells).map(([id, s]) => [id, {
      name: s.name ?? `Spell ${id}`, durationMs: s.durationMs ?? null, textHash: s.textHash ?? "aaaaaaaaaaaa",
      effects: [{ index: 0, basePoints: s.basePoints ?? 5, dieSides: 0, periodMs: 0, chainTargets: 0, miscValue: 0, radiusYards: null }],
    }])),
  };
}

export function worldMap(buildId: number, zones: { id: number; name: string; left?: number }[] = [{ id: 1411, name: "Durotar" }]): WorldMapData {
  const b = stamp(buildId);
  return {
    schema: "everloot.world-map/1",
    source: { name: "x", status: "found in game files, unconfirmed", licence: "x", licenceUrl: "x", product: b.product, buildId, version: b.version, buildConfig: b.buildConfig, definitions: b.definitions, extractedAt: b.extractedAt, tables: [] },
    continents: [{ id: 1, name: "Kalimdor", bounds: { left: 1, top: 2, right: 3, bottom: 4 } }],
    zones: zones.map((z) => ({ uiMapId: z.id, name: z.name, continentId: 1, bounds: { left: z.left ?? 10, top: 20, right: 5, bottom: 1 } })),
    heldBackZones: [],
    entrances: [{ mapId: 33, name: "Shadowfang Keep", raid: false, continentId: 0, worldX: -231, worldY: 1571.6 }],
    warnings: [],
  };
}

const put = (path: string, text: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };

/** Writes the files the generators write, under `root`. */
export function writeSite(root: string, site: Partial<SiteData> & { talents: TrimmedClass[] }, opts: { raidTs?: boolean; digests?: DigestInput[] } = {}): void {
  const dir = join(root, GAME_DATA_DIR);
  for (const c of site.talents) put(join(dir, "talents", `${(c.className ?? "x").toLowerCase()}.json`), `${JSON.stringify(c, null, 1)}\n`);
  if (site.raid) {
    put(join(dir, raidFileName(site.raid.build)), `${JSON.stringify(site.raid, null, 1)}\n`);
    put(join(root, RAID_LUA), `-- raid ${site.raid.build}\n`);
  }
  if (site.map) put(join(dir, "map.json"), `${JSON.stringify(site.map, null, 2)}\n`);
  if (site.spellValues) writeSpellValues(root, site.spellValues);
  writeClientDigests(root, clientDigestsOf(site.talents[0].build, opts.digests ?? DIGESTS));
  if (opts.raidTs && site.raid) put(join(root, RAID_TS), `import raid from "./${raidFileName(site.raid.build)}";\nexport const CURRENT_BUILD: string = raid.build;\n`);
}

export interface Build { nodes: TNode[]; raid?: WebRaid; map?: WorldMapData; spells?: Parameters<typeof spellValues>[1]; classes?: TrimmedClass[]; config?: string; digests?: DigestInput[] }

/** The first build a test commits, written into a root before the watch runs. */
export function commitBuild(root: string, buildId: number, b: Build, opts: { raidTs?: boolean } = {}): void {
  writeSite(root, {
    talents: b.classes ?? [trimmed(buildId, b.nodes, {}, b.config)], raid: b.raid, map: b.map,
    spellValues: b.spells ? spellValues(buildId, b.spells, b.config) : undefined,
  }, { ...opts, digests: b.digests });
}

/** What the CDN extraction would hand over for a build: the generators are replaced by writing fixtures. */
export function extracted(buildId: number, b: Build, over: Partial<Extracted> = {}): Extracted {
  const config = b.config ?? CONFIG_A;
  return {
    build: { buildId, buildConfig: config, version: `1.60.1.${buildId}` },
    spellValues: spellValues(buildId, b.spells ?? {}, config),
    clientDigests: clientDigestsOf(stamp(buildId, config), b.digests ?? DIGESTS),
    missingTables: [],
    generate: (root) => writeSite(root, { talents: b.classes ?? [trimmed(buildId, b.nodes, {}, config)], raid: b.raid, map: b.map }, { digests: b.digests }),
    encryptedTables: [{ table: "SpellName", blocks: 14 }, { table: "TraitNode", blocks: 0 }],
    source: { definitions: "abc123abc123", library: "lib@1", extractedAt: "2026-10-17T12:00:00.000Z" },
    warnings: [], ...over,
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
