import type { ObjectFacts } from "../../../kb/src/object-page";
import { computeRollups, loadItemFacts } from "./rollup-compute";

/** Object facts from the shared aggregates: the drop rollup and the agreed item names, no second scan. */
export async function loadObjectFacts(): Promise<ObjectFacts & { unreachable: boolean; dataAsOf: string | null }> {
  const [rollup, items] = await Promise.all([computeRollups(), loadItemFacts()]);
  const unreachable = rollup.stats.unreachable || items.unreachable;
  return {
    rates: unreachable ? [] : rollup.rates,
    measuredZeros: unreachable ? [] : rollup.measuredZeros,
    names: unreachable ? [] : items.names,
    unreachable,
    dataAsOf: rollup.stats.dataAsOf,
  };
}
