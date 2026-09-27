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
 * Pass 1: page id -> the ordinal (1-based position among all blocks read) of the block holding that
 * page's newest revision. A WikiTeam history dump splits one page over many non-adjacent,
 * out-of-order `<page>` blocks. When two blocks tie on newest timestamp, the later block in the file
 * wins (`t >= prev`), matching the parser's own in-block tie rule. Stores numbers only: a substring
 * of the parsed text would keep its whole decoded chunk alive.
 */
async function newestBlockOrdinals(file: string, opts: WikiImportOptions): Promise<Map<number, number>> {
  const newestTime = new Map<number, number>();
  const newestOrdinal = new Map<number, number>();
  let ordinal = 0;
  for await (const p of counted(openPages(file), 1, opts)) {
    ordinal++;
    const t = Date.parse(p.timestamp);
    if (Number.isNaN(t)) continue; // a block with no revision has nothing to offer
    const id = Number(p.id);
    const prev = newestTime.get(id);
    if (prev === undefined || t >= prev) {
      newestTime.set(id, t);
      newestOrdinal.set(id, ordinal);
    }
  }
  return newestOrdinal;
}

/**
 * Pass 2: one row per main-namespace page, from the block holding its newest revision (that block's
 * title and text). Pages whose newest block is a redirect (tag or `#REDIRECT` text), outside
 * namespace 0, or has empty text are dropped and counted by reason, not counted as skipped.
 */
async function* toRows(
  pages: AsyncIterable<WikiPage>,
  newestOrdinal: Map<number, number>,
  limit: number | undefined,
  counts: { skipped: number; dropped: { redirect: number; namespace: number; empty: number } },
): AsyncGenerator<EntityInput> {
  let n = 0;
  let ordinal = 0;
  for await (const p of pages) {
    ordinal++;
    const id = Number(p.id);
    if (newestOrdinal.get(id) !== ordinal) continue;
    newestOrdinal.delete(id); // settled: a tied id later in the file must not emit the page again
    if (p.ns !== 0) {
      counts.dropped.namespace++;
      continue;
    }
    if (p.redirect || REDIRECT.test(p.text)) {
      counts.dropped.redirect++;
      continue;
    }
    if (!p.text) {
      counts.dropped.empty++;
      continue;
    }
    let converted: { text: string; categories: string[] };
    try {
      converted = wikitextToText(p.text);
    } catch {
      counts.skipped++; // wikitext the parser cannot read is skipped, not guessed at
      continue;
    }
    if ((converted.text.match(/\p{L}/gu) ?? []).length < 20) {
      // near-empty: template-only stubs (item tooltips, TCG cards, disambiguation stubs)
      // convert to a handful of words or less; not worth storing.
      counts.skipped++;
      continue;
    }
    yield {
      kind: "lore_page",
      extId: p.id,
      name: p.title,
      body: converted.text.replace(/\n{3,}/g, "\n\n"),
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
 * pass 2 stores it inside one atomic replace. Returns how many pages were stored, how many
 * main-namespace pages were skipped because their wikitext could not be converted or converted to no
 * text, and how many pages were dropped (and why: redirect, outside namespace 0, or empty text).
 */
export async function importWikiDump(
  db: DB,
  file: string,
  opts: WikiImportOptions = {},
): Promise<{ stored: number; skipped: number; dropped: { redirect: number; namespace: number; empty: number } }> {
  const newestOrdinal = await newestBlockOrdinals(file, opts);
  const counts = { skipped: 0, dropped: { redirect: 0, namespace: 0, empty: 0 } };
  const rows = toRows(counted(openPages(file), 2, opts), newestOrdinal, opts.limit, counts);
  const stored = await replaceSourceRows(db, "warcraft-wiki-2023", ["lore_page"], rows);
  return { stored, skipped: counts.skipped, dropped: counts.dropped };
}
