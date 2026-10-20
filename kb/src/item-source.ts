import { INDEPENDENT_INSTALLS } from "./drop-rollup.js";

/**
 * Items a recipe makes, from what players' trade-skill windows showed (recipe_observed rows with the product's
 * item id). An item counts once 3 distinct installs reported it as a product, the bar every other public fact uses.
 */
export function craftedItemsFromRecords(records: unknown[]): Set<number> {
  const installs = new Map<number, Set<string>>();
  for (const raw of records) {
    const r = raw as Record<string, unknown>;
    if (r?.kind !== "recipe_observed" || typeof r.installId !== "string" || !r.installId.trim()) continue;
    const id = r.productItemId;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1) continue;
    installs.set(id, (installs.get(id) ?? new Set()).add(r.installId.trim()));
  }
  return new Set([...installs].filter(([, s]) => s.size >= INDEPENDENT_INSTALLS).map(([id]) => id));
}
