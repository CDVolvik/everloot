/**
 * Loot windows players reported that the public drop rates leave out: the ones converted from a Polestar Recorder
 * file. The file does not say whether the game's loot API named the window's source, so these rows carry no
 * `sourceEvidence` and `lootWindowsFromRecords` never passes them to `rollupDrops`. They are counted here
 * instead, per source and per item: windows, distinct voters (the Recorder voters `publicRecords` folds) and
 * item counts. Pages show the count as "reported, not yet in the rates"; nothing here is a rate.
 */
import { isRecorderInstall } from "./recorder-installs.js";

export interface PendingCount { windows: number; reporters: number }

interface Tally { windows: number; voters: Set<string> }
interface SourceTally extends Tally { items: Map<number, Tally & { count: number }> }

export interface PendingLoot {
  /** `npc:<id>` or `obj:<id>`: the windows of that source, and per item the windows holding it and its count. */
  sources: Map<string, SourceTally>;
  /** Per item: the windows holding it, from any source. */
  items: Map<number, Tally>;
}

const EMPTY: PendingLoot = { sources: new Map(), items: new Map() };

const positive = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** Recorder loot rows without the loot API's evidence, the rows the rates leave out. */
export function pendingLootFromRecords(records: unknown[]): PendingLoot {
  const out: PendingLoot = { sources: new Map(), items: new Map() };
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row.kind !== "loot" || row.sourceEvidence === "loot-api" || !isRecorderInstall(row.installId) || !Array.isArray(row.items)) continue;
    const voter = row.installId as string;
    const key = positive(row.sourceNpcId) ? `npc:${row.sourceNpcId}` : positive(row.sourceObjectId) ? `obj:${row.sourceObjectId}` : null;
    if (!key) continue;
    const source = out.sources.get(key) ?? { windows: 0, voters: new Set<string>(), items: new Map() };
    source.windows += 1;
    source.voters.add(voter);
    out.sources.set(key, source);
    const counted = new Set<number>();
    for (const entry of row.items as { itemId?: unknown; count?: unknown }[]) {
      if (!positive(entry?.itemId) || !positive(entry?.count)) continue;
      const item = source.items.get(entry.itemId) ?? { windows: 0, count: 0, voters: new Set<string>() };
      item.count += entry.count;
      if (!counted.has(entry.itemId)) {
        counted.add(entry.itemId);
        item.windows += 1;
        const any = out.items.get(entry.itemId) ?? { windows: 0, voters: new Set<string>() };
        any.windows += 1;
        any.voters.add(voter);
        out.items.set(entry.itemId, any);
      }
      item.voters.add(voter);
      source.items.set(entry.itemId, item);
    }
  }
  return out;
}

const count = (tally: Tally | undefined): PendingCount | null => (tally && tally.windows > 0 ? { windows: tally.windows, reporters: tally.voters.size } : null);

/** An NPC's pending windows, or null when there are none. */
export const pendingForNpc = (pending: PendingLoot = EMPTY, npcId: number) => count(pending.sources.get(`npc:${npcId}`));
/** An object's pending windows, or null when there are none. */
export const pendingForObject = (pending: PendingLoot = EMPTY, objectId: number) => count(pending.sources.get(`obj:${objectId}`));
/** The pending windows holding an item, from any source, or null when there are none. */
export const pendingForItem = (pending: PendingLoot = EMPTY, itemId: number) => count(pending.items.get(itemId));

/** The line pages and tools show: "12 more loot windows reported, not yet in the rates." */
export function pendingLine(pending: PendingCount, withItem = false): string {
  const windows = `${pending.windows.toLocaleString("en-US")} more ${pending.windows === 1 ? "loot window" : "loot windows"}`;
  return `${windows}${withItem ? " with this item" : ""} reported, not yet in the rates.`;
}
