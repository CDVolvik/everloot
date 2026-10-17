import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { sha256File } from "../src/snapshot.js";
import {
  clientSnapshotName, normalizeItem, normalizeSpell, readClientRows, readClientItems, writeClientSnapshot,
  type ClientBuildMeta, type ExtractedTable,
} from "../src/client-snapshot.js";

const meta: ClientBuildMeta = {
  product: "wow_classic_beta", buildConfig: "84bea4233331e390fda8724c6f91ffa5", buildId: 70450,
  version: "1.60.1.70450", extractedAt: "2026-10-17T07:00:00.000Z", library: "@rhyster/wow-casc-dbc@2.16.15",
  definitions: "abc1234",
};
const table = (name: string, fileDataID: number, rows: [number, Record<string, unknown>][], encryptedBlocks = 0): ExtractedTable =>
  ({ table: name, fileDataID, cKey: "c".repeat(32), encryptedBlocks, rows: new Map(rows) });

function sampleTables(): ExtractedTable[] {
  return [
    table("ItemSparse", 1572924, [[19019, { ID: 19019, Display_lang: "Thunderfury, Blessed Blade of the Windseeker", OverallQualityID: 5, ItemLevel: 80, RequiredLevel: 60 }]]),
    table("Item", 841626, [[19019, { ID: 19019, ClassID: 2, SubclassID: 7, InventoryType: 13 }]]),
    table("SpellName", 1990283, [[133, { ID: 133, Name_lang: "Fireball" }]]),
    table("Spell", 1140089, [[133, { ID: 133, Description_lang: "Hurls a fiery ball.", AuraDescription_lang: "" }]]),
  ];
}

test("a snapshot keeps each raw row and writes a manifest with provenance and a checksum", () => {
  const path = join(mkdtempSync(join(tmpdir(), "kb-client-")), "client.sqlite");
  const manifest = writeClientSnapshot(path, meta, sampleTables());
  expect(manifest).toMatchObject({ ...meta, sha256: sha256File(path) });
  expect(manifest.tables).toEqual([
    { table: "ItemSparse", fileDataID: 1572924, cKey: "c".repeat(32), rows: 1, encryptedBlocks: 0 },
    { table: "Item", fileDataID: 841626, cKey: "c".repeat(32), rows: 1, encryptedBlocks: 0 },
    { table: "SpellName", fileDataID: 1990283, cKey: "c".repeat(32), rows: 1, encryptedBlocks: 0 },
    { table: "Spell", fileDataID: 1140089, cKey: "c".repeat(32), rows: 1, encryptedBlocks: 0 },
  ]);
  expect(JSON.parse(readFileSync(`${path}.manifest.json`, "utf8"))).toEqual(manifest);
  expect(readClientRows(path, "SpellName").get(133)).toEqual({ ID: 133, Name_lang: "Fireball" });
});

test("normalized items and spells take known fields and leave the rest null", () => {
  expect(normalizeItem(19019, { Display_lang: "Thunderfury", OverallQualityID: 5, ItemLevel: 80, RequiredLevel: 60 }, { ClassID: 2, SubclassID: 7, InventoryType: 13 }))
    .toEqual({ id: 19019, name: "Thunderfury", quality: 5, itemLevel: 80, requiredLevel: 60, classId: 2, subclassId: 7, inventoryType: 13 });
  expect(normalizeItem(5, undefined, { ClassID: 0 }))
    .toEqual({ id: 5, name: null, quality: null, itemLevel: null, requiredLevel: null, classId: 0, subclassId: null, inventoryType: null });
  expect(normalizeSpell(133, { Name_lang: "Fireball" }, undefined)).toEqual({ id: 133, name: "Fireball", description: null, auraDescription: null });
});

test("the snapshot's items table joins ItemSparse and Item", () => {
  const path = join(mkdtempSync(join(tmpdir(), "kb-client-")), "client.sqlite");
  writeClientSnapshot(path, meta, sampleTables());
  expect(readClientItems(path)).toEqual([
    { id: 19019, name: "Thunderfury, Blessed Blade of the Windseeker", quality: 5, itemLevel: 80, requiredLevel: 60, classId: 2, subclassId: 7, inventoryType: 13 },
  ]);
});

test("64-bit values are stored as strings rather than failing or losing precision", () => {
  const path = join(mkdtempSync(join(tmpdir(), "kb-client-")), "client.sqlite");
  writeClientSnapshot(path, meta, [table("Item", 841626, [[1, { ID: 1, Flags: 18446744073709551615n }]])]);
  expect(readClientRows(path, "Item").get(1)).toEqual({ ID: 1, Flags: "18446744073709551615" });
});

test("encrypted blocks that were skipped are recorded per table", () => {
  const path = join(mkdtempSync(join(tmpdir(), "kb-client-")), "client.sqlite");
  const manifest = writeClientSnapshot(path, meta, [table("ItemSparse", 1572924, [[1, { ID: 1 }]], 2)]);
  expect(manifest.tables[0].encryptedBlocks).toBe(2);
});

test("a snapshot's file name tells apart two builds that share a build number", () => {
  expect(clientSnapshotName(meta)).toBe("wow_classic_beta-70450-84bea423.sqlite");
  expect(clientSnapshotName({ ...meta, buildConfig: "fedcba9876543210fedcba9876543210" })).toBe("wow_classic_beta-70450-fedcba98.sqlite");
});