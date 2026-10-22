/**
 * The weekly spot check (docs/design/specs/2026-10-21-coverage-plateau-design.md, section 5): hotfixes change no build
 * and never reach the build watch, so each week about 2% of settled facts are left out of the settled list and
 * uploaders send their rows again. Every settled fact is looked at again about once a year, and the load stays flat.
 *
 * The pick is a hash of the fact's key and the ISO week, so the same week picks the same facts on every run, and a
 * fact's chance does not depend on the corpus. A spot-checked fact that then gets a conflicting report goes to recheck
 * (a scope in `kb/curated/recheck.json` whose source is `spot-check <week>`), and its zone's rate goes to 10% for the
 * four weeks after the week the conflict was found. The boost reads only that committed file, so it changes once a
 * week at most, never between two runs of one week.
 *
 * Keys follow the settled list's grain (spec section 4): `npc:<id>`, `pin:<npc>:<map>`, `quest:<id>`, `vendor:<id>`
 * and `loot:npc:<id>` or `loot:obj:<id>`. Loot sources are picked like the rest, but a rate has no conflicting value,
 * so `spotCheckConflicts` reads the other four.
 */
import { POSITION_TOLERANCE, type CoverageType, type RecheckScope } from "./coverage.js";
import { SETTLE_EXTRA_VOTERS, SETTLE_WINDOW_DAYS, tallyVotes, WORLD_AGREEMENT, type VoteRow } from "./fact-states.js";
import { isPinPosition, worldFactsFromRecords } from "./world-pages.js";

/** The share of settled facts left out of the settled list each week. */
export const SPOT_CHECK_RATE = 0.02;
/** A zone's share for the weeks after a spot check there found a conflicting report. */
export const SPOT_CHECK_BOOSTED_RATE = 0.1;
export const SPOT_CHECK_BOOST_WEEKS = 4;
/** How many weeks, the current one included, a spot-checked fact is watched for a conflicting report. */
export const SPOT_CHECK_LOOKBACK_WEEKS = 4;
export const SPOT_CHECK_SOURCE = "spot-check";

const DAY = 86_400_000;
const WEEK = /^(\d{4})-W(\d{2})$/;

/** The ISO 8601 week of a time, as `2026-W43` (UTC). */
export function isoWeek(at: Date | string): string {
  const d = new Date(typeof at === "string" ? Date.parse(at) : at.getTime());
  if (!Number.isFinite(d.getTime())) throw new Error(`not a time: ${String(at)}`);
  const day = (d.getUTCDay() + 6) % 7; // Monday 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const year = thursday.getUTCFullYear();
  // A week belongs to the year its Thursday is in; week 1 holds that year's first Thursday.
  const week = 1 + Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday 00:00 UTC of an ISO week. */
export function isoWeekStart(week: string): Date {
  const m = WEEK.exec(week);
  if (!m) throw new Error(`not an ISO week: ${week}`);
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
  return new Date(monday + (Number(m[2]) - 1) * 7 * DAY);
}

/** The ISO week `n` weeks after `week` (before, for a negative `n`). */
export function addWeeks(week: string, n: number): string {
  return isoWeek(new Date(isoWeekStart(week).getTime() + n * 7 * DAY));
}

const weeksBetween = (from: string, to: string) => Math.round((isoWeekStart(to).getTime() - isoWeekStart(from).getTime()) / (7 * DAY));

/** A number in [0, 1) from the key and the week: FNV-1a over UTF-16 units, then MurmurHash3's finalizer to spread it. */
export function spotCheckHash(key: string, week: string): number {
  let h = 0x811c9dc5;
  const text = `${key}|${week}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
}

/** The week a spot-check scope was written in, or null for any other scope. */
function scopeWeek(scope: Pick<RecheckScope, "source">): string | null {
  const m = new RegExp(`^${SPOT_CHECK_SOURCE} (\\d{4}-W\\d{2})$`).exec(scope.source);
  return m ? m[1]! : null;
}

/** A zone's rate in `week`: boosted for the four weeks after a spot check there found a conflict, else the base rate. */
export function spotCheckRate(zone: number | null, week: string, scopes: readonly RecheckScope[]): number {
  if (zone === null) return SPOT_CHECK_RATE;
  for (const s of scopes) {
    const found = scopeWeek(s);
    if (found === null || !s.zones?.includes(zone)) continue;
    const after = weeksBetween(found, week);
    if (after >= 1 && after <= SPOT_CHECK_BOOST_WEEKS) return SPOT_CHECK_BOOSTED_RATE;
  }
  return SPOT_CHECK_RATE;
}

/**
 * Whether a settled fact is left out of the settled list in `week`. The settled list calls this for each entry it would
 * write; a boosted zone's pick holds the base pick, since both compare one hash against a rate.
 */
export function isSpotChecked(fact: { key: string; zone: number | null }, week: string, scopes: readonly RecheckScope[] = []): boolean {
  return spotCheckHash(fact.key, week) < spotCheckRate(fact.zone, week, scopes);
}

type Row = VoteRow & { capturedAt: string };
type Placed = { installId: string; x: number; y: number; capturedAt: string };
/** One entity at the settled list's grain, with its fields' rows. */
export interface SpotFact {
  key: string;
  type: Extract<CoverageType, "npcs" | "pins" | "quests" | "vendors">;
  /** The entity's own id: an NPC, a quest or a vendor NPC. */
  id: number;
  /** The released or unreleased map it is counted on, by the coverage score's rule; null when none. */
  zone: number | null;
  fields: Map<string, Row[]>;
  /** Pins only: one position per report. */
  positions?: Placed[];
}

function busiest(installs: Map<number, Set<string>>): number | null {
  let best: number | null = null, size = 0;
  for (const [mapId, set] of [...installs].sort((a, b) => a[0] - b[0])) if (set.size > size) { best = mapId; size = set.size; }
  return best;
}

const timed = (raw: unknown): string | null => {
  const c = raw && typeof raw === "object" ? (raw as { capturedAt?: unknown }).capturedAt : undefined;
  return typeof c === "string" && Number.isFinite(Date.parse(c)) ? c : null;
};

/** The entities a spot check can find a conflict in, from the folded public records. */
export function spotCheckFacts(records: readonly unknown[]): SpotFact[] {
  const facts = new Map<string, SpotFact>();
  const fact = (key: string, type: SpotFact["type"], id: number): SpotFact => {
    const f = facts.get(key) ?? { key, type, id, zone: null, fields: new Map<string, Row[]>() };
    facts.set(key, f);
    return f;
  };
  const vote = (f: SpotFact, field: string, installId: string, value: string | number | undefined, capturedAt: string) => {
    if (value === undefined) return;
    const list = f.fields.get(field) ?? [];
    list.push({ installId, value, capturedAt });
    f.fields.set(field, list);
  };
  const pinMaps = new Map<number, Map<number, Set<string>>>(), anyMaps = new Map<number, Map<number, Set<string>>>();
  const add = (by: Map<number, Map<number, Set<string>>>, npcId: number, mapId: number, installId: string) => {
    const maps = by.get(npcId) ?? new Map<number, Set<string>>();
    maps.set(mapId, (maps.get(mapId) ?? new Set<string>()).add(installId));
    by.set(npcId, maps);
  };
  const quests: { questId: number; giver?: number; turnIn?: number }[] = [];
  const vendors: number[] = [];
  for (const raw of records) {
    const capturedAt = timed(raw);
    if (capturedAt === null) continue;
    const one = worldFactsFromRecords([raw]);
    for (const r of one.npcs) {
      const installId = r.installId.trim();
      if (!installId) continue;
      const f = fact(`npc:${r.npcId}`, "npcs", r.npcId);
      for (const k of ["name", "level", "creatureType", "rank"] as const) vote(f, k, installId, r[k], capturedAt);
      add(anyMaps, r.npcId, r.mapId, installId);
      if (!isPinPosition(r.positionKind) || !Number.isInteger(r.mapId) || r.mapId < 0 || r.x < 0 || r.x > 100 || r.y < 0 || r.y > 100) continue;
      add(pinMaps, r.npcId, r.mapId, installId);
      const pin = fact(`pin:${r.npcId}:${r.mapId}`, "pins", r.npcId);
      pin.zone = r.mapId;
      (pin.positions ??= []).push({ installId, x: r.x, y: r.y, capturedAt });
    }
    for (const r of one.quests) {
      const installId = r.installId.trim();
      if (!installId) continue;
      const f = fact(`quest:${r.questId}`, "quests", r.questId);
      vote(f, "title", installId, r.title, capturedAt); vote(f, "level", installId, r.level, capturedAt);
      vote(f, "giver", installId, r.giverNpcId, capturedAt); vote(f, "turn-in", installId, r.turnInNpcId, capturedAt);
      vote(f, "category", installId, r.category, capturedAt); vote(f, "group-size", installId, r.suggestedGroup, capturedAt);
      vote(f, "tag", installId, r.tag, capturedAt);
      quests.push({ questId: r.questId, giver: r.giverNpcId, turnIn: r.turnInNpcId });
    }
    for (const r of one.vendors) {
      const installId = r.installId.trim();
      if (!installId || !Number.isInteger(r.itemId) || r.itemId < 1 || !Number.isInteger(r.priceCopper) || r.priceCopper < 0) continue;
      const f = fact(`vendor:${r.vendorNpcId}`, "vendors", r.vendorNpcId);
      vote(f, `price:${r.itemId}`, installId, r.priceCopper, capturedAt);
      vote(f, `stock:${r.itemId}`, installId, r.limitedStock ?? 0, capturedAt);
      vendors.push(r.vendorNpcId);
    }
  }
  // Placement mirrors the coverage score: an NPC on the map most installs pinned it on, then any map it was seen on.
  const npcZone = (id: number | undefined) => (id === undefined ? null : busiest(pinMaps.get(id) ?? new Map()) ?? busiest(anyMaps.get(id) ?? new Map()));
  for (const f of facts.values()) if (f.type === "npcs" || f.type === "vendors") f.zone = npcZone(f.id);
  for (const f of facts.values()) if (f.type === "quests") {
    const lead = (k: "giver" | "turn-in") => tallyVotes(f.fields.get(k) ?? []).groups.sort((a, b) => b.voters.size - a.voters.size)[0]?.value as number | undefined;
    f.zone = npcZone(lead("giver")) ?? npcZone(lead("turn-in"));
  }
  return [...facts.values()].sort((a, b) => a.key.localeCompare(b.key, "en", { numeric: true }));
}

const norm = (v: string | number) => (typeof v === "string" ? v.trim().toLowerCase() : v);
const before = <T extends { capturedAt: string }>(rows: readonly T[], cut: number) => rows.filter((r) => Date.parse(r.capturedAt) < cut);
const since = <T extends { capturedAt: string }>(rows: readonly T[], cut: number) => rows.filter((r) => Date.parse(r.capturedAt) >= cut);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Whether a fact was settled when `week` began, and whether a report captured since then conflicts with it: another
 * value for any field, or for a pin a position more than `POSITION_TOLERANCE` map units from the settled median.
 */
export function spotCheckOutcome(f: SpotFact, week: string): { settled: boolean; conflict: boolean } {
  const start = isoWeekStart(week).getTime();
  const asOf = new Date(start).toISOString();
  if (f.positions) {
    const old = before(f.positions, start);
    const by = new Map<string, { x: number[]; y: number[]; first: number }>();
    for (const r of old) {
      const e = by.get(r.installId) ?? { x: [], y: [], first: Infinity };
      e.x.push(r.x); e.y.push(r.y); e.first = Math.min(e.first, Date.parse(r.capturedAt));
      by.set(r.installId, e);
    }
    const each = [...by.values()].map((e) => ({ x: median(e.x), y: median(e.y), first: e.first }));
    const mx = median(each.map((e) => e.x)), my = median(each.map((e) => e.y));
    const third = each.map((e) => e.first).sort((a, b) => a - b)[WORLD_AGREEMENT - 1];
    const settled = each.length >= WORLD_AGREEMENT + SETTLE_EXTRA_VOTERS && third !== undefined && third <= start - SETTLE_WINDOW_DAYS * DAY
      && each.every((e) => Math.hypot(e.x - mx, e.y - my) <= POSITION_TOLERANCE);
    return { settled, conflict: settled && since(f.positions, start).some((r) => Math.hypot(r.x - mx, r.y - my) > POSITION_TOLERANCE) };
  }
  if (!f.fields.size) return { settled: false, conflict: false };
  let conflict = false;
  for (const rows of f.fields.values()) {
    const tally = tallyVotes(before(rows, start), { asOf });
    if (tally.state !== "settled" || !tally.winner) return { settled: false, conflict: false };
    const value = norm(tally.winner.value);
    if (since(rows, start).some((r) => norm(r.value) !== value)) conflict = true;
  }
  return { settled: true, conflict };
}

export interface SpotCheckConflict {
  key: string;
  zone: number | null;
  /** The week the fact was left out of the settled list. */
  checkedIn: string;
  scope: RecheckScope;
}
export interface SpotCheckRun {
  /** The week the check ran for: the current week, the one the settled list picks with. */
  week: string;
  /** Settled entities this week (of the four kinds read here) and how many of them the week leaves out. */
  settled: number;
  checked: number;
  /** Spot-checked facts with a conflicting report, not yet in recheck: each with its new scope. */
  conflicts: SpotCheckConflict[];
}

const sameScope = (a: RecheckScope, b: RecheckScope) => a.type === b.type && JSON.stringify(a.zones ?? null) === JSON.stringify(b.zones ?? null) && JSON.stringify(a.ids ?? null) === JSON.stringify(b.ids ?? null);

/**
 * One week's run over the folded records: how many settled facts the week leaves out, and which facts spot-checked
 * in this week or the three before got a conflicting report since their week began. Each conflict becomes a recheck
 * scope from the start of the week it was checked in, so only reports from then on count for it; the scope names the
 * fact's zone, which is what raises that zone's rate. A fact already under such a scope is not reported again.
 */
export function spotCheckConflicts(records: readonly unknown[], week: string, scopes: readonly RecheckScope[] = []): SpotCheckRun {
  const facts = spotCheckFacts(records);
  let settled = 0, checked = 0;
  const conflicts: SpotCheckConflict[] = [];
  for (const f of facts) {
    if (spotCheckOutcome(f, week).settled) {
      settled += 1;
      if (isSpotChecked(f, week, scopes)) checked += 1;
    }
    for (let back = SPOT_CHECK_LOOKBACK_WEEKS - 1; back >= 0; back -= 1) {
      const checkedIn = addWeeks(week, -back);
      if (!isSpotChecked(f, checkedIn, scopes)) continue;
      const outcome = spotCheckOutcome(f, checkedIn);
      if (!outcome.conflict) continue;
      const scope: RecheckScope = {
        since: isoWeekStart(checkedIn).toISOString(), source: `${SPOT_CHECK_SOURCE} ${week}`, type: f.type,
        ...(f.zone === null ? {} : { zones: [f.zone] }), ids: [f.id], note: `spot-checked in ${checkedIn}`,
      };
      if (!scopes.some((s) => scopeWeek(s) !== null && sameScope(s, scope))) conflicts.push({ key: f.key, zone: f.zone, checkedIn, scope });
      break;
    }
  }
  return { week, settled, checked, conflicts };
}
