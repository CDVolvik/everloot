import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { SOURCES } from "../src/sources.js";

test("openDb creates the schema and registers every source", () => {
  const db = openDb(":memory:");
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name")
    .all()
    .map((r) => (r as { name: string }).name);
  expect(tables).toEqual(expect.arrayContaining(["api_cache", "entities", "entities_fts", "sources"]));
  const sources = db.prepare("SELECT id, licence, publishable FROM sources ORDER BY id").all();
  expect(sources).toHaveLength(Object.keys(SOURCES).length);
  expect(sources).toContainEqual({ id: "wago-tools", licence: "blizzard-game-data", publishable: 0 });
  expect(sources).toContainEqual({ id: "warcraft-wiki-2023", licence: "CC-BY-SA-4.0", publishable: 1 });
});

test("openDb is safe to call twice on the same file", () => {
  const file = join(mkdtempSync(join(tmpdir(), "kb-db-")), "kb.sqlite");
  openDb(file).close();
  const again = openDb(file);
  expect(again.prepare("SELECT count(*) AS n FROM sources").get()).toEqual({ n: Object.keys(SOURCES).length });
});
