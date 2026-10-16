import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
  await replaceSourceRows(db, "blizzard-api", ["item"], [
    { kind: "item", extId: "19019", name: "ZzBlizzardLeakMarker", gameVersion: "forever", sourceUrl: "https://develop.battle.net/x", retrievedAt: "2026-09-27" },
  ]);
  db.prepare("INSERT INTO api_cache VALUES ('k', '{\"leak\":\"ZzApiLeakMarker\"}', '2026-09-27', '2026-09-28')").run();

  const out = join(dir, "release", "release.sqlite");
  const manifest = snapshot(db, out, new Date("2026-09-27T12:00:00Z"));
  expect(manifest.counts).toEqual({ curated: 1, "warcraft-wiki-2023": 0 });

  const snap = new Database(out, { readonly: true });
  expect(snap.prepare("SELECT source_id FROM entities").all()).toEqual([{ source_id: "curated" }]);
  expect(snap.prepare("SELECT count(*) AS n FROM api_cache").get()).toEqual({ n: 0 });
  expect(snap.prepare("SELECT id FROM sources ORDER BY id").all()).toEqual([{ id: "curated" }, { id: "warcraft-wiki-2023" }]);
  expect(snap.prepare("SELECT count(*) AS n FROM entities_fts WHERE entities_fts MATCH 'warchief'").get()).toEqual({ n: 1 });
  snap.close();

  const bytes = readFileSync(out).toString("latin1");
  for (const marker of ["ZzBlizzardLeakMarker", "zzblizzardleakmarker", "ZzApiLeakMarker"]) expect(bytes).not.toContain(marker);

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
  expect(() => snapshot(db, join(dir, "release", "release.sqlite"))).toThrow("bad source_url");
});

test("a registry is the authority: a tampered sources table cannot publish blizzard data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  await replaceSourceRows(db, "blizzard-api", ["item"], [
    { kind: "item", extId: "1", name: "ZzBlizzardLeakMarker", gameVersion: "forever", sourceUrl: "https://develop.battle.net/x", retrievedAt: "2026-09-27" },
  ]);
  db.prepare("UPDATE sources SET publishable = 1 WHERE id = 'blizzard-api'").run();
  const out = join(dir, "release", "release.sqlite");
  expect(snapshot(db, out).counts).toEqual({ curated: 1, "warcraft-wiki-2023": 0 });
  expect(readFileSync(out).toString("latin1")).not.toContain("ZzBlizzardLeakMarker");
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

test("refuses to write the snapshot into the live database's folder", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  const out = join(dir, "release.sqlite");
  expect(() => snapshot(db, out)).toThrow("refusing to write the snapshot into the live database's folder");
});

test("verifyOutput rejects an extra table", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  db.exec("CREATE TABLE zz_extra (id INTEGER PRIMARY KEY)");
  const out = join(dir, "release", "release.sqlite");
  expect(() => snapshot(db, out)).toThrow("snapshot check failed");
  expect(existsSync(out)).toBe(false);
});

test("verifyOutput rejects an extra view", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  db.exec("CREATE VIEW zz_extra_view AS SELECT id FROM entities");
  const out = join(dir, "release", "release.sqlite");
  expect(() => snapshot(db, out)).toThrow("snapshot check failed");
  expect(existsSync(out)).toBe(false);
});

test("verifyOutput rejects a live DB whose entities table gained a column", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  db.exec("ALTER TABLE entities ADD COLUMN secret TEXT");
  const out = join(dir, "release", "release.sqlite");
  expect(() => snapshot(db, out)).toThrow("snapshot check failed");
  expect(existsSync(out)).toBe(false);
});

test("ANALYZE on the live database does not block or leak into the snapshot", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", body: "Warchief", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  await replaceSourceRows(db, "blizzard-api", ["item"], [
    { kind: "item", extId: "19019", name: "ZzBlizzardLeakMarker", gameVersion: "forever", sourceUrl: "https://develop.battle.net/x", retrievedAt: "2026-09-27" },
    { kind: "item", extId: "19020", name: "Some Blizzard Item Two", gameVersion: "forever", sourceUrl: "https://develop.battle.net/y", retrievedAt: "2026-09-27" },
    { kind: "item", extId: "19021", name: "Some Blizzard Item Three", gameVersion: "forever", sourceUrl: "https://develop.battle.net/z", retrievedAt: "2026-09-27" },
  ]);
  db.exec("ANALYZE; PRAGMA optimize;");

  const out = join(dir, "release", "release.sqlite");
  snapshot(db, out);

  const snap = new Database(out, { readonly: true });
  const statTables = snap.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sqlite_stat%'").all();
  snap.close();
  expect(statTables).toEqual([]);

  const bytes = readFileSync(out).toString("latin1");
  expect(bytes).not.toContain("ZzBlizzardLeakMarker");
  expect(bytes).not.toContain("zzblizzardleakmarker");
});

test("stale partial and work files from a crashed run are swept, but a user file is not", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", body: "Warchief", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  const outDir = join(dir, "release");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, "release.sqlite");
  const stalePartial = `${out}.partial-99999`;
  writeFileSync(stalePartial, "ZzStale");
  const staleManifestPartial = `${out}.manifest.json.partial-99999`;
  writeFileSync(staleManifestPartial, "ZzStale");
  const staleWork = join(dir, ".kb-snapshot-work-99999.sqlite");
  writeFileSync(staleWork, "ZzStale");
  const userFile = join(outDir, "release.sqlite.partial-notes.txt");
  writeFileSync(userFile, "my own notes, not a snapshot leftover");

  snapshot(db, out);

  expect(existsSync(stalePartial)).toBe(false);
  expect(existsSync(staleManifestPartial)).toBe(false);
  expect(existsSync(staleWork)).toBe(false);
  expect(existsSync(userFile)).toBe(true);
  expect(readFileSync(userFile, "utf8")).toBe("my own notes, not a snapshot leftover");
});

test("the manifest hash matches the published file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  await replaceSourceRows(db, "curated", ["lore_page"], [
    { kind: "lore_page", extId: "1", name: "Thrall", body: "Warchief", gameVersion: "lore", sourceUrl: "https://example.test/1", retrievedAt: "2026-09-27" },
  ]);
  const out = join(dir, "release", "release.sqlite");
  const manifest = snapshot(db, out);
  const recomputed = createHash("sha256").update(readFileSync(out)).digest("hex");
  expect(manifest.sha256).toBe(recomputed);
  const written = JSON.parse(readFileSync(`${out}.manifest.json`, "utf8"));
  expect(written.sha256).toBe(recomputed);
});

test("the manifest counts page types and damaged pages, and the release carries the type index", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kb-snap-"));
  const db = openDb(join(dir, "kb.sqlite"));
  const row = (extId: string, data: Record<string, unknown>) => ({
    kind: "lore_page" as const, extId, name: `Page ${extId}`, body: "Body text", gameVersion: "lore" as const,
    sourceUrl: `https://example.test/${extId}`, retrievedAt: "2023-11-13", data,
  });
  await replaceSourceRows(db, "warcraft-wiki-2023", ["lore_page"], [
    row("1", { type: "npc" }), row("2", { type: "npc", damaged: true }), row("3", { type: "item" }), row("4", {}),
  ]);
  const out = join(dir, "release", "release.sqlite");
  const manifest = snapshot(db, out, new Date("2026-10-15T12:00:00Z"));
  expect(manifest.types).toEqual({ npc: 2, item: 1, other: 1 });
  expect(manifest.damaged).toBe(1);
  const written = JSON.parse(readFileSync(`${out}.manifest.json`, "utf8"));
  expect(written.types).toEqual({ npc: 2, item: 1, other: 1 });
  expect(written.damaged).toBe(1);
  const snap = new Database(out, { readonly: true });
  expect(snap.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'entities_type_name'").get()).toEqual({ name: "entities_type_name" });
  snap.close();
});
