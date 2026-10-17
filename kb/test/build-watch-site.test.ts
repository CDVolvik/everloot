import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { differingFiles, GAME_DATA_DIR, generatedFiles, RAID_LUA, RAID_TS, readSiteData, retargetRaidImport, siteBuild, SpellValueTable, spellValuesOf, writeSpellValues } from "../src/build-watch/site-data.js";
import { ClassCatalog, LABEL } from "../src/talents/catalog.js";
import { commitBuild, node, raid, spellValues, stamp, worldMap } from "./build-watch-fixtures.js";

let a: string;
let b: string;
beforeEach(() => { a = mkdtempSync(join(tmpdir(), "everloot-site-a-")); b = mkdtempSync(join(tmpdir(), "everloot-site-b-")); });
afterEach(() => { rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); });
const build = { nodes: [node(1, "Mutilate")], raid: raid("1.60.1.1"), map: worldMap(1), spells: { 101: {} } };

describe("readSiteData", () => {
  it("is null before there are talent files", () => {
    expect(readSiteData(a)).toBeNull();
  });
  it("reads the files the site reads", () => {
    commitBuild(a, 1, build);
    const data = readSiteData(a)!;
    expect(data.talents[0].className).toBe("Rogue");
    expect(data.raid!.build).toBe("1.60.1.1");
    expect(data.map!.zones).toHaveLength(1);
    expect(siteBuild(data).buildId).toBe(1);
    expect(Object.keys(data.spellValues!.spells)).toEqual(["101"]);
  });
});

describe("spell values", () => {
  it("round-trips through the one-spell-per-line file", () => {
    const table = spellValues(1, { 101: { basePoints: 7 }, 55: {} });
    writeSpellValues(a, table);
    const text = readFileSync(join(a, GAME_DATA_DIR, "spell-values.json"), "utf8");
    expect(text.split("\n").filter((l) => l.startsWith('  "')).map((l) => l.trim().split(":")[0])).toEqual(['"55"', '"101"']);
    expect(SpellValueTable.parse(JSON.parse(text))).toEqual(table);
  });
  it("is taken from the full catalog and keeps a hash, never the text", () => {
    const full = ClassCatalog.parse({
      schema: "everloot.talent-catalog/2", label: LABEL, build: stamp(1), classId: 4, className: "Rogue", specId: 1, traitTreeId: 1, pointLevels: [], pointCurrencyId: null, warnings: [],
      trees: [{ id: 1, name: "A", skillLineId: 1, order: 0, edges: [], nodes: [{
        ...node(1, "Mutilate"),
        entries: [{ definitionId: 1, spellId: 101, name: "Mutilate", maxRanks: 1, iconFileId: 1, iconFile: "present", description: "Secret tooltip $s1", auraDescription: null,
          effects: [{ index: 0, basePoints: 5, dieSides: 0, periodMs: 0, chainTargets: 0, miscValue: 0, radiusYards: null }], durationMs: 3000 }],
      }] }],
    });
    const table = spellValuesOf(stamp(1), [full]);
    expect(table.spells["101"]).toMatchObject({ name: "Mutilate", durationMs: 3000 });
    expect(table.spells["101"].textHash).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(table)).not.toContain("Secret");
  });
});

describe("retargetRaidImport", () => {
  const write = (text: string) => { mkdirSync(dirname(join(a, RAID_TS)), { recursive: true }); writeFileSync(join(a, RAID_TS), text); };
  it("changes only the import line", () => {
    write('// notes\nimport raid from "./raid-1.60.1.70450.json";\nexport const X = 1;\n');
    expect(retargetRaidImport(a, "1.60.1.70460")).toBe(true);
    expect(readFileSync(join(a, RAID_TS), "utf8")).toBe('// notes\nimport raid from "./raid-1.60.1.70460.json";\nexport const X = 1;\n');
    expect(retargetRaidImport(a, "1.60.1.70460")).toBe(false);
  });
  it("fails loudly when there is no such import", () => {
    write("export const X = 1;\n");
    expect(() => retargetRaidImport(a, "1.60.1.70460")).toThrow("no import");
  });
});

describe("differingFiles", () => {
  it("ignores extractedAt and nothing else", () => {
    commitBuild(a, 1, build);
    commitBuild(b, 1, build);
    const files = generatedFiles(a);
    expect(files).toEqual(expect.arrayContaining([`${GAME_DATA_DIR}/talents/rogue.json`, `${GAME_DATA_DIR}/map.json`, `${GAME_DATA_DIR}/raid-1.60.1.1.json`, RAID_LUA]));
    const path = join(b, GAME_DATA_DIR, "talents", "rogue.json");
    writeFileSync(path, readFileSync(path, "utf8").replace("2026-10-17T00:00:00.000Z", "2030-01-01T00:00:00.000Z"));
    expect(differingFiles(b, a, files)).toEqual([]);
    writeFileSync(path, readFileSync(path, "utf8").replace('"maxRanks": 1', '"maxRanks": 2'));
    writeFileSync(join(b, RAID_LUA), "-- changed\n");
    expect(differingFiles(b, a, files).sort()).toEqual([RAID_LUA, `${GAME_DATA_DIR}/talents/rogue.json`].sort());
  });
  it("counts a missing file as different", () => {
    commitBuild(a, 1, build);
    expect(differingFiles(b, a, generatedFiles(a)).length).toBe(generatedFiles(a).length);
  });
});
