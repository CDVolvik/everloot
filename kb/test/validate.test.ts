import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows } from "../src/entities.js";
import { validate } from "../src/validate.js";

async function seeded() {
  const db = openDb(":memory:");
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  return db;
}

test("a clean database has no problems", async () => {
  expect(validate(await seeded())).toEqual([]);
});

test("reports rows whose licence differs from their source", async () => {
  const db = await seeded();
  db.prepare("UPDATE entities SET licence = 'CC0'").run();
  expect(validate(db)).toContain("licence mismatch: curated has 1 row(s) not licensed CC-BY-SA-4.0");
});

test("reports missing or malformed provenance", async () => {
  const db = await seeded();
  db.prepare("UPDATE entities SET source_url = 'not a url', retrieved_at = 'yesterday'").run();
  const problems = validate(db);
  expect(problems).toContain("bad source_url: curated/lore_page/1");
  expect(problems).toContain("bad retrieved_at: curated/lore_page/1");
});

test("the search-index check compares the index with the rows", async () => {
  const db = await seeded();
  db.exec("DROP TRIGGER entities_ai");
  db.prepare(
    "INSERT INTO entities (kind, ext_id, name, game_version, source_id, source_url, licence, retrieved_at) VALUES ('lore_page','2','Jaina','lore','curated','https://example.test/2','CC-BY-SA-4.0','2026-09-27')",
  ).run();
  expect(validate(db).some((p) => p.startsWith("search index out of sync"))).toBe(true);
});

test("a bare https:// URL is not provenance", async () => {
  const db = await seeded();
  db.prepare("UPDATE entities SET source_url = 'https://'").run();
  expect(validate(db)).toContain("bad source_url: curated/lore_page/1");
});

test("rows pointing at an unknown source are reported", async () => {
  const db = await seeded();
  db.pragma("foreign_keys = OFF");
  db.prepare("UPDATE entities SET source_id = 'nowhere'").run();
  expect(validate(db)).toContain("unknown source: nowhere has 1 row(s)");
});

test("an empty name is reported", async () => {
  const db = await seeded();
  db.prepare("UPDATE entities SET name = '   '").run();
  expect(validate(db)).toContain("bad name: curated/lore_page/1");
});

test("more than 50 bad rows says how many were not listed", async () => {
  const db = openDb(":memory:");
  const rows = Array.from({ length: 60 }, (_, i) => ({
    kind: "lore_page" as const, extId: String(i), name: `P${i}`, gameVersion: "lore" as const,
    sourceUrl: `https://example.test/${i}`, retrievedAt: "2026-09-27",
  }));
  await replaceSourceRows(db, "curated", ["lore_page"], rows);
  db.prepare("UPDATE entities SET source_url = 'nope'").run();
  const problems = validate(db);
  expect(problems.filter((p) => p.startsWith("bad source_url: curated/"))).toHaveLength(50);
  expect(problems).toContain("bad source_url: … and 10 more");
});
