import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import wtf from "wtf_wikipedia";
import type { DB } from "../db.js";
import { replaceSourceRows, type EntityInput } from "../entities.js";
import { parsePages, type WikiPage } from "./wiki-xml.js";
import { zstdDecompress } from "./zstd.js";

/** Date of the Internet Archive dump: archive.org/details/wiki-warcraft.wiki.gg-20231113 */
export const WIKI_DUMP_DATE = "2023-11-13";

export function wikiUrl(title: string): string {
  const slug = encodeURIComponent(title.replace(/ /g, "_")).replace(/%3A/g, ":").replace(/%2F/g, "/");
  return `https://warcraft.wiki.gg/wiki/${slug}`;
}

export function wikitextToText(wikitext: string): { text: string; categories: string[] } {
  const doc = wtf(wikitext);
  return { text: doc.text().trim(), categories: doc.categories() };
}

async function* toRows(
  pages: AsyncIterable<WikiPage>,
  limit: number | undefined,
  counts: { skipped: number },
): AsyncGenerator<EntityInput> {
  let n = 0;
  for await (const p of pages) {
    if (p.ns !== 0 || p.redirect || !p.text) continue;
    let converted: { text: string; categories: string[] };
    try {
      converted = wikitextToText(p.text);
    } catch {
      counts.skipped++; // wikitext the parser cannot read is skipped, not guessed at
      continue;
    }
    if (!converted.text) {
      counts.skipped++;
      continue;
    }
    yield {
      kind: "lore_page",
      extId: p.id,
      name: p.title,
      body: converted.text,
      data: { categories: converted.categories, revisionTimestamp: p.timestamp },
      gameVersion: "lore",
      sourceUrl: wikiUrl(p.title),
      retrievedAt: WIKI_DUMP_DATE,
    };
    if (limit && ++n >= limit) return;
  }
}

/**
 * Imports a MediaWiki XML dump (`.xml` or `.xml.zst`). Returns how many pages were stored and how
 * many main-namespace pages were skipped because their wikitext converted to no text.
 */
export async function importWikiDump(
  db: DB,
  file: string,
  opts: { limit?: number } = {},
): Promise<{ stored: number; skipped: number }> {
  const raw = createReadStream(file);
  const xml: Readable = file.endsWith(".zst") ? zstdDecompress(raw) : raw;
  const counts = { skipped: 0 };
  const stored = await replaceSourceRows(db, "warcraft-wiki-2023", ["lore_page"], toRows(parsePages(xml), opts.limit, counts));
  return { stored, skipped: counts.skipped };
}
