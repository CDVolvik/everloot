import { CLIENT_LAYER, CLIENT_TAXONOMY } from "../../../kb/src/client-layer-file";
import { filterItems, QUALITIES, slotOf } from "../../../kb/src/item-taxonomy";

export { CLIENT_LAYER, CLIENT_TAXONOMY };

export const ITEMS_PER_PAGE = 100;

/**
 * A category page stays out of search (noindex, and out of the sitemap) until at least this share of its
 * first page has a name. A page of "Item 1234" rows is thin, and search engines judge the whole site by it.
 */
export const MIN_NAMED_SHARE = 0.5;

/** Where a shown item name comes from, in the words each page writes beside it. */
export const NAME_SOURCE = {
  players: "Confirmed by players",
  wiki: "Game files + Warcraft Wiki",
  files: "Game files, unconfirmed",
} as const;
export type NameSource = keyof typeof NAME_SOURCE;
export interface ShownItemName { name: string; source: NameSource; color: string | null; wikiPage: string | null }

/**
 * The name a page shows for an item, best source first: the name 3 installs agree on; then the game file name
 * where the Warcraft Wiki gives the same one; then, for an item players reported, its game file name from the
 * tooltip facts. Null when there is none: the page writes "Item N".
 */
export function shownItemName(
  id: number,
  agreed: { get(id: number): string | undefined },
  matched?: { get(id: number): { name: string; color: string; wikiPage: string } | undefined } | null,
  tip?: { name: string; color: string } | null,
): ShownItemName | null {
  const players = agreed.get(id), wiki = matched?.get(id);
  if (players) return { name: players, source: "players", color: tip?.color ?? wiki?.color ?? null, wikiPage: null };
  if (wiki) return { name: wiki.name, source: "wiki", color: wiki.color, wikiPage: wiki.wikiPage };
  if (tip) return { name: tip.name, source: "files", color: tip.color, wikiPage: null };
  return null;
}

/** Whether the plain first page of a category has enough named rows to be indexed. */
export function categoryNamedEnough(classId: number, subclassId: number | undefined, named: { has(id: number): boolean }): boolean {
  const ids = filterItems(CLIENT_TAXONOMY, { classId, subclassId }).slice(0, ITEMS_PER_PAGE).map((row) => row[0]);
  return ids.length > 0 && ids.filter((id) => named.has(id)).length / ids.length >= MIN_NAMED_SHARE;
}

/** Slot slugs any item in the build uses, in inventory type order (robes and chest pieces share "chest"). */
export const SLOT_SLUGS: string[] = [...new Set(CLIENT_TAXONOMY.items.map((r) => slotOf(r[3])?.slug).filter((s): s is string => Boolean(s)))];
export const QUALITY_SLUGS: string[] = QUALITIES.map((q) => q.slug);

export interface CategoryQuery { slot?: string; quality?: string; page: number }

/** The list filters from the query string; an unknown value is null (the page answers 404 rather than guess). */
export function categoryQuery(search: Record<string, string | string[] | undefined>): CategoryQuery | null {
  const one = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : undefined);
  const slot = one("slot"), quality = one("quality"), page = one("page");
  if (slot !== undefined && !SLOT_SLUGS.includes(slot)) return null;
  if (quality !== undefined && !QUALITY_SLUGS.includes(quality)) return null;
  if (page !== undefined && !/^[1-9]\d{0,4}$/.test(page)) return null;
  return { slot, quality, page: page === undefined ? 1 : Number(page) };
}

export function itemsHref(classSlug?: string, subclassSlug?: string, q: Partial<CategoryQuery> = {}): string {
  const path = ["/database/items", classSlug, classSlug ? subclassSlug : undefined].filter(Boolean).join("/");
  const params = new URLSearchParams();
  if (q.slot) params.set("slot", q.slot);
  if (q.quality) params.set("quality", q.quality);
  if (q.page && q.page > 1) params.set("page", String(q.page));
  const s = params.toString();
  return s ? `${path}?${s}` : path;
}
