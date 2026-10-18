import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ClientLayer, readLayerEdges, readLayerTaxonomy, writeClientLayer } from "../src/client-layer.js";
import { CLIENT_TABLES, writeClientSnapshot, type ClientBuildMeta, type ExtractedTable } from "../src/client-snapshot.js";

const meta: ClientBuildMeta = {
  product: "wow_classic_beta", buildConfig: "84bea4233331e390fda8724c6f91ffa5", buildId: 70450,
  version: "1.60.1.70450", extractedAt: "2026-10-18T08:08:17.671Z", library: "@rhyster/wow-casc-dbc@2.16.15",
  definitions: "b9a63096cdd9",
};
const table = (name: keyof typeof CLIENT_TABLES, rows: Record<string, unknown>[]): ExtractedTable =>
  ({ table: name, fileDataID: CLIENT_TABLES[name], cKey: null, encryptedBlocks: 0, rows: new Map(rows.map((r) => [r.ID as number, r])) });

test("the client layer is one build-stamped, labelled file whose rows read back as edges", () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-layer-"));
  const snap = join(dir, "client.sqlite");
  writeClientSnapshot(snap, meta, [
    table("SpellEffect", [{ ID: 1, SpellID: 2660, Effect: 24, EffectItemType: 2862 }]),
    table("ItemSet", [{ ID: 209, ItemID: [16862, 0] }]),
    table("ItemClass", [{ ID: 5, ClassID: 4, ClassName_lang: "Armor" }]),
    table("ItemSubClass", [{ ID: 20, ClassID: 4, SubClassID: 4, DisplayName_lang: "Plate", VerboseName_lang: "Plate" }]),
    table("Item", [{ ID: 16862, ClassID: 4, SubclassID: 4, InventoryType: 5 }]),
    table("ItemSparse", [{ ID: 16862, OverallQualityID: 4 }]),
  ]);
  const path = join(dir, "out", "client-layer.json");
  const layer = writeClientLayer(snap, path);
  const text = readFileSync(path, "utf8");
  // One edge per line: a new build's file reads as a line diff.
  expect(text).toContain('\n  ["item",2862,"created_by","spell",2660],\n  ["item",16862,"part_of_set","item_set",209]\n');
  const file = ClientLayer.parse(JSON.parse(text));
  expect(file).toEqual(layer);
  expect(file).toMatchObject({
    schema: "everloot.client-layer/2", label: "Found in game files, unconfirmed",
    build: { product: "wow_classic_beta", buildId: 70450, version: "1.60.1.70450", buildConfig: "84bea4233331e390fda8724c6f91ffa5", definitions: "b9a63096cdd9" },
    counts: { created_by: 1, part_of_set: 1 },
    edges: [["item", 2862, "created_by", "spell", 2660], ["item", 16862, "part_of_set", "item_set", 209]],
  });
  expect(file.credit).toContain("WoWDBDefs");
  expect(file.categories.classes).toEqual([{ id: 4, name: "Armor", slug: "armor", items: 1 }]);
  expect(file.categories.subclasses).toEqual([{ classId: 4, id: 4, name: "Plate", slug: "plate", items: 1 }]);
  expect(file.items).toEqual([[16862, 4, 4, 5, 4]]);
  expect(text).toContain('\n  [16862,4,4,5,4]\n');
  expect(readLayerTaxonomy(file).items).toEqual(file.items);
  expect(readLayerEdges(file)[0]).toEqual({
    fromKind: "item", fromId: 2862, rel: "created_by", toKind: "spell", toId: 2660,
    evidence: "client", build: "1.60.1.70450", installs: null, firstSeen: meta.extractedAt, lastSeen: meta.extractedAt,
  });
});
