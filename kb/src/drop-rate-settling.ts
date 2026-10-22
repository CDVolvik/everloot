import type { DropRate } from "./drop-rollup.js";

export const DROP_SETTLE_MIN_WINDOWS = 50;
export const DROP_SETTLE_MIN_VOTERS = 5;
export const DROP_SETTLE_ABSOLUTE_PRECISION = 0.03;
export const DROP_SETTLE_RELATIVE_PRECISION = 0.30;
export const DROP_RATE_CONFIDENCE = 0.95;
/** Two-sided standard-normal quantile for the 95% Wilson score interval. */
export const DROP_RATE_Z = 1.959963984540054;

export interface DropRateMeasurement {
  drops: number;
  windows: number;
  voters: number;
  rate: number | null;
  interval: { lower: number; upper: number; halfWidth: number } | null;
  /** Corpus cut-off supplied by the caller, not the time this function ran. */
  dataAsOf: string;
  method: "wilson";
  confidence: number;
  settled: boolean;
}

/** All rates and widths are fractions: 0.03 means three percentage points. */
export function meetsDropRateSettlingRule(sample: {
  windows: number; voters: number; rate: number; halfWidth: number;
}): boolean {
  return sample.windows >= DROP_SETTLE_MIN_WINDOWS
    && sample.voters >= DROP_SETTLE_MIN_VOTERS
    && sample.halfWidth <= Math.max(
      DROP_SETTLE_ABSOLUTE_PRECISION,
      DROP_SETTLE_RELATIVE_PRECISION * sample.rate,
    );
}

/**
 * Measure a rollup from folded, source-attributed loot windows. `kills` is the
 * legacy window denominator, not inferred kills; reporters are source voters.
 * Pending Recorder loot must stay outside the rollup. Windows are observations,
 * not necessarily independent trials; the interval is descriptive of this sample.
 */
export function measureDropRate(
  sample: Pick<DropRate, "drops" | "kills" | "reporters">,
  dataAsOf: string,
): DropRateMeasurement {
  const { drops, kills: windows, reporters: voters } = sample;
  const rate = windows > 0 ? drops / windows : null;
  let interval: DropRateMeasurement["interval"] = null;
  if (rate !== null) {
    const z2 = DROP_RATE_Z ** 2;
    const denominator = 1 + z2 / windows;
    const center = (rate + z2 / (2 * windows)) / denominator;
    const halfWidth = DROP_RATE_Z * Math.sqrt(
      rate * (1 - rate) / windows + z2 / (4 * windows ** 2),
    ) / denominator;
    interval = {
      lower: Math.max(0, center - halfWidth),
      upper: Math.min(1, center + halfWidth),
      halfWidth,
    };
  }
  return {
    drops, windows, voters, rate, interval, dataAsOf, method: "wilson",
    confidence: DROP_RATE_CONFIDENCE,
    settled: rate !== null && interval !== null
      && meetsDropRateSettlingRule({ windows, voters, rate, halfWidth: interval.halfWidth }),
  };
}
