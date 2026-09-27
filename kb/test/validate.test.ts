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
