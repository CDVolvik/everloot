import { npcPage, questPage, vendorPage, type NpcPage, type QuestPage, type VendorPage, type WorldFacts } from "../../../kb/src/world-pages";

// The NPCs, quests and vendors that have at least one public fact (3 installs agree), for the list pages
// and the database search. Built from the same page functions as the detail pages, so a row here never
// shows more than its page does. Rows are grouped by id first: one pass, not one scan per id.

function byId<T>(rows: T[], id: (row: T) => number): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const key = id(row);
    if (!Number.isInteger(key) || key < 1) continue;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return new Map([...groups].sort((a, b) => a[0] - b[0]));
}

const EMPTY: WorldFacts = { npcs: [], quests: [], vendors: [] };

export function publicNpcs(facts: WorldFacts): NpcPage[] {
  return [...byId(facts.npcs, (r) => r.npcId)].map(([id, npcs]) => npcPage(id, { ...EMPTY, npcs })).filter((p) => p.name !== null || p.pins.length > 0);
}

export function publicQuests(facts: WorldFacts): QuestPage[] {
  return [...byId(facts.quests, (r) => r.questId)].map(([id, quests]) => questPage(id, { ...EMPTY, quests }))
    .filter((p) => p.title !== null || p.level !== null || p.giverNpcId !== null || p.turnInNpcId !== null || p.rewards.length > 0);
}

export function publicVendors(facts: WorldFacts): VendorPage[] {
  return [...byId(facts.vendors, (r) => r.vendorNpcId)].map(([id, vendors]) => vendorPage(id, { ...EMPTY, vendors })).filter((p) => p.offers.length > 0);
}
