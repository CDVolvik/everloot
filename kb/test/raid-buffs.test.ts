import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { writeCatalogs } from "../src/client-catalog.js";
import { writeClientSnapshot, type ClientBuildMeta, type ExtractedTable } from "../src/client-snapshot.js";
import { buildRaidBuffTable, diffRaidBuffs, effectScope, RaidBuffTable, type Curated } from "../src/raid-buffs.js";
import type { Row, Rows, TableReader } from "../src/talents/build-catalog.js";
import type { BuildStamp } from "../src/talents/catalog.js";

const stamp = (buildId: number, product = "wow_classic_beta"): BuildStamp =>
  ({ product, buildId, version: `1.60.1.${buildId}`, buildConfig: "c".repeat(32), definitions: null, extractedAt: "2026-10-17T00:00:00.000Z" });
const rows = (list: Row[]): Rows => new Map(list.map((r) => [r.ID as number, r]));

/**
 * Made-up spell ids and numbers. Spell 1 and 2 are ranks 1 and 2 of one buff, with the given targets;
 * 6 is a same-named helper that is not on the list. The target ids 20 and 56 are the real party and raid ones.
 */
function tables(rank1Target: number, rank2Target: number, totemEffect: number): TableReader {
  const t: Record<string, Rows> = {
    SpellName: rows([
      { ID: 1, Name_lang: "Test Shout" }, { ID: 2, Name_lang: "Test Shout" }, { ID: 3, Name_lang: "Test Totem" },
      { ID: 4, Name_lang: "Test Totem Aura" }, { ID: 5, Name_lang: "Test Curse" }, { ID: 6, Name_lang: "Test Shout" },
    ]),
    Spell: rows([{ ID: 1, NameSubtext_lang: "Rank 1" }, { ID: 2, NameSubtext_lang: "Rank 2" }, { ID: 4, NameSubtext_lang: "Rank 1" }, { ID: 6, NameSubtext_lang: "Rank 2" }]),
    SpellRadius: rows([{ ID: 9, Radius: 30 }]),
    SpellEffect: rows([
      { ID: 1, SpellID: 1, DifficultyID: 0, EffectIndex: 0, Effect: 6, EffectAura: 99, ImplicitTarget: [rank1Target, 0], EffectRadiusIndex: [9, 0] },
      { ID: 2, SpellID: 2, DifficultyID: 0, EffectIndex: 0, Effect: 6, EffectAura: 99, ImplicitTarget: [rank2Target, 0], EffectRadiusIndex: [9, 0] },
      { ID: 3, SpellID: 3, DifficultyID: 0, EffectIndex: 0, Effect: 28, EffectAura: 0, ImplicitTarget: [41, 0], EffectRadiusIndex: [0, 0] }, // summons the totem: no aura
      { ID: 4, SpellID: 4, DifficultyID: 0, EffectIndex: 0, Effect: totemEffect, EffectAura: 29, ImplicitTarget: [1, 0], EffectRadiusIndex: [9, 9] },
      { ID: 5, SpellID: 5, DifficultyID: 0, EffectIndex: 0, Effect: 6, EffectAura: 22, ImplicitTarget: [6, 0], EffectRadiusIndex: [0, 0] },
      { ID: 6, SpellID: 2, DifficultyID: 14, EffectIndex: 0, Effect: 6, EffectAura: 99, ImplicitTarget: [1, 0], EffectRadiusIndex: [0, 0] }, // another difficulty: ignored
      { ID: 7, SpellID: 6, DifficultyID: 0, EffectIndex: 0, Effect: 6, EffectAura: 99, ImplicitTarget: [1, 0], EffectRadiusIndex: [0, 0] }, // same name, self only, not listed
    ]),
  };
  return (name) => t[name];
}

const curated: Curated = [
  { id: "shout", label: "Test Shout", kind: "buff", class: "Warrior", spells: [1, 2] },
  { id: "totem", label: "Test Totem", kind: "buff", class: "Shaman", spells: [3, 4] },
  { id: "curse", label: "Test Curse", kind: "debuff", spells: [5] },
  { id: "gone", label: "Not In The Game", kind: "buff", spells: [999] },
];

test("scope: area aura effect types set it, target ids are read first, and an id we do not know makes it unknown", () => {
  expect(effectScope(35, [1, 0])).toBe("party");
  expect(effectScope(65, [1, 0])).toBe("raid");
  expect(effectScope(6, [20, 0])).toBe("party");
  expect(effectScope(6, [56, 0])).toBe("raid");
  expect(effectScope(6, [21, 0])).toBe("single");
  expect(effectScope(6, [6, 0])).toBe("enemy");
  expect(effectScope(6, [1, 0])).toBe("self");
  expect(effectScope(6, [22, 30])).toBe("area");
  expect(effectScope(6, [18, 31])).toBe("area");
  expect(effectScope(6, [153, 0])).toBe("unknown");
  expect(effectScope(6, [1, 153])).toBe("unknown");
  expect(effectScope(35, [153, 0])).toBe("unknown");
  expect(effectScope(6, [0, 0])).toBe("unknown");
});

test("scope: an effect type and targets that disagree give unknown, not either reading", () => {
  expect(effectScope(65, [20, 0])).toBe("unknown");
  expect(effectScope(35, [56, 0])).toBe("unknown");
  expect(effectScope(65, [21, 0])).toBe("unknown");
  expect(effectScope(65, [56, 0])).toBe("raid");
});

test("each entry lists exactly the spells on its list that apply an aura, with effect, aura, targets and radius", () => {
  const table = buildRaidBuffTable(tables(56, 56, 65), stamp(70425), curated);
  const shout = table.entries.find((e) => e.id === "shout")!;
  expect(shout.spells.map((s) => [s.spellId, s.rank, s.scope])).toEqual([[1, 1, "raid"], [2, 2, "raid"]]);
  expect(shout.spells[1].effects).toEqual([{ index: 0, effect: 6, aura: 99, targets: [56, 0], radiusYards: 30, scope: "raid" }]);
  expect(shout).toMatchObject({ scope: "raid", class: "Warrior", missingSpells: [] });
  expect(shout.byRank).toEqual([{ rank: 1, spellIds: [1], scope: "raid" }, { rank: 2, spellIds: [2], scope: "raid" }]);
});

test("a same-named spell that is not on the list is not pulled in", () => {
  const shout = buildRaidBuffTable(tables(56, 56, 65), stamp(1), curated).entries.find((e) => e.id === "shout")!;
  expect(shout.spells.map((s) => s.spellId)).not.toContain(6);
});

test("ranks that disagree are shown per rank and the entry reads mixed, not collapsed to one scope", () => {
  const shout = buildRaidBuffTable(tables(20, 56, 65), stamp(1), curated).entries.find((e) => e.id === "shout")!;
  expect(shout.scope).toBe("mixed");
  expect(shout.byRank).toEqual([{ rank: 1, spellIds: [1], scope: "party" }, { rank: 2, spellIds: [2], scope: "raid" }]);
});

test("an unknown target is not hidden behind a single or self reading in the same spell", () => {
  const table = buildRaidBuffTable(tables(153, 21, 65), stamp(1), curated);
  expect(table.entries.find((e) => e.id === "shout")!.spells.map((s) => s.scope)).toEqual(["unknown", "single"]);
});

test("an id that only summons a totem is listed as missing; the aura spell carries the scope", () => {
  const totem = buildRaidBuffTable(tables(56, 56, 35), stamp(1), curated).entries.find((e) => e.id === "totem")!;
  expect(totem.spells.map((s) => s.spellId)).toEqual([4]);
  expect(totem).toMatchObject({ scope: "party", missingSpells: [3] });
});

test("debuffs read as enemy, and a list with no spell in the build is not found with a null scope", () => {
  const table = buildRaidBuffTable(tables(56, 56, 65), stamp(1), curated);
  expect(table.entries.find((e) => e.id === "curse")).toMatchObject({ scope: "enemy", class: null });
  expect(table.entries.find((e) => e.id === "gone")).toMatchObject({ scope: null, spells: [], missingSpells: [999], byRank: [] });
  expect(table.notFound).toEqual(["gone"]);
});

test("the table is stamped with its build and the game file label, and passes its schema", () => {
  const table = buildRaidBuffTable(tables(56, 56, 65), stamp(70425), curated);
  expect(table).toMatchObject({ schema: "everloot.raid-buffs/2", label: "found in game files, unconfirmed", build: { product: "wow_classic_beta", buildId: 70425 } });
  expect(() => RaidBuffTable.parse(table)).not.toThrow();
});

test("two builds are compared entry by entry, and a change in one rank shows even when the entry is mixed in both", () => {
  const before = buildRaidBuffTable(tables(20, 20, 35), stamp(70400), curated);
  const after = buildRaidBuffTable(tables(56, 56, 35), stamp(70425), curated);
  expect(diffRaidBuffs(before, after)).toEqual([{ id: "shout", label: "Test Shout", before: "party", after: "raid", beforeRanks: "1:party 2:party", afterRanks: "1:raid 2:raid" }]);
  expect(diffRaidBuffs(after, after)).toEqual([]);
  const mixedA = buildRaidBuffTable(tables(20, 56, 35), stamp(1), curated);
  const mixedB = buildRaidBuffTable(tables(56, 20, 35), stamp(2), curated);
  expect(diffRaidBuffs(mixedA, mixedB)).toMatchObject([{ id: "shout", before: "mixed", after: "mixed", beforeRanks: "1:party 2:raid", afterRanks: "1:raid 2:party" }]);
});

test("writeCatalogs reads a snapshot and writes the talent files, the index and the raid buff table into a build folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-catalog-"));
  const meta: ClientBuildMeta = {
    product: "wow_classic_beta", buildConfig: "84bea4233331e390fda8724c6f91ffa5", buildId: 70450, version: "1.60.1.70450",
    extractedAt: "2026-10-17T07:00:00.000Z", library: "@rhyster/wow-casc-dbc@2.16.15", definitions: "abc1234",
  };
  const get = tables(56, 56, 65);
  const table = (name: string, encryptedBlocks = 0): ExtractedTable => ({ table: name, fileDataID: 1, cKey: null, encryptedBlocks, rows: get(name)! });
  const snap = join(dir, "client.sqlite");
  writeClientSnapshot(snap, meta, [table("SpellName", 14), table("Spell"), table("SpellEffect", 14), table("SpellRadius")]);
  const list = join(dir, "list.yaml");
  writeFileSync(list, `- { id: shout, label: Test Shout, kind: buff, class: Warrior, spells: [1] }\n`);

  const run = writeCatalogs(snap, join(dir, "out"), list);
  expect(run.dir).toBe(join(dir, "out", "wow_classic_beta-70450-84bea423"));
  const index = JSON.parse(readFileSync(join(run.dir, "talents", "index.json"), "utf8"));
  expect(index.build).toMatchObject({ buildId: 70450, definitions: "abc1234" });
  expect(index.classes).toEqual([]);
  expect(index.warnings).toContain("required table TraitNode is not in this snapshot");
  expect(index.tables).toEqual([
    { table: "SpellName", rows: 6, encryptedBlocks: 14 },
    { table: "Spell", rows: 4, encryptedBlocks: 0 },
    { table: "SpellEffect", rows: 7, encryptedBlocks: 14 },
    { table: "SpellRadius", rows: 1, encryptedBlocks: 0 },
  ]);
  const buffs = JSON.parse(readFileSync(join(run.dir, "raid-buffs.json"), "utf8"));
  expect(buffs.entries.map((e: { id: string; scope: string }) => [e.id, e.scope])).toEqual([["shout", "raid"]]);
});
