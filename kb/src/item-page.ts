/**
 * One item page from Everloot rollups.
 * Observed loot-window frequency is public after 3 distinct install reports.
 * A name or a map pin is public when 3 installs agree.
 * Wowhead is the page shape. Its rows stay there.
 */

export const ITEM_AGREEMENT = 3;

export type DropRateRow = {
  sourceNpcId?: number;
  sourceObjectId?: number;
  itemId: number;
  kills: number;
  drops: number;
  rate: number;
  reporters: number;
  public: boolean;
};

export type ItemNameSighting = { installId: string; itemId: number; name: string };

export type NpcSighting = {
  installId: string;
  npcId: number;
  name: string;
  mapId: number;
  x: number;
  y: number;
};

export type ItemDrop = {
  sourceNpcId?: number;
  sourceObjectId?: number;
  source: string;
  kills: number;
  drops: number;
  rate: number;
  reporters: number;
};

export type MapPin = {
  npcId: number;
  name: string | null;
  mapId: number;
  x: number;
  y: number;
  reporters: number;
};

export type ItemPage = {
  itemId: number;
  name: string | null;
  drops: ItemDrop[];
  pins: MapPin[];
};

export type ItemFacts = {
  rates: DropRateRow[];
  names: ItemNameSighting[];
  npcs: NpcSighting[];
};

function clean(value: string): string {
  return value.trim().toLowerCase();
}

function agreedLabel(rows: { installId: string; label: string }[]): string | null {
  const groups = new Map<string, { label: string; installs: Set<string> }>();
  for (const row of rows) {
    const key = clean(row.label);
    if (!row.installId.trim() || !key) continue;
    const group = groups.get(key) ?? { label: row.label.trim(), installs: new Set<string>() };
    group.installs.add(row.installId);
    groups.set(key, group);
  }
  const winners = [...groups.values()].filter((group) => group.installs.size >= ITEM_AGREEMENT);
  return winners.length === 1 ? winners[0]!.label : null;
}

/** Every item with an agreed name, by id: the same names `itemPage` gives, in one pass over the sightings. */
export function agreedItemNames(facts: Pick<ItemFacts, "names">): Map<number, string> {
  const byItem = new Map<number, { installId: string; label: string }[]>();
  for (const row of facts.names) {
    const rows = byItem.get(row.itemId) ?? [];
    rows.push({ installId: row.installId, label: row.name });
    byItem.set(row.itemId, rows);
  }
  const out = new Map<number, string>();
  for (const [itemId, rows] of byItem) {
    const name = agreedLabel(rows);
    if (name) out.set(itemId, name);
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
}

function sourceLabel(npcId: number | undefined, objectId: number | undefined, npcName: string | null): string {
  if (npcId !== undefined) return npcName ? `NPC ${npcId} ${npcName}` : `NPC ${npcId}`;
  return `Object ${objectId}`;
}

export function itemPage(itemId: number, facts: ItemFacts): ItemPage {
  const name = agreedLabel(
    facts.names.filter((row) => row.itemId === itemId).map((row) => ({ installId: row.installId, label: row.name })),
  );
  const drops = facts.rates
    .filter((row) => row.public && row.itemId === itemId)
    .map((row) => {
      const npcName =
        row.sourceNpcId === undefined
          ? null
          : agreedLabel(
              facts.npcs
                .filter((npc) => npc.npcId === row.sourceNpcId)
                .map((npc) => ({ installId: npc.installId, label: npc.name })),
            );
      return {
        sourceNpcId: row.sourceNpcId,
        sourceObjectId: row.sourceObjectId,
        source: sourceLabel(row.sourceNpcId, row.sourceObjectId, npcName),
        kills: row.kills,
        drops: row.drops,
        rate: row.rate,
        reporters: row.reporters,
      };
    })
    .sort((a, b) => b.kills - a.kills || b.rate - a.rate);

  const sourceNpcs = new Set(drops.map((drop) => drop.sourceNpcId).filter((id): id is number => id !== undefined));
  const pins: MapPin[] = [];
  const grouped = new Map<string, Map<string, NpcSighting>>();
  for (const npc of facts.npcs) {
    if (!sourceNpcs.has(npc.npcId)) continue;
    if (!npc.installId.trim() || !Number.isInteger(npc.mapId) || npc.mapId < 0) continue;
    if (npc.x < 0 || npc.x > 100 || npc.y < 0 || npc.y > 100) continue;
    const key = `${npc.npcId}|${npc.mapId}`;
    const installs = grouped.get(key) ?? new Map<string, NpcSighting>();
    installs.set(npc.installId, npc);
    grouped.set(key, installs);
  }
  for (const installs of grouped.values()) {
    if (installs.size < ITEM_AGREEMENT) continue;
    const rows = [...installs.values()];
    const npcId = rows[0]!.npcId;
    pins.push({
      npcId,
      name: agreedLabel(rows.map((row) => ({ installId: row.installId, label: row.name }))),
      mapId: rows[0]!.mapId,
      x: median(rows.map((row) => row.x)),
      y: median(rows.map((row) => row.y)),
      reporters: installs.size,
    });
  }
  pins.sort((a, b) => a.npcId - b.npcId || a.mapId - b.mapId);
  return { itemId, name, drops, pins };
}

/** Zero within an observed sample, not a census of kills. */
export function formatMeasuredZero(kills: number): string {
  return `0 items in ${kills} observed loot windows`;
}

export function formatItemPage(page: ItemPage): string {
  const title = page.name ? `Item ${page.itemId} — ${page.name}` : `Item ${page.itemId}`;
  const lines = [title];
  if (!page.name) lines.push("No agreed name yet. A name needs 3 installs reporting the same one.");
  if (page.drops.length === 0) {
    lines.push("Drop rate unrecorded. Observed loot-window frequency needs 3 distinct install reports; total kills are unknown.");
    return lines.join("\n");
  }
  lines.push("Drops");
  for (const drop of page.drops) {
    const rate = drop.drops === 0
      ? `${formatMeasuredZero(drop.kills)}  ${drop.reporters} reporters`
      : `${drop.kills} observed loot windows  ${drop.drops} windows with this item  ${(drop.rate * 100).toFixed(1)}%  ${drop.reporters} distinct install reports`;
    lines.push(`${drop.source}  ${rate}`);
  }
  lines.push("Map");
  if (page.pins.length === 0) lines.push("No agreed position. A pin needs 3 installs on the same map.");
  for (const pin of page.pins) {
    const who = pin.name ? `${pin.name} ` : "";
    lines.push(`NPC ${pin.npcId} ${who}map ${pin.mapId} at ${pin.x}, ${pin.y}  ${pin.reporters} reporters`);
  }
  return lines.join("\n");
}

export function handleItemPage(args: { itemId: number }, facts: ItemFacts = { rates: [], names: [], npcs: [] }): string {
  if (!Number.isInteger(args.itemId) || args.itemId < 1) return "Name an item id.";
  return formatItemPage(itemPage(args.itemId, facts));
}
