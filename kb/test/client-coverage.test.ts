import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { clientCoverage, formatCoverage, NEEDED_FIELDS } from "../src/client-coverage.js";
import { CLIENT_TABLES, writeClientSnapshot, type ClientBuildMeta, type ExtractedTable } from "../src/client-snapshot.js";

const meta: ClientBuildMeta = {
  product: "wow_classic_beta", buildConfig: "84bea4233331e390fda8724c6f91ffa5", buildId: 70450,
  version: "1.60.1.70450", extractedAt: "2026-10-18T07:00:00.000Z", library: "@rhyster/wow-casc-dbc@2.16.15",
  definitions: "b9a63096cdd9",
};
const table = (name: keyof typeof CLIENT_TABLES, rows: [number, Record<string, unknown>][], encryptedBlocks = 0): ExtractedTable =>
  ({ table: name, fileDataID: CLIENT_TABLES[name], cKey: "c".repeat(32), encryptedBlocks, rows: new Map(rows) });

function snapshot(): string {
  const path = join(mkdtempSync(join(tmpdir(), "kb-coverage-")), "client.sqlite");
  writeClientSnapshot(path, meta, [
    table("Item", [[19019, { ID: 19019, ClassID: 2, SubclassID: 7, InventoryType: 13, IconFileDataID: 135349 }], [25, { ID: 25, ClassID: 2, SubclassID: 7, InventoryType: 13, IconFileDataID: 0 }]]),
    table("ItemSubClass", [[1, { ID: 1, ClassID: 2, SubClassID: 7, DisplayName_lang: "One-Handed Swords", VerboseName_lang: "" }]], 3),
    // A column the definitions name differently from what we expect: reported, not guessed.
    table("CreatureFamily", [[1, { ID: 1, Name_lang: "Wolf", IconFileDataID: 132203 }]]),
    table("ItemSet", [[1, { ID: 1, Name_lang: "Battlegear of Might", ItemID: [16862, 16863, 0] }]]),
  ], [{ table: "Toy", reason: "not in this build" }, { table: "QuestV2", reason: "No valid definition found for layout 1C2B3A4D" }]);
  return path;
}

test("every client table is in the report, read or not, with why it was not read", () => {
  const report = clientCoverage(snapshot());
  expect(report.tables.map((t) => t.table)).toEqual(Object.keys(CLIENT_TABLES));
  expect(report.tables.find((t) => t.table === "Toy")).toMatchObject({ status: "absent", reason: "not in this build", rows: 0 });
  expect(report.tables.find((t) => t.table === "QuestV2")).toMatchObject({ status: "failed", reason: "No valid definition found for layout 1C2B3A4D" });
  // A table neither in the snapshot nor in its missing list (an older snapshot) says so.
  expect(report.tables.find((t) => t.table === "Faction")).toMatchObject({ status: "not extracted", reason: null });
});

test("a read table reports its rows, encrypted blocks, and whether each field we rely on exists and holds values", () => {
  const report = clientCoverage(snapshot());
  const item = report.tables.find((t) => t.table === "Item")!;
  expect(item).toMatchObject({ status: "read", rows: 2, encryptedBlocks: 0, fileDataID: 841626 });
  expect(item.fields).toEqual([
    { name: "ClassID", present: true, filled: 2 }, { name: "SubclassID", present: true, filled: 2 },
    { name: "InventoryType", present: true, filled: 2 }, { name: "IconFileDataID", present: true, filled: 1 },
  ]);
  const sub = report.tables.find((t) => t.table === "ItemSubClass")!;
  expect(sub.encryptedBlocks).toBe(3);
  expect(sub.fields.find((f) => f.name === "VerboseName_lang")).toEqual({ name: "VerboseName_lang", present: true, filled: 0 });
  expect(report.tables.find((t) => t.table === "ItemSet")!.fields.find((f) => f.name === "ItemID")).toEqual({ name: "ItemID", present: true, filled: 1 });
  expect(report.tables.find((t) => t.table === "CreatureFamily")!.fields.find((f) => f.name === "IconFileID")).toEqual({ name: "IconFileID", present: false, filled: 0 });
});

test("every field we rely on is named for a table we read", () => {
  for (const t of Object.keys(NEEDED_FIELDS)) expect(Object.keys(CLIENT_TABLES)).toContain(t);
});

test("the markdown report carries the build stamp and flags missing fields and unread tables", () => {
  const md = formatCoverage(clientCoverage(snapshot()));
  expect(md).toContain("wow_classic_beta 1.60.1.70450 (build config 84bea423, WoWDBDefs b9a63096cdd9)");
  expect(md).toContain("| Item | 841626 | read | 2 | 0 | ClassID 2, SubclassID 2, InventoryType 2, IconFileDataID 1 |");
  expect(md).toContain("**IconFileID missing**");
  expect(md).toContain("| Toy | 988200 | not in this build | 0 | 0 |");
  expect(md).toContain("| QuestV2 | 1139443 | failed: No valid definition found for layout 1C2B3A4D | 0 | 0 |");
});
