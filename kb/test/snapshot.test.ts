import Database from "better-sqlite3";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
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
    { kind: "item", extId: "19019", name: "ZzWagoLeakMarker", gameVersion: "forever", sourceUrl: "https://wago.tools/x", retrievedAt: "2026-09-27" },
  ]);
  db.prepare("INSERT INTO api_cache VALUES ('k', '{\"leak\":\"ZzApiLeakMarker\"}', '2026-09-27', '2026-09-28')").run();

  const out = join(dir, "release.sqlite");
  const manifest = snapshot(db, out, new Date("2026-09-27T12:00:00Z"));
  expect(manifest.counts).toEqual({ curated: 1, "warcraft-wiki-2023": 0 });

  const snap = new Database(out, { readonly: true });
  expect(snap.prepare("SELECT source_id FROM entities").all()).toEqual([{ source_id: "curated" }]);
  expect(snap.prepare("SELECT count(*) AS n FROM api_cache").get()).toEqual({ n: 0 });
  expect(snap.prepare("SELECT id FROM sources ORDER BY id").all()).toEqual([{ id: "curated" }, { id: "warcraft-wiki-2023" }]);
  expect(snap.prepare("SELECT count(*) AS n FROM entities_fts WHERE entities_fts MATCH 'warchief'").get()).toEqual({ n: 1 });
  snap.close();

  const bytes = readFileSync(out).toString("latin1");
  for (const marker of ["ZzWagoLeakMarker", "zzwagoleakmarker", "ZzApiLeakMarker"]) expect(bytes).not.toContain(marker);

  const written = JSON.parse(readFileSync(`${out}.manifest.json`, "utf8"));
  expect(written).toMatchObject({ createdAt: "2026-09-27T12:00:00.000Z", licence: "CC-BY-SA-4.0", counts: { curated: 1, "warcraft-wiki-2023": 0 } });
  expect(written.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(written.notice).toContain("curated entries");
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

test("a registry is the authority: a tampered sources table cannot publish wago data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  await replaceSourceRows(db, "wago-tools", ["item"], [
    { kind: "item", extId: "1", name: "ZzWagoLeakMarker", gameVersion: "forever", sourceUrl: "https://wago.tools/x", retrievedAt: "2026-09-27" },
  ]);
  db.prepare("UPDATE sources SET publishable = 1 WHERE id = 'wago-tools'").run();
  const out = join(dir, "release.sqlite");
  expect(snapshot(db, out).counts).toEqual({ curated: 1, "warcraft-wiki-2023": 0 });
  expect(readFileSync(out).toString("latin1")).not.toContain("ZzWagoLeakMarker");
});

test("a failure mid-snapshot leaves nothing at the output path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  db.exec("CREATE TRIGGER boom BEFORE DELETE ON api_cache BEGIN SELECT RAISE(ABORT, 'boom'); END;");
  db.prepare("INSERT INTO api_cache VALUES ('k', '{}', '2026-09-27', '2026-09-28')").run();
  const out = join(dir, "release", "release.sqlite");
  expect(() => snapshot(db, out)).toThrow("boom");
  expect(existsSync(out)).toBe(false);
  expect(readdirSync(join(dir, "release")).filter((f) => f.includes(".partial-"))).toEqual([]);
});

test("refuses to overwrite the live database", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const file = join(dir, "kb.sqlite");
  const db = openDb(file);
  expect(() => snapshot(db, file)).toThrow("refusing to write the snapshot over the live database");
});
