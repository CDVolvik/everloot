/**
 * NPC, quest, and vendor pages from Everloot uploads.
 * A name, pin, title, level, giver, reward, or price is public after 3 installs agree.
 * No copied catalog.
 */

export const WORLD_AGREEMENT = 3;

export type NpcSightingRow = {
  installId: string;
  npcId: number;
  name: string;
  mapId: number;
  x: number;
  y: number;
};

export type QuestSighting = {
  installId: string;
  questId: number;
  title: string;
  level: number;
  giverNpcId?: number;
  turnInNpcId?: number;
  rewardItemIds: number[];
};

export type VendorSighting = {
  installId: string;
  vendorNpcId: number;
  itemId: number;
  priceCopper: number;
  limitedStock?: number;
};

export type WorldFacts = {
  npcs: NpcSightingRow[];
  quests: QuestSighting[];
  vendors: VendorSighting[];
};

export type NpcPin = { mapId: number; x: number; y: number; reporters: number };
export type NpcPage = { npcId: number; name: string | null; pins: NpcPin[] };
export type QuestPage = {
  questId: number;
  title: string | null;
  level: number | null;
  giverNpcId: number | null;
  turnInNpcId: number | null;
  rewards: number[];
};
/** `limitedStock` null with `unlimited` false means the stock is unrecorded, not unlimited. */
export type VendorOffer = { itemId: number; priceCopper: number; limitedStock: number | null; unlimited: boolean; reporters: number };
export type VendorPage = { vendorNpcId: number; offers: VendorOffer[] };

const EMPTY: WorldFacts = { npcs: [], quests: [], vendors: [] };

function clean(value: string): string {
  return value.trim().toLowerCase();
}

function agreedLabel(rows: { installId: string; label: string }[]): string | null {
  const groups = new Map<string, { label: string; installs: Set<string> }>();
  for (const row of rows) {
    const key = clean(row.label);
    if (!row.installId.trim() || !key) continue;
    const group = groups.get(key) ?? { label: row.label.trim(), installs: new Set<string>() };
    group.installs.add(row.installId.trim());
    groups.set(key, group);
  }
  const winners = [...groups.values()].filter((group) => group.installs.size >= WORLD_AGREEMENT);
  return winners.length === 1 ? winners[0]!.label : null;
}

function agreedNumber(rows: { installId: string; value: number }[]): number | null {
  const groups = new Map<number, Set<string>>();
  for (const row of rows) {
    if (!row.installId.trim() || !Number.isInteger(row.value)) continue;
    const set = groups.get(row.value) ?? new Set<string>();
    set.add(row.installId.trim());
    groups.set(row.value, set);
  }
  const winners = [...groups.entries()].filter(([, installs]) => installs.size >= WORLD_AGREEMENT);
  return winners.length === 1 ? winners[0]![0] : null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(value * 10) / 10;
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

export function npcPage(npcId: number, facts: WorldFacts): NpcPage {
  const rows = facts.npcs.filter((row) => row.npcId === npcId && row.installId.trim());
  const name = agreedLabel(rows.map((row) => ({ installId: row.installId, label: row.name })));
  const grouped = new Map<number, Map<string, NpcSightingRow>>();
  for (const row of rows) {
    if (!Number.isInteger(row.mapId) || row.mapId < 0) continue;
    if (row.x < 0 || row.x > 100 || row.y < 0 || row.y > 100) continue;
    const installs = grouped.get(row.mapId) ?? new Map<string, NpcSightingRow>();
    installs.set(row.installId.trim(), row);
    grouped.set(row.mapId, installs);
  }
  const pins = [...grouped.entries()]
    .filter(([, installs]) => installs.size >= WORLD_AGREEMENT)
    .map(([mapId, installs]) => {
      const seen = [...installs.values()];
      return { mapId, x: median(seen.map((row) => row.x)), y: median(seen.map((row) => row.y)), reporters: installs.size };
    })
    .sort((a, b) => a.mapId - b.mapId);
  return { npcId, name, pins };
}

export function formatNpcPage(page: NpcPage): string {
  const lines = [page.name ? `NPC ${page.npcId} — ${page.name}` : `NPC ${page.npcId}`];
  if (!page.name) lines.push("No agreed name yet. A name needs 3 installs reporting the same one.");
  lines.push("Map");
  if (page.pins.length === 0) lines.push("No agreed position. A pin needs 3 installs on the same map.");
  for (const pin of page.pins) lines.push(`Map ${pin.mapId} at ${pin.x}, ${pin.y}  ${pin.reporters} reporters`);
  return lines.join("\n");
}

export function handleNpcPage(args: { npcId: number }, facts: WorldFacts = EMPTY): string {
  if (!Number.isInteger(args.npcId) || args.npcId < 1) return "Name an npc id.";
  return formatNpcPage(npcPage(args.npcId, facts));
}

export function questPage(questId: number, facts: WorldFacts): QuestPage {
  const rows = facts.quests.filter((row) => row.questId === questId && row.installId.trim());
  const rewards = new Map<number, Set<string>>();
  for (const row of rows) {
    for (const itemId of row.rewardItemIds) {
      if (!Number.isInteger(itemId) || itemId < 1) continue;
      const set = rewards.get(itemId) ?? new Set<string>();
      set.add(row.installId.trim());
      rewards.set(itemId, set);
    }
  }
  return {
    questId,
    title: agreedLabel(rows.map((row) => ({ installId: row.installId, label: row.title }))),
    level: agreedNumber(rows.map((row) => ({ installId: row.installId, value: row.level }))),
    giverNpcId: agreedNumber(
      rows.filter((row) => row.giverNpcId !== undefined).map((row) => ({ installId: row.installId, value: row.giverNpcId! })),
    ),
    turnInNpcId: agreedNumber(
      rows.filter((row) => row.turnInNpcId !== undefined).map((row) => ({ installId: row.installId, value: row.turnInNpcId! })),
    ),
    rewards: [...rewards.entries()].filter(([, installs]) => installs.size >= WORLD_AGREEMENT).map(([itemId]) => itemId).sort((a, b) => a - b),
  };
}

export function formatQuestPage(page: QuestPage): string {
  const lines = [page.title ? `Quest ${page.questId} — ${page.title}` : `Quest ${page.questId}`];
  if (!page.title) lines.push("No agreed title yet. A title needs 3 installs reporting the same one.");
  lines.push(page.level === null ? "No agreed level. A level needs 3 installs reporting the same one." : `Level ${page.level}`);
  lines.push(page.giverNpcId === null ? "No agreed giver." : `Giver NPC ${page.giverNpcId}`);
  lines.push(page.turnInNpcId === null ? "No agreed turn-in." : `Turn-in NPC ${page.turnInNpcId}`);
  lines.push(page.rewards.length === 0 ? "No agreed rewards." : `Rewards: ${page.rewards.join(", ")}`);
  return lines.join("\n");
}

export function handleQuestPage(args: { questId: number }, facts: WorldFacts = EMPTY): string {
  if (!Number.isInteger(args.questId) || args.questId < 1) return "Name a quest id.";
  return formatQuestPage(questPage(args.questId, facts));
}

export function vendorPage(vendorNpcId: number, facts: WorldFacts): VendorPage {
  const grouped = new Map<string, { itemId: number; priceCopper: number; installs: Map<string, number | undefined> }>();
  for (const row of facts.vendors) {
    if (row.vendorNpcId !== vendorNpcId || !row.installId.trim()) continue;
    if (!Number.isInteger(row.itemId) || row.itemId < 1 || !Number.isInteger(row.priceCopper) || row.priceCopper < 0) continue;
    const key = `${row.itemId}|${row.priceCopper}`;
    const group = grouped.get(key) ?? { itemId: row.itemId, priceCopper: row.priceCopper, installs: new Map() };
    group.installs.set(row.installId.trim(), row.limitedStock);
    grouped.set(key, group);
  }
  const offers = [...grouped.values()]
    .filter((group) => group.installs.size >= WORLD_AGREEMENT)
    .map((group) => {
      const stocks = new Map<number, number>();
      let noLimit = 0;
      for (const stock of group.installs.values()) {
        if (stock === undefined) noLimit += 1;
        else if (Number.isInteger(stock) && stock > 0) stocks.set(stock, (stocks.get(stock) ?? 0) + 1);
      }
      const agreed = [...stocks.entries()].filter(([, count]) => count >= WORLD_AGREEMENT);
      return {
        itemId: group.itemId,
        priceCopper: group.priceCopper,
        limitedStock: agreed.length === 1 ? agreed[0]![0] : null,
        unlimited: noLimit >= WORLD_AGREEMENT,
        reporters: group.installs.size,
      };
    })
    .sort((a, b) => a.itemId - b.itemId || a.priceCopper - b.priceCopper);
  return { vendorNpcId, offers };
}

export function stockLabel(offer: VendorOffer): string {
  if (offer.limitedStock !== null) return `stock ${offer.limitedStock}`;
  return offer.unlimited ? "not limited" : "stock unrecorded";
}

export function formatVendorPage(page: VendorPage): string {
  const lines = [
    `Vendor NPC ${page.vendorNpcId}`,
    "An item is listed when 3 installs agree on that item and its copper price.",
  ];
  if (page.offers.length === 0) {
    lines.push("Goods unrecorded. A price needs 3 installs agreeing.");
    return lines.join("\n");
  }
  for (const offer of page.offers) {
    const stock = stockLabel(offer);
    lines.push(`Item ${offer.itemId}  ${formatCopper(offer.priceCopper)}  ${stock}  ${offer.reporters} reporters`);
  }
  return lines.join("\n");
}

export function handleVendorPage(args: { vendorNpcId: number }, facts: WorldFacts = EMPTY): string {
  if (!Number.isInteger(args.vendorNpcId) || args.vendorNpcId < 1) return "Name a vendor id.";
  return formatVendorPage(vendorPage(args.vendorNpcId, facts));
}

export function worldFactsFromRecords(records: unknown[]): WorldFacts {
  const facts: WorldFacts = { npcs: [], quests: [], vendors: [] };
  for (const raw of records) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.installId !== "string") continue;
    if (
      row.kind === "npc_sighting" &&
      typeof row.npcId === "number" &&
      typeof row.name === "string" &&
      typeof row.mapId === "number" &&
      typeof row.x === "number" &&
      typeof row.y === "number"
    ) {
      facts.npcs.push({ installId: row.installId, npcId: row.npcId, name: row.name, mapId: row.mapId, x: row.x, y: row.y });
    }
    if (row.kind === "quest" && typeof row.questId === "number" && typeof row.title === "string" && typeof row.level === "number") {
      facts.quests.push({
        installId: row.installId,
        questId: row.questId,
        title: row.title,
        level: row.level,
        ...(typeof row.giverNpcId === "number" ? { giverNpcId: row.giverNpcId } : {}),
        ...(typeof row.turnInNpcId === "number" ? { turnInNpcId: row.turnInNpcId } : {}),
        rewardItemIds: Array.isArray(row.rewardItemIds) ? row.rewardItemIds.filter((id): id is number => typeof id === "number") : [],
      });
    }
    if (row.kind === "vendor" && typeof row.vendorNpcId === "number" && Array.isArray(row.items)) {
      for (const item of row.items) {
        if (!item || typeof item !== "object") continue;
        const offer = item as { itemId?: unknown; priceCopper?: unknown; limitedStock?: unknown };
        if (typeof offer.itemId !== "number" || typeof offer.priceCopper !== "number") continue;
        facts.vendors.push({
          installId: row.installId,
          vendorNpcId: row.vendorNpcId,
          itemId: offer.itemId,
          priceCopper: offer.priceCopper,
          ...(typeof offer.limitedStock === "number" ? { limitedStock: offer.limitedStock } : {}),
        });
      }
    }
  }
  return facts;
}
