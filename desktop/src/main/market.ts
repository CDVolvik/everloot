import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchRealmPrices, readRealms, writePricesAddon, type RealmPrices } from "../../../companion/src/prices";
import type { RealmSummary } from "../shared/types";

/** The companion's cap on realms in one prices file. */
export const MAX_REALMS = 20;

const realmKey = (realm: string) => realm.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());

/** The realms the site has public values for, from `GET /api/market/prices` without a realm. */
export async function listRealms(endpoint: string, send: typeof fetch = fetch): Promise<{ realms: string[]; dataAsOf: string | null }> {
  const res = await send(`${endpoint}/api/market/prices`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`market realms: ${res.status}`);
  const body = (await res.json()) as { ok?: boolean; realms?: unknown; dataAsOf?: unknown };
  if (!body.ok || !Array.isArray(body.realms)) throw new Error("market realms: unexpected answer");
  return { realms: body.realms.filter((r): r is string => typeof r === "string"), dataAsOf: typeof body.dataAsOf === "string" ? body.dataAsOf : null };
}

/**
 * The realms to fetch: the player's own scans first, then the followed ones, no duplicates
 * (case-insensitive), at most MAX_REALMS. Followed realms are what TSM calls realm picks; here
 * they only choose which of Everloot's own public values to carry into the game.
 */
export function mergeRealms(own: string[], followed: string[]): { realm: string; source: "scan" | "followed" }[] {
  const out: { realm: string; source: "scan" | "followed" }[] = [];
  const add = (realm: string, source: "scan" | "followed") => {
    const name = realm.trim();
    if (name.length < 2 || out.some((o) => realmKey(o.realm) === realmKey(name))) return;
    out.push({ realm: name, source });
  };
  for (const r of own) add(r, "scan");
  for (const r of followed) add(r, "followed");
  return out.slice(0, MAX_REALMS);
}

/** Realms named in the player's own auction scans across every account file. */
export function ownRealms(svFiles: string[]): string[] {
  const names: string[] = [];
  for (const file of svFiles) {
    let text: string;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const realm of readRealms(text)) if (!names.some((n) => realmKey(n) === realmKey(realm))) names.push(realm);
  }
  return names;
}

/** One item's row from the prices file, as the tooltip reads it. `market` is null when unrecorded. */
export interface PriceRow { realm: string; dataAsOf: string | null; itemId: number; market: number | null; min: number; historical: number; quantity: number; day: string; reporters: number }
export interface PricesFile { realms: { realm: string; dataAsOf: string | null; items: number }[]; rows: Map<string, string> }

/**
 * Reads the EverlootPrices file this app wrote into the game, so the Market page shows what the game
 * shows: each realm's item count and date, and one item's row on request. Read-only; null when absent.
 * The realm key is the lower-case name the file uses.
 */
export function readPricesFile(addonsDir: string): PricesFile | null {
  let text: string;
  try { text = readFileSync(join(addonsDir, "EverlootPrices", "EverlootPrices.lua"), "utf8"); } catch { return null; }
  const realms: PricesFile["realms"] = [];
  const rows = new Map<string, string>();
  for (const m of text.matchAll(/\[\s*"((?:[^"\\]|\\.)*)"\s*\]\s*=\s*\{\s*\["dataAsOf"\]\s*=\s*"([^"]*)",\s*\["data"\]\s*=\s*"([^"]*)"/g)) {
    const [, realm, dataAsOf, data] = m;
    rows.set(realm, `;${data};`);
    realms.push({ realm, dataAsOf: dataAsOf || null, items: data ? data.split(";").length : 0 });
  }
  return { realms, rows };
}

/** One item on every realm in the file, in file order. */
export function priceRows(file: PricesFile, itemId: number): PriceRow[] {
  const out: PriceRow[] = [];
  for (const r of file.realms) {
    const data = file.rows.get(r.realm)!;
    const at = data.indexOf(`;${itemId},`);
    if (at < 0) continue;
    const m = /^(\d+),(\d*),(\d+),(\d+),(\d+),([\d-]+),(\d+);/.exec(data.slice(at + 1));
    if (!m) continue;
    out.push({ realm: r.realm, dataAsOf: r.dataAsOf, itemId, market: m[2] ? Number(m[2]) : null, min: Number(m[3]), historical: Number(m[4]), quantity: Number(m[5]), day: m[6], reporters: Number(m[7]) });
  }
  return out;
}

/** The item id in what the player typed or pasted: a bare id, an item link copied from game chat, or an everloot.app item address. */
export function itemIdFrom(text: string): number | null {
  const t = text.trim();
  const m = /^(\d{1,7})$/.exec(t) ?? /item[:=](\d{1,7})/.exec(t) ?? /\/items\/(\d{1,7})/.exec(t);
  return m ? Number(m[1]) : null;
}

/** Fetches every chosen realm and rewrites the EverlootPrices slot addon. Any failure keeps the previous file. */
export async function refreshMarket(options: {
  svFiles: string[]; followed: string[]; addonsDir: string; endpoint: string; send?: typeof fetch;
}): Promise<{ realms: RealmSummary[]; items: number }> {
  const chosen = mergeRealms(ownRealms(options.svFiles), options.followed);
  // Independent GETs to the same site; together they take one round trip, not one per realm (at most 20).
  const fetched: RealmPrices[] = await Promise.all(chosen.map(({ realm }) => fetchRealmPrices(options.endpoint, realm, options.send)));
  const summaries: RealmSummary[] = fetched.map((prices, i) => ({ realm: prices.realm, items: prices.items.length, dataAsOf: prices.dataAsOf, source: chosen[i].source }));
  writePricesAddon(options.addonsDir, fetched);
  return { realms: summaries, items: summaries.reduce((n, r) => n + r.items, 0) };
}
