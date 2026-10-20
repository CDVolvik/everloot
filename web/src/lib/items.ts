import { CLIENT_EDGES, CLIENT_LAYER, CLIENT_SKILLS, CLIENT_TAXONOMY } from "../../../kb/src/client-layer-file";
import { describe, filterItems, QUALITIES, slotOf, slugify, type ItemRow } from "../../../kb/src/item-taxonomy";

export { CLIENT_LAYER, CLIENT_TAXONOMY };

/** Rows on one page of an item list (density spec, 2026-10-20: 50, as on Wowhead and WarcraftDB). */
export const ITEMS_PER_PAGE = 50;

/**
 * A category page stays out of search (noindex, and out of the sitemap) until at least this share of its
 * first rows has a name. A page of "Item 1234" rows is thin, and search engines judge the whole site by it.
 */
export const MIN_NAMED_SHARE = 0.5;
/** The rows that share is read over: the first 100 by id, as when a page held 100 rows, so the same categories stay indexed. */
export const NAMED_SAMPLE = 100;

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

/** Whether the plain first rows of a category have enough names to be indexed. */
export function categoryNamedEnough(classId: number, subclassId: number | undefined, named: { has(id: number): boolean }): boolean {
  const ids = filterItems(CLIENT_TAXONOMY, { classId, subclassId }).slice(0, NAMED_SAMPLE).map((row) => row[0]);
  return ids.length > 0 && ids.filter((id) => named.has(id)).length / ids.length >= MIN_NAMED_SHARE;
}

/** Slot slugs any item in the build uses, in inventory type order (robes and chest pieces share "chest"). */
export const SLOT_SLUGS: string[] = [...new Set(CLIENT_TAXONOMY.items.map((r) => slotOf(r[3])?.slug).filter((s): s is string => Boolean(s)))];
export const QUALITY_SLUGS: string[] = QUALITIES.map((q) => q.slug);
/** The quality filter also takes items whose quality the files leave unrecorded. */
export const UNRECORDED = "unrecorded";

/* ---------- What the game files say about each item: crafted, reagent, set piece, profession ---------- */

export interface Profession { id: number; name: string; slug: string }
interface Facets { crafted: Set<number>; reagent: Set<number>; set: Set<number>; bySkill: Map<number, Set<number>>; professions: Profession[] }

let facets: Facets | null = null;
/** Read once from the committed client layer: items a spell creates, items a spell uses, set pieces, and the profession of those spells. */
export function itemFacets(): Facets {
  if (facets) return facets;
  const skillOfSpell = new Map<number, number>();
  for (const e of CLIENT_EDGES) if (e.rel === "in_skill_line") skillOfSpell.set(e.fromId, e.toId);
  const crafted = new Set<number>(), reagent = new Set<number>(), set = new Set<number>();
  const bySkill = new Map<number, Set<number>>();
  for (const e of CLIENT_EDGES) {
    if (e.fromKind !== "item") continue;
    if (e.rel === "part_of_set") set.add(e.fromId);
    if (e.rel !== "created_by" && e.rel !== "reagent_for") continue;
    (e.rel === "created_by" ? crafted : reagent).add(e.fromId);
    const skill = skillOfSpell.get(e.toId);
    if (skill !== undefined) bySkill.set(skill, (bySkill.get(skill) ?? new Set()).add(e.fromId));
  }
  const professions = [...CLIENT_SKILLS].filter(([id]) => bySkill.has(id)).map(([id, name]) => ({ id, name, slug: slugify(name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  facets = { crafted, reagent, set, bySkill, professions };
  return facets;
}

/* ---------- The list's query string ---------- */

export const ITEM_SORTS = ["name", "type", "slot", "seen", "id"] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

/** Filters, sort and page of an item list; the class and subclass are in the path. */
export interface CategoryQuery {
  /** Name contains (the names a page may show), or an exact id. */
  q?: string;
  slot?: string[];
  quality?: string[];
  crafted?: boolean;
  reagent?: boolean;
  set?: boolean;
  /** Profession slug: items its spells make or use. */
  skill?: string;
  /** Items players have reported (a public fact: name, drop, vendor or quest). */
  seen?: boolean;
  /** Absent: by id, ascending. */
  sort?: { key: ItemSort; desc: boolean };
  page: number;
}

/** How many filters are on (the page and the sort are not filters). */
export function activeFilters(q: CategoryQuery): number {
  return Number(Boolean(q.q)) + (q.slot?.length ? 1 : 0) + (q.quality?.length ? 1 : 0) + Number(Boolean(q.crafted)) + Number(Boolean(q.reagent))
    + Number(Boolean(q.set)) + Number(Boolean(q.skill)) + Number(Boolean(q.seen));
}

/** A comma list where every value is known, in the known values' order; null when one is not. */
function list(raw: string | undefined, known: readonly string[]): string[] | undefined | null {
  if (raw === undefined) return undefined;
  const values = raw.split(",").filter(Boolean);
  if (!values.length || values.some((v) => !known.includes(v))) return null;
  return known.filter((k) => values.includes(k));
}

/** The list filters from the query string; an unknown value is null (the page answers 404 rather than guess). */
export function categoryQuery(search: Record<string, string | string[] | undefined>): CategoryQuery | null {
  const one = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : undefined);
  const flag = (k: string): boolean | undefined | null => { const v = one(k); return v === undefined ? undefined : v === "1" ? true : null; };
  const slot = list(one("slot"), SLOT_SLUGS);
  const quality = list(one("quality"), [...QUALITY_SLUGS, UNRECORDED]);
  const crafted = flag("crafted"), reagent = flag("reagent"), set = flag("set"), seen = flag("seen");
  const skill = one("skill"), sort = one("sort"), page = one("page");
  if (slot === null || quality === null || crafted === null || reagent === null || set === null || seen === null) return null;
  if (skill !== undefined && !itemFacets().professions.some((p) => p.slug === skill)) return null;
  const sorted = sort === undefined ? undefined : /^(-?)([a-z]+)$/.exec(sort);
  if (sort !== undefined && (!sorted || !(ITEM_SORTS as readonly string[]).includes(sorted[2]))) return null;
  if (page !== undefined && !/^[1-9]\d{0,4}$/.test(page)) return null;
  const text = one("q")?.trim().slice(0, 60);
  return {
    ...(text ? { q: text } : {}),
    ...(slot ? { slot } : {}), ...(quality ? { quality } : {}),
    ...(crafted ? { crafted } : {}), ...(reagent ? { reagent } : {}), ...(set ? { set } : {}), ...(seen ? { seen } : {}),
    ...(skill ? { skill } : {}),
    ...(sorted ? { sort: { key: sorted[2] as ItemSort, desc: sorted[1] === "-" } } : {}),
    page: page === undefined ? 1 : Number(page),
  };
}

/** The query string of a list, in one fixed order so a view has one URL. */
export function itemsHref(classSlug?: string, subclassSlug?: string, q: Partial<CategoryQuery> = {}): string {
  const path = ["/database/items", classSlug, classSlug ? subclassSlug : undefined].filter(Boolean).join("/");
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  if (q.slot?.length) params.set("slot", q.slot.join(","));
  if (q.quality?.length) params.set("quality", q.quality.join(","));
  if (q.skill) params.set("skill", q.skill);
  if (q.crafted) params.set("crafted", "1");
  if (q.reagent) params.set("reagent", "1");
  if (q.set) params.set("set", "1");
  if (q.seen) params.set("seen", "1");
  if (q.sort) params.set("sort", `${q.sort.desc ? "-" : ""}${q.sort.key}`);
  if (q.page && q.page > 1) params.set("page", String(q.page));
  // Commas read better in a shared link than %2C, and are safe in a query string.
  const s = params.toString().replace(/%2C/g, ",");
  return s ? `${path}?${s}` : path;
}

/** The query with one value of a multi filter switched on or off, back on page 1. */
export function toggled(q: CategoryQuery, key: "slot" | "quality", value: string): CategoryQuery {
  const now = q[key] ?? [];
  const order = key === "slot" ? SLOT_SLUGS : [...QUALITY_SLUGS, UNRECORDED];
  const next = order.filter((v) => (v === value ? !now.includes(v) : now.includes(v)));
  return { ...q, [key]: next.length ? next : undefined, page: 1 };
}

/* ---------- Filtering and sorting ---------- */

/** What the list needs from the uploads and the names file; the API passes none of it. */
export interface ItemListContext {
  /** The name a page may show (players' agreed name, or the game files and wiki match). */
  name?: (id: number) => string | undefined;
  /** Items with a public fact from players. */
  seen?: { has(id: number): boolean };
}

/** The game-file filters, which the page and the API share. */
export function matchesFacets(id: number, f: Pick<CategoryQuery, "crafted" | "reagent" | "set" | "skill">): boolean {
  const x = itemFacets();
  if (f.crafted && !x.crafted.has(id)) return false;
  if (f.reagent && !x.reagent.has(id)) return false;
  if (f.set && !x.set.has(id)) return false;
  if (f.skill) {
    const p = x.professions.find((s) => s.slug === f.skill);
    if (!p || !x.bySkill.get(p.id)?.has(id)) return false;
  }
  return true;
}

/** Rows of a category (`base`) that pass every filter, in the query's order. */
export function listItems(base: readonly ItemRow[], q: CategoryQuery, ctx: ItemListContext = {}): ItemRow[] {
  const text = q.q?.toLowerCase();
  const id = text && /^#?\d+$/.test(text) ? Number(text.replace("#", "")) : null;
  const rows = base.filter(([itemId, , , inv, quality]) => {
    if (text && !(id !== null ? itemId === id : ctx.name?.(itemId)?.toLowerCase().includes(text))) return false;
    if (q.slot?.length && !q.slot.includes(slotOf(inv)?.slug ?? "")) return false;
    if (q.quality?.length && !q.quality.includes(quality === null ? UNRECORDED : QUALITIES[quality]?.slug ?? UNRECORDED)) return false;
    if (q.seen && !ctx.seen?.has(itemId)) return false;
    return matchesFacets(itemId, q);
  });
  return sortItems(rows, q.sort, ctx);
}

/** Text keys sort A to Z with the rows that have none last, whichever way; ties go by id. */
export function sortItems(rows: ItemRow[], sort: CategoryQuery["sort"], ctx: ItemListContext = {}): ItemRow[] {
  if (!sort || sort.key === "id") return sort?.desc ? [...rows].sort((a, b) => b[0] - a[0]) : rows;
  const dir = sort.desc ? -1 : 1;
  const key = (row: ItemRow): string | number | null => {
    if (sort.key === "name") return ctx.name?.(row[0])?.toLowerCase() ?? null;
    if (sort.key === "type") return describe(CLIENT_TAXONOMY, row).subclass?.name?.toLowerCase() ?? null;
    if (sort.key === "slot") return slotOf(row[3])?.name.toLowerCase() ?? null;
    return ctx.seen?.has(row[0]) ? 0 : null;
  };
  const keyed = rows.map((row) => ({ row, k: key(row) }));
  keyed.sort((a, b) => {
    if (a.k === null || b.k === null) return a.k === b.k ? a.row[0] - b.row[0] : a.k === null ? 1 : -1;
    const c = typeof a.k === "number" && typeof b.k === "number" ? a.k - b.k : String(a.k).localeCompare(String(b.k));
    return c * dir || a.row[0] - b.row[0];
  });
  return keyed.map((x) => x.row);
}
