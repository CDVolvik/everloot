import { agreedItemNames, type ItemFacts } from "../../../kb/src/item-page";
import { categoryOf } from "../../../kb/src/item-taxonomy";
import type { WorldFacts } from "../../../kb/src/world-pages";
import { CLIENT_TAXONOMY } from "./items";
import { loadItemFacts, loadWorldFacts } from "./rollup-compute";
import { publicNpcs, publicQuests } from "./world-lists";

// The database part of the site search: items, NPCs, quests and objects by id, and by the names the site
// already shows. A name counts only once 3 installs agree on it (the same rule as the pages), so the search
// never surfaces a name a page would not show, such as a game file name of an item nobody reported.

export type DatabaseKind = "item" | "npc" | "quest" | "object";

export interface DatabaseHit {
  kind: DatabaseKind;
  id: number;
  /** The agreed name, or "Item 2589" when there is none. */
  name: string;
  /** One short line: the item's category, or what the entry is. */
  detail: string;
  href: string;
}

export const DATABASE_HITS_MAX = 20;
const ID = /^#?([1-9]\d{0,9})$/;

const KIND_LABEL: Record<DatabaseKind, string> = { item: "Item", npc: "NPC", quest: "Quest", object: "Object" };

function itemDetail(id: number): string {
  const c = categoryOf(CLIENT_TAXONOMY, id);
  return ["Item", c?.class?.label, c?.subclass?.name].filter(Boolean).join(" · ");
}

/** The hits for a query from the current uploads; storage that cannot be read only leaves out player names. */
export async function databaseHits(query: string): Promise<DatabaseHit[]> {
  const [items, world] = await Promise.all([loadItemFacts(), loadWorldFacts()]);
  return searchDatabase(query, items.unreachable ? { names: [] } : items, world.unreachable ? { npcs: [], quests: [], vendors: [] } : world);
}

/** Hits for a query, best first: an exact id, then names that start with the query, then names that contain it. */
export function searchDatabase(query: string, items: Pick<ItemFacts, "names">, world: WorldFacts): DatabaseHit[] {
  const q = query.trim();
  const itemNames = agreedItemNames(items);
  const npcs = publicNpcs(world);
  const quests = publicQuests(world);
  const byId = q.match(ID);
  if (byId) {
    const id = Number(byId[1]);
    const npc = npcs.find((p) => p.npcId === id);
    const quest = quests.find((p) => p.questId === id);
    const hits: DatabaseHit[] = [];
    // An item only when the game files have that id; the other pages answer any id, so they are offered as such.
    if (categoryOf(CLIENT_TAXONOMY, id) || itemNames.has(id)) hits.push({ kind: "item", id, name: itemNames.get(id) ?? `Item ${id}`, detail: itemDetail(id), href: `/database/items/${id}` });
    hits.push({ kind: "npc", id, name: npc?.name ?? `NPC ${id}`, detail: "NPC", href: `/database/npcs/${id}` });
    hits.push({ kind: "quest", id, name: quest?.title ?? `Quest ${id}`, detail: "Quest", href: `/database/quests/${id}` });
    hits.push({ kind: "object", id, name: `Object ${id}`, detail: "Object: chest, herb, ore or pool", href: `/database/objects/${id}` });
    return hits;
  }
  const needle = q.toLowerCase();
  if (needle.length < 2) return [];
  const named: DatabaseHit[] = [
    ...[...itemNames].map(([id, name]) => ({ kind: "item" as const, id, name, detail: itemDetail(id), href: `/database/items/${id}` })),
    ...npcs.filter((p) => p.name).map((p) => ({ kind: "npc" as const, id: p.npcId, name: p.name!, detail: KIND_LABEL.npc, href: `/database/npcs/${p.npcId}` })),
    ...quests.filter((p) => p.title).map((p) => ({ kind: "quest" as const, id: p.questId, name: p.title!, detail: p.level !== null ? `Quest · level ${p.level}` : KIND_LABEL.quest, href: `/database/quests/${p.questId}` })),
  ];
  const rank = (h: DatabaseHit) => { const n = h.name.toLowerCase(); return n === needle ? 0 : n.startsWith(needle) ? 1 : n.includes(needle) ? 2 : 3; };
  return named
    .map((h) => ({ h, r: rank(h) }))
    .filter(({ r }) => r < 3)
    .sort((a, b) => a.r - b.r || a.h.name.localeCompare(b.h.name) || a.h.id - b.h.id)
    .slice(0, DATABASE_HITS_MAX)
    .map(({ h }) => h);
}
