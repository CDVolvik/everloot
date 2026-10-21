import type { ObjectFacts } from "../../../kb/src/object-page";
import { computeRollups, loadItemFacts, loadWorldFacts } from "./rollup-compute";

/** Object facts from the shared aggregates: the drop rollup, the agreed item names and the object names, no second scan. */
export async function loadObjectFacts(): Promise<ObjectFacts & { unreachable: boolean; dataAsOf: string | null }> {
  const [rollup, items, world] = await Promise.all([computeRollups(), loadItemFacts(), loadWorldFacts()]);
  const unreachable = rollup.stats.unreachable || items.unreachable || world.unreachable;
  return {
    rates: unreachable ? [] : rollup.rates,
    measuredZeros: unreachable ? [] : rollup.measuredZeros,
    names: unreachable ? [] : items.names,
    objectNames: unreachable ? [] : world.objects ?? [],
    unreachable,
    dataAsOf: rollup.stats.dataAsOf,
  };
}
