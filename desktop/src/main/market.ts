import { readFileSync } from "node:fs";
import { fetchRealmPrices, readRealms, writePricesAddon, type RealmPrices } from "../../../companion/src/prices";
import type { RealmSummary } from "../shared/types";

/** The companion's cap on realms in one prices file. */
export const MAX_REALMS = 20;

const realmKey = (realm: string) => realm.trim().replace(/[A-Z]/g, (c) => c.toLowerCase());

/** The realms the site has public values for, from `GET /api/market/prices` without a realm. */
export async function listRealms(endpoint: string, send: typeof fetch = fetch): Promise<{ realms: string[]; dataAsOf: string | null }> {
  const res = await send(`${endpoint}/api/market/prices`, { headers: { accept: "application/json" } });
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

/** Fetches every chosen realm and rewrites the EverlootPrices slot addon. Any failure keeps the previous file. */
export async function refreshMarket(options: {
  svFiles: string[]; followed: string[]; addonsDir: string; endpoint: string; send?: typeof fetch;
}): Promise<{ realms: RealmSummary[]; items: number }> {
  const chosen = mergeRealms(ownRealms(options.svFiles), options.followed);
  const fetched: RealmPrices[] = [];
  const summaries: RealmSummary[] = [];
  for (const { realm, source } of chosen) {
    const prices = await fetchRealmPrices(options.endpoint, realm, options.send);
    fetched.push(prices);
    summaries.push({ realm: prices.realm, items: prices.items.length, dataAsOf: prices.dataAsOf, source });
  }
  writePricesAddon(options.addonsDir, fetched);
  return { realms: summaries, items: summaries.reduce((n, r) => n + r.items, 0) };
}
