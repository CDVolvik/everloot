import { itemNames } from "./names";
import { loadItemFacts, loadWorldFacts } from "./rollup-compute";
import { publicQuests, publicVendors } from "./world-lists";

export type SeenAs = "Drop" | "Vendor" | "Quest";

/** Items players have reported, each public under the 3-install rule its page uses, and how they were seen. */
export interface ItemSeen {
  /** An agreed name, a public loot frequency, an agreed vendor price or an agreed quest reward. */
  seen: Set<number>;
  as: Map<number, SeenAs[]>;
  unreachable: boolean;
}

// The fact arrays are replaced whenever the corpus reloads, so they are the memo's key.
let memo: { keys: unknown[]; value: ItemSeen } | null = null;

/** For the item lists' "Seen as" column and "Seen by players" filter. Built once per corpus version. */
export async function loadItemSeen(): Promise<ItemSeen> {
  const [items, world] = await Promise.all([loadItemFacts(), loadWorldFacts()]);
  if (items.unreachable || world.unreachable) return { seen: new Set(), as: new Map(), unreachable: true };
  const keys = [items.rates, items.names, world.vendors, world.quests];
  if (memo && memo.keys.every((k, i) => k === keys[i])) return memo.value;
  const as = new Map<number, SeenAs[]>();
  const add = (id: number, how: SeenAs) => { const now = as.get(id) ?? []; if (!now.includes(how)) as.set(id, [...now, how]); };
  for (const r of items.rates) if (r.public && r.drops > 0) add(r.itemId, "Drop");
  for (const v of publicVendors(world)) for (const o of v.offers) add(o.itemId, "Vendor");
  for (const q of publicQuests(world)) for (const id of q.rewards) add(id, "Quest");
  const seen = new Set([...itemNames(items).keys(), ...as.keys()]);
  memo = { keys, value: { seen, as, unreachable: false } };
  return memo.value;
}
