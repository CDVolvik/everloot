/**
 * Auction history from scans a player uploaded on purpose.
 * A day is public after 3 installs scanned that item on that realm.
 * Copper is the median of the last scan per install that day.
 */

export const AUCTION_AGREEMENT = 3;

export type AuctionSighting = {
  installId: string;
  realm: string;
  itemId: number;
  copper: number;
  seenAt: string;
};

export type AuctionPoint = { day: string; copper: number; reporters: number };

export type AuctionHistory = {
  realm: string;
  itemId: number;
  points: AuctionPoint[];
};

function clean(value: string): string {
  return value.trim().toLowerCase();
}

function dayOf(seenAt: string): string | null {
  const day = seenAt.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

function formatCopper(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const coins = copper % 100;
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0 || gold > 0) parts.push(`${silver}s`);
  parts.push(`${coins}c`);
  return parts.join(" ");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function auctionHistory(realm: string, itemId: number, sightings: AuctionSighting[]): AuctionHistory {
  const wanted = clean(realm);
  const latest = new Map<string, { day: string; copper: number; seenAt: string }>();
  for (const row of sightings) {
    const day = dayOf(row.seenAt);
    if (!row.installId.trim() || clean(row.realm) !== wanted || row.itemId !== itemId || !day) continue;
    if (!Number.isInteger(row.copper) || row.copper < 0) continue;
    const key = `${row.installId.trim()}|${day}`;
    const prev = latest.get(key);
    if (!prev || row.seenAt > prev.seenAt) latest.set(key, { day, copper: row.copper, seenAt: row.seenAt });
  }
  const byDay = new Map<string, number[]>();
  for (const row of latest.values()) {
    const list = byDay.get(row.day) ?? [];
    list.push(row.copper);
    byDay.set(row.day, list);
  }
  const points = [...byDay.entries()]
    .filter(([, coppers]) => coppers.length >= AUCTION_AGREEMENT)
    .map(([day, coppers]) => ({ day, copper: median(coppers), reporters: coppers.length }))
    .sort((a, b) => a.day.localeCompare(b.day));
  return { realm: realm.trim(), itemId, points };
}

export function formatAuctionHistory(history: AuctionHistory): string {
  const lines = [
    `${history.realm} item ${history.itemId}`,
    "A day is public when 3 installs scanned this item on this realm. The copper is the median of the last scan from each install.",
  ];
  if (history.points.length === 0) {
    lines.push("Price unrecorded. A day goes on the history when 3 installs scanned that item.");
    return lines.join("\n");
  }
  for (const point of history.points) {
    lines.push(`${point.day}  ${formatCopper(point.copper)}  ${point.reporters} reporters`);
  }
  return lines.join("\n");
}

export function handleAuctionHistory(args: { realm: string; itemId: number }, sightings: AuctionSighting[] = []): string {
  if (!args.realm.trim()) return "Name a realm.";
  if (!Number.isInteger(args.itemId) || args.itemId < 1) return "Name an item id.";
  return formatAuctionHistory(auctionHistory(args.realm, args.itemId, sightings));
}

export function auctionSightingsFromRecords(records: unknown[]): AuctionSighting[] {
  const sightings: AuctionSighting[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row.kind !== "auction_scan") continue;
    if (typeof row.installId !== "string" || typeof row.realm !== "string" || typeof row.itemId !== "number" || typeof row.copper !== "number") continue;
    const seenAt = typeof row.capturedAt === "string" ? row.capturedAt : "";
    sightings.push({ installId: row.installId, realm: row.realm, itemId: row.itemId, copper: row.copper, seenAt });
  }
  return sightings;
}
