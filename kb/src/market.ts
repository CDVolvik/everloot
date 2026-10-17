/**
 * Forever market values from full auction scans players uploaded on purpose.
 * Design: docs/superpowers/specs/2026-10-16-forever-market-design.md
 *
 * A realm/item day is public when 3 reporters scanned it. A reporter is one upload address (the
 * intake route stores only a keyed hash of it, never the address), so many installs behind one
 * address count once: a day's value is the median of the reporters' values, each the median of
 * that reporter's installs' last scans. Market value weights the last 14 public days toward today;
 * historical is the median of the last 60.
 *
 * Outliers: with 5 or more solid days, a day further than TRIM_FACTOR from historical (either way) is
 * trimmed from market value, minimum and quantity, so a few forged days cannot move the price.
 * Thin days (THIN_UNITS or fewer units listed) show in the history but never feed market value.
 * Install age is not used as a weight: ids are anonymous and random, an attacker can age one by
 * waiting, and the reporter rule plus the trim already bound what a new install can do.
 *
 * Late arrivals: the last OPEN_DAYS days keep one scan per install, so an upload that reaches the
 * site up to a week late still counts, and a day below 3 reporters is not published. A day older
 * than that is closed and ignores later scans.
 *
 * Size: realms, items per realm, installs per item-day and the total entries are capped (MARKET_LIMITS),
 * so the rollup cannot grow with what a stranger uploads; MARKET_MAX_BYTES is the last guard.
 * Days past the open window collapse to their public medians (or are dropped if they never were).
 */
import { z } from "zod";
import { AUCTION_AGREEMENT } from "./auction-history.js";

export const MARKET_WINDOW_DAYS = 14;
export const HISTORY_DAYS = 60;
/** Today and the six days before take new scans; a later upload for an older day is ignored. */
export const OPEN_DAYS = 7;
/** An item day with this many units listed or fewer is thin: shown, never averaged into market value. */
export const THIN_UNITS = 5;
/** Days further than this factor from historical are trimmed (needs TRIM_MIN_DAYS solid days). */
export const TRIM_FACTOR = 3;
export const TRIM_MIN_DAYS = 5;
/** Most rows one realm's price file carries: the items with the most units listed. */
export const MAX_PRICE_ROWS = 2000;
export const MARKET_LIMITS = {
  realms: 40,
  itemsPerRealm: 20_000,
  installsPerItemDay: 25,
  /** Open install scans plus closed days, across every realm. About 100 bytes each. */
  entries: 60_000,
  /** Distinct realms read from one upload. */
  realmsPerUpload: 3,
};
/** market.json is refused above this size, whatever the other caps allow. */
export const MARKET_MAX_BYTES = 10 * 1024 * 1024;
const DAY_MS = 86_400_000;

/** A realm name: letters, digits, spaces, apostrophes and hyphens, 2 to 40 characters once trimmed. */
export function validRealm(name: unknown): name is string {
  if (typeof name !== "string") return false;
  const realm = name.trim();
  return realm.length >= 2 && realm.length <= 40 && /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u.test(realm);
}

/** One install's last scan of an item on an open day: [minUnit, marketUnit, quantity, auctions, capturedAt epoch ms, reporter]. */
export type InstallScan = [number, number, number, number, number, string];
/** A closed day's public values: [min, market, quantity, reporters]. */
export type ClosedDay = [number, number, number, number];

export interface ItemDays {
  open: Record<string, Record<string, InstallScan>>;
  closed: Record<string, ClosedDay>;
}

export interface MarketState {
  version: 3;
  /** Keyed by the trimmed realm with ASCII letters lower-cased (as Lua's string.lower does); `name` is the first spelling seen. */
  realms: Record<string, { name: string; items: Record<string, ItemDays> }>;
}

export interface PublicDay { day: string; min: number; market: number; quantity: number; reporters: number; thin: boolean }

export interface MarketValue {
  itemId: number;
  /** Null when no solid public day falls in the last 14: the value is unrecorded, not zero. */
  market: number | null;
  min: number;
  historical: number;
  quantity: number;
  day: string;
  ageDays: number;
  reporters: number;
  /** The newest day lists THIN_UNITS units or fewer. */
  thin: boolean;
}

export function emptyMarket(): MarketState {
  return { version: 3, realms: {} };
}

/** ASCII-only lower case, so the site, the companion and the addon's string.lower agree on every realm. */
export function realmKey(realm: string): string {
  return realm.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());
}

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

/**
 * The fold reads only what this schema accepts: an upload's auction parts, with the reporter hash the
 * intake route added. Prices are per unit and at least 1 copper (a buyout below its stack size is not a price).
 */
const unit = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const scanItem = z.tuple([z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), unit, unit, unit, unit]);
const scanRecord = z.object({
  kind: z.literal("auction_snapshot"),
  installId: z.string().min(8).max(64),
  capturedAt: z.string().datetime({ offset: true }),
  realm: z.string().refine(validRealm),
  reporter: z.string().regex(/^[a-f0-9]{16}$/).optional(),
  items: z.array(z.unknown()).max(1000),
});
type ScanRecord = z.infer<typeof scanRecord>;

/**
 * One upload's auction parts, at most `limit` distinct realms: a stranger cannot make one file name
 * dozens of realms. `reporter` is the intake route's keyed hash of the upload address. Records that
 * do not parse are dropped.
 */
export function uploadScans(records: readonly unknown[], reporter?: string, limit = MARKET_LIMITS.realmsPerUpload): ScanRecord[] {
  const realms = new Set<string>();
  const kept: ScanRecord[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object" || (raw as { kind?: unknown }).kind !== "auction_snapshot") continue;
    const parsed = scanRecord.safeParse({ ...(raw as object), reporter });
    if (!parsed.success) continue;
    const key = realmKey(parsed.data.realm);
    if (!realms.has(key) && realms.size >= limit) continue;
    realms.add(key);
    kept.push(parsed.data);
  }
  return kept;
}

/** Reporter groups: installs sharing an upload address vote once. Without a reporter an install is its own group. */
function reporterGroups(installs: Record<string, InstallScan>): InstallScan[][] {
  const groups = new Map<string, InstallScan[]>();
  for (const [installId, scan] of Object.entries(installs)) {
    const key = scan[5] || `install:${installId}`;
    groups.set(key, [...(groups.get(key) ?? []), scan]);
  }
  return [...groups.values()];
}

function publicOf(installs: Record<string, InstallScan>): ClosedDay | null {
  const groups = reporterGroups(installs);
  if (groups.length < AUCTION_AGREEMENT) return null;
  const per = (index: number) => median(groups.map((g) => median(g.map((s) => s[index] as number))));
  return [per(0), per(1), per(2), groups.length];
}

function entryCount(state: MarketState): number {
  let n = 0;
  for (const realm of Object.values(state.realms)) {
    for (const days of Object.values(realm.items)) {
      n += Object.keys(days.closed).length;
      for (const installs of Object.values(days.open)) n += Object.keys(installs).length;
    }
  }
  return n;
}

/** Bytes of the serialised rollup, for the MARKET_MAX_BYTES guard. */
export const marketBytes = (state: MarketState) => Buffer.byteLength(JSON.stringify(state));

/**
 * Fold auction_snapshot records into the state, then close days that left the open window and prune
 * days that left the 60-day window. A scan for a day that is already closed is ignored. A record that
 * would exceed a cap (new realm, new item, an install past the day's limit, or an entry past the total)
 * is dropped; scans from installs already counted still update.
 */
export function foldMarket(previous: MarketState, records: readonly unknown[], now: Date, limits: Partial<typeof MARKET_LIMITS> = {}): MarketState {
  const cap = { ...MARKET_LIMITS, ...limits };
  const state: MarketState = structuredClone(previous);
  let entries = entryCount(state);
  const itemCounts = new Map(Object.entries(state.realms).map(([key, r]) => [key, Object.keys(r.items).length]));
  for (const raw of records) {
    if (!raw || typeof raw !== "object" || (raw as { kind?: unknown }).kind !== "auction_snapshot") continue;
    const parsed = scanRecord.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    const at = Date.parse(row.capturedAt);
    const n = Math.floor(at / DAY_MS);
    if (!inHistory(n, now)) continue;
    const day = dayString(n);
    const key = realmKey(row.realm);
    for (const item of row.items) {
      const scan = scanItem.safeParse(item);
      if (!scan.success) continue;
      const [itemId, auctions, quantity, minUnit, marketUnit] = scan.data;
      const existing = state.realms[key]?.items[String(itemId)];
      if (existing?.closed[day]) continue;
      if (!state.realms[key]) {
        if (Object.keys(state.realms).length >= cap.realms) break;
        state.realms[key] = { name: row.realm.trim(), items: {} };
        itemCounts.set(key, 0);
      }
      const realm = state.realms[key]!;
      if (!existing && itemCounts.get(key)! >= cap.itemsPerRealm) continue;
      const days = (realm.items[String(itemId)] ??= { open: {}, closed: {} });
      if (!existing) itemCounts.set(key, itemCounts.get(key)! + 1);
      const installs = (days.open[day] ??= {});
      const prev = installs[row.installId];
      if (prev && prev[4] >= at) continue;
      if (!prev && (Object.keys(installs).length >= cap.installsPerItemDay || entries >= cap.entries)) continue;
      if (!prev) entries++;
      installs[row.installId] = [minUnit, marketUnit, quantity, auctions, at, row.reporter ?? ""];
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
  const add = (day: string, [min, market, quantity, reporters]: ClosedDay) =>
    points.push({ day, min, market, quantity, reporters, thin: quantity <= THIN_UNITS });
  for (const [day, values] of Object.entries(days.closed)) if (inHistory(dayNumber(day)!, now)) add(day, values);
  for (const [day, installs] of Object.entries(days.open)) {
    const values = inHistory(dayNumber(day)!, now) ? publicOf(installs) : null;
    if (values) add(day, values);
  }
  return points.sort((a, b) => a.day.localeCompare(b.day));
}

function valueOf(itemId: number, points: PublicDay[], now: Date): MarketValue | null {
  if (!points.length) return null;
  const solid = points.filter((p) => !p.thin);
  const historical = median((solid.length ? solid : points).map((p) => p.market));
  // With enough solid days, one that sits far from the rest is an outlier, not a price move.
  const trimmed = new Set<PublicDay>();
  if (solid.length >= TRIM_MIN_DAYS) {
    for (const p of solid) if (p.market > historical * TRIM_FACTOR || p.market * TRIM_FACTOR < historical) trimmed.add(p);
  }
  const trusted = points.filter((p) => !trimmed.has(p));
  const newest = trusted.at(-1)!;
  let weighted = 0;
  let weights = 0;
  for (const p of trusted) {
    if (p.thin) continue;
    // A day ahead of the server clock (client drift) counts as today.
    const age = Math.max(0, today(now) - dayNumber(p.day)!);
    if (age > MARKET_WINDOW_DAYS) continue;
    const weight = MARKET_WINDOW_DAYS + 1 - age;
    weighted += p.market * weight;
    weights += weight;
  }
  return {
    itemId,
    market: weights ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(weighted / weights)) : null,
    min: newest.min,
    historical,
    quantity: newest.quantity,
    day: newest.day,
    ageDays: Math.max(0, today(now) - dayNumber(newest.day)!),
    reporters: newest.reporters,
    thin: newest.thin,
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

/** Realms that hold any public value, by display name. */
export function marketRealms(state: MarketState, now: Date = new Date()): string[] {
  // A realm name is free text from an upload; it is published only if it passes the realm rules and
  // 3 reporters made a value public there.
  return Object.values(state.realms)
    .filter((r) => validRealm(r.name) && Object.values(r.items).some((days) => publicDays(days, now).length > 0))
    .map((r) => r.name)
    .sort((a, b) => a.localeCompare(b));
}

/** The realm's display name: the first spelling seen, or the name as asked. */
export function realmName(state: MarketState, realm: string): string {
  return state.realms[realmKey(realm)]?.name ?? realm.trim();
}

/**
 * The companion's price file for one realm: [itemId, market|null, min, historical, quantity, day, reporters].
 * Tuples keep the file small; at most `limit` rows, the items with the most units listed. A thin item
 * has no market value (null), only its minimum.
 */
export function marketPrices(state: MarketState, realm: string, now: Date, limit = MAX_PRICE_ROWS) {
  return {
    realm: realmName(state, realm),
    items: realmMarket(state, realm, now).slice(0, limit)
      .map((v) => [v.itemId, v.market, v.min, v.historical, v.quantity, v.day, v.reporters] as const),
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
  "A day is public when 3 reporters scanned this item on this realm with a full scan (installs behind one upload address count once); each value is the median of their last scans that day. " +
  "Market value weights the last 14 public days toward today, skips thin days (5 units listed or fewer) and days far from the historical value. Historical is the median of the last 60.";

export function handleMarketValue(args: { realm: string; itemId: number }, state: MarketState | null, now: Date): string {
  if (!args.realm.trim()) return "Name a realm.";
  if (!Number.isInteger(args.itemId) || args.itemId < 1) return "Name an item id.";
  if (!state) return "Market values are unavailable. They are unrecorded, not zero.";
  const { value, points } = itemMarket(state, args.realm, args.itemId, now);
  const lines = [`${args.realm.trim()} item ${args.itemId}`, MARKET_RULE];
  if (!value) {
    lines.push("No public market value yet. A day becomes public when 3 reporters scanned this item.");
    return lines.join("\n");
  }
  lines.push(
    `Market value: ${value.market === null ? "unrecorded (no solid public day in the last 14)" : formatCopper(value.market)}`,
    `Minimum buyout: ${formatCopper(value.min)} (${value.day}, ${value.ageDays} days ago, ${value.reporters} reporters)`,
    `Historical: ${formatCopper(value.historical)}`,
    `Units listed: ${value.quantity}${value.thin ? " (thin: not counted in the market value)" : ""}`,
    "History:",
    ...points.map((p) => `${p.day}  value ${formatCopper(p.market)}  min ${formatCopper(p.min)}  ${p.quantity} units${p.thin ? " (thin)" : ""}  ${p.reporters} reporters`),
  );
  return lines.join("\n");
}
