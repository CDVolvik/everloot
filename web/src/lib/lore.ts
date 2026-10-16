/**
 * The lore archive: Warcraft Wiki pages from the approved knowledge release, served on the site.
 * Pure helpers (slugs, body rendering, indexing rule) live here with the release-backed lookups.
 */

export const PAGE_SIZE = 20;
export const INDEXABLE_MIN_BODY = 300;
export const CHUNK_SIZE = 40_000;
export const MAX_QUERY = 200;

/** Lowercase ASCII letters and digits joined by hyphens; accents stripped, everything else dropped. */
export function slugify(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const runs = ascii.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return runs.join("-").slice(0, 80).replace(/-+$/, "");
}

/** `<extId>-<name-slug>`: the wiki page id, then a readable name. */
export function loreSlug(row: { extId: string; name: string }): string {
  return `${row.extId}-${slugify(row.name)}`;
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

/** The first sentence, or a word-boundary cut at `max` with an ellipsis. */
export function firstSentence(body: string, max = 160): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const end = flat.search(/\.(\s|$)/);
  const sentence = end >= 0 ? flat.slice(0, end + 1) : flat;
  if (sentence.length <= max) return sentence;
  const cut = sentence.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}
