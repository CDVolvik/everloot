/**
 * The plateau (docs/design/specs/2026-10-21-coverage-plateau-design.md, section 5): the point past which players mostly
 * verify what is there instead of finding something new. A type is at its plateau when, over the expected facts of the
 * released zones, at least 90% are confirmed and 75% settled, and fewer than 0.5% became confirmed in the last 28 days.
 * The site is at its plateau when quests, NPC pins, vendors and drops all are.
 *
 * Nothing flips by itself: the off-switch is per fact (the settled list). The plateau is what the coverage page and the
 * internal report state, and what moves the Desktop App's settled-list refresh from daily to weekly.
 *
 * Pure, over the same input as the coverage score (`coverage.ts`): the score now, and the score from the reports
 * captured up to 28 days before the data date, with only the recheck scopes that had begun by then. Newly confirmed is
 * the rise between the two, field by field and zone by zone, so a fact that left confirmed in one cell never hides one
 * that joined in another. A fact in recheck is neither confirmed nor settled in either score.
 */
import { COVERAGE_TYPES, computeCoverage, type CoverageInput, type CoverageReport, type CoverageType } from "./coverage.js";

/** A type is at its plateau with at least this share of its expected facts confirmed (spec section 5). */
export const PLATEAU_CONFIRMED = 0.9;
/** ... and at least this share settled. */
export const PLATEAU_SETTLED = 0.75;
/** ... and fewer than this share newly confirmed within the window. */
export const PLATEAU_NEW_SHARE = 0.005;
export const PLATEAU_WINDOW_DAYS = 28;
/** The types whose plateau is the site's. */
export const PLATEAU_TYPES = ["quests", "pins", "vendors", "drops"] as const satisfies readonly CoverageType[];
/** How often the Desktop App refreshes its settled list: daily while collecting, weekly at the plateau. */
export const SETTLED_LIST_REFRESH_DAYS = { collecting: 1, plateau: 7 } as const;

const DAY = 86_400_000;
const pct = (share: number) => `${Math.round(share * 1000) / 10}%`;

/** How the plateau is measured, said once wherever it is shown. */
export const PLATEAU_METHOD =
  `A type is at its plateau when, over the facts expected in the released zones, at least ${pct(PLATEAU_CONFIRMED)} are confirmed, `
  + `${pct(PLATEAU_SETTLED)} are settled, and fewer than ${pct(PLATEAU_NEW_SHARE)} became confirmed in the ${PLATEAU_WINDOW_DAYS} days before the data date. `
  + `Newly confirmed is the rise, field by field and zone by zone, from the score of the reports captured ${PLATEAU_WINDOW_DAYS} days earlier. `
  + "A fact a patch may have changed (recheck) counts as neither confirmed nor settled. "
  + "The site is at its plateau when quests, NPC pins, vendors and drops all are.";

export interface TypePlateau {
  type: CoverageType;
  /** The expected facts of the released zones (`max(expected, observed)` per zone); null without an expected file. */
  denominator: number | null;
  confirmed: number;
  settled: number;
  /** Facts in recheck: in the denominator, in neither count. */
  recheck: number;
  /** Facts that became confirmed in the window; null without a data date. */
  newlyConfirmed: number | null;
  /** Shares of the denominator, capped at 1; null where it is unknown. */
  shares: { confirmed: number | null; settled: number | null; newlyConfirmed: number | null };
  /** Null when a share is unknown: no expected file, an empty denominator, or no data date. */
  atPlateau: boolean | null;
}

export interface PlateauReport {
  /** The data date the score is for (the corpus time), and where the window starts. */
  dataAsOf: string | null;
  windowStart: string | null;
  build: string | null;
  method: string;
  /** Distinct folded installs behind the counted facts now, and those with a report captured in the window. */
  installs: number;
  windowInstalls: number;
  /** The expected file's date, or null for the whole field without one. */
  expected: { dataAsOf: string | null } | null;
  types: TypePlateau[];
  /** True when every type in `PLATEAU_TYPES` is at its plateau; null when any of them is unknown. */
  site: boolean | null;
  /** Days between the Desktop App's settled-list refreshes. */
  refreshDays: number;
}

function time(value: unknown): number | null {
  const t = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : null;
}

/** The start of the window: the data date less 28 days, or null without a data date. */
export function plateauWindowStart(asOf: string | null): string | null {
  const t = time(asOf);
  return t === null ? null : new Date(t - PLATEAU_WINDOW_DAYS * DAY).toISOString();
}

/**
 * The score's input as it stood at the window's start: only reports captured by then (a record with no capture time is
 * left out, so it reads as new), the window's start as the data date, and only the recheck scopes begun by then.
 */
export function plateauInput(input: CoverageInput): CoverageInput | null {
  const start = plateauWindowStart(input.asOf);
  if (start === null) return null;
  const cut = time(start)!;
  const records = input.records.filter((r) => {
    const t = time(r && typeof r === "object" ? (r as { capturedAt?: unknown }).capturedAt : undefined);
    return t !== null && t <= cut;
  });
  return { ...input, records, asOf: start, recheck: (input.recheck ?? []).filter((s) => time(s.since)! <= cut) };
}

/** Distinct installs with a report captured in the window. */
function windowInstalls(records: readonly unknown[], start: string | null, asOf: string | null): number {
  const from = time(start), to = time(asOf);
  if (from === null || to === null) return 0;
  const installs = new Set<string>();
  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    const { installId, capturedAt } = r as { installId?: unknown; capturedAt?: unknown };
    const t = time(capturedAt);
    if (typeof installId === "string" && installId.trim() && t !== null && t > from && t <= to) installs.add(installId.trim());
  }
  return installs.size;
}

/**
 * The plateau from the score now and the score at the window's start (`plateauInput`). `then` is null without a data
 * date, and every rate is then unknown. `records` are the same folded records, for the installs in the window.
 */
export function measurePlateau(now: CoverageReport, then: CoverageReport | null, records: readonly unknown[]): PlateauReport {
  const start = then?.dataAsOf ?? null;
  const types = COVERAGE_TYPES.map((type): TypePlateau => {
    const cell = now.totals[type];
    let newlyConfirmed: number | null = null;
    if (then) {
      newlyConfirmed = 0;
      for (const zone of now.zones) {
        const before = then.zones.find((z) => z.mapId === zone.mapId);
        for (const f of zone.fields) {
          if (f.type !== type) continue;
          const was = before?.fields.find((b) => b.type === type && b.field === f.field)?.confirmed ?? 0;
          newlyConfirmed += Math.max(0, f.confirmed - was);
        }
      }
    }
    const d = cell.denominator;
    const share = (n: number | null) => (d === null || d === 0 || n === null ? null : Math.min(1, n / d));
    const shares = { confirmed: share(cell.confirmed), settled: share(cell.settled), newlyConfirmed: share(newlyConfirmed) };
    const atPlateau = shares.confirmed === null || shares.settled === null || shares.newlyConfirmed === null ? null
      : shares.confirmed >= PLATEAU_CONFIRMED && shares.settled >= PLATEAU_SETTLED && shares.newlyConfirmed < PLATEAU_NEW_SHARE;
    return { type, denominator: d, confirmed: cell.confirmed, settled: cell.settled, recheck: cell.recheck, newlyConfirmed, shares, atPlateau };
  });
  const deciding = types.filter((t) => (PLATEAU_TYPES as readonly CoverageType[]).includes(t.type));
  const site = deciding.some((t) => t.atPlateau === false) ? false : deciding.every((t) => t.atPlateau === true) ? true : null;
  return {
    dataAsOf: now.dataAsOf, windowStart: start, build: now.build, method: PLATEAU_METHOD,
    installs: now.installs, windowInstalls: windowInstalls(records, start, now.dataAsOf),
    expected: now.expected, types, site,
    refreshDays: site === true ? SETTLED_LIST_REFRESH_DAYS.plateau : SETTLED_LIST_REFRESH_DAYS.collecting,
  };
}

/** The plateau for one coverage input: the score now and at the window's start. `now` may be passed when already computed. */
export function computePlateau(input: CoverageInput, now: CoverageReport = computeCoverage(input)): PlateauReport {
  const earlier = plateauInput(input);
  return measurePlateau(now, earlier && computeCoverage(earlier), input.records);
}
