/**
 * Game objects (chests, herbs, ore veins, fishing pools) from loot windows players opened on them. The
 * addon records the object's entry id from its GUID (`sourceObjectId`). A frequency is public after 3
 * install reports, as for NPCs. Uploads carry no object names and the client's GameObjects table holds
 * no lootable objects, so an object is known by its id.
 */
import { itemFactsFromRecords, lootWindowsFromRecords, rollupDrops, type DropRate, type ItemNameRow, type MeasuredZero } from "./drop-rollup.js";
import { formatMeasuredZero, itemPage } from "./item-page.js";

export interface ObjectFacts { rates: DropRate[]; measuredZeros: MeasuredZero[]; names: ItemNameRow[] }

export interface ObjectDrop { itemId: number; itemName: string | null; kills: number; drops: number; rate: number; reporters: number }
export interface ObjectPage {
  objectId: number;
  drops: ObjectDrop[];
  /** Public windows with no item at all. */
  zero: { kills: number; reporters: number } | null;
  /** Observations exist but fewer than 3 installs reported them. */
  queued: boolean;
}

export function objectFactsFromRecords(records: unknown[]): ObjectFacts {
  const { rates, measuredZeros } = rollupDrops(lootWindowsFromRecords(records));
  return { rates, measuredZeros, names: itemFactsFromRecords(records).names };
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
    objectId, drops,
    zero: zero ? { kills: zero.kills, reporters: zero.reporters } : null,
    queued: !drops.length && !zero && (mine.length > 0 || zeros.length > 0),
  };
}

/** Objects with public observations, most-looted first. */
export function objectList(facts: ObjectFacts): { objectId: number; windows: number; items: number; reporters: number }[] {
  const byId = new Map<number, { objectId: number; windows: number; items: number; reporters: number }>();
  for (const r of facts.rates) {
    if (!r.public || r.sourceObjectId === undefined) continue;
    const o = byId.get(r.sourceObjectId) ?? { objectId: r.sourceObjectId, windows: r.kills, items: 0, reporters: r.reporters };
    o.items += 1;
    byId.set(r.sourceObjectId, o);
  }
  for (const z of facts.measuredZeros) {
    if (z.public && z.sourceObjectId !== undefined && !byId.has(z.sourceObjectId)) byId.set(z.sourceObjectId, { objectId: z.sourceObjectId, windows: z.kills, items: 0, reporters: z.reporters });
  }
  return [...byId.values()].sort((a, b) => b.windows - a.windows || a.objectId - b.objectId);
}

export function formatObjectPage(page: ObjectPage): string {
  const lines = [`Object ${page.objectId}`, "No object names yet: uploads carry the object's id only."];
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
