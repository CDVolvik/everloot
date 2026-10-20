import { AUCTION_AGREEMENT } from "../../../kb/src/auction-history";
import {
  TRIM_FACTOR, TRIM_MIN_DAYS, formatCopper, itemMarket, validRealm,
  type ItemDays, type MarketState, type MarketValue, type PublicDay,
} from "../../../kb/src/market";

/**
 * The Auction House pages' view of the market rollup (kb/src/market.ts): realms, the rows each one
 * shows, the price moves, and which pages are indexed. Only public values reach here: a realm/item day
 * is public when 3 reporters scanned it. Reporter hashes and install ids are counted, never returned.
 */

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const todayNumber = (now: Date) => Math.floor(now.getTime() / DAY_MS);

export const AH_PATH = "/tools/auctions";

export interface RealmRef {
  /** The rollup's key (trimmed, ASCII lower case). */
  key: string;
  /** The first spelling seen. */
  name: string;
  slug: string;
}

/**
 * The realm's URL segment: lower case, apostrophes dropped, spaces and hyphens one dash. "Mal'Ganis" is
 * "malganis". A realm called Item gets "item-realm", since /tools/auctions/item/<id> is the cross-realm page.
 */
export function realmSlug(name: string): string {
  const slug = name.trim().toLowerCase().replace(/['’]/g, "").replace(/[\s-]+/g, "-").replace(/-+$/, "");
  return slug === "item" ? "item-realm" : slug;
}

/** A slug as it may arrive in a URL; null when it cannot be one. */
export function slugParam(raw: string): string | null {
  let slug: string;
  try { slug = decodeURIComponent(raw).toLowerCase(); } catch { return null; }
  return slug.length <= 40 && /^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(slug) ? slug : null;
}

export const realmHref = (realm: Pick<RealmRef, "slug">) => `${AH_PATH}/${encodeURIComponent(realm.slug)}`;
export const itemHref = (realm: Pick<RealmRef, "slug">, itemId: number) => `${realmHref(realm)}/${itemId}`;
export const crossRealmHref = (itemId: number) => `${AH_PATH}/item/${itemId}`;

/** An item id as it may arrive in a URL or the search box; null when it is not one. */
export function itemIdParam(raw: string): number | null {
  return /^[1-9]\d{0,9}$/.test(raw.trim()) ? Number(raw.trim()) : null;
}

/**
 * Item names the Auction House may show. None yet: until the item-name ledger lands (PR #158) an item
 * reads "Item N" with its icon and quality. When it does, return only the names that policy lets the
 * item pages show, and every label, title and the name search pick them up.
 */
export type ItemNames = ReadonlyMap<number, string>;
export async function loadAuctionNames(): Promise<ItemNames> {
  return new Map();
}
export const itemLabel = (itemId: number, names?: ItemNames) => names?.get(itemId) ?? `Item ${itemId}`;

export const money = (copper: number | null) => (copper === null ? "unrecorded" : formatCopper(copper));

export interface MarketRow {
  realm: RealmRef;
  value: MarketValue;
  /** Public days, oldest first. */
  points: PublicDay[];
  /** When the scans behind the newest open public day were taken (epoch ms); null when only closed days remain. */
  updatedAt: number | null;
}

export interface RealmBoard {
  realm: RealmRef;
  /** Items with a public value, most units listed first. */
  rows: MarketRow[];
  byItem: Map<number, MarketRow>;
  /** Distinct reporters behind the public days still open (the last 7). */
  reporters: number;
  updatedAt: number | null;
}

/** Reporter groups of one open day, as the rollup counts them: installs behind one upload address are one. */
function groupsOf(installs: ItemDays["open"][string]): Set<string> {
  return new Set(Object.entries(installs).map(([installId, scan]) => scan[5] || `install:${installId}`));
}

function realmBoard(state: MarketState, key: string, now: Date): RealmBoard | null {
  const stored = state.realms[key]!;
  if (!validRealm(stored.name)) return null;
  const realm: RealmRef = { key, name: stored.name, slug: realmSlug(stored.name) };
  const reporters = new Set<string>();
  let realmUpdated: number | null = null;
  const rows: MarketRow[] = [];
  for (const [id, days] of Object.entries(stored.items)) {
    const { value, points } = itemMarket(state, key, Number(id), now);
    if (!value) continue;
    let updatedAt: number | null = null;
    for (const installs of Object.values(days.open)) {
      const groups = groupsOf(installs);
      if (groups.size < AUCTION_AGREEMENT) continue;
      for (const g of groups) reporters.add(g);
      for (const scan of Object.values(installs)) updatedAt = Math.max(updatedAt ?? 0, scan[4]);
    }
    if (updatedAt !== null) realmUpdated = Math.max(realmUpdated ?? 0, updatedAt);
    rows.push({ realm, value, points, updatedAt });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => b.value.quantity - a.value.quantity || a.value.itemId - b.value.itemId);
  return { realm, rows, byItem: new Map(rows.map((r) => [r.value.itemId, r])), reporters: reporters.size, updatedAt: realmUpdated };
}

const boardsMemo = new WeakMap<MarketState, { day: number; boards: RealmBoard[] }>();

/** Every realm with a public value, the busiest first. Kept per rollup and day: the store hands back the same rollup until it reloads. */
export function realmBoards(state: MarketState, now: Date = new Date()): RealmBoard[] {
  const hit = boardsMemo.get(state);
  if (hit && hit.day === todayNumber(now)) return hit.boards;
  const boards = Object.keys(state.realms)
    .map((key) => realmBoard(state, key, now))
    .filter((b): b is RealmBoard => b !== null)
    .sort((a, b) => b.rows.length - a.rows.length || a.realm.name.localeCompare(b.realm.name));
  boardsMemo.set(state, { day: todayNumber(now), boards });
  return boards;
}

export function findBoard(boards: RealmBoard[], slug: string): RealmBoard | null {
  return boards.find((b) => b.realm.slug === slug) ?? null;
}

/**
 * How close a realm or an item there is to public, for the agreement meter: the most reporters any one
 * open day has. Below the gate this is 0 to 2; the realm's name is never read back from the rollup.
 */
export function agreementSoFar(state: MarketState, slug: string, itemId?: number): number {
  let most = 0;
  for (const stored of Object.values(state.realms)) {
    if (!validRealm(stored.name) || realmSlug(stored.name) !== slug) continue;
    const items = itemId === undefined ? Object.values(stored.items) : [stored.items[String(itemId)]].filter(Boolean) as ItemDays[];
    for (const days of items) for (const installs of Object.values(days.open)) most = Math.max(most, groupsOf(installs).size);
  }
  return Math.min(most, AUCTION_AGREEMENT - 1);
}

/** A slug read back as words, for a realm with nothing public: "argent-dawn" is "Argent Dawn". */
export const slugWords = (slug: string) => slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/**
 * Indexing rule: a price page is in the sitemap and indexable only when it has a market value, that is a
 * public day (3 reporters) with more than 5 units listed in the last 14 days. Every other price page says noindex.
 */
export const indexable = (value: MarketValue | null | undefined) => Boolean(value && value.market !== null);

/** Every Auction House page the sitemap lists: realms, an item on a realm, an item across realms. */
export function sitemapPaths(boards: RealmBoard[]): string[] {
  const realms: string[] = [];
  const items: string[] = [];
  const cross = new Set<number>();
  for (const board of boards) {
    const listed = board.rows.filter((r) => indexable(r.value));
    if (!listed.length) continue;
    realms.push(realmHref(board.realm));
    for (const row of listed) {
      items.push(itemHref(board.realm, row.value.itemId));
      cross.add(row.value.itemId);
    }
  }
  return [...realms, ...items, ...[...cross].sort((a, b) => a - b).map(crossRealmHref)];
}

/** Public days that can carry a move: not thin, and not an outlier the market value trims. */
function solidDays(points: PublicDay[]): PublicDay[] {
  const solid = points.filter((p) => !p.thin);
  if (solid.length < TRIM_MIN_DAYS) return solid;
  const sorted = solid.map((p) => p.market).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const historical = sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  return solid.filter((p) => p.market <= historical * TRIM_FACTOR && p.market * TRIM_FACTOR >= historical);
}

export type MoveSpan = 1 | 7;

export interface Move {
  row: MarketRow;
  from: PublicDay;
  to: PublicDay;
  /** (to - from) / from. */
  change: number;
}

/**
 * The market value's move over a day or a week: the newest solid day (today or yesterday) against the
 * solid day `span` days before it (a week allows up to three days earlier, as scans are not daily).
 */
export function priceMove(row: MarketRow, span: MoveSpan, now: Date): Move | null {
  const solid = solidDays(row.points);
  const to = solid.at(-1);
  if (!to || todayNumber(now) - dayNumber(to.day) > 1) return null;
  const target = dayNumber(to.day) - span;
  const slack = span === 1 ? 0 : 3;
  const from = [...solid].reverse().find((p) => dayNumber(p.day) <= target && dayNumber(p.day) >= target - slack);
  if (!from || from.market <= 0 || from.market === to.market) return null;
  return { row, from, to, change: (to.market - from.market) / from.market };
}

export function biggestMoves(rows: MarketRow[], span: MoveSpan, now: Date, limit: number): Move[] {
  return rows
    .map((row) => priceMove(row, span, now))
    .filter((m): m is Move => m !== null)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.row.value.quantity - a.row.value.quantity || a.row.value.itemId - b.row.value.itemId)
    .slice(0, limit);
}

export function mostListed(rows: MarketRow[], limit: number): MarketRow[] {
  return [...rows].sort((a, b) => b.value.quantity - a.value.quantity || a.value.itemId - b.value.itemId).slice(0, limit);
}

export function recentlyUpdated(rows: MarketRow[], limit: number): MarketRow[] {
  return rows
    .filter((r) => r.updatedAt !== null)
    .sort((a, b) => b.updatedAt! - a.updatedAt! || b.value.quantity - a.value.quantity || a.value.itemId - b.value.itemId)
    .slice(0, limit);
}

/** An item on every realm that has a public value for it, by realm name. */
export function itemAcrossRealms(boards: RealmBoard[], itemId: number): MarketRow[] {
  return boards
    .map((b) => b.byItem.get(itemId))
    .filter((r): r is MarketRow => r !== undefined)
    .sort((a, b) => a.realm.name.localeCompare(b.realm.name));
}

/** Items whose shown name contains the text, across realms; empty while no names are shown. */
export function searchByName(boards: RealmBoard[], names: ItemNames, text: string, limit = 50): number[] {
  const needle = text.trim().toLowerCase();
  if (needle.length < 2 || !names.size) return [];
  const ids = new Set<number>();
  for (const b of boards) for (const r of b.rows) if (names.get(r.value.itemId)?.toLowerCase().includes(needle)) ids.add(r.value.itemId);
  return [...ids].sort((a, b) => a - b).slice(0, limit);
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function timeAgo(at: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** "+12%", "−8%" (a true minus sign). */
export function percent(change: number): string {
  const n = Math.round(change * 100);
  return n > 0 ? `+${n}%` : n < 0 ? `−${Math.abs(n)}%` : "0%";
}
