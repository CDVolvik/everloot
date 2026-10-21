/** Scalar facts for coverage. Call once per entity field, with corpus-folded installs. */
export const WORLD_AGREEMENT = 3;
export const SETTLE_EXTRA_VOTERS = 2;
export const SETTLE_WINDOW_DAYS = 14;

export type FactState = "missing" | "reported" | "confirmed" | "settled" | "recheck";
export type VoteRow = { installId: string; value: string | number; capturedAt?: string };
type VoteTimes = { firstCapturedAt: number | null; lastCapturedAt: number | null };
export type VoteGroup = VoteTimes & {
  /** First trimmed spelling for text, as the public readers have always returned. */
  value: string | number;
  voters: Map<string, VoteTimes>;
  /** Time the third distinct voter first reported this value, in epoch milliseconds. */
  confirmedAt: number | null;
};
export type VoteTally = {
  state: FactState;
  groups: VoteGroup[];
  winner: VoteGroup | null;
  contested: boolean;
};
export type TallyOptions = {
  /** Corpus time (ISO); required for settling. Future capture times clamp to it. */
  asOf?: string;
  /** Build firstSeen or maintainer scope date. Signal wiring belongs to a later PR. */
  recheckSince?: string;
};

function timestamp(value: string | undefined): number | null {
  const time = value === undefined ? NaN : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Shared reader rule: trimmed, case-insensitive text or integer, distinct installs per value. */
function groupVotes(rows: readonly VoteRow[], asOf: number | null): VoteGroup[] {
  const groups = new Map<string | number, VoteGroup>();
  for (const row of rows) {
    const installId = row.installId.trim();
    const value = typeof row.value === "string" ? row.value.trim() : row.value;
    const key = typeof value === "string" ? value.toLowerCase() : value;
    if (!installId || (typeof key === "string" ? !key : !Number.isInteger(key))) continue;
    const group = groups.get(key) ?? { value, voters: new Map<string, VoteTimes>(), firstCapturedAt: null, lastCapturedAt: null, confirmedAt: null };
    const voter = group.voters.get(installId) ?? { firstCapturedAt: null, lastCapturedAt: null };
    const captured = timestamp(row.capturedAt);
    if (captured !== null) {
      const time = asOf === null ? captured : Math.min(captured, asOf);
      voter.firstCapturedAt = Math.min(voter.firstCapturedAt ?? time, time);
      voter.lastCapturedAt = Math.max(voter.lastCapturedAt ?? time, time);
      group.firstCapturedAt = Math.min(group.firstCapturedAt ?? time, time);
      group.lastCapturedAt = Math.max(group.lastCapturedAt ?? time, time);
    }
    group.voters.set(installId, voter);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const firsts = [...group.voters.values()].flatMap((v) => v.firstCapturedAt === null ? [] : [v.firstCapturedAt]).sort((a, b) => a - b);
    group.confirmedAt = firsts[WORLD_AGREEMENT - 1] ?? null;
  }
  return [...groups.values()];
}

function winners(groups: VoteGroup[]): VoteGroup[] {
  return groups.filter((group) => group.voters.size >= WORLD_AGREEMENT);
}

/**
 * Empty input means an expected candidate with no report; discovering that universe is the caller's job.
 * Recorder identities must already be folded by publicRecords, before selecting a field's rows.
 * No drop-rate, position, or quest-side settling is inferred from this scalar tally.
 */
export function tallyVotes(rows: readonly VoteRow[], options: TallyOptions = {}): VoteTally {
  const asOf = timestamp(options.asOf);
  const cutoff = timestamp(options.recheckSince);
  const captured = (row: VoteRow) => {
    const time = timestamp(row.capturedAt);
    return time === null ? null : Math.min(time, asOf ?? time);
  };
  const recheck = cutoff !== null && winners(groupVotes(rows.filter((row) => {
    const time = captured(row);
    return time !== null && time < cutoff;
  }), asOf)).length === 1;
  const groups = groupVotes(recheck ? rows.filter((row) => {
    const time = captured(row);
    return time !== null && time > cutoff!;
  }) : rows, asOf);
  const agreed = winners(groups);
  const winner = agreed.length === 1 ? agreed[0]! : null;
  let state: FactState = recheck ? "recheck" : groups.length ? "reported" : "missing";
  if (winner) {
    state = "confirmed";
    const since = asOf === null ? null : asOf - SETTLE_WINDOW_DAYS * 86_400_000;
    const quiet = since !== null && groups.every((group) => group === winner || [...group.voters.values()].every((voter) => voter.firstCapturedAt !== null && voter.firstCapturedAt <= since));
    if (winner.voters.size >= WORLD_AGREEMENT + SETTLE_EXTRA_VOTERS && since !== null && winner.confirmedAt !== null && winner.confirmedAt <= since && quiet) state = "settled";
  }
  // Two winning groups stay reported, including during a recheck.
  const contested = agreed.length > 1;
  return { state: contested ? "reported" : state, groups, winner, contested };
}
