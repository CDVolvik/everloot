import { createReadStream } from "node:fs";
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

export interface WikiImportProgress {
  pass: 1 | 2;
  /** `<page>` blocks read so far in this pass. */
  blocks: number;
}

export interface WikiImportOptions {
  /** Stop after storing this many rows. Applies to pass 2 only: a trial still reads the whole file once. */
  limit?: number;
  onProgress?: (p: WikiImportProgress) => void;
  /** Blocks between `onProgress` calls. Default 100,000. */
  progressEvery?: number;
}

const REDIRECT = /^\s*#redirect\b/i;

/** A fresh stream of `<page>` blocks from the file, so each pass reads it independently. */
function openPages(file: string): AsyncGenerator<WikiPage> {
  const raw = createReadStream(file);
  return parsePages(file.endsWith(".zst") ? zstdDecompress(raw) : raw);
}

async function* counted(pages: AsyncIterable<WikiPage>, pass: 1 | 2, opts: WikiImportOptions): AsyncGenerator<WikiPage> {
  const every = opts.progressEvery ?? 100_000;
  let blocks = 0;
  for await (const p of pages) {
    if (opts.onProgress && ++blocks % every === 0) opts.onProgress({ pass, blocks });
    yield p;
  }
}

/**
 * Pass 1: page id -> newest revision time (ms) across every block of that page. A WikiTeam history
 * dump splits one page over many non-adjacent, out-of-order `<page>` blocks. Stores numbers only:
 * a substring of the parsed text would keep its whole decoded chunk alive.
 */
async function newestRevisions(file: string, opts: WikiImportOptions): Promise<Map<number, number>> {
  const newest = new Map<number, number>();
  for await (const p of counted(openPages(file), 1, opts)) {
    const t = Date.parse(p.timestamp);
    if (Number.isNaN(t)) continue; // a block with no revision has nothing to offer
    const id = Number(p.id);
    const prev = newest.get(id);
    if (prev === undefined || t > prev) newest.set(id, t);
  }
  return newest;
}

/**
 * Pass 2: one row per main-namespace page, from the block holding its newest revision (that block's
 * title and text). Pages whose newest text is a redirect are dropped, not counted as skipped.
 */
async function* toRows(
  pages: AsyncIterable<WikiPage>,
  newest: Map<number, number>,
  limit: number | undefined,
  counts: { skipped: number },
): AsyncGenerator<EntityInput> {
  let n = 0;
  for await (const p of pages) {
    const id = Number(p.id);
    if (Date.parse(p.timestamp) !== newest.get(id)) continue;
    newest.delete(id); // settled: a tied block later in the file must not emit the page again
    if (p.ns !== 0 || p.redirect || !p.text || REDIRECT.test(p.text)) continue;
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
 * Imports a MediaWiki XML dump (`.xml` or `.xml.zst`), including WikiTeam history dumps where one
 * page spans many `<page>` blocks. Reads the file twice: pass 1 finds each page's newest revision,
 * pass 2 stores it inside one atomic replace. Returns how many pages were stored and how many
 * main-namespace pages were skipped because their wikitext could not be converted or converted to no text.
 */
export async function importWikiDump(
  db: DB,
  file: string,
  opts: WikiImportOptions = {},
): Promise<{ stored: number; skipped: number }> {
  const newest = await newestRevisions(file, opts);
  const counts = { skipped: 0 };
  const rows = toRows(counted(openPages(file), 2, opts), newest, opts.limit, counts);
  const stored = await replaceSourceRows(db, "warcraft-wiki-2023", ["lore_page"], rows);
  return { stored, skipped: counts.skipped };
}
