import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { auditSources } from "../src/audit-sources.js";
import { openDb } from "../src/db.js";
import { replaceSourceRows } from "../src/entities.js";
import type { SourceId } from "../src/sources.js";

const page = (extId: string) => ({
  kind: "lore_page" as const, extId, name: `Page ${extId}`, body: "Body text", gameVersion: "lore" as const,
  sourceUrl: `https://example.test/${extId}`, retrievedAt: "2023-11-13", data: {},
});

async function dbWith(rows: Partial<Record<SourceId, number>>): Promise<string> {
  const path = join(mkdtempSync(join(tmpdir(), "kb-audit-")), "kb.sqlite");
  const db = openDb(path);
  for (const [source, n] of Object.entries(rows)) {
    await replaceSourceRows(db, source as SourceId, ["lore_page"], Array.from({ length: n }, (_, i) => page(`${source}-${i}`)));
  }
  db.close();
  return path;
}

test("a database with only wiki and curated rows passes", async () => {
  const p = await dbWith({ "warcraft-wiki-2023": 2, curated: 1 });
  expect(auditSources(p)).toEqual({ path: p, sources: { "warcraft-wiki-2023": 2, curated: 1 }, unexpected: [] });
});

test("any other source is reported", async () => {
  const p = await dbWith({ "warcraft-wiki-2023": 1, "blizzard-api": 1 });
  expect(auditSources(p).unexpected).toEqual(["blizzard-api"]);
});

test("a file that is not a database throws", () => {
  const p = join(mkdtempSync(join(tmpdir(), "kb-audit-")), "not-a-db.sqlite");
  writeFileSync(p, "x");
  expect(() => auditSources(p)).toThrow();
});
