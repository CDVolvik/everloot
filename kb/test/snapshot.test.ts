import Database from "better-sqlite3";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { replaceSourceRows } from "../src/entities.js";
import { snapshot } from "../src/snapshot.js";

test("snapshot keeps publishable rows only and writes a manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", body: "Warchief", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  await replaceSourceRows(db, "wago-tools", ["item"], [
    { kind: "item", extId: "19019", name: "Thunderfury", gameVersion: "forever", sourceUrl: "https://wago.tools/x", retrievedAt: "2026-09-27" },
  ]);
  db.prepare("INSERT INTO api_cache VALUES ('k', '{}', '2026-09-27', '2026-09-28')").run();

  const out = join(dir, "release.sqlite");
  const manifest = snapshot(db, out, new Date("2026-09-27T12:00:00Z"));
  expect(manifest.counts).toEqual({ curated: 1 });

  const snap = new Database(out, { readonly: true });
  expect(snap.prepare("SELECT source_id FROM entities").all()).toEqual([{ source_id: "curated" }]);
  expect(snap.prepare("SELECT count(*) AS n FROM api_cache").get()).toEqual({ n: 0 });
  expect(snap.prepare("SELECT id FROM sources ORDER BY id").all()).toEqual([{ id: "curated" }, { id: "warcraft-wiki-2023" }]);
  expect(snap.prepare("SELECT count(*) AS n FROM entities_fts WHERE entities_fts MATCH 'warchief'").get()).toEqual({ n: 1 });
  snap.close();

  const written = JSON.parse(readFileSync(`${out}.manifest.json`, "utf8"));
  expect(written).toMatchObject({ createdAt: "2026-09-27T12:00:00.000Z", licence: "CC-BY-SA-4.0", counts: { curated: 1 } });
  expect(written.notice).toContain("not affiliated with Blizzard");
});

test("snapshot refuses to run when validation fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "nope", retrievedAt: "2026-09-27" },
  ]);
  expect(() => snapshot(db, join(dir, "release.sqlite"))).toThrow("bad source_url");
});
