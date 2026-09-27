import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { openDb } from "../src/db.js";
import { importWikiDump, wikiUrl, wikitextToText } from "../src/importers/wiki-dump.js";
import { search } from "../src/search.js";

const fixture = fileURLToPath(new URL("./fixtures/wiki-sample.xml", import.meta.url));
const zstFixture = fileURLToPath(new URL("./fixtures/wiki-sample.xml.zst", import.meta.url));

test("imports only main-namespace, non-redirect pages as lore_page rows", async () => {
  const db = openDb(":memory:");
  const n = await importWikiDump(db, fixture);
  expect(n).toBe(1);
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
  expect(await importWikiDump(db, zstFixture)).toBe(1);
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
  expect(await importWikiDump(db, fixture, { limit: 1 })).toBe(1);
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
