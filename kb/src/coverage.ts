/**
 * The coverage score (docs/design/specs/2026-10-21-coverage-plateau-design.md, sections 1 to 3): how much of what a
 * zone holds players have confirmed and settled, per zone, per type and per field. `coverage = settled / expected`,
 * with `confirmed / expected` beside it, where a zone's denominator is `max(expected, observed)` so a fact new in
 * Forever never pushes a share over 100%.
 *
 * A fact is one field of one entity (a quest's turn-in, an NPC's level, a pin's position), the grain the maintainer's
 * coverage report (`coverage-report.ts`) counts its expected facts in, so the numerator and the denominator count the
 * same thing: a type's cell counts every field fact of that type, and a field's cell that field's facts.
 *
 * Pure: the folded public records (`publicRecords`), the fact states (`fact-states.ts`, `drop-rate-settling.ts`),
 * the counts-only expected file and the recheck scopes go in; counts come out. The expected file is parsed strictly
 * (counts under known zone, type and field keys, nothing else), so no baseline row, name or id can reach the
 * output. The lists of facts that need more voters hold only what players reported, by id, with no value fewer than
 * three installs agree on.
 */
import { z } from "zod";
import { measureDropRate } from "./drop-rate-settling.js";
import { lootRecheckSince, lootWindowsFromRecords, recheckLootRecords, rollupDrops } from "./drop-rollup.js";
import { SETTLE_EXTRA_VOTERS, SETTLE_WINDOW_DAYS, tallyVotes, WORLD_AGREEMENT, type FactState, type VoteRow } from "./fact-states.js";
import { instanceFactsFromRecords } from "./instances.js";
import { objectSightingRowsFromRecords, objectSpawnRowsFromRecords, objectSpawns, SPAWN_RADIUS } from "./object-spawns.js";
import { busiestMap as busiest, npcZones, scopeSince } from "./recheck-scopes.js";
import { isPinPosition, sideRows, worldFactsFromRecords } from "./world-pages.js";

export const COVERAGE_SCHEMA = "everloot.coverage/1";
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

/** Each type's key in the expected file (`coverage-report.ts`'s `COVERAGE_TYPES`). */
export const EXPECTED_TYPE: Record<CoverageType, string> = {
  quests: "quest", npcs: "npc", pins: "npc_pin", vendors: "vendor", drops: "drop", rares: "rare", entrances: "entrance", bosses: "boss", treasures: "treasure",
};

/**
 * The fields of each type that get a state (spec section 1), by the expected file's field key, with the words the
 * page shows. A quest's rewards, an NPC's roles and a boss's NPC ids are one fact per reward, role or NPC.
 */
export const COVERAGE_FIELDS: Record<CoverageType, readonly { field: string; label: string }[]> = {
  quests: [
    { field: "title", label: "title" }, { field: "level", label: "level" }, { field: "giver", label: "giver" }, { field: "turn-in", label: "turn-in" },
    { field: "reward", label: "reward" }, { field: "category", label: "category" }, { field: "side", label: "side" },
    { field: "group-size", label: "group size" }, { field: "tag", label: "tag" },
  ],
  npcs: [
    { field: "name", label: "name" }, { field: "level", label: "level" }, { field: "creatureType", label: "creature type" },
    { field: "rank", label: "rank" }, { field: "role", label: "role" },
  ],
  pins: [{ field: "position", label: "position" }],
  vendors: [{ field: "price", label: "price" }, { field: "stock", label: "stock" }],
  drops: [{ field: "rate", label: "rate" }],
  rares: [{ field: "name", label: "name" }, { field: "position", label: "pin" }],
  entrances: [{ field: "position", label: "position" }, { field: "name", label: "name" }, { field: "instanceType", label: "type" }],
  bosses: [{ field: "listed", label: "listed" }, { field: "name", label: "name" }, { field: "npc", label: "boss NPC" }],
  treasures: [{ field: "position", label: "position" }, { field: "name", label: "name" }],
};
const FIELD_KEYS = [...new Set(Object.values(COVERAGE_FIELDS).flatMap((list) => list.map((f) => f.field)))] as [string, ...string[]];
export const fieldLabel = (type: CoverageType, field: string): string => COVERAGE_FIELDS[type].find((f) => f.field === field)?.label ?? field;

/** How the score is measured, said once wherever it is shown. */
export const COVERAGE_METHOD =
  `A fact is one field of one entity, such as a quest's turn-in or an NPC's level. It is confirmed when ${WORLD_AGREEMENT} installs agree on it and settled when `
  + `${WORLD_AGREEMENT + SETTLE_EXTRA_VOTERS} agree, the third at least ${SETTLE_WINDOW_DAYS} days ago, with no other value reported since. A pin settles when `
  + `all ${WORLD_AGREEMENT + SETTLE_EXTRA_VOTERS} stood within ${POSITION_TOLERANCE} map units of the median, and a drop rate when its 95% interval is narrow enough. `
  + "Installs that share a Polestar character or address count once. A zone's denominator is the larger of the facts expected there and the facts players reported.";

const count = z.number().int().nonnegative();
const typeKey = z.enum(Object.values(EXPECTED_TYPE) as [string, ...string[]]);

/**
 * `coverage-expected.json`, written by the maintainer's coverage report (`coverage-report.ts`) and uploaded to the
 * private bucket's build folder: how many entity fields of each type, and of each field, each zone is expected to
 * hold. Counts only; strict, so a file that carries anything else (a name, an id, an unknown key) is refused whole.
 * Zones are UiMap ids, Area ids (`area:N`) or `unplaced`; only released UiMap zones are read.
 */
export const CoverageExpected = z.object({
  version: z.literal(1),
  /** When the counts were made; the report does not write it yet, and the page then says `[?]`. */
  dataAsOf: z.string().datetime({ offset: true }).nullable().optional(),
  zones: z.array(z.object({
    zone: z.string().regex(/^([1-9]\d*|area:\d+|unplaced)$/),
    types: z.partialRecord(typeKey, count),
    fields: z.partialRecord(typeKey, z.partialRecord(z.enum(FIELD_KEYS), count)),
  }).strict()),
}).strict();
export type CoverageExpected = z.infer<typeof CoverageExpected>;

/**
 * One recheck scope in `kb/curated/recheck.json` (spec section 5): facts a patch or a blue post may have changed.
 * A fact is in the scope when it is of `type` (when given), in one of `zones` (when given), and involves one of
 * `ids` (when given: a quest, NPC, item, instance, encounter or object id). Only reports after `since` count for it.
 * The match is `scopeSince` in recheck-scopes.ts, shared with the internal report and the public readers.
 */
export const RecheckScope = z.object({
  since: z.string().datetime({ offset: true }),
  /** The post's url, or `build-watch <product>-<buildId>`. */
  source: z.string().min(1).max(300),
  type: z.enum(COVERAGE_TYPES).optional(),
  zones: z.array(z.number().int().positive()).optional(),
  ids: z.array(z.number().int().positive()).optional(),
  note: z.string().max(300).optional(),
}).strict().refine((s) => Boolean(s.type || s.zones?.length || s.ids?.length), { message: "a scope names a type, zones or ids" });
export type RecheckScope = z.infer<typeof RecheckScope>;
export const RecheckFile = z.object({ schema: z.literal(RECHECK_SCHEMA), scopes: z.array(RecheckScope) }).strict();
export type RecheckFile = z.infer<typeof RecheckFile>;

export interface CoverageCell {
  /** From the expected file; null without one. */
  expected: number | null;
  /** Field facts Everloot holds: reported by players, or an entrance the game files place. */
  observed: number;
  /** `max(expected, observed)`; null without an expected file, except entrances, which the game files list. */
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
  /** The client build the score is for, when the caller names it. */
  build: string | null;
  /** When the records were current; null when unrecorded. */
  dataAsOf: string | null;
  method: string;
  /** Distinct folded installs behind every counted fact. */
  installs: number;
  /** The expected file's own date (null when it carries none); null for the whole field without a file. */
  expected: { dataAsOf: string | null } | null;
  /** The released zones together; unplaced facts and held-back zones are never in them. */
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
  /** Corpus time (ISO): the time of the last real change. Without it nothing settles. */
  asOf: string | null;
  build?: string;
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
  /** Ids a recheck scope can name; the first is the entity's own. */
  refs: number[];
  fields: FieldFact[];
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

const missing = (field: string): FieldFact => ({ field, state: "missing", leading: 0, contested: false });

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
function position(rows: readonly Placed[], asOf: string | null, since: string | null, radius = POSITION_TOLERANCE): FieldFact | null {
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
  if (n < WORLD_AGREEMENT) return { field: "position", state: recheck ? "recheck" : n ? "reported" : "missing", leading: n, contested: false };
  const each = [...by.values()].map((e) => ({ x: median(e.x), y: median(e.y), first: e.first }));
  const mx = median(each.map((e) => e.x)), my = median(each.map((e) => e.y));
  const tight = each.every((e) => Math.hypot(e.x - mx, e.y - my) <= radius);
  const third = each.map((e) => e.first).filter((t): t is number => t !== null).sort((a, b) => a - b)[WORLD_AGREEMENT - 1];
  const settled = n >= SETTLE_VOTERS && tight && now !== null && third !== undefined && third <= now - SETTLE_WINDOW_DAYS * DAY;
  return { field: "position", state: settled ? "settled" : "confirmed", leading: n, contested: false };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * A quest's side (spec section 1): Alliance or Horde with 5 of that faction and none of the other, Both with 5 of each.
 * With `since`, a side given before it counts only reports after it (`sideRows`).
 */
function side(rows: readonly { installId: string; faction?: "alliance" | "horde"; capturedAt?: string }[], asOf: string | null, since: string | null): FieldFact | null {
  if (!rows.some((r) => r.faction && r.installId.trim())) return null;
  const counted = sideRows(rows, since, asOf);
  const a = new Set<string>(), h = new Set<string>();
  for (const r of counted.rows) if (r.faction && r.installId.trim()) (r.faction === "alliance" ? a : h).add(r.installId.trim());
  const agree = (k: number) => (a.size >= k && h.size === 0) || (h.size >= k && a.size === 0) || (a.size >= k && h.size >= k);
  const state = agree(SETTLE_VOTERS) ? "settled" : agree(WORLD_AGREEMENT) ? "confirmed" : counted.recheck ? "recheck" : "reported";
  return { field: "side", state, leading: Math.max(a.size, h.size), contested: false };
}

function addTo(map: Map<number, Set<string>>, key: number, installId: string) {
  map.set(key, (map.get(key) ?? new Set<string>()).add(installId.trim()));
}

function groupBy<T, K>(rows: readonly T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r), list = out.get(k);
    if (list) list.push(r); else out.set(k, [r]);
  }
  return out;
}

const capturedOf = (raw: unknown): { capturedAt?: string } => {
  const c = raw && typeof raw === "object" ? (raw as { capturedAt?: unknown }).capturedAt : undefined;
  return typeof c === "string" && time(c) !== null ? { capturedAt: c } : {};
};
const at = (r: { capturedAt?: string }) => (r.capturedAt ? { capturedAt: r.capturedAt } : {});

export function computeCoverage(input: CoverageInput): CoverageReport {
  const asOf = input.asOf && time(input.asOf) !== null ? new Date(time(input.asOf)!).toISOString() : null;
  const released = new Set(input.zones.map((z) => z.mapId));
  const held = new Set(input.heldBack ?? []);
  const scopes = input.recheck ?? [];
  const facts: Fact[] = [];

  // The world rows with their capture times: the readers' own parsing, one record at a time.
  type World = ReturnType<typeof worldFactsFromRecords>;
  const npcs: (World["npcs"][number] & { capturedAt?: string })[] = [];
  const quests: (World["quests"][number] & { capturedAt?: string })[] = [];
  const vendors: (World["vendors"][number] & { capturedAt?: string })[] = [];
  for (const raw of input.records) {
    const one = worldFactsFromRecords([raw]);
    const when = capturedOf(raw);
    for (const r of one.npcs) npcs.push({ ...r, ...when });
    for (const r of one.quests) quests.push({ ...r, ...when });
    for (const r of one.vendors) vendors.push({ ...r, ...when });
  }
  const npcRows = groupBy(npcs.filter((r) => r.installId.trim()), (r) => r.npcId);

  // Where an NPC is counted: the map most installs placed it on (a pin position first, any position after).
  const npcZone = npcZones([...npcRows.values()].flat().map((r) => ({ npcId: r.npcId, mapId: r.mapId, installId: r.installId, pin: isPinPosition(r.positionKind) })));
  const zoneOfNpc = (id: number | null | undefined) => (id === null || id === undefined ? null : npcZone.get(id) ?? null);

  /** The latest scope date that covers a fact, or null. */
  const since = (type: CoverageType, zone: number | null, refs: readonly number[]): string | null => scopeSince(scopes, { types: [type], zones: [zone], ids: refs });

  const push = (type: CoverageType, zone: number | null, refs: number[], fields: (FieldFact | null)[], voters: Iterable<string>, label: string, href: string | null) => {
    facts.push({ type, zone, refs, fields: fields.filter((f): f is FieldFact => f !== null), voters: new Set([...voters].map((v) => v.trim()).filter(Boolean)), label, href });
  };
  const installsOf = (rows: readonly { installId: string }[]) => rows.map((r) => r.installId);

  // NPCs, their pins, rares.
  for (const [npcId, rows] of npcRows) {
    const zone = zoneOfNpc(npcId);
    const s = since("npcs", zone, [npcId]);
    const vote = (k: "name" | "level" | "creatureType" | "rank") => rows.flatMap((r) => (r[k] === undefined ? [] : [{ installId: r.installId, value: r[k]!, ...at(r) }]));
    const roles = groupBy(rows.filter((r) => r.positionKind === "interaction" && r.role), (r) => r.role!);
    const rank = scalar("rank", vote("rank"), asOf, s);
    push("npcs", zone, [npcId], [
      scalar("name", vote("name"), asOf, s), scalar("level", vote("level"), asOf, s), scalar("creatureType", vote("creatureType"), asOf, s), rank,
      ...[...roles.values()].map((list) => listed("role", list, asOf, s)),
    ], installsOf(rows), `NPC ${npcId}`, `/database/npcs/${npcId}`);

    const pinRows = groupBy(rows.filter((r) => isPinPosition(r.positionKind) && Number.isInteger(r.mapId) && r.mapId >= 0 && r.x >= 0 && r.x <= 100 && r.y >= 0 && r.y <= 100), (r) => r.mapId);
    for (const [mapId, list] of pinRows) {
      push("pins", released.has(mapId) || held.has(mapId) ? mapId : null, [npcId], [position(list, asOf, since("pins", mapId, [npcId]))], installsOf(list), `NPC ${npcId} · map ${mapId}`, `/database/npcs/${npcId}`);
    }
    // A rare is an NPC whose agreed rank is rare or rare elite, or, with no agreed rank yet, one reported as either.
    // Like the report, its name is one fact and each map's pin another.
    const rareRank = (v: unknown) => v === "rare" || v === "rare_elite";
    const agreedRank = rank && RANK[rank.state] >= RANK.confirmed ? tallyVotes(vote("rank")).winner?.value : undefined;
    if (agreedRank !== undefined ? rareRank(agreedRank) : rows.some((r) => rareRank(r.rank))) {
      push("rares", zone, [npcId], [scalar("name", vote("name"), asOf, since("rares", zone, [npcId]))], installsOf(rows), `NPC ${npcId}`, `/database/npcs/${npcId}`);
      for (const [mapId, list] of pinRows) {
        push("rares", released.has(mapId) || held.has(mapId) ? mapId : null, [npcId], [position(list, asOf, since("rares", mapId, [npcId]))], installsOf(list), `NPC ${npcId} · map ${mapId}`, `/database/npcs/${npcId}`);
      }
    }
  }

  // Quests, counted where their giver (or turn-in) NPC is.
  for (const [questId, rows] of groupBy(quests.filter((r) => r.installId.trim()), (r) => r.questId)) {
    const ids = (k: "giverNpcId" | "turnInNpcId") => rows.flatMap((r) => (r[k] === undefined ? [] : [{ installId: r.installId, value: r[k]!, ...at(r) }]));
    const lead = (list: VoteRow[]) => tallyVotes(list).groups.sort((a, b) => b.voters.size - a.voters.size)[0]?.value as number | undefined;
    const zone = zoneOfNpc(lead(ids("giverNpcId"))) ?? zoneOfNpc(lead(ids("turnInNpcId")));
    const s = since("quests", zone, [questId]);
    const rewards = new Map<number, typeof rows>();
    for (const r of rows) for (const item of new Set(r.rewardItemIds)) {
      if (!Number.isInteger(item) || item < 1) continue;
      const list = rewards.get(item);
      if (list) list.push(r); else rewards.set(item, [r]);
    }
    const text = (k: "title" | "category" | "tag") => rows.flatMap((r) => (r[k] === undefined ? [] : [{ installId: r.installId, value: r[k]!, ...at(r) }]));
    push("quests", zone, [questId, ...rewards.keys()], [
      scalar("title", text("title"), asOf, s), scalar("level", rows.map((r) => ({ installId: r.installId, value: r.level, ...at(r) })), asOf, s),
      scalar("giver", ids("giverNpcId"), asOf, s), scalar("turn-in", ids("turnInNpcId"), asOf, s),
      ...[...rewards.values()].map((list) => listed("reward", list, asOf, s)),
      scalar("category", text("category"), asOf, s), side(rows, asOf, s),
      scalar("group-size", rows.flatMap((r) => (r.suggestedGroup === undefined ? [] : [{ installId: r.installId, value: r.suggestedGroup, ...at(r) }])), asOf, s),
      scalar("tag", text("tag"), asOf, s),
    ], installsOf(rows), `Quest ${questId}`, `/database/quests/${questId}`);
  }

  // Vendor offers: one entity per vendor and item.
  for (const [, rows] of groupBy(vendors.filter((r) => r.installId.trim() && Number.isInteger(r.itemId) && r.itemId > 0 && Number.isInteger(r.priceCopper) && r.priceCopper >= 0), (r) => `${r.vendorNpcId}|${r.itemId}`)) {
    const { vendorNpcId, itemId } = rows[0]!;
    const zone = zoneOfNpc(vendorNpcId);
    const s = since("vendors", zone, [vendorNpcId, itemId]);
    // Stock 0 stands for "not limited", as a row without a limit says.
    push("vendors", zone, [vendorNpcId, itemId], [
      scalar("price", rows.map((r) => ({ installId: r.installId, value: r.priceCopper, ...at(r) })), asOf, s),
      scalar("stock", rows.map((r) => ({ installId: r.installId, value: r.limitedStock ?? 0, ...at(r) })), asOf, s),
    ], installsOf(rows), `NPC ${vendorNpcId} · item ${itemId}`, `/database/vendors/${vendorNpcId}`);
  }

  // Drop rates: the merged settling rule over the loot-api windows the public rates read. A source under a recheck scope
  // counts only the windows after its date (`recheckLootRecords`); a rate public before that and not again since is
  // in recheck.
  const scopedLoot = lootRecheckSince(input.records, scopes);
  const allWindows = lootWindowsFromRecords(input.records as unknown[]);
  const windows = scopedLoot.size ? lootWindowsFromRecords(recheckLootRecords(input.records as unknown[], scopes)) : allWindows;
  const counted = new Map(rollupDrops(windows).rates.map((r) => [`${r.sourceNpcId !== undefined ? "npc" : "obj"}:${r.sourceNpcId ?? r.sourceObjectId}|${r.itemId}`, r]));
  const objectMaps = new Map<number, Map<number, Set<string>>>();
  for (const r of [...objectSpawnRowsFromRecords(input.records as unknown[]), ...objectSightingRowsFromRecords(input.records as unknown[])]) {
    if (typeof r.mapId !== "number") continue;
    const maps = objectMaps.get(r.objectId) ?? new Map<number, Set<string>>();
    addTo(maps, r.mapId, r.installId);
    objectMaps.set(r.objectId, maps);
  }
  const sourceInstalls = new Map<string, Set<string>>();
  for (const w of windows) {
    const key = w.sourceNpcId !== undefined ? `npc:${w.sourceNpcId}` : `obj:${w.sourceObjectId}`;
    sourceInstalls.set(key, (sourceInstalls.get(key) ?? new Set<string>()).add(w.installId));
  }
  for (const before of rollupDrops(allWindows).rates) {
    const npc = before.sourceNpcId !== undefined;
    const sourceId = (before.sourceNpcId ?? before.sourceObjectId)!;
    const zone = npc ? zoneOfNpc(sourceId) : busiest(objectMaps.get(sourceId) ?? new Map());
    const recheck = scopedLoot.has(`${npc ? "npc" : "obj"}:${sourceId}`);
    const rate = recheck ? counted.get(`${npc ? "npc" : "obj"}:${sourceId}|${before.itemId}`) : before;
    const settled = rate?.public === true && measureDropRate(rate, asOf ?? "[?]").settled;
    const state: FactState = settled ? "settled" : rate?.public ? "confirmed" : recheck && before.public ? "recheck" : "reported";
    push("drops", zone, [sourceId, before.itemId], [{ field: "rate", state, leading: rate?.reporters ?? 0, contested: false }],
      sourceInstalls.get(`${npc ? "npc" : "obj"}:${sourceId}`) ?? [], `${npc ? "NPC" : "Object"} ${sourceId} · item ${before.itemId}`,
      npc ? `/database/npcs/${sourceId}` : `/database/objects/${sourceId}`);
  }

  // Dungeon entrances and bosses. An entrance the game files place is a fact before anyone reports it.
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
    const vote = (k: "name" | "instanceType") => rows.map((r) => ({ installId: r.installId, value: r[k], ...at(r) }));
    push("entrances", where, [...ids], [
      (map === null ? null : position(rows.filter((r) => r.mapId === map), asOf, s)) ?? missing("position"),
      scalar("name", vote("name"), asOf, s) ?? missing("name"), scalar("instanceType", vote("instanceType"), asOf, s) ?? missing("instanceType"),
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
      listed("listed", rows, asOf, s), scalar("name", rows.map((r) => ({ installId: r.installId, value: r.name, ...at(r) })), asOf, s),
      ...[...npcVotes.values()].map((list) => listed("npc", list, asOf, s)),
    ], installsOf(rows), `Instance ${instanceMapId} · encounter ${encounterId}`, `/database/instances/${instanceMapId}`);
  }

  // Treasures: objects seen on the minimap, one entity per spawn cluster, as the treasure pins are drawn.
  const sightings = objectSightingRowsFromRecords(input.records as unknown[]);
  const spawns = objectSpawns(sightings, [], asOf ? new Date(asOf) : undefined);
  const sightingsOf = groupBy(sightings, (r) => r.objectId);
  for (const pin of spawns.pins) {
    const all = sightingsOf.get(pin.objectId) ?? [];
    const near = all.filter((r) => r.mapId === pin.mapId && Math.hypot((r.x ?? -99) - pin.x, (r.y ?? -99) - pin.y) <= SPAWN_RADIUS) as Placed[];
    const s = since("treasures", pin.mapId, [pin.objectId]);
    const placed = position(near, asOf, s, SPAWN_RADIUS);
    // The cluster rule already holds 3 installs; a radius check that sees fewer leaves the pin confirmed, not settled.
    // A pin in recheck stays in recheck: it is neither confirmed nor settled until 3 new installs place it.
    const pos: FieldFact = placed && (RANK[placed.state] >= RANK.confirmed || placed.state === "recheck") ? placed : { field: "position", state: "confirmed", leading: pin.reporters, contested: false };
    const names = all.flatMap((r) => (r.name === undefined ? [] : [{ installId: r.installId, value: r.name, ...at(r) }]));
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
  // Only released UiMap zones are read from the file: Area ids, `unplaced` and held-back zones stay out of every share.
  const byZone = new Map((expected?.zones ?? []).filter((z) => /^\d+$/.test(z.zone)).map((z) => [Number(z.zone), z]));
  const expectedType = (zone: number, type: CoverageType) => (expected ? byZone.get(zone)?.types[EXPECTED_TYPE[type]] ?? 0 : null);
  const expectedField = (zone: number, type: CoverageType, field: string) => (expected ? byZone.get(zone)?.fields[EXPECTED_TYPE[type]]?.[field] ?? 0 : null);
  const denominator = (type: CoverageType, cell: CoverageCell) =>
    cell.expected !== null ? Math.max(cell.expected, cell.observed) : type === "entrances" ? cell.observed : null;

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
      for (const field of f.fields) {
        tally(types[f.type], field.state);
        const key = `${f.type}|${field.field}`;
        const cell = fieldCells.get(key) ?? { ...emptyCell(), type: f.type, field: field.field };
        tally(cell, field.state);
        fieldCells.set(key, cell);
        const short = field.state === "reported" || field.state === "recheck";
        if (short && !field.contested && field.leading >= 1 && field.leading < WORLD_AGREEMENT) {
          needs.push({ type: f.type, field: fieldLabel(f.type, field.field), label: f.label, voters: field.leading, need: WORLD_AGREEMENT - field.leading, href: f.href });
        }
      }
    }
    // A field the file expects here that nobody has reported still gets its row, at 0 of its count.
    if (zone !== null) for (const t of COVERAGE_TYPES) for (const { field } of COVERAGE_FIELDS[t]) {
      const key = `${t}|${field}`;
      if (!fieldCells.has(key) && (expectedField(zone, t, field) ?? 0) > 0) fieldCells.set(key, { ...emptyCell(), type: t, field });
    }
    for (const t of COVERAGE_TYPES) {
      const cell = types[t];
      cell.expected = zone === null ? null : expectedType(zone, t);
      cell.denominator = zone === null ? null : denominator(t, cell);
    }
    const order = new Map(COVERAGE_TYPES.flatMap((t, ti) => COVERAGE_FIELDS[t].map((f, i) => [`${t}|${f.field}`, ti * 100 + i] as const)));
    const fields = [...fieldCells.values()].sort((a, b) => (order.get(`${a.type}|${a.field}`) ?? 0) - (order.get(`${b.type}|${b.field}`) ?? 0));
    for (const cell of fields) {
      cell.expected = zone === null ? null : expectedField(zone, cell.type, cell.field);
      cell.denominator = zone === null ? null : denominator(cell.type, cell);
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
    const all = (k: "expected" | "denominator") => cells.length > 0 && cells.every((c) => c[k] !== null);
    return [t, {
      expected: all("expected") ? sum("expected") : null, observed: sum("observed"), denominator: all("denominator") ? sum("denominator") : null,
      reported: sum("reported"), recheck: sum("recheck"), confirmed: sum("confirmed"), settled: sum("settled"),
    } satisfies CoverageCell];
  })) as Record<CoverageType, CoverageCell>;

  const locate = (type: "quests" | "npcs") => shown.filter((f) => f.type === type)
    .map((f): [number, number | null] => [f.refs[0]!, f.zone !== null && released.has(f.zone) ? f.zone : null]).sort((a, b) => a[0] - b[0]);
  return {
    schema: COVERAGE_SCHEMA, build: input.build ?? null, dataAsOf: asOf, method: COVERAGE_METHOD,
    installs: new Set(shown.flatMap((f) => [...f.voters])).size,
    expected: expected && { dataAsOf: expected.dataAsOf ?? null },
    totals, zones, unplaced, locate: { quests: locate("quests"), npcs: locate("npcs") },
  };
}

/** `settled / denominator` and `confirmed / denominator` as fractions, null without a denominator (shown `[?]`). */
export function coverageShares(cell: Pick<CoverageCell, "denominator" | "confirmed" | "settled">): { settled: number | null; confirmed: number | null } {
  const d = cell.denominator;
  if (d === null || d === 0) return { settled: null, confirmed: null };
  return { settled: Math.min(1, cell.settled / d), confirmed: Math.min(1, cell.confirmed / d) };
}

/** The expected file, or null when it is missing, malformed, or carries anything but counts under known keys. */
export function parseCoverageExpected(raw: unknown): CoverageExpected | null {
  const parsed = CoverageExpected.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
