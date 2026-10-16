import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../../kb/src/db";
import { replaceSourceRows } from "../../../kb/src/entities";
import { snapshot } from "../../../kb/src/snapshot";

/**
 * Test-only: an approved release in a temp dir with the fixture rows the lore tests share.
 * Rows: Thrall (1, indexable, categories), Stub (2), a redirect (3), two "Return to Sender" (4, 5), a page
 * saying "redirected" in lowercase (6, indexable),
 * 22 "Zone n" pages mentioning grommash (100..121), and the curated forever launch date.
 */
export async function buildLoreRelease(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "everloot-lore-"));
  const source = openDb(join(dir, "source.sqlite"));
  const wiki = (extId: string, name: string, body: string, data?: Record<string, unknown>) => ({
    kind: "lore_page" as const, extId, name, body, data, gameVersion: "lore" as const,
    sourceUrl: `https://warcraft.wiki.gg/wiki/${name.replace(/ /g, "_")}`, retrievedAt: "2023-11-13",
  });
  const rows = [
    wiki("1", "Thrall", `Thrall is the former Warchief of the Horde. ${"He led his people. ".repeat(20)}\n\n * Son of Durotan\n * Friend of Jaina`, { categories: ["Orcs", "Warchiefs"], revisionTimestamp: "2023-01-14T21:40:10Z" }),
    wiki("2", "Stub", "Short."),
    wiki("3", "Old Name", "#REDIRECT [[Thrall]]"),
    wiki("4", "Return to Sender", `An animated letter. ${"It flies. ".repeat(40)}`),
    wiki("5", "Return to Sender", `An achievement. ${"Defeat him. ".repeat(40)}`),
    wiki("6", "Redirected Road", `A road that redirected travellers. ${"It wound on. ".repeat(30)}`),
    ...Array.from({ length: 22 }, (_, i) => wiki(String(100 + i), `Zone ${i + 1}`, `Zone ${i + 1} is where grommash fought. ${"Battles raged here. ".repeat(20)}`)),
  ];
  await replaceSourceRows(source, "warcraft-wiki-2023", ["lore_page"], rows);
  await replaceSourceRows(source, "curated", ["lore_page", "item"], [{
    kind: "lore_page", extId: "forever-launch-date", name: "WoW Forever launch date",
    body: "World of Warcraft Forever launches globally on November 4, 2026.", gameVersion: "forever",
    sourceUrl: "https://news.blizzard.com/example", retrievedAt: "2026-09-24",
  }, {
    kind: "item", extId: "grommash-axe", name: "Axe of grommash",
    body: "A curated item that mentions grommash and must not appear in lore search.", gameVersion: "forever",
    sourceUrl: "https://example.test/grommash-axe", retrievedAt: "2026-09-24",
  }]);
  const release = join(dir, "release", "release.sqlite");
  snapshot(source, release, new Date("2026-10-15T00:00:00Z"));
  source.close();
  return release;
}
