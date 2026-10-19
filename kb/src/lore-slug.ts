/**
 * The lore archive's URL slugs, shared by the site's /lore pages and the MCP server's search and fetch
 * tools, so both name the same page for one record.
 */

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
 * Where a knowledge record is read: a lore page has its own page on the site, where the source and
 * licence are shown with the text; any other record points at the source's own page.
 */
export function recordUrl(row: { kind: string; extId: string; name: string; sourceUrl: string }, site: string): string {
  return row.kind === "lore_page" ? `${site}/lore/${loreSlug(row)}` : row.sourceUrl;
}
