import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { importWikiDump, wikiUrl, wikitextToText } from "../src/importers/wiki-dump.js";
import { search } from "../src/search.js";

const fixture = fileURLToPath(new URL("./fixtures/wiki-sample.xml", import.meta.url));
const zstFixture = fileURLToPath(new URL("./fixtures/wiki-sample.xml.zst", import.meta.url));
const w31Fixture = fileURLToPath(new URL("./fixtures/wiki-sample.w31.xml.zst", import.meta.url));

test("imports only main-namespace, non-redirect pages as lore_page rows", async () => {
  const db = openDb(":memory:");
  const n = await importWikiDump(db, fixture);
  expect(n).toEqual({ stored: 1, skipped: 0 });
  const r = db.prepare("SELECT kind, name, game_version, source_url, retrieved_at, licence, data FROM entities").get() as Record<string, string>;
  expect(r).toMatchObject({
    kind: "lore_page",
    name: "Thunderfury",
    game_version: "lore",
    source_url: "https://warcraft.wiki.gg/wiki/Thunderfury",
    retrieved_at: "2023-11-13",
    licence: "CC-BY-SA-4.0",
  });
  expect(JSON.parse(r.data).categories).toContain("Legendary items");
  expect(search(db, "legendary sword")).toHaveLength(1);
});

test("reads a zstd-compressed dump the same way", async () => {
  const db = openDb(":memory:");
  expect(await importWikiDump(db, zstFixture)).toEqual({ stored: 1, skipped: 0 });
  expect(search(db, "blessed blade")).toHaveLength(1);
});

test("re-import does not duplicate", async () => {
  const db = openDb(":memory:");
  await importWikiDump(db, fixture);
  await importWikiDump(db, fixture);
  const { n } = db.prepare("SELECT count(*) AS n FROM entities").get() as { n: number };
  expect(n).toBe(1);
});

test("limit stops early", async () => {
  const db = openDb(":memory:");
  expect((await importWikiDump(db, fixture, { limit: 1 })).stored).toBe(1);
});

test("reads a dump whose zstd frame declares a 2 GB window (like the real Warcraft Wiki dump)", async () => {
  const db = openDb(":memory:");
  expect(await importWikiDump(db, w31Fixture)).toEqual({ stored: 1, skipped: 0 });
});

test("a truncated .zst dump is rejected and keeps the previous rows", async () => {
  const db = openDb(":memory:");
  await importWikiDump(db, fixture);
  const bytes = readFileSync(zstFixture);
  const cut = join(mkdtempSync(join(tmpdir(), "kb-zst-")), "cut.xml.zst");
  writeFileSync(cut, bytes.subarray(0, bytes.length - 20));
  await expect(importWikiDump(db, cut)).rejects.toThrow();
  const { n } = db.prepare("SELECT count(*) AS n FROM entities").get() as { n: number };
  expect(n).toBe(1);
});

test("counts main-namespace pages whose text converts to nothing as skipped", async () => {
  const db = openDb(":memory:");
  const xml =
    '<mediawiki><page><title>Only categories</title><ns>0</ns><id>7</id><revision>' +
    "<timestamp>2023-01-01T00:00:00Z</timestamp><text>[[Category:Stubs]]</text></revision></page></mediawiki>";
  const file = join(mkdtempSync(join(tmpdir(), "kb-xml-")), "skip.xml");
  writeFileSync(file, xml);
  expect(await importWikiDump(db, file)).toEqual({ stored: 0, skipped: 1 });
});

test("wikitextToText strips markup and collects categories", () => {
  const { text, categories } = wikitextToText("'''Thrall''' leads the [[Horde]].\n[[Category:Orcs]]");
  expect(text).toContain("Thrall leads the Horde.");
  expect(categories).toEqual(["Orcs"]);
});

test("wikiUrl builds a readable wiki URL", () => {
  expect(wikiUrl("Thrall (lore)")).toBe("https://warcraft.wiki.gg/wiki/Thrall_(lore)");
  expect(wikiUrl("Ahn'Qiraj: The Fallen Kingdom")).toBe("https://warcraft.wiki.gg/wiki/Ahn'Qiraj:_The_Fallen_Kingdom");
});
