import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHANGE_SCHEMA, ChangeEntry, hasChanges } from "../src/build-watch/changes.js";
import { CLIENT_DIGESTS_REL, clientDigestsOf, diffClientDigests, readClientDigests, tableHash, writeClientDigests, type DigestInput } from "../src/build-watch/client-digests.js";
import { LABEL } from "../src/talents/catalog.js";
import { stamp } from "./build-watch-fixtures.js";

const rows = (entries: [number, Record<string, unknown>][]) => new Map(entries);
const digests = (buildId: number, tables: DigestInput[], definitions = "abc123abc123") =>
  clientDigestsOf({ ...stamp(buildId), definitions }, tables);

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "everloot-digests-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe("tableHash", () => {
  it("does not depend on the order rows were inserted in, or on key order", () => {
    const a = rows([[2, { b: 2, a: 1 }], [1, { z: 1 }]]);
    const b = rows([[1, { z: 1 }], [2, { a: 1, b: 2 }]]);
    expect(tableHash(a)).toBe(tableHash(b));
    expect(tableHash(a)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("changes when a value or an id changes", () => {
    expect(tableHash(rows([[1, { a: 1 }]]))).not.toBe(tableHash(rows([[1, { a: 2 }]])));
    expect(tableHash(rows([[1, { a: 1 }]]))).not.toBe(tableHash(rows([[2, { a: 1 }]])));
  });

  it("has a stable hash for an empty table", () => {
    expect(tableHash(new Map())).toBe(tableHash(new Map()));
  });
});

describe("clientDigestsOf", () => {
  it("includes empty tables and sorts by name", () => {
    const d = digests(1, [{ table: "Zed", rows: rows([]) }, { table: "Alpha", rows: rows([[1, {}]]) }]);
    expect(Object.keys(d.tables)).toEqual(["Alpha", "Zed"]);
    expect(d.tables.Zed).toEqual({ rows: 0, hash: tableHash(new Map()) });
    expect(d.hashVersion).toBe(1);
  });
});

describe("the digest file", () => {
  it("round-trips and gives one table per line", () => {
    const d = digests(1, [{ table: "Zed", rows: rows([]) }, { table: "Alpha", rows: rows([[1, {}]]) }]);
    writeClientDigests(root, d);
    const text = readFileSync(join(root, CLIENT_DIGESTS_REL), "utf8");
    expect(text).toContain('  "Alpha": ');
    expect(text).toContain('  "Zed": ');
    expect(text.split("\n").filter((l) => l.startsWith("  ")).map((l) => l.slice(2, l.indexOf(":")))).toEqual(["\"Alpha\"", "\"Zed\""]);
    expect(readClientDigests(root)).toEqual(d);
  });

  it("is null when nothing is committed", () => {
    expect(readClientDigests(join(root, "absent"))).toBeNull();
  });
});

describe("diffClientDigests", () => {
  const before = digests(1, [
    { table: "ItemSparse", rows: rows([[1, { a: 1 }]]) },
    { table: "SpellName", rows: rows([[1, { n: "x" }]]) },
    { table: "Retired", rows: rows([[1, {}]]) },
  ]);
  const after = digests(2, [
    { table: "ItemSparse", rows: rows([[1, { a: 2 }], [2, { a: 3 }]]) },
    { table: "SpellName", rows: rows([[1, { n: "x" }]]) },
    { table: "NewTable", rows: rows([[1, {}]]) },
  ], "def456def456");

  it("finds added, removed and changed tables, and a layout change", () => {
    const { readSet, warnings } = diffClientDigests(before, after);
    expect(readSet.changedTables).toEqual([{ table: "ItemSparse", rowsBefore: 1, rowsAfter: 2, changed: true }]);
    expect(readSet.addedTables).toEqual([{ table: "NewTable", fileDataID: null, rows: 1 }]);
    expect(readSet.removedTables).toEqual([{ table: "Retired", fileDataID: null }]);
    expect(readSet.layoutChanged).toBe(true);
    expect(warnings).toEqual([]);
    expect(readSet.tables).toEqual({ before: 3, after: 3 });
    expect(readSet.rows).toEqual({ before: 3, after: 4 });
  });

  it("names the file data id of a known table", () => {
    const d = digests(2, [{ table: "ItemSparse", rows: rows([]) }]);
    expect(diffClientDigests(digests(1, []), d).readSet.addedTables).toEqual([{ table: "ItemSparse", fileDataID: 1572924, rows: 0 }]);
  });

  it("calls an absent table a warning, not a removal", () => {
    const { readSet, warnings } = diffClientDigests(before, after, [{ table: "Retired", reason: "not in build" }]);
    expect(readSet.removedTables).toEqual([]);
    expect(warnings.join(" ")).toContain("Retired");
    expect(warnings.join(" ")).toContain("not in build");
  });

  it("says nothing changed when the hashes match", () => {
    const { readSet } = diffClientDigests(before, before);
    expect(readSet).toMatchObject({ addedTables: [], removedTables: [], changedTables: [], layoutChanged: false });
  });
});

describe("ChangeEntry schema", () => {
  const base = {
    label: LABEL, id: "p-1", product: "p", live: false, spoiler: true, detectedAt: "x",
    build: { version: "1", buildId: 1, buildConfig: "a" }, previous: null, initial: true,
    encryptedBlocks: { total: 0, tables: [] }, source: { definitions: null, library: "lib", extractedAt: "x" },
    catalog: { classes: 0, nodes: 0 }, talents: null, raidBuffs: null, mapChanges: null, warnings: [],
  };

  it("still parses an entry from before the read set", () => {
    expect(ChangeEntry.parse({ ...base, schema: "everloot.game-changes/1" }).schema).toBe("everloot.game-changes/1");
  });

  it("requires readSet on a /2 entry, null included", () => {
    expect(() => ChangeEntry.parse({ ...base, schema: CHANGE_SCHEMA })).toThrow(/readSet/);
    expect(ChangeEntry.parse({ ...base, schema: CHANGE_SCHEMA, readSet: null }).schema).toBe(CHANGE_SCHEMA);
  });

  it("counts a read-set change as a difference", () => {
    const entry = ChangeEntry.parse({
      ...base, schema: CHANGE_SCHEMA,
      readSet: { tables: { before: 1, after: 1 }, rows: { before: 1, after: 2 }, addedTables: [], removedTables: [], changedTables: [{ table: "ItemSparse", rowsBefore: 1, rowsAfter: 2, changed: true }], layoutChanged: false },
    });
    expect(hasChanges(entry)).toBe(true);
  });
});
