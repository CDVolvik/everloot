import type { EdgeKind } from "../../../kb/src/edges";
import { agreedItemNames, type ItemFacts } from "../../../kb/src/item-page";
import { agreedNpcNames, agreedObjectNames, agreedQuestTitles, type WorldFacts } from "../../../kb/src/world-pages";
import { loadItemFacts, loadWorldFacts } from "./rollup-compute";

/**
 * Names players agree on (3 installs, as on the pages themselves), by id, for lists that would
 * otherwise print "Item 1234". Built once per corpus version: the fact arrays are the memo keys, and
 * they are replaced whenever the corpus reloads.
 */
export interface Names {
  items: Map<number, string>;
  npcs: Map<number, string>;
  quests: Map<number, string>;
  objects: Map<number, string>;
}

const memo = new WeakMap<object, Map<number, string>>();
function once(key: object, build: () => Map<number, string>): Map<number, string> {
  let known = memo.get(key);
  if (!known) { known = build(); memo.set(key, known); }
  return known;
}

export const itemNames = (facts: Pick<ItemFacts, "names">) => once(facts.names, () => agreedItemNames(facts));
export const npcNames = (facts: Pick<WorldFacts, "npcs">) => once(facts.npcs, () => agreedNpcNames(facts));
export const questTitles = (facts: Pick<WorldFacts, "quests">) => once(facts.quests, () => agreedQuestTitles(facts));
export const objectNames = (facts: Pick<WorldFacts, "objects">) => once(facts.objects ?? facts, () => agreedObjectNames(facts));

/** All four name sets; empty when the store cannot be read (callers then print ids, never guesses). */
export async function loadNames(): Promise<Names> {
  const [items, world] = await Promise.all([loadItemFacts(), loadWorldFacts()]);
  return {
    items: items.unreachable ? new Map() : itemNames(items),
    npcs: world.unreachable ? new Map() : npcNames(world),
    quests: world.unreachable ? new Map() : questTitles(world),
    objects: world.unreachable ? new Map() : objectNames(world),
  };
}

/** The agreed name of a relation's target, for the item, NPC, quest and object kinds; other kinds have none yet. */
export function nameOf(names: Names): (kind: EdgeKind, id: number) => string | undefined {
  return (kind, id) => (kind === "item" ? names.items : kind === "npc" ? names.npcs : kind === "quest" ? names.quests : kind === "object" ? names.objects : undefined)?.get(id);
}

const byName =new WeakMap<Map<number, string>, Map<string, number[]>>();

/** The id of the one entity with this exact name (case-insensitive); null when none or when two share it. */
export function idForName(names: Map<number, string>, name: string): number | null {
  let index = byName.get(names);
  if (!index) {
    index = new Map();
    for (const [id, n] of names) {
      const key = n.trim().toLowerCase();
      index.set(key, [...(index.get(key) ?? []), id]);
    }
    byName.set(names, index);
  }
  const ids = index.get(name.trim().toLowerCase());
  return ids?.length === 1 ? ids[0] : null;
}
