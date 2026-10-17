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

/** Made-up spell ids and numbers. The target ids 20 and 56 are the real party and raid ones. */
function tables(shoutTarget: number, totemEffect: number): TableReader {
  const t: Record<string, Rows> = {
    SpellName: rows([
      { ID: 1, Name_lang: "Test Shout" }, { ID: 2, Name_lang: "Test Shout" }, { ID: 3, Name_lang: "Test Totem" },
      { ID: 4, Name_lang: "Test Totem Aura" }, { ID: 5, Name_lang: "Test Curse" },
    ]),
    Spell: rows([{ ID: 1, NameSubtext_lang: "Rank 1" }, { ID: 2, NameSubtext_lang: "Rank 2" }, { ID: 4, NameSubtext_lang: "Rank 1" }]),
    SpellRadius: rows([{ ID: 9, Radius: 30 }]),
    SpellEffect: rows([
      { ID: 1, SpellID: 1, DifficultyID: 0, EffectIndex: 0, Effect: 6, EffectAura: 99, ImplicitTarget: [shoutTarget, 0], EffectRadiusIndex: [9, 0] },
      { ID: 2, SpellID: 2, DifficultyID: 0, EffectIndex: 0, Effect: 6, EffectAura: 99, ImplicitTarget: [shoutTarget, 0], EffectRadiusIndex: [9, 0] },
      { ID: 3, SpellID: 3, DifficultyID: 0, EffectIndex: 0, Effect: 28, EffectAura: 0, ImplicitTarget: [41, 0], EffectRadiusIndex: [0, 0] }, // summons the totem: no aura
      { ID: 4, SpellID: 4, DifficultyID: 0, EffectIndex: 0, Effect: totemEffect, EffectAura: 29, ImplicitTarget: [1, 0], EffectRadiusIndex: [9, 9] },
      { ID: 5, SpellID: 5, DifficultyID: 0, EffectIndex: 0, Effect: 6, EffectAura: 22, ImplicitTarget: [6, 0], EffectRadiusIndex: [0, 0] },
      { ID: 6, SpellID: 2, DifficultyID: 14, EffectIndex: 0, Effect: 6, EffectAura: 99, ImplicitTarget: [1, 0], EffectRadiusIndex: [0, 0] }, // another difficulty: ignored
    ]),
  };
  return (name) => t[name];
}

const curated: Curated = [
  { id: "shout", label: "Test Shout", kind: "buff", class: "Warrior", names: ["Test Shout"] },
  { id: "totem", label: "Test Totem", kind: "buff", class: "Shaman", names: ["Test Totem", "Test Totem Aura"] },
  { id: "curse", label: "Test Curse", kind: "debuff", names: ["Test Curse"] },
  { id: "gone", label: "Not In The Game", kind: "buff", names: ["Not In The Game"] },
];

test("scope comes from the area aura effect type when there is one, and from the target ids otherwise", () => {
  expect(effectScope(35, [1, 0])).toBe("party");
  expect(effectScope(65, [1, 0])).toBe("raid");
  expect(effectScope(6, [20, 0])).toBe("party");
  expect(effectScope(6, [56, 0])).toBe("raid");
  expect(effectScope(6, [21, 0])).toBe("single");
  expect(effectScope(6, [6, 0])).toBe("enemy");
  expect(effectScope(6, [1, 0])).toBe("self");
  expect(effectScope(6, [22, 30])).toBe("area");
  expect(effectScope(6, [153, 0])).toBe("unknown");
});

test("each entry lists the spells with that name that apply an aura, with effect, aura, targets and radius", () => {
  const table = buildRaidBuffTable(tables(56, 65), stamp(70425), curated);
  const shout = table.entries.find((e) => e.id === "shout")!;
  expect(shout.spells.map((s) => [s.spellId, s.rank, s.scope])).toEqual([[1, 1, "raid"], [2, 2, "raid"]]);
  expect(shout.spells[1].effects).toEqual([{ index: 0, effect: 6, aura: 99, targets: [56, 0], radiusYards: 30, scope: "raid" }]);
  expect(shout).toMatchObject({ scope: "raid", scopes: { raid: 2 }, class: "Warrior" });
});

test("a totem is found through the aura spell; the spell that only summons it is skipped", () => {
  const totem = buildRaidBuffTable(tables(56, 35), stamp(1), curated).entries.find((e) => e.id === "totem")!;
  expect(totem.spells.map((s) => s.spellId)).toEqual([4]);
  expect(totem.scope).toBe("party");
});

test("debuffs read as enemy, and a name the build does not have is listed as not found with a null scope", () => {
  const table = buildRaidBuffTable(tables(56, 65), stamp(1), curated);
  expect(table.entries.find((e) => e.id === "curse")).toMatchObject({ scope: "enemy", class: null });
  expect(table.entries.find((e) => e.id === "gone")).toMatchObject({ scope: null, spells: [] });
  expect(table.notFound).toEqual(["gone"]);
});

test("the table is stamped with its build and the game file label, and passes its schema", () => {
  const table = buildRaidBuffTable(tables(56, 65), stamp(70425), curated);
  expect(table).toMatchObject({ schema: "everloot.raid-buffs/1", label: "found in game files, unconfirmed", build: { product: "wow_classic_beta", buildId: 70425 } });
  expect(() => RaidBuffTable.parse(table)).not.toThrow();
});

test("two builds are compared entry by entry: party in one and raid in the next shows as a change", () => {
  const before = buildRaidBuffTable(tables(20, 35), stamp(70400), curated);
  const after = buildRaidBuffTable(tables(56, 35), stamp(70425), curated);
  expect(diffRaidBuffs(before, after)).toEqual([{ id: "shout", label: "Test Shout", before: "party", after: "raid" }]);
  expect(diffRaidBuffs(after, after)).toEqual([]);
});

test("writeCatalogs reads a snapshot and writes the talent files, the index and the raid buff table into a build folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-catalog-"));
  const meta: ClientBuildMeta = {
    product: "wow_classic_beta", buildConfig: "84bea4233331e390fda8724c6f91ffa5", buildId: 70450, version: "1.60.1.70450",
    extractedAt: "2026-10-17T07:00:00.000Z", library: "@rhyster/wow-casc-dbc@2.16.15", definitions: "abc1234",
  };
  const get = tables(56, 65);
  const table = (name: string, encryptedBlocks = 0): ExtractedTable => ({ table: name, fileDataID: 1, cKey: null, encryptedBlocks, rows: get(name)! });
  const snap = join(dir, "client.sqlite");
  writeClientSnapshot(snap, meta, [table("SpellName", 14), table("Spell"), table("SpellEffect", 14), table("SpellRadius")]);
  const list = join(dir, "list.yaml");
  writeFileSync(list, `- { id: shout, label: Test Shout, kind: buff, class: Warrior, names: [Test Shout] }\n`);

  const run = writeCatalogs(snap, join(dir, "out"), list);
  expect(run.dir).toBe(join(dir, "out", "wow_classic_beta-70450-84bea423"));
  const index = JSON.parse(readFileSync(join(run.dir, "talents", "index.json"), "utf8"));
  expect(index.build).toMatchObject({ buildId: 70450, definitions: "abc1234" });
  expect(index.classes).toEqual([]);
  expect(index.tables).toEqual([
    { table: "SpellName", rows: 5, encryptedBlocks: 14 },
    { table: "Spell", rows: 3, encryptedBlocks: 0 },
    { table: "SpellEffect", rows: 6, encryptedBlocks: 14 },
    { table: "SpellRadius", rows: 1, encryptedBlocks: 0 },
  ]);
  const buffs = JSON.parse(readFileSync(join(run.dir, "raid-buffs.json"), "utf8"));
  expect(buffs.entries.map((e: { id: string; scope: string }) => [e.id, e.scope])).toEqual([["shout", "raid"]]);
});
