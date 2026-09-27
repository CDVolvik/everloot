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

test("a missing field names the file and the field", async () => {
  const db = openDb(":memory:");
  const bad = GOOD.replace(/  source_url:.*\n/, "");
  await expect(importCurated(db, dirWith({ "bad.yaml": bad }))).rejects.toThrow("bad.yaml: entry 1 is missing source_url");
});
