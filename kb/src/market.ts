/**
 * Forever market values from full auction scans players uploaded on purpose.
 * A realm/item day is public when 3 installs scanned it; its values are the medians of each
 * install's last scan that day. Market value weights the last 14 public days toward today;
 * historical is the median of the last 60. Design: docs/superpowers/specs/2026-10-16-forever-market-design.md
 *
 * Size: only the last OPEN_DAYS days keep one scan per install. Older days collapse to their public
 * medians (or are dropped if they never reached 3 installs), so the rollup does not grow with installs.
 */
import { AUCTION_AGREEMENT } from "./auction-history.js";

export const MARKET_WINDOW_DAYS = 14;
export const HISTORY_DAYS = 60;
/** Today and the two days before take new scans; a later upload for an older day is ignored. */
export const OPEN_DAYS = 3;
const DAY_MS = 86_400_000;

/** One install's last scan of an item on an open day: [minUnit, marketUnit, quantity, auctions, capturedAt epoch ms]. */
export type InstallScan = [number, number, number, number, number];
/** A closed day's public values: [min, market, quantity, reporters]. */
export type ClosedDay = [number, number, number, number];

export interface ItemDays {
  open: Record<string, Record<string, InstallScan>>;
  closed: Record<string, ClosedDay>;
}

export interface MarketState {
  version: 2;
  /** Keyed by the trimmed realm with ASCII letters lower-cased (as Lua's string.lower does); `name` is the first spelling seen. */
  realms: Record<string, { name: string; items: Record<string, ItemDays> }>;
}

export interface PublicDay { day: string; min: number; market: number; quantity: number; reporters: number }

export interface MarketValue {
  itemId: number;
  /** Null when no public day falls in the last 14: the value is unrecorded, not zero. */
  market: number | null;
  min: number;
  historical: number;
  quantity: number;
  day: string;
  ageDays: number;
  reporters: number;
}

export function emptyMarket(): MarketState {
  return { version: 2, realms: {} };
}

/** ASCII-only lower case, so the site, the companion and the addon's string.lower agree on every realm. */
export function realmKey(realm: string): string {
  return realm.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
}

const copper = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const dayString = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const today = (now: Date) => Math.floor(now.getTime() / DAY_MS);

function dayNumber(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null;
}

/** Days from the last 60 up to one day ahead (client clocks drift). */
function inHistory(n: number, now: Date): boolean {
  return n > today(now) - HISTORY_DAYS && n <= today(now) + 1;
}

const isOpen = (n: number, now: Date) => n > today(now) - OPEN_DAYS;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function publicOf(installs: Record<string, InstallScan>): ClosedDay | null {
  const scans = Object.values(installs);
  if (scans.length < AUCTION_AGREEMENT) return null;
  return [median(scans.map((s) => s[0])), median(scans.map((s) => s[1])), median(scans.map((s) => s[2])), scans.length];
}

/**
 * Fold auction_snapshot records into the state, then close days that left the open window and prune
 * days that left the 60-day window. A scan for a day that is already closed is ignored.
 */
export function foldMarket(previous: MarketState, records: readonly unknown[], now: Date): MarketState {
  const state: MarketState = structuredClone(previous);
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row.kind !== "auction_snapshot" || typeof row.installId !== "string" || !row.installId.trim()) continue;
    if (typeof row.realm !== "string" || !row.realm.trim() || typeof row.capturedAt !== "string") continue;
    if (!Array.isArray(row.items)) continue;
    const at = Date.parse(row.capturedAt);
    if (!Number.isFinite(at)) continue;
    const n = Math.floor(at / DAY_MS);
    if (!inHistory(n, now)) continue;
    const day = dayString(n);
    for (const item of row.items) {
      if (!Array.isArray(item) || item.length !== 5) continue;
      const [itemId, auctions, quantity, minUnit, marketUnit] = item as unknown[];
      if (!Number.isSafeInteger(itemId) || (itemId as number) < 1) continue;
      if (![auctions, quantity, minUnit, marketUnit].every(copper)) continue;
      if ((auctions as number) < 1 || (quantity as number) < 1) continue;
      const key = realmKey(row.realm);
      const existing = state.realms[key]?.items[String(itemId)];
      if (existing?.closed[day]) continue;
      const realm = (state.realms[key] ??= { name: row.realm.trim(), items: {} });
      const days = (realm.items[String(itemId)] ??= { open: {}, closed: {} });
      const installs = (days.open[day] ??= {});
      const prev = installs[row.installId];
      if (prev && prev[4] >= at) continue;
      installs[row.installId] = [minUnit as number, marketUnit as number, quantity as number, auctions as number, at];
    }
  }
  for (const [key, realm] of Object.entries(state.realms)) {
    for (const [itemId, days] of Object.entries(realm.items)) {
      for (const [day, installs] of Object.entries(days.open)) {
        const n = dayNumber(day)!;
        if (isOpen(n, now) && inHistory(n, now)) continue;
        delete days.open[day];
        const closed = publicOf(installs);
        if (closed && inHistory(n, now)) days.closed[day] = closed;
      }
      for (const day of Object.keys(days.closed)) if (!inHistory(dayNumber(day)!, now)) delete days.closed[day];
      if (!Object.keys(days.open).length && !Object.keys(days.closed).length) delete realm.items[itemId];
    }
    if (!Object.keys(realm.items).length) delete state.realms[key];
  }
  return state;
}

function publicDays(days: ItemDays, now: Date): PublicDay[] {
  const points: PublicDay[] = [];
  for (const [day, [min, market, quantity, reporters]] of Object.entries(days.closed)) {
    if (inHistory(dayNumber(day)!, now)) points.push({ day, min, market, quantity, reporters });
  }
  for (const [day, installs] of Object.entries(days.open)) {
    const values = inHistory(dayNumber(day)!, now) ? publicOf(installs) : null;
    if (values) points.push({ day, min: values[0], market: values[1], quantity: values[2], reporters: values[3] });
  }
  return points.sort((a, b) => a.day.localeCompare(b.day));
}

function valueOf(itemId: number, points: PublicDay[], now: Date): MarketValue | null {
  const newest = points.at(-1);
  if (!newest) return null;
  let weighted = 0;
  let weights = 0;
  for (const p of points) {
    // A day ahead of the server clock (client drift) counts as today.
    const age = Math.max(0, today(now) - dayNumber(p.day)!);
    if (age > MARKET_WINDOW_DAYS) continue;
    const weight = MARKET_WINDOW_DAYS + 1 - age;
    weighted += p.market * weight;
    weights += weight;
  }
  return {
    itemId,
    market: weights ? Math.round(weighted / weights) : null,
    min: newest.min,
    historical: median(points.map((p) => p.market)),
    quantity: newest.quantity,
    day: newest.day,
    ageDays: Math.max(0, today(now) - dayNumber(newest.day)!),
    reporters: newest.reporters,
  };
}

export function itemMarket(state: MarketState, realm: string, itemId: number, now: Date): { value: MarketValue | null; points: PublicDay[] } {
  const days = state.realms[realmKey(realm)]?.items[String(itemId)];
  const points = days ? publicDays(days, now) : [];
  return { value: valueOf(itemId, points, now), points };
}

/** Every item with a public value on the realm, most units first. */
export function realmMarket(state: MarketState, realm: string, now: Date): MarketValue[] {
  const items = state.realms[realmKey(realm)]?.items ?? {};
  return Object.entries(items)
    .map(([itemId, days]) => valueOf(Number(itemId), publicDays(days, now), now))
    .filter((v): v is MarketValue => v !== null)
    .sort((a, b) => b.quantity - a.quantity || a.itemId - b.itemId);
}

/** Realms that hold any scans, by display name. */
export function marketRealms(state: MarketState, now: Date = new Date()): string[] {
  // A realm name is free text from an upload; it is published only once 3 installs made a value public there.
  return Object.values(state.realms)
    .filter((r) => Object.values(r.items).some((days) => publicDays(days, now).length > 0))
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b));
}

/** The realm's display name: the first spelling seen, or the name as asked. */
export function realmName(state: MarketState, realm: string): string {
  return state.realms[realmKey(realm)]?.name ?? realm.trim();
}

/**
 * The companion's price file for one realm: [itemId, market|null, min, historical, quantity, day, reporters].
 * Tuples keep the file small; the companion turns them into the EverlootPrices slot addon.
 */
export function marketPrices(state: MarketState, realm: string, now: Date) {
  return {
    realm: realmName(state, realm),
    items: realmMarket(state, realm, now).map((v) => [v.itemId, v.market, v.min, v.historical, v.quantity, v.day, v.reporters] as const),
  };
}

export function formatCopper(value: number): string {
  const gold = Math.floor(value / 10000);
  const silver = Math.floor((value % 10000) / 100);
  const coins = value % 100;
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0 || gold > 0) parts.push(`${silver}s`);
  parts.push(`${coins}c`);
  return parts.join(" ");
}

export const MARKET_RULE =
  "A day is public when 3 installs scanned this item on this realm with a full scan; each value is the median of their last scans that day. " +
  "Market value weights the last 14 public days toward today. Historical is the median of the last 60.";

export function handleMarketValue(args: { realm: string; itemId: number }, state: MarketState | null, now: Date): string {
  if (!args.realm.trim()) return "Name a realm.";
  if (!Number.isInteger(args.itemId) || args.itemId < 1) return "Name an item id.";
  if (!state) return "Market values are unavailable. They are unrecorded, not zero.";
  const { value, points } = itemMarket(state, args.realm, args.itemId, now);
  const lines = [`${args.realm.trim()} item ${args.itemId}`, MARKET_RULE];
  if (!value) {
    lines.push("No public market value yet. A day becomes public when 3 installs scanned this item.");
    return lines.join("\n");
  }
  lines.push(
    `Market value: ${value.market === null ? "unrecorded (no public day in the last 14)" : formatCopper(value.market)}`,
    `Minimum buyout: ${formatCopper(value.min)} (${value.day}, ${value.ageDays} days ago, ${value.reporters} reporters)`,
    `Historical: ${formatCopper(value.historical)}`,
    `Units listed: ${value.quantity}`,
    "History:",
    ...points.map((p) => `${p.day}  value ${formatCopper(p.market)}  min ${formatCopper(p.min)}  ${p.quantity} units  ${p.reporters} reporters`),
  );
  return lines.join("\n");
}
