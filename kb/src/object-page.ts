/**
 * Game objects (chests, herbs, ore veins, fishing pools) from loot windows players opened on them. The
 * addon records the object's entry id from its GUID (`sourceObjectId`) and the name the client showed for it
 * (`sourceObjectName`). A frequency and a name are public after 3 install reports, as for NPCs. The client's
 * GameObjects table holds no lootable objects, so an object with no agreed name is known by its id.
 */
import { itemFactsFromRecords, lootWindowsFromRecords, rollupDrops, type DropRate, type ItemNameRow, type MeasuredZero } from "./drop-rollup.js";
import { formatMeasuredZero, itemPage } from "./item-page.js";
import { agreedObjectNames, worldFactsFromRecords, type ObjectNameRow } from "./world-pages.js";

export interface ObjectFacts { rates: DropRate[]; measuredZeros: MeasuredZero[]; names: ItemNameRow[]; objectNames?: ObjectNameRow[] }

export interface ObjectDrop { itemId: number; itemName: string | null; kills: number; drops: number; rate: number; reporters: number }
export interface ObjectPage {
  objectId: number;
  /** The name 3 installs agree on; null until then. */
  name: string | null;
  drops: ObjectDrop[];
  /** Public windows with no item at all. */
  zero: { kills: number; reporters: number } | null;
  /** Observations exist but fewer than 3 installs reported them. */
  queued: boolean;
}

export function objectFactsFromRecords(records: unknown[]): ObjectFacts {
  const { rates, measuredZeros } = rollupDrops(lootWindowsFromRecords(records));
  return { rates, measuredZeros, names: itemFactsFromRecords(records).names, objectNames: worldFactsFromRecords(records).objects };
}

export function objectPage(objectId: number, facts: ObjectFacts): ObjectPage {
  const mine = facts.rates.filter((r) => r.sourceObjectId === objectId);
  const zeros = facts.measuredZeros.filter((z) => z.sourceObjectId === objectId);
  const nameOf = (itemId: number) => itemPage(itemId, { rates: [], names: facts.names, npcs: [] }).name;
  const drops = mine.filter((r) => r.public)
    .map((r) => ({ itemId: r.itemId, itemName: nameOf(r.itemId), kills: r.kills, drops: r.drops, rate: r.rate, reporters: r.reporters }))
    .sort((a, b) => b.rate - a.rate || a.itemId - b.itemId);
  const zero = zeros.find((z) => z.public);
  return {
    objectId, name: agreedObjectNames({ objects: facts.objectNames }).get(objectId) ?? null, drops,
    zero: zero ? { kills: zero.kills, reporters: zero.reporters } : null,
    queued: !drops.length && !zero && (mine.length > 0 || zeros.length > 0),
  };
}

/** Objects with public observations, most-looted first. */
export function objectList(facts: ObjectFacts): { objectId: number; name: string | null; windows: number; items: number; reporters: number }[] {
  const names = agreedObjectNames({ objects: facts.objectNames });
  const byId = new Map<number, { objectId: number; name: string | null; windows: number; items: number; reporters: number }>();
  for (const r of facts.rates) {
    if (!r.public || r.sourceObjectId === undefined) continue;
    const o = byId.get(r.sourceObjectId) ?? { objectId: r.sourceObjectId, name: names.get(r.sourceObjectId) ?? null, windows: r.kills, items: 0, reporters: r.reporters };
    o.items += 1;
    byId.set(r.sourceObjectId, o);
  }
  for (const z of facts.measuredZeros) {
    if (z.public && z.sourceObjectId !== undefined && !byId.has(z.sourceObjectId)) byId.set(z.sourceObjectId, { objectId: z.sourceObjectId, name: names.get(z.sourceObjectId) ?? null, windows: z.kills, items: 0, reporters: z.reporters });
  }
  return [...byId.values()].sort((a, b) => b.windows - a.windows || a.objectId - b.objectId);
}

export function formatObjectPage(page: ObjectPage): string {
  const lines = [page.name ? `Object ${page.objectId} — ${page.name}` : `Object ${page.objectId}`];
  if (!page.name) lines.push("No agreed name yet. A name needs 3 installs reporting the same one.");
  if (page.zero) {
    lines.push(`${formatMeasuredZero(page.zero.kills)}  ${page.zero.reporters} reporters`);
  } else if (!page.drops.length) {
    lines.push("Loot observations unrecorded. Public frequencies need source observations from 3 install IDs.");
  } else {
    lines.push("Drops");
    for (const d of page.drops) {
      lines.push(`Item ${d.itemId}${d.itemName ? ` ${d.itemName}` : ""}  ${d.kills} observed loot windows  ${d.drops} windows with this item  ${(d.rate * 100).toFixed(1)}%  ${d.reporters} distinct install reports`);
    }
  }
  return lines.join("\n");
}

export function handleObjectPage(args: { objectId: number }, facts: ObjectFacts = { rates: [], measuredZeros: [], names: [] }): string {
  if (!Number.isInteger(args.objectId) || args.objectId < 1) return "Name an object id.";
  return formatObjectPage(objectPage(args.objectId, facts));
}
