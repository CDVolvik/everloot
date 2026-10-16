import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { importCurated } from "../src/importers/curated.js";

function dirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "kb-curated-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

const GOOD = `
- kind: lore_page
  id: forever-launch
  name: WoW Forever launch date
  game_version: forever
  body: WoW Forever launches on November 4, 2026.
  source_url: https://news.blizzard.com/en-us/article/24302498
  retrieved_at: "2026-09-27"
`;

test("imports every yaml file in the folder as curated rows", async () => {
  const db = openDb(":memory:");
  expect(await importCurated(db, dirWith({ "a.yaml": GOOD, "notes.txt": "ignored" }))).toBe(1);
  const r = db.prepare("SELECT kind, ext_id, game_version, licence, source_id FROM entities").get();
  expect(r).toEqual({ kind: "lore_page", ext_id: "forever-launch", game_version: "forever", licence: "CC-BY-SA-4.0", source_id: "curated" });
});

test("imports .yml files too, not just .yaml", async () => {
  const db = openDb(":memory:");
  expect(await importCurated(db, dirWith({ "a.yml": GOOD }))).toBe(1);
  const r = db.prepare("SELECT kind, ext_id FROM entities").get();
  expect(r).toEqual({ kind: "lore_page", ext_id: "forever-launch" });
});

test("a missing field names the file and the field", async () => {
  const db = openDb(":memory:");
  const bad = GOOD.replace(/  source_url:.*\n/, "");
  await expect(importCurated(db, dirWith({ "bad.yaml": bad }))).rejects.toThrow("bad.yaml: entry 1 is missing source_url");
});

test("a file whose top level is not a list is named in the error", async () => {
  const db = openDb(":memory:");
  await expect(importCurated(db, dirWith({ "map.yaml": "kind: lore_page\nid: x\n" }))).rejects.toThrow("map.yaml: top level must be a list of entries");
});

test("an unknown game_version or kind is named with the file and entry", async () => {
  const db = openDb(":memory:");
  await expect(importCurated(db, dirWith({ "v.yaml": GOOD.replace("game_version: forever", "game_version: tbc") }))).rejects.toThrow('v.yaml: entry 1 has game_version "tbc"');
  await expect(importCurated(db, dirWith({ "k.yaml": GOOD.replace("kind: lore_page", "kind: boss") }))).rejects.toThrow('k.yaml: entry 1 has kind "boss"');
});

test("a duplicate id across files names both files", async () => {
  const db = openDb(":memory:");
  await expect(importCurated(db, dirWith({ "a.yaml": GOOD, "b.yaml": GOOD }))).rejects.toThrow('b.yaml: entry 1 duplicates lore_page id "forever-launch" (first defined in a.yaml)');
});

test("whitespace-only required fields count as missing", async () => {
  const db = openDb(":memory:");
  await expect(importCurated(db, dirWith({ "w.yaml": GOOD.replace("name: WoW Forever launch date", 'name: "   "') }))).rejects.toThrow("w.yaml: entry 1 is missing name");
});

test("a curated id must be kebab-case and must not look like a wiki page id", async () => {
  for (const id of ["12345", "2026-launch", "Forever Launch", "forever_launch"]) {
    const db = openDb(":memory:");
    await expect(importCurated(db, dirWith({ "a.yaml": GOOD.replace("id: forever-launch", `id: "${id}"`) }))).rejects.toThrow(/id/);
  }
  const db = openDb(":memory:");
  expect(await importCurated(db, dirWith({ "a.yaml": GOOD.replace("id: forever-launch", "id: forever-launch-2") }))).toBe(1);
});
