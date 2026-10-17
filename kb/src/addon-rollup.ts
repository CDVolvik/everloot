/**
 * Which addons Forever players run, from the addon_seen records of installs that turned the addon
 * list on. An addon is public once 3 distinct installs report it: a rarer name can identify a
 * setup. Everloot itself is left out of the ranking. The result carries counts, never install ids.
 */

import { INDEPENDENT_INSTALLS } from "./drop-rollup.js";

/** Everloot and the answers addon its companion writes are on every reporting install. */
export const OWN_ADDONS: ReadonlySet<string> = new Set(["Everloot", "EverlootAnswers"]);

export interface AddonSeenRow {
  installId: string;
  capturedAt: string;
  name: string;
  title: string;
  loaded: boolean;
}

export interface AddonPopularity {
  name: string;
  /** The title from the newest report. */
  title: string;
  /** Installs that reported the addon, loaded or not. */
  installs: number;
  /** Installs that had it loaded in at least one report. */
  loadedInstalls: number;
  /** loadedInstalls out of every install that reported its addons. */
  share: number;
  firstSeen: string;
  lastSeen: string;
  public: boolean;
}

export interface AddonRollup {
  addons: AddonPopularity[];
  /** Distinct installs with any addon_seen record: the share's denominator. */
  reportingInstalls: number;
}

export function rollupAddons(rows: AddonSeenRow[]): AddonRollup {
  const reporting = new Set<string>();
  const byName = new Map<string, {
    title: string; titleAt: number; installs: Set<string>; loaded: Set<string>; first: string; last: string;
  }>();
  for (const row of rows) {
    const at = Date.parse(row.capturedAt);
    if (!Number.isFinite(at)) continue;
    reporting.add(row.installId);
    if (OWN_ADDONS.has(row.name)) continue;
    const entry = byName.get(row.name) ??
      { title: row.title, titleAt: at, installs: new Set<string>(), loaded: new Set<string>(), first: row.capturedAt, last: row.capturedAt };
    if (at >= entry.titleAt) { entry.title = row.title; entry.titleAt = at; }
    if (at < Date.parse(entry.first)) entry.first = row.capturedAt;
    if (at > Date.parse(entry.last)) entry.last = row.capturedAt;
    entry.installs.add(row.installId);
    if (row.loaded) entry.loaded.add(row.installId);
    byName.set(row.name, entry);
  }
  const addons: AddonPopularity[] = [...byName].map(([name, e]) => ({
    name,
    title: e.title,
    installs: e.installs.size,
    loadedInstalls: e.loaded.size,
    share: e.loaded.size / reporting.size,
    firstSeen: e.first,
    lastSeen: e.last,
    public: e.installs.size >= INDEPENDENT_INSTALLS,
  }));
  addons.sort((a, b) => b.loadedInstalls - a.loadedInstalls || b.installs - a.installs || a.name.localeCompare(b.name));
  return { addons, reportingInstalls: reporting.size };
}

export function addonRowsFromRecords(records: unknown[]): AddonSeenRow[] {
  const rows: AddonSeenRow[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row.kind !== "addon_seen" || typeof row.installId !== "string" || typeof row.capturedAt !== "string" ||
      typeof row.name !== "string" || typeof row.title !== "string" || typeof row.loaded !== "boolean") continue;
    rows.push({ installId: row.installId, capturedAt: row.capturedAt, name: row.name, title: row.title, loaded: row.loaded });
  }
  return rows;
}

/** The leaderboard's rows from one upload record list. */
export function addonFactsFromRecords(records: unknown[]): AddonRollup {
  return rollupAddons(addonRowsFromRecords(records));
}
