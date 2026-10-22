/**
 * The coverage score (docs/design/specs/2026-10-21-coverage-plateau-design.md, sections 1 to 3): how much of what a
 * zone holds players have confirmed and settled, per zone, per type and per field. `coverage = settled / expected`,
 * with `confirmed / expected` beside it, where a zone's denominator is `max(expected, observed)` so a fact new in
 * Forever never pushes a share over 100%.
 *
 * Pure: the folded public records (`publicRecords`), the fact states (`fact-states.ts`, `drop-rate-settling.ts`),
 * the counts-only expected file and the recheck scopes go in; counts come out. The expected file holds counts per
 * zone and type and nothing else (its schema is strict), so no baseline row, name or id can reach the output. The
 * lists of facts that need more voters hold only what players reported, by id, with no value that has not reached
 * three installs.
 */
import { z } from "zod";
import { measureDropRate } from "./drop-rate-settling.js";
import { lootWindowsFromRecords, rollupDrops } from "./drop-rollup.js";
import { SETTLE_EXTRA_VOTERS, SETTLE_WINDOW_DAYS, tallyVotes, WORLD_AGREEMENT, type FactState, type VoteRow } from "./fact-states.js";
import { instanceFactsFromRecords } from "./instances.js";
import { objectSightingRowsFromRecords, objectSpawnRowsFromRecords, objectSpawns, SPAWN_RADIUS } from "./object-spawns.js";
import { isPinPosition, worldFactsFromRecords } from "./world-pages.js";

export const COVERAGE_SCHEMA = "everloot.coverage/1";
export const EXPECTED_SCHEMA = "everloot.coverage-expected/1";
export const RECHECK_SCHEMA = "everloot.recheck/1";
/** Facts that need more voters, listed per zone at most; the count beside the list is the full one. */
export const NEEDS_LIMIT = 200;

/**
 * How far, in map units, every install may stand from a pin's median for the pin to settle: the baseline report's
 * `POSITION_TOLERANCE`. Kept here so the site does not import that local-only module; a test holds them equal.
 */
export const POSITION_TOLERANCE = 5;

export const COVERAGE_TYPES = ["quests", "npcs", "pins", "vendors", "drops", "rares", "entrances", "bosses", "treasures"] as const;
export type CoverageType = (typeof COVERAGE_TYPES)[number];

/**
 * The fields of each type that get a state (spec section 1). `core` fields decide the entity's own state, the one
 * the type's column counts: the lowest state among them, and no better than reported while one has no report.
 * `perEntity` fields have one value per entity, so the type's denominator is theirs too; the others (a quest's
 * rewards, an NPC's roles, a boss's NPC ids) are counted without one.
 */
export const COVERAGE_FIELDS: Record<CoverageType, readonly { field: string; core: boolean; perEntity: boolean }[]> = {
  quests: [
    { field: "title", core: true, perEntity: true }, { field: "level", core: true, perEntity: true },
    { field: "giver", core: true, perEntity: true }, { field: "turn-in", core: true, perEntity: true },
    { field: "reward", core: false, perEntity: false }, { field: "category", core: false, perEntity: true },
    { field: "side", core: false, perEntity: true }, { field: "group size", core: false, perEntity: true },
    { field: "tag", core: false, perEntity: true },
  ],
  npcs: [
    { field: "name", core: true, perEntity: true }, { field: "level", core: false, perEntity: true },
    { field: "creature type", core: false, perEntity: true }, { field: "rank", core: false, perEntity: true },
    { field: "role", core: false, perEntity: false },
  ],
  pins: [{ field: "position", core: true, perEntity: true }],
  vendors: [{ field: "price", core: true, perEntity: true }, { field: "stock", core: false, perEntity: true }],
  drops: [{ field: "rate", core: true, perEntity: true }],
  rares: [{ field: "name", core: true, perEntity: true }, { field: "pin", core: true, perEntity: true }],
  entrances: [{ field: "position", core: true, perEntity: true }, { field: "name", core: false, perEntity: true }, { field: "type", core: false, perEntity: true }],
  bosses: [{ field: "listed", core: true, perEntity: true }, { field: "name", core: false, perEntity: true }, { field: "boss NPC", core: false, perEntity: false }],
  treasures: [{ field: "position", core: true, perEntity: true }, { field: "name", core: false, perEntity: true }],
};

/** How the score is measured, said once wherever it is shown. */
export const COVERAGE_METHOD =
  `A fact is confirmed when ${WORLD_AGREEMENT} installs agree on it and settled when ${WORLD_AGREEMENT + SETTLE_EXTRA_VOTERS} agree, `
  + `the third at least ${SETTLE_WINDOW_DAYS} days ago, with no other value reported since. A pin settles when all ${WORLD_AGREEMENT + SETTLE_EXTRA_VOTERS} `
  + `stood within ${POSITION_TOLERANCE} map units of the median, and a drop rate when its 95% interval is narrow enough. `
  + "Installs that share a Polestar character or address count once. A zone's denominator is the larger of the facts expected there and the facts players reported.";

const count = z.number().int().nonnegative();
const posInt = z.number().int().positive();
const TypeCounts = z.object({
  quests: count.optional(), npcs: count.optional(), pins: count.optional(), vendors: count.optional(), drops: count.optional(),
  rares: count.optional(), entrances: count.optional(), bosses: count.optional(), treasures: count.optional(),
}).strict();

/**
 * `coverage-expected.json`, written by the maintainer's local coverage report and uploaded to the private bucket: how
 * many facts of each type each zone is expected to hold, for one client build. Counts only; strict, so a file that
 * carries anything else (a name, an id list) is refused whole. `types` lists the types the file counts: a type it
 * does not list has no denominator, and a zone it leaves out of a listed type expects none.
 */
export const CoverageExpected = z.object({
  schema: z.literal(EXPECTED_SCHEMA),
  build: z.object({ version: z.string().regex(/^\d+(\.\d+){2,3}$/) }).strict(),
  measuredAt: z.string().datetime({ offset: true }),
  sources: z.array(z.enum(["game-files", "classic-baseline"])).min(1),
  types: z.array(z.enum(COVERAGE_TYPES)).min(1),
  zones: z.record(z.string().regex(/^[1-9]\d*$/), TypeCounts),
}).strict();
export type CoverageExpected = z.infer<typeof CoverageExpected>;

/**
 * One recheck scope in `kb/curated/recheck.json` (spec section 5): facts a patch or a blue post may have changed.
 * A fact is in the scope when it is of `type` (when given), in one of `zones` (when given), and involves one of
 * `ids` (when given: a quest, NPC, item, instance, encounter or object id). Only reports after `since` count for it.
 */
export const RecheckScope = z.object({
  since: z.string().datetime({ offset: true }),
  /** The post's url, or `build-watch <product>-<buildId>`. */
  source: z.string().min(1).max(300),
  type: z.enum(COVERAGE_TYPES).optional(),
  zones: z.array(posInt).optional(),
  ids: z.array(posInt).optional(),
  note: z.string().max(300).optional(),
}).strict().refine((s) => Boolean(s.type || s.zones?.length || s.ids?.length), { message: "a scope names a type, zones or ids" });
export type RecheckScope = z.infer<typeof RecheckScope>;
export const RecheckFile = z.object({ schema: z.literal(RECHECK_SCHEMA), scopes: z.array(RecheckScope) }).strict();
export type RecheckFile = z.infer<typeof RecheckFile>;

export interface CoverageCell {
  /** From the expected file; null when it does not count this type (or there is no file). */
  expected: number | null;
  /** Facts Everloot holds: reported by players, or an entrance the game files place. */
  observed: number;
  /** `max(expected, observed)`; null without an expected count, except entrances, which the game files list. */
  denominator: number | null;
  reported: number;
  recheck: number;
  /** Confirmed or settled. */
  confirmed: number;
  settled: number;
}
export interface FieldCell extends CoverageCell { type: CoverageType; field: string }
/** A reported fact that needs one or two more installs: by id only, never a value fewer than 3 installs agree on. */
export interface CoverageNeed {
  type: CoverageType;
  field: string;
  /** The entity, as the site names it with an id: "Quest 783", "NPC 1234 · item 2589". */
  label: string;
  /** Installs behind the leading value. */
  voters: number;
  /** Installs still needed to confirm it. */
  need: number;
  href: string | null;
}
export interface CoverageArea {
  /** Distinct folded installs behind this area's facts. */
  installs: number;
  types: Record<CoverageType, CoverageCell>;
  fields: FieldCell[];
  needs: CoverageNeed[];
  needsTotal: number;
}
export interface ZoneCoverage extends CoverageArea { mapId: number; name: string }
export interface CoverageReport {
  schema: typeof COVERAGE_SCHEMA;
  /** When the records were current; null when unrecorded. */
  dataAsOf: string | null;
  method: string;
  /** Distinct folded installs behind every counted fact. */
  installs: number;
  expected: { build: string; measuredAt: string; sources: string[]; types: CoverageType[] } | null;
  totals: Record<CoverageType, CoverageCell>;
  zones: ZoneCoverage[];
  /** Facts in no released zone (an NPC seen only inside a dungeon, a quest with no placed giver): never in a denominator. */
  unplaced: CoverageArea;
  /** Where each reported quest and NPC is counted, for the page's search: id to zone (null: unplaced). */
  locate: { quests: [number, number | null][]; npcs: [number, number | null][] };
}

export interface CoverageInput {
  /** Records after `publicRecords`, so Recorder installs are folded. */
  records: readonly unknown[];
  /** Corpus time (ISO); without it nothing settles. */
  asOf: string | null;
  /** The released zones; facts elsewhere are unplaced. */
  zones: readonly { mapId: number; name: string }[];
  /** Zones found only in the game files: their facts are left out entirely. */
  heldBack?: readonly number[];
  /** Entrances the game files place, each with the released zone it lies in. */
  fileEntrances?: readonly { instanceMapIds: readonly number[]; zone: number }[];
  expected?: CoverageExpected | null;
  recheck?: readonly RecheckScope[];
}

type FieldFact = { field: string; state: FactState; leading: number; contested: boolean };
interface Fact {
  type: CoverageType;
  zone: number | null;
  /** Ids a recheck scope can name. */
  refs: number[];
  fields: FieldFact[];
  state: FactState;
  voters: Set<string>;
  label: string;
  href: string | null;
}

const RANK: Record<FactState, number> = { missing: 0, reported: 1, recheck: 2, confirmed: 3, settled: 4 };
const DAY = 86_400_000;
const SETTLE_VOTERS = WORLD_AGREEMENT + SETTLE_EXTRA_VOTERS;

function time(value: unknown): number | null {
  const t = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : null;
}

function emptyCell(): CoverageCell {
  return { expected: null, observed: 0, denominator: null, reported: 0, recheck: 0, confirmed: 0, settled: 0 };
}

/** One scalar field through the shared tally: the states the readers' agreement rule gives. */
function scalar(field: string, rows: readonly VoteRow[], asOf: string | null, since: string | null): FieldFact | null {
  if (!rows.length) return null;
  const tally = tallyVotes(rows, { ...(asOf ? { asOf } : {}), ...(since ? { recheckSince: since } : {}) });
  return { field, state: tally.state, leading: Math.max(0, ...tally.groups.map((g) => g.voters.size)), contested: tally.contested };
}

/** A field that is there or not (a reward, a role, a listed boss): every report is the same value. */
function listed(field: string, rows: readonly { installId: string; capturedAt?: string }[], asOf: string | null, since: string | null): FieldFact | null {
  return scalar(field, rows.map((r) => ({ installId: r.installId, value: "listed", ...(r.capturedAt ? { capturedAt: r.capturedAt } : {}) })), asOf, since);
}

type Placed = { installId: string; x: number; y: number; capturedAt?: string };

/**
 * A position (spec section 1, "Pins"): one position per install, its median; confirmed at 3 installs, settled at 5
 * when every install stood within `radius` of the median and the third reported at least 14 days before `asOf`. A
 * spread pin stays confirmed. With `since`, a pin that was confirmed before it counts only reports after it.
 */
function position(field: string, rows: readonly Placed[], asOf: string | null, since: string | null, radius = POSITION_TOLERANCE): FieldFact | null {
  if (!rows.length) return null;
  const now = time(asOf);
  const at = (r: Placed) => { const t = time(r.capturedAt); return t === null ? null : Math.min(t, now ?? t); };
  const cut = time(since);
  const installs = (list: readonly Placed[]) => new Set(list.map((r) => r.installId.trim()).filter(Boolean)).size;
  const recheck = cut !== null && installs(rows.filter((r) => { const t = at(r); return t !== null && t < cut; })) >= WORLD_AGREEMENT;
  const use = recheck ? rows.filter((r) => { const t = at(r); return t !== null && t > cut!; }) : rows;
  const by = new Map<string, { x: number[]; y: number[]; first: number | null }>();
  for (const r of use) {
    const id = r.installId.trim();
    if (!id) continue;
    const e = by.get(id) ?? { x: [], y: [], first: null };
    e.x.push(r.x); e.y.push(r.y);
    const t = at(r);
    if (t !== null) e.first = Math.min(e.first ?? t, t);
    by.set(id, e);
  }
  const n = by.size;
  if (n < WORLD_AGREEMENT) return { field, state: recheck ? "recheck" : n ? "reported" : "missing", leading: n, contested: false };
  const each = [...by.values()].map((e) => ({ x: median(e.x), y: median(e.y), first: e.first }));
  const mx = median(each.map((e) => e.x)), my = median(each.map((e) => e.y));
  const tight = each.every((e) => Math.hypot(e.x - mx, e.y - my) <= radius);
  const third = each.map((e) => e.first).filter((t): t is number => t !== null).sort((a, b) => a - b)[WORLD_AGREEMENT - 1];
  const settled = n >= SETTLE_VOTERS && tight && now !== null && third !== undefined && third <= now - SETTLE_WINDOW_DAYS * DAY;
  return { field, state: settled ? "settled" : "confirmed", leading: n, contested: false };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A quest's side (spec section 1): Alliance or Horde with 5 of that faction and none of the other, Both with 5 of each. */
function side(rows: readonly { installId: string; faction?: "alliance" | "horde" }[]): FieldFact | null {
  const a = new Set<string>(), h = new Set<string>();
  for (const r of rows) if (r.faction && r.installId.trim()) (r.faction === "alliance" ? a : h).add(r.installId.trim());
  if (!a.size && !h.size) return null;
  const agree = (k: number) => (a.size >= k && h.size === 0) || (h.size >= k && a.size === 0) || (a.size >= k && h.size >= k);
  return { field: "side", state: agree(SETTLE_VOTERS) ? "settled" : agree(WORLD_AGREEMENT) ? "confirmed" : "reported", leading: Math.max(a.size, h.size), contested: false };
}

/** The lowest state among the core fields; no better than reported while a core field has no report. */
function entityState(type: CoverageType, fields: readonly FieldFact[]): FactState {
  const core = COVERAGE_FIELDS[type].filter((f) => f.core).map((f) => f.field);
  const have = fields.filter((f) => core.includes(f.field));
  if (!have.length) return fields.length ? "reported" : "missing";
  const low = have.reduce((min, f) => (RANK[f.state] < RANK[min] ? f.state : min), "settled" as FactState);
  return have.length < core.length && RANK[low] > RANK.reported ? "reported" : low;
}

/** The map with the most installs, ties to the lower id; null for none. */
function busiest(installs: Map<number, Set<string>>): number | null {
  let best: number | null = null, size = 0;
  for (const [mapId, set] of [...installs].sort((a, b) => a[0] - b[0])) if (set.size > size) { best = mapId; size = set.size; }
  return best;
}

function addTo(map: Map<number, Set<string>>, key: number, installId: string) {
  map.set(key, (map.get(key) ?? new Set<string>()).add(installId.trim()));
}

const capturedOf = (raw: unknown): { capturedAt?: string } => {
  const c = raw && typeof raw === "object" ? (raw as { capturedAt?: unknown }).capturedAt : undefined;
  return typeof c === "string" && time(c) !== null ? { capturedAt: c } : {};
};

export function computeCoverage(input: CoverageInput): CoverageReport {
  const asOf = input.asOf && time(input.asOf) !== null ? new Date(time(input.asOf)!).toISOString() : null;
  const released = new Set(input.zones.map((z) => z.mapId));
  const held = new Set(input.heldBack ?? []);
  const scopes = input.recheck ?? [];
  const facts: Fact[] = [];

  // The world rows with their capture times: the readers' own parsing, one record at a time.
  const npcs: (ReturnType<typeof worldFactsFromRecords>["npcs"][number] & { capturedAt?: string })[] = [];
  const quests: (ReturnType<typeof worldFactsFromRecords>["quests"][number] & { capturedAt?: string })[] = [];
  const vendors: (ReturnType<typeof worldFactsFromRecords>["vendors"][number] & { capturedAt?: string })[] = [];
  for (const raw of input.records) {
    const one = worldFactsFromRecords([raw]);
    const at = capturedOf(raw);
    for (const r of one.npcs) npcs.push({ ...r, ...at });
    for (const r of one.quests) quests.push({ ...r, ...at });
    for (const r of one.vendors) vendors.push({ ...r, ...at });
  }

  const groupBy = <T, K>(rows: readonly T[], key: (r: T) => K) => {
    const out = new Map<K, T[]>();
    for (const r of rows) {
      const k = key(r), list = out.get(k);
      if (list) list.push(r); else out.set(k, [r]);
    }
    return out;
  };
  const npcRows = groupBy(npcs.filter((r) => r.installId.trim()), (r) => r.npcId);

  // Where an NPC is counted: the map most installs placed it on (a pin position first, any position after).
  const npcZone = new Map<number, number | null>();
  for (const [npcId, rows] of npcRows) {
    const pinMaps = new Map<number, Set<string>>(), anyMaps = new Map<number, Set<string>>();
    for (const r of rows) { addTo(anyMaps, r.mapId, r.installId); if (isPinPosition(r.positionKind)) addTo(pinMaps, r.mapId, r.installId); }
    npcZone.set(npcId, busiest(pinMaps) ?? busiest(anyMaps));
  }
  const zoneOfNpc = (id: number | null | undefined) => (id === null || id === undefined ? null : npcZone.get(id) ?? null);

  /** The latest scope date that covers a fact, or null. */
  const since = (type: CoverageType, zone: number | null, refs: readonly number[]): string | null => {
    let best: string | null = null;
    for (const s of scopes) {
      if (s.type && s.type !== type) continue;
      if (s.zones?.length && (zone === null || !s.zones.includes(zone))) continue;
      if (s.ids?.length && !refs.some((id) => s.ids!.includes(id))) continue;
      if (best === null || time(s.since)! > time(best)!) best = s.since;
    }
    return best;
  };

  const push = (type: CoverageType, zone: number | null, refs: number[], fields: (FieldFact | null)[], voters: Iterable<string>, label: string, href: string | null) => {
    const kept = fields.filter((f): f is FieldFact => f !== null);
    facts.push({ type, zone, refs, fields: kept, state: entityState(type, kept), voters: new Set([...voters].map((v) => v.trim()).filter(Boolean)), label, href });
  };
  const installsOf = (rows: readonly { installId: string }[]) => rows.map((r) => r.installId);

  // NPCs, their pins, rares.
  for (const [npcId, rows] of npcRows) {
    const zone = zoneOfNpc(npcId);
    const s = since("npcs", zone, [npcId]);
    const vote = <K extends keyof (typeof rows)[number]>(k: K) => rows.filter((r) => r[k] !== undefined).map((r) => ({ installId: r.installId, value: r[k] as unknown as string | number, ...(r.capturedAt ? { capturedAt: r.capturedAt } : {}) }));
    const roles = groupBy(rows.filter((r) => r.positionKind === "interaction" && r.role), (r) => r.role!);
    const name = scalar("name", vote("name"), asOf, s);
    const rank = scalar("rank", vote("rank"), asOf, s);
    push("npcs", zone, [npcId], [
      name, scalar("level", vote("level"), asOf, s), scalar("creature type", vote("creatureType"), asOf, s), rank,
      ...[...roles.values()].map((list) => listed("role", list, asOf, s)),
    ], installsOf(rows), `NPC ${npcId}`, `/database/npcs/${npcId}`);

    const pins: FieldFact[] = [];
    for (const [mapId, list] of groupBy(rows.filter((r) => isPinPosition(r.positionKind) && Number.isInteger(r.mapId) && r.mapId >= 0 && r.x >= 0 && r.x <= 100 && r.y >= 0 && r.y <= 100), (r) => r.mapId)) {
      const pin = position("position", list, asOf, since("pins", mapId, [npcId]));
      if (pin) pins.push(pin);
      push("pins", released.has(mapId) || held.has(mapId) ? mapId : null, [npcId], [pin], installsOf(list), `NPC ${npcId} · map ${mapId}`, `/database/npcs/${npcId}`);
    }
    // A rare is an NPC whose agreed rank is rare or rare elite, or, with no agreed rank yet, one reported as either.
    const rareRank = (v: unknown) => v === "rare" || v === "rare_elite";
    const agreedRank = rank && (rank.state === "confirmed" || rank.state === "settled") ? tallyVotes(vote("rank")).winner?.value : undefined;
    if (agreedRank !== undefined ? rareRank(agreedRank) : rows.some((r) => rareRank(r.rank))) {
      const rs = since("rares", zone, [npcId]);
      const best = pins.reduce<FieldFact | null>((b, p) => (!b || RANK[p.state] > RANK[b.state] ? p : b), null);
      push("rares", zone, [npcId], [scalar("name", vote("name"), asOf, rs), best && { ...best, field: "pin" }], installsOf(rows), `NPC ${npcId}`, `/database/npcs/${npcId}`);
    }
  }

  // Quests, counted where their giver (or turn-in) NPC is.
  for (const [questId, rows] of groupBy(quests.filter((r) => r.installId.trim()), (r) => r.questId)) {
    const at = (r: (typeof rows)[number]) => (r.capturedAt ? { capturedAt: r.capturedAt } : {});
    const ids = (k: "giverNpcId" | "turnInNpcId") => rows.filter((r) => r[k] !== undefined).map((r) => ({ installId: r.installId, value: r[k]!, ...at(r) }));
    const lead = (list: VoteRow[]) => tallyVotes(list).groups.sort((a, b) => b.voters.size - a.voters.size)[0]?.value as number | undefined;
    const zone = zoneOfNpc(lead(ids("giverNpcId"))) ?? zoneOfNpc(lead(ids("turnInNpcId")));
    const s = since("quests", zone, [questId]);
    const rewards = new Map<number, typeof rows>();
    for (const r of rows) for (const item of new Set(r.rewardItemIds)) {
      if (!Number.isInteger(item) || item < 1) continue;
      const list = rewards.get(item);
      if (list) list.push(r); else rewards.set(item, [r]);
    }
    const text = (k: "title" | "category" | "tag") => rows.filter((r) => r[k] !== undefined).map((r) => ({ installId: r.installId, value: r[k]!, ...at(r) }));
    push("quests", zone, [questId, ...rewards.keys()], [
      scalar("title", text("title"), asOf, s), scalar("level", rows.map((r) => ({ installId: r.installId, value: r.level, ...at(r) })), asOf, s),
      scalar("giver", ids("giverNpcId"), asOf, s), scalar("turn-in", ids("turnInNpcId"), asOf, s),
      ...[...rewards.values()].map((list) => listed("reward", list, asOf, s)),
      scalar("category", text("category"), asOf, s), side(rows),
      scalar("group size", rows.filter((r) => r.suggestedGroup !== undefined).map((r) => ({ installId: r.installId, value: r.suggestedGroup!, ...at(r) })), asOf, s),
      scalar("tag", text("tag"), asOf, s),
    ], installsOf(rows), `Quest ${questId}`, `/database/quests/${questId}`);
  }

  // Vendor offers: one fact per vendor and item.
  for (const [, rows] of groupBy(vendors.filter((r) => r.installId.trim() && Number.isInteger(r.itemId) && r.itemId > 0 && Number.isInteger(r.priceCopper) && r.priceCopper >= 0), (r) => `${r.vendorNpcId}|${r.itemId}`)) {
    const { vendorNpcId, itemId } = rows[0]!;
    const zone = zoneOfNpc(vendorNpcId);
    const s = since("vendors", zone, [vendorNpcId, itemId]);
    const at = (r: (typeof rows)[number]) => (r.capturedAt ? { capturedAt: r.capturedAt } : {});
    // Stock 0 stands for "not limited", as a row without a limit says.
    push("vendors", zone, [vendorNpcId, itemId], [
      scalar("price", rows.map((r) => ({ installId: r.installId, value: r.priceCopper, ...at(r) })), asOf, s),
      scalar("stock", rows.map((r) => ({ installId: r.installId, value: r.limitedStock ?? 0, ...at(r) })), asOf, s),
    ], installsOf(rows), `NPC ${vendorNpcId} · item ${itemId}`, `/database/vendors/${vendorNpcId}`);
  }

  // Drop rates: the merged settling rule over the loot-api windows the public rates read.
  const windows = lootWindowsFromRecords(input.records as unknown[]);
  const objectRows = [...objectSpawnRowsFromRecords(input.records as unknown[]), ...objectSightingRowsFromRecords(input.records as unknown[])];
  const objectMaps = new Map<number, Map<number, Set<string>>>();
  for (const r of objectRows) if (typeof r.mapId === "number") {
    const maps = objectMaps.get(r.objectId) ?? new Map<number, Set<string>>();
    addTo(maps, r.mapId, r.installId);
    objectMaps.set(r.objectId, maps);
  }
  const sourceInstalls = new Map<string, Set<string>>();
  for (const w of windows) {
    const key = w.sourceNpcId !== undefined ? `npc:${w.sourceNpcId}` : `obj:${w.sourceObjectId}`;
    sourceInstalls.set(key, (sourceInstalls.get(key) ?? new Set<string>()).add(w.installId));
  }
  for (const rate of rollupDrops(windows).rates) {
    const npc = rate.sourceNpcId !== undefined;
    const sourceId = (rate.sourceNpcId ?? rate.sourceObjectId)!;
    const zone = npc ? zoneOfNpc(sourceId) : busiest(objectMaps.get(sourceId) ?? new Map());
    const settled = rate.public && measureDropRate(rate, asOf ?? "").settled;
    push("drops", zone, [sourceId, rate.itemId], [{ field: "rate", state: settled ? "settled" : rate.public ? "confirmed" : "reported", leading: rate.reporters, contested: false }],
      sourceInstalls.get(`${npc ? "npc" : "obj"}:${sourceId}`) ?? [], `${npc ? "NPC" : "Object"} ${sourceId} · item ${rate.itemId}`,
      npc ? `/database/npcs/${sourceId}` : `/database/objects/${sourceId}`);
  }

  // Dungeon entrances and bosses.
  const instances = instanceFactsFromRecords(input.records as unknown[]);
  const entranceRows = groupBy(instances.entrances, (r) => r.instanceMapId);
  const instanceZone = new Map<number, number | null>();
  const entrance = (ids: readonly number[], zone: number | null) => {
    const rows = ids.flatMap((id) => entranceRows.get(id) ?? []);
    const maps = new Map<number, Set<string>>();
    for (const r of rows) addTo(maps, r.mapId, r.installId);
    const map = busiest(maps);
    const where = zone ?? map;
    for (const id of ids) instanceZone.set(id, where);
    const s = since("entrances", where, [...ids]);
    const vote = (k: "name" | "instanceType") => rows.map((r) => ({ installId: r.installId, value: r[k], ...(r.capturedAt ? { capturedAt: r.capturedAt } : {}) }));
    push("entrances", where, [...ids], [
      map === null ? null : position("position", rows.filter((r) => r.mapId === map), asOf, s), scalar("name", vote("name"), asOf, s), scalar("type", vote("instanceType"), asOf, s),
    ], installsOf(rows), `Instance ${ids[0]}`, `/database/instances/${ids[0]}`);
  };
  const filed = new Set<number>();
  for (const e of input.fileEntrances ?? []) {
    for (const id of e.instanceMapIds) filed.add(id);
    entrance(e.instanceMapIds, e.zone);
  }
  for (const id of entranceRows.keys()) if (!filed.has(id)) entrance([id], null);
  for (const [, rows] of groupBy(instances.encounters, (r) => `${r.instanceMapId}|${r.encounterId}`)) {
    const { instanceMapId, encounterId } = rows[0]!;
    const zone = instanceZone.get(instanceMapId) ?? null;
    const s = since("bosses", zone, [instanceMapId, encounterId]);
    const npcVotes = new Map<number, typeof rows>();
    for (const r of rows) for (const id of r.npcIds) {
      const list = npcVotes.get(id);
      if (list) list.push(r); else npcVotes.set(id, [r]);
    }
    push("bosses", zone, [instanceMapId, encounterId, ...npcVotes.keys()], [
      listed("listed", rows, asOf, s), scalar("name", rows.map((r) => ({ installId: r.installId, value: r.name, ...(r.capturedAt ? { capturedAt: r.capturedAt } : {}) })), asOf, s),
      ...[...npcVotes.values()].map((list) => listed("boss NPC", list, asOf, s)),
    ], installsOf(rows), `Instance ${instanceMapId} · encounter ${encounterId}`, `/database/instances/${instanceMapId}`);
  }

  // Treasures: objects seen on the minimap, one fact per spawn cluster, as the treasure pins are drawn.
  const sightings = objectSightingRowsFromRecords(input.records as unknown[]);
  const spawns = objectSpawns(sightings, [], asOf ? new Date(asOf) : undefined);
  const sightingsOf = groupBy(sightings, (r) => r.objectId);
  for (const pin of spawns.pins) {
    const all = sightingsOf.get(pin.objectId) ?? [];
    const near = all.filter((r) => r.mapId === pin.mapId && Math.hypot((r.x ?? -99) - pin.x, (r.y ?? -99) - pin.y) <= SPAWN_RADIUS) as Placed[];
    const s = since("treasures", pin.mapId, [pin.objectId]);
    const at = position("position", near, asOf, s, SPAWN_RADIUS);
    // The cluster rule already holds 3 installs; a radius check that sees fewer leaves the pin confirmed, not settled.
    const pos: FieldFact = at && RANK[at.state] >= RANK.confirmed ? at : { field: "position", state: "confirmed", leading: pin.reporters, contested: false };
    const names = all.filter((r) => r.name !== undefined).map((r) => ({ installId: r.installId, value: r.name!, ...(r.capturedAt ? { capturedAt: r.capturedAt } : {}) }));
    push("treasures", pin.mapId, [pin.objectId], [pos, scalar("name", names, asOf, s)], installsOf(near), `Object ${pin.objectId}`, `/database/objects/${pin.objectId}`);
  }
  for (const u of spawns.unconfirmed) {
    const rows = (sightingsOf.get(u.objectId) ?? []).filter((r) => r.mapId === u.mapId);
    // A cluster under 3 installs is a count, never a place: reported, with no voter number to show.
    for (let i = 0; i < u.clusters; i += 1) push("treasures", u.mapId, [u.objectId], [{ field: "position", state: "reported", leading: 0, contested: false }], installsOf(rows), `Object ${u.objectId}`, `/database/objects/${u.objectId}`);
  }

  return summarize(facts, input, asOf, released, held);
}

function summarize(facts: Fact[], input: CoverageInput, asOf: string | null, released: Set<number>, held: Set<number>): CoverageReport {
  const expected = input.expected ?? null;
  const counted = new Set(expected?.types ?? []);
  const expectedFor = (zone: number, type: CoverageType): number | null =>
    expected && counted.has(type) ? expected.zones[String(zone)]?.[type] ?? 0 : null;

  // Held-back zones are left out entirely; anything outside a released zone is unplaced.
  const shown = facts.filter((f) => f.zone === null || !held.has(f.zone));
  const area = (list: Fact[], zone: number | null): CoverageArea => {
    const types = Object.fromEntries(COVERAGE_TYPES.map((t) => [t, emptyCell()])) as Record<CoverageType, CoverageCell>;
    const fieldCells = new Map<string, FieldCell>();
    const voters = new Set<string>();
    const needs: CoverageNeed[] = [];
    const tally = (cell: CoverageCell, state: FactState) => {
      cell.observed += 1;
      if (state === "reported") cell.reported += 1;
      if (state === "recheck") cell.recheck += 1;
      if (state === "confirmed" || state === "settled") cell.confirmed += 1;
      if (state === "settled") cell.settled += 1;
    };
    for (const f of list) {
      for (const v of f.voters) voters.add(v);
      tally(types[f.type], f.state);
      for (const field of f.fields) {
        const key = `${f.type}|${field.field}`;
        const cell = fieldCells.get(key) ?? { ...emptyCell(), type: f.type, field: field.field };
        tally(cell, field.state);
        fieldCells.set(key, cell);
        const short = field.state === "reported" || field.state === "recheck";
        if (short && !field.contested && field.leading >= 1 && field.leading < WORLD_AGREEMENT) {
          needs.push({ type: f.type, field: field.field, label: f.label, voters: field.leading, need: WORLD_AGREEMENT - field.leading, href: f.href });
        }
      }
    }
    for (const t of COVERAGE_TYPES) {
      const cell = types[t];
      cell.expected = zone === null ? null : expectedFor(zone, t);
      cell.denominator = zone === null ? null : cell.expected !== null ? Math.max(cell.expected, cell.observed) : t === "entrances" ? cell.observed : null;
    }
    const order = new Map(COVERAGE_TYPES.flatMap((t) => COVERAGE_FIELDS[t].map((f, i) => [`${t}|${f.field}`, COVERAGE_TYPES.indexOf(t) * 100 + i] as const)));
    const fields = [...fieldCells.values()].sort((a, b) => (order.get(`${a.type}|${a.field}`) ?? 0) - (order.get(`${b.type}|${b.field}`) ?? 0));
    for (const cell of fields) {
      const perEntity = COVERAGE_FIELDS[cell.type].find((f) => f.field === cell.field)?.perEntity ?? false;
      cell.expected = perEntity ? types[cell.type].expected : null;
      cell.denominator = perEntity && types[cell.type].denominator !== null ? Math.max(types[cell.type].denominator!, cell.observed) : null;
    }
    // The closest first: one more install before two, then by type and label.
    needs.sort((a, b) => a.need - b.need || COVERAGE_TYPES.indexOf(a.type) - COVERAGE_TYPES.indexOf(b.type) || a.label.localeCompare(b.label, "en", { numeric: true }) || a.field.localeCompare(b.field));
    return { installs: voters.size, types, fields, needs: needs.slice(0, NEEDS_LIMIT), needsTotal: needs.length };
  };

  const zones = input.zones.filter((z) => !held.has(z.mapId)).map((z): ZoneCoverage => ({
    mapId: z.mapId, name: z.name, ...area(shown.filter((f) => f.zone === z.mapId), z.mapId),
  })).sort((a, b) => a.mapId - b.mapId);
  const unplaced = area(shown.filter((f) => f.zone === null || !released.has(f.zone)), null);

  const totals = Object.fromEntries(COVERAGE_TYPES.map((t) => {
    const cells = zones.map((z) => z.types[t]);
    const sum = (k: keyof CoverageCell) => cells.reduce((n, c) => n + (c[k] ?? 0), 0);
    const known = cells.every((c) => c.denominator !== null);
    return [t, {
      expected: cells.every((c) => c.expected !== null) && cells.length ? sum("expected") : null,
      observed: sum("observed"), denominator: known && cells.length ? sum("denominator") : null,
      reported: sum("reported"), recheck: sum("recheck"), confirmed: sum("confirmed"), settled: sum("settled"),
    } satisfies CoverageCell];
  })) as Record<CoverageType, CoverageCell>;

  const installs = new Set(shown.flatMap((f) => [...f.voters])).size;
  const locate = (type: "quests" | "npcs") => shown.filter((f) => f.type === type)
    .map((f): [number, number | null] => [f.refs[0]!, f.zone !== null && released.has(f.zone) ? f.zone : null]).sort((a, b) => a[0] - b[0]);
  return {
    schema: COVERAGE_SCHEMA, dataAsOf: asOf, method: COVERAGE_METHOD, installs,
    expected: expected && { build: expected.build.version, measuredAt: expected.measuredAt, sources: [...expected.sources], types: [...expected.types] },
    totals, zones, unplaced, locate: { quests: locate("quests"), npcs: locate("npcs") },
  };
}

/** `settled / denominator` and `confirmed / denominator` as fractions, null without a denominator (shown `[?]`). */
export function coverageShares(cell: Pick<CoverageCell, "denominator" | "confirmed" | "settled">): { settled: number | null; confirmed: number | null } {
  const d = cell.denominator;
  if (d === null || d === 0) return { settled: null, confirmed: null };
  return { settled: Math.min(1, cell.settled / d), confirmed: Math.min(1, cell.confirmed / d) };
}

/** The expected file, or null when it is missing, malformed, carries anything but counts, or is for another build. */
export function parseCoverageExpected(raw: unknown, build?: string): CoverageExpected | null {
  const parsed = CoverageExpected.safeParse(raw);
  if (!parsed.success) return null;
  return build === undefined || parsed.data.build.version === build ? parsed.data : null;
}
