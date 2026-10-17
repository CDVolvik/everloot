import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { diffSnapshots } from "../src/client-diff.js";
import { writeClientSnapshot, type ClientBuildMeta, type ExtractedTable } from "../src/client-snapshot.js";

const meta = (buildId: number, product = "wow_classic_beta"): ClientBuildMeta => ({
  product, buildConfig: buildId.toString(16).padStart(32, "0"), buildId, version: `1.60.1.${buildId}`,
  extractedAt: "2026-10-17T07:00:00.000Z", library: "@rhyster/wow-casc-dbc@2.16.15", definitions: null,
});
const tbl = (name: string, rows: [number, Record<string, unknown>][]): ExtractedTable =>
  ({ table: name, fileDataID: 1, cKey: null, encryptedBlocks: 0, rows: new Map(rows) });
function snap(m: ClientBuildMeta, tables: ExtractedTable[]): string {
  const path = join(mkdtempSync(join(tmpdir(), "kb-diff-")), "client.sqlite");
  writeClientSnapshot(path, m, tables);
  return path;
}

test("added, removed and changed rows, with each changed field's before and after", () => {
  const a = snap(meta(70450), [tbl("ItemSparse", [
    [1, { ID: 1, Display_lang: "Old Sword", ItemLevel: 10 }],
    [2, { ID: 2, Display_lang: "Gone Shield", ItemLevel: 12 }],
  ])]);
  const b = snap(meta(70460), [tbl("ItemSparse", [
    [1, { ID: 1, Display_lang: "Old Sword", ItemLevel: 15 }],
    [3, { ID: 3, Display_lang: "New Helm", ItemLevel: 20 }],
  ])]);
  const diff = diffSnapshots(a, b);
  expect(diff.from).toMatchObject({ product: "wow_classic_beta", version: "1.60.1.70450" });
  expect(diff.to).toMatchObject({ product: "wow_classic_beta", version: "1.60.1.70460" });
  expect(diff.crossProduct).toBe(false);
  expect(diff.tables).toEqual([{
    table: "ItemSparse",
    added: [3],
    removed: [2],
    changed: [{ id: 1, fields: [{ field: "ItemLevel", before: 10, after: 15 }] }],
    schema: { addedFields: [], removedFields: [] },
  }]);
});

test("the same two snapshots always give the same diff, in id and field order", () => {
  const rows = (lvl: number): [number, Record<string, unknown>][] =>
    [9, 3, 7].map((id) => [id, { ID: id, Zeta: lvl, Alpha: -lvl }] as [number, Record<string, unknown>]);
  const a = snap(meta(1), [tbl("Item", rows(1))]);
  const b = snap(meta(2), [tbl("Item", rows(2))]);
  const first = diffSnapshots(a, b);
  expect(first.tables[0].changed.map((c) => c.id)).toEqual([3, 7, 9]);
  expect(first.tables[0].changed[0].fields.map((f) => f.field)).toEqual(["Alpha", "Zeta"]);
  expect(diffSnapshots(a, b)).toEqual(first);
});

test("array fields compare by value, so an unchanged array is not a change", () => {
  const a = snap(meta(1), [tbl("Spell", [[1, { ID: 1, Effects: [1, 2, 3] }]])]);
  const b = snap(meta(2), [tbl("Spell", [[1, { ID: 1, Effects: [1, 2, 3] }]])]);
  expect(diffSnapshots(a, b).tables[0].changed).toEqual([]);
});

test("a table that loses most of its rows is flagged, since that is usually a parsing problem", () => {
  const many = Array.from({ length: 100 }, (_, i) => [i + 1, { ID: i + 1 }] as [number, Record<string, unknown>]);
  const a = snap(meta(1), [tbl("ItemSparse", many)]);
  const b = snap(meta(2), [tbl("ItemSparse", many.slice(0, 40))]);
  const diff = diffSnapshots(a, b);
  expect(diff.tables[0].removed).toHaveLength(60);
  expect(diff.warnings).toEqual(["ItemSparse: 60 of 100 rows removed; check the extraction before trusting this"]);
});

test("a table present in only one snapshot is a warning, not a mass removal", () => {
  const a = snap(meta(1), [tbl("Item", [[1, { ID: 1 }]]), tbl("Spell", [[1, { ID: 1 }]])]);
  const b = snap(meta(2), [tbl("Item", [[1, { ID: 1 }]])]);
  const diff = diffSnapshots(a, b);
  expect(diff.tables.map((t) => t.table)).toEqual(["Item"]);
  expect(diff.warnings).toEqual(["Spell: only in 1.60.1.1 (wow_classic_beta)"]);
});

test("comparing two products is labelled as a cross-product comparison", () => {
  const a = snap(meta(70003, "wow_classic_era"), [tbl("Item", [[1, { ID: 1 }]])]);
  const b = snap(meta(70450), [tbl("Item", [[1, { ID: 1 }]])]);
  expect(diffSnapshots(a, b).crossProduct).toBe(true);
});

test("a column only one build has is one schema change, not a change on every row", () => {
  const a = snap(meta(70003, "wow_classic_era"), [tbl("ItemSparse", [
    [1, { ID: 1, ItemLevel: 10, MaxDurability: 50 }],
    [2, { ID: 2, ItemLevel: 12, MaxDurability: 60 }],
  ])]);
  const b = snap(meta(70450), [tbl("ItemSparse", [
    [1, { ID: 1, ItemLevel: 15, ItemSquish: 0 }],
    [2, { ID: 2, ItemLevel: 12, ItemSquish: 0 }],
  ])]);
  const [t] = diffSnapshots(a, b).tables;
  expect(t.schema).toEqual({ addedFields: ["ItemSquish"], removedFields: ["MaxDurability"] });
  expect(t.changed).toEqual([{ id: 1, fields: [{ field: "ItemLevel", before: 10, after: 15 }] }]);
});
