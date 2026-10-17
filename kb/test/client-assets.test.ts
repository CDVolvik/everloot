import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { AssetManifest, buildAssetsFromTables, FRAME_ELEMENTS, type Converter } from "../src/client-assets.js";
import type { FileStatus, TableSource } from "../src/client-extract.js";
import type { Row, Rows } from "../src/talents/build-catalog.js";
import type { BuildStamp } from "../src/talents/catalog.js";

const build: BuildStamp = { product: "wow_classic_beta", buildId: 70450, version: "1.60.1.70450", buildConfig: "b".repeat(32), definitions: null, extractedAt: "2026-10-17T00:00:00.000Z" };
const t = (rows: Row[]): Rows => new Map(rows.map((r, i) => [typeof r.ID === "number" ? r.ID : i + 1, r]));

// One made-up class with one tree and three talents. Ids are invented, none are from a real build.
// Talent 1001 has an icon that reads fine, 1002's icon is encrypted, 1003's is not in the build.
const tables: Record<string, Rows> = {
  ChrClasses: t([{ ID: 1, Name_lang: "Warrior" }]),
  ChrSpecialization: t([{ ID: 77, ClassID: 1, OrderIndex: 0 }]),
  SkillLine: t([{ ID: 10, DisplayName_lang: "Arms" }]),
  SkillRaceClassInfo: t([{ ID: 1, SkillID: 10, ClassMask: 1 }]),
  SkillLineXTraitTree: t([{ ID: 1, SkillLineID: 10, TraitTreeID: 900 }]),
  TraitTree: t([{ ID: 900 }]),
  TraitNodeGroupDisplayInfo: t([{ ID: 1, TraitNodeGroupID: 500, SkillLineID: 10, OrderIndex: 0, TraitTreeID: 900 }]),
  TraitNodeGroupXTraitNode: t([1, 2, 3].map((n) => ({ TraitNodeGroupID: 500, TraitNodeID: n }))),
  TraitNode: t([
    { ID: 1, TraitTreeID: 900, PosX: 1000, PosY: 2000, Type: 0 },
    { ID: 2, TraitTreeID: 900, PosX: 1600, PosY: 2000, Type: 0 },
    { ID: 3, TraitTreeID: 900, PosX: 2200, PosY: 2000, Type: 0 },
  ]),
  TraitNodeXTraitNodeEntry: t([1, 2, 3].map((n) => ({ TraitNodeID: n, TraitNodeEntryID: 10 + n, Index: 0 }))),
  TraitNodeEntry: t([1, 2, 3].map((n) => ({ ID: 10 + n, TraitDefinitionID: 100 + n, MaxRanks: 1 }))),
  TraitDefinition: t([1, 2, 3].map((n) => ({ ID: 100 + n, SpellID: 1000 + n }))),
  SpellName: t([1, 2, 3].map((n) => ({ ID: 1000 + n, Name_lang: `Talent ${n}` }))),
  Spell: t([
    { ID: 1001, Description_lang: "Deals $s1 damage for $d." },
    { ID: 1002, Description_lang: "Does $s1 and $q9." },
    { ID: 1003, Description_lang: null },
  ]),
  SpellMisc: t([
    { ID: 1, SpellID: 1001, DifficultyID: 0, SpellIconFileDataID: 5001, DurationIndex: 7, Attributes: [0x40, 0] },
    { ID: 2, SpellID: 1002, DifficultyID: 0, SpellIconFileDataID: 5002, DurationIndex: 0, Attributes: [0, 0] },
    { ID: 3, SpellID: 1003, DifficultyID: 0, SpellIconFileDataID: 5003, DurationIndex: 0, Attributes: [0, 0] },
  ]),
  SpellEffect: t([
    { ID: 1, SpellID: 1001, DifficultyID: 0, EffectIndex: 0, EffectBasePoints: 25, EffectDieSides: 0 },
    { ID: 2, SpellID: 1002, DifficultyID: 0, EffectIndex: 0, EffectBasePoints: 4, EffectDieSides: 0 },
  ]),
  SpellDuration: t([{ ID: 7, Duration: 10000 }]),
  UiTextureAtlas: t([{ ID: 1, FileDataID: 9000 }]),
  UiTextureAtlasElement: t([{ ID: 1, Name: "talents-node-circle-green" }, { ID: 2, Name: "talents-background-warrior-arms" }]),
  UiTextureAtlasMember: t([
    { ID: 1, UiTextureAtlasID: 1, UiTextureAtlasElementID: 1, CommittedLeft: 0, CommittedTop: 0, CommittedRight: 10, CommittedBottom: 10 },
    { ID: 2, UiTextureAtlasID: 1, UiTextureAtlasElementID: 2, CommittedLeft: 10, CommittedTop: 0, CommittedRight: 30, CommittedBottom: 10 },
  ]),
};

const status: Record<number, FileStatus> = { 5001: "present", 5002: "encrypted", 5003: "absent", 9000: "present" };
const source = (reads: number[]): TableSource => ({
  async read() { return null; },
  fileStatus: (id) => status[id] ?? "absent",
  async readFile(id) { reads.push(id); return { cKey: "k", buffer: Buffer.from(`blp ${id}`), encryptedBlocks: 0 }; },
});

// Stands in for Pillow: writes a small file and reports a size.
const fakeConvert: Converter = async (jobs) => jobs.map((j) => {
  writeFileSync(j.dst, `webp of ${j.src}`);
  return { dst: j.dst, ok: true, width: j.crop ? j.crop[2] - j.crop[0] : 64, height: j.crop ? j.crop[3] - j.crop[1] : 64, error: null };
});

async function run(convert = fakeConvert) {
  const reads: number[] = [];
  const outDir = mkdtempSync(join(tmpdir(), "everloot-assets-"));
  const result = await buildAssetsFromTables({ get: (n) => tables[n], build, outDir, source: source(reads), convert });
  return { ...result, reads, outDir };
}

test("icons, tooltips and frame pieces come out with counts, and encrypted or missing files are skipped", async () => {
  const { manifest, reads, dir } = await run();
  expect(AssetManifest.parse(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")))).toEqual(manifest);
  expect(manifest.label).toBe("found in game files, unconfirmed");
  expect(manifest.build.buildId).toBe(70450);
  expect(manifest.counts).toMatchObject({ iconsExtracted: 1, iconsEncrypted: 1, iconsAbsent: 1, iconsFailed: 0, framesExtracted: 2 });
  // The encrypted and the absent icon were never downloaded: only the readable icon and the atlas were.
  expect(reads.sort()).toEqual([5001, 9000]);
  expect(manifest.spells["101"]).toMatchObject({ spellId: 1001, name: "Talent 1", icon: "5001.webp", passive: true, description: { text: "Deals 25 damage for 10 sec.", unresolved: [] } });
  expect(manifest.spells["102"]).toMatchObject({ icon: null, passive: false, description: { text: "Does 4 and [?].", unresolved: ["$q9"] } });
  expect(manifest.spells["103"]).toMatchObject({ icon: null, description: null });
  expect(manifest.counts).toMatchObject({ tooltipsResolved: 1, tooltipsUnresolved: 1, tooltipsEmpty: 1 });
  expect(manifest.backgrounds["warrior:Arms"]).toEqual({ element: "talents-background-warrior-arms", nearest: false });
  expect(manifest.frames["talents-node-circle-green"]).toMatchObject({ file: "frames/talents-node-circle-green.webp", width: 10, height: 10 });
  expect(manifest.frames["talents-node-circle-green"].sha256).toMatch(/^[0-9a-f]{64}$/);
  // Everything else the window wants is reported, not invented.
  expect(manifest.missingFrames).toContain("talents-arrow-line-yellow");
  expect(manifest.missingFrames).not.toContain("talents-node-circle-green");
  expect(FRAME_ELEMENTS.filter((e) => !manifest.missingFrames.includes(e))).toEqual(["talents-node-circle-green"]);
});

test("a build that serves nothing for a file leaves it out and says so", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "everloot-assets-"));
  const src: TableSource = { async read() { return null; }, fileStatus: () => "present", async readFile() { return { cKey: "k", buffer: Buffer.alloc(1), encryptedBlocks: 2 } } };
  const { manifest } = await buildAssetsFromTables({ get: (n) => tables[n], build, outDir, source: src, convert: fakeConvert });
  expect(manifest.counts).toMatchObject({ iconsExtracted: 0, iconsEncrypted: 3, framesExtracted: 0 });
  expect(Object.keys(manifest.icons)).toEqual([]);
});

test("a file the converter cannot read is counted as failed and has no entry", async () => {
  const { manifest } = await run(async (jobs) => jobs.map((j) => ({ dst: j.dst, ok: false, width: 0, height: 0, error: "bad" })));
  expect(manifest.counts.iconsFailed).toBe(1);
  expect(manifest.spells["101"].icon).toBeNull();
});

test("the output holds only the manifest and converted files, and the working copies are gone", async () => {
  const { dir } = await run();
  expect(existsSync(join(dir, "_work"))).toBe(false);
});

test("it refuses a snapshot that lacks the atlas tables", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "everloot-assets-"));
  await expect(buildAssetsFromTables({ get: (n) => (n === "UiTextureAtlas" ? undefined : tables[n]), build, outDir, source: source([]), convert: fakeConvert }))
    .rejects.toThrow(/client-extract --refresh/);
});
