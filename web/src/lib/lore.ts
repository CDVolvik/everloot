import { SOURCES } from "../../../kb/src/sources";
import { search, type SearchHit } from "../../../kb/src/search";
import { getRelease } from "./release";

/**
 * The lore archive: Warcraft Wiki pages from the approved knowledge release, served on the site.
 * Pure helpers (slugs, body rendering, indexing rule) live here with the release-backed lookups.
 */

export const PAGE_SIZE = 20;
export const INDEXABLE_MIN_BODY = 300;
export const CHUNK_SIZE = 40_000;
export const MAX_QUERY = 200;
/** Deepest search page served; beyond it the answer is "no hits", never a 20 million row LIMIT. */
export const MAX_PAGE = 50;
export const UNAVAILABLE_COPY = "The knowledge release could not be opened. Nothing here is a count or a page; try again later.";
export const CONVERSION_NOTE = "Converted from wikitext with templates, tables and images removed, so some sentences may be missing values.";

/** Lowercase ASCII letters and digits joined by hyphens; accents stripped, everything else dropped. */
export function slugify(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const runs = ascii.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return runs.join("-").slice(0, 80).replace(/-+$/, "");
}

/** `<extId>-<name-slug>` for a numeric wiki page id; a curated kebab id is the whole slug. */
export function loreSlug(row: { extId: string; name: string }): string {
  return /^[1-9]\d*$/.test(row.extId) ? `${row.extId}-${slugify(row.name)}` : row.extId;
}

/**
 * Wiki ids are digits (`291323-frostwhisper`); curated ids are kebab strings and carry no name
 * part (`forever-launch-date`). Leading zeros, uppercase and anything outside [a-z0-9-] are rejected
 * so one page never answers at two URLs.
 */
export function parseLoreSlug(slug: string): { extId: string; nameSlug: string } | null {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  const numeric = slug.match(/^([1-9]\d*)(?:-(.*))?$/);
  if (numeric) return { extId: numeric[1], nameSlug: numeric[2] ?? "" };
  if (/^0/.test(slug)) return null;
  return { extId: slug, nameSlug: "" };
}

export function isIndexable(body: string): boolean {
  return body.length >= INDEXABLE_MIN_BODY && !body.includes("REDIRECT");
}

export type BodyBlock = { type: "p"; text: string } | { type: "ul"; items: string[] };

/** Plain-text body → paragraphs split on blank lines; consecutive ` * ` lines form one list. */
export function renderBody(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const chunk of body.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    let items: string[] = [];
    let text: string[] = [];
    const flushText = () => { if (text.length) { blocks.push({ type: "p", text: text.join(" ") }); text = []; } };
    const flushItems = () => { if (items.length) { blocks.push({ type: "ul", items }); items = []; } };
    for (const line of lines) {
      const bullet = line.match(/^\*\s*(.*)$/);
      if (bullet) { flushText(); if (bullet[1]) items.push(bullet[1]); }
      else { flushItems(); text.push(line); }
    }
    flushText();
    flushItems();
  }
  return blocks;
}

/**
 * The first sentence of the first block, or a word-boundary cut at `max` with an ellipsis.
 * A bullet-first body (disambiguation pages) reads as its items joined by "; ", never "* ".
 */
export function firstSentence(body: string, max = 160): string {
  const first = renderBody(body)[0];
  const text = !first ? "" : first.type === "p" ? first.text : first.items.join("; ");
  const flat = text.replace(/\s+/g, " ").trim();
  if (first?.type === "ul") return flat.length <= max ? flat : `${flat.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  const end = flat.search(/\.(\s|$)/);
  const sentence = end >= 0 ? flat.slice(0, end + 1) : flat;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

// ---- Release-backed lookups ----------------------------------------------------------------

export type Unavailable = "unavailable";
export const UNAVAILABLE: Unavailable = "unavailable";

export interface LorePage {
  extId: string;
  name: string;
  body: string;
  categories: string[];
  revisionTimestamp: string | null;
  sourceUrl: string;
  sourceId: string;
  licence: string;
  retrievedAt: string;
  gameVersion: string;
}

const PUBLISHABLE = Object.values(SOURCES).filter((s) => s.publishable).map((s) => s.id);
const SOURCE_MARKS = PUBLISHABLE.map(() => "?").join(", ");
const INDEXABLE_SQL = `kind = 'lore_page' AND source_id IN (${SOURCE_MARKS}) AND length(body) >= ${INDEXABLE_MIN_BODY} AND instr(body, 'REDIRECT') = 0`;

interface LoreRow {
  extId: string; name: string; body: string; data: string; sourceUrl: string; sourceId: string;
  licence: string; retrievedAt: string; gameVersion: string;
}

export function loreByExtId(extId: string): LorePage | null | Unavailable {
  const release = getRelease();
  if (!release) return UNAVAILABLE;
  const row = release.db
    .prepare(
      `SELECT ext_id AS extId, name, body, data, source_url AS sourceUrl, source_id AS sourceId, licence,
         retrieved_at AS retrievedAt, game_version AS gameVersion
       FROM entities WHERE kind = 'lore_page' AND source_id IN (${SOURCE_MARKS}) AND ext_id = ? LIMIT 1`,
    )
    .get(...PUBLISHABLE, extId) as LoreRow | undefined;
  if (!row) return null;
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(row.data) as Record<string, unknown>; } catch { /* a row without usable data still renders */ }
  const categories = Array.isArray(data.categories) ? data.categories.filter((c): c is string => typeof c === "string") : [];
  return {
    extId: row.extId, name: row.name, body: row.body, sourceUrl: row.sourceUrl, sourceId: row.sourceId,
    licence: row.licence, retrievedAt: row.retrievedAt, gameVersion: row.gameVersion, categories,
    revisionTimestamp: typeof data.revisionTimestamp === "string" ? data.revisionTimestamp : null,
  };
}

export function searchLore(q: string, page: number): { hits: SearchHit[]; hasNext: boolean } | Unavailable {
  const release = getRelease();
  if (!release) return UNAVAILABLE;
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  if (p > MAX_PAGE) return { hits: [], hasNext: false };
  const results = search(release.db, q.slice(0, MAX_QUERY), p * PAGE_SIZE + 1, { kinds: ["lore_page"] });
  return { hits: results.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), hasNext: results.length > p * PAGE_SIZE };
}

/** The count scans every body (seconds on the real file); a read-only release cannot change, so count once per open. */
const COUNTS = new WeakMap<object, number>();

export function indexableCount(): number | Unavailable {
  const release = getRelease();
  if (!release) return UNAVAILABLE;
  const known = COUNTS.get(release.db);
  if (known !== undefined) return known;
  const row = release.db.prepare(`SELECT count(*) AS n FROM entities WHERE ${INDEXABLE_SQL}`).get(...PUBLISHABLE) as { n: number };
  COUNTS.set(release.db, row.n);
  return row.n;
}

export function indexableChunk(n: number, size = CHUNK_SIZE): { extId: string; name: string }[] | Unavailable {
  const release = getRelease();
  if (!release) return UNAVAILABLE;
  return release.db
    .prepare(`SELECT ext_id AS extId, name FROM entities WHERE ${INDEXABLE_SQL} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...PUBLISHABLE, size, n * size) as { extId: string; name: string }[];
}

export function releaseCreatedAt(): string | Unavailable {
  const release = getRelease();
  return release ? release.manifest.createdAt : UNAVAILABLE;
}
