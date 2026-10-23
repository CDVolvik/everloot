/** Maintainer-only coverage detail. Nothing in this module publishes baseline rows. */
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRecords, type IntakeRecord } from "@everloot/protocol";
import { POSITION_TOLERANCE, readBaseline, type Baseline } from "./baseline-report.js";
import type { DB } from "./db.js";
import { lootRecheckSince, lootWindowsFromRecords, recheckLootRecords, rollupDrops } from "./drop-rollup.js";
import { measureDropRate, type DropRateMeasurement } from "./drop-rate-settling.js";
import { computeCoverage, EXPECTED_TYPE, parseCoverageExpected, type CoverageType as ScoreType, type RecheckScope } from "./coverage.js";
import { tallyVotes, type FactState, type VoteRow } from "./fact-states.js";
import type { Spawn } from "./importers/pfquest.js";
import { objectSightingRowsFromRecords, objectSpawnRowsFromRecords, SPAWN_RADIUS } from "./object-spawns.js";
import { computePlateau, type PlateauReport } from "./plateau.js";
import { foldRecorderInstalls } from "./recorder-installs.js";
import { scopeSince } from "./recheck-scopes.js";
import { isPinPosition } from "./world-pages.js";
import type { WorldMapData } from "./world-map-data.js";
import { WORLD_MAP_DATA } from "./world-map-file.js";
import { zoneAt, zoneTable } from "./world-coords.js";

export const COVERAGE_TYPES = ["quest", "npc", "npc_pin", "vendor", "drop", "rare", "entrance", "boss", "treasure"] as const;
type CoverageType = typeof COVERAGE_TYPES[number];
export interface CoverageRow {
  type: CoverageType;
  id: string;
  field: string;
  name: string;
  /** UiMap id, Area id prefixed with area:, or unplaced; never an entity id. */
  zone: string;
  zoneName: string;
  level: number | null;
  state: FactState;
  contested: boolean;
  spread: boolean;
  values: { value: string | number; voters: number; firstCapturedAt: number | null; lastCapturedAt: number | null }[];
  measurement?: DropRateMeasurement;
}
export interface CoverageExpected {
  version: 1;
  /** When the counts were made: the corpus date the report was built from, so a count is never dateless. */
  dataAsOf?: string | null;
  /** Facts are entity fields, not whole entities. Includes observed additions; shared loot joins excluded. */
  zones: { zone: string; types: Record<CoverageType, number>; fields: Partial<Record<CoverageType, Record<string, number>>> }[];
}
export interface CoverageReport {
  version: 1;
  commit: string | null;
  dataAsOf: string | null;
  connected: boolean;
  clientConnected: boolean;
  notes: string[];
  rows: CoverageRow[];
  expected: CoverageExpected;
  /** The plateau over the released zones, from these counts as the denominator: what the public page would state. */
  plateau: PlateauReport | null;
}
export interface CoverageInput {
  baseline: Baseline;
  records: unknown[];
  dataAsOf: string | null;
  connected: boolean;
  mapData?: WorldMapData;
  questIds?: Iterable<number>;
  rareIds?: ReadonlySet<number>;
  bosses?: { encounterId: number; instanceMapId?: number }[];
  clientConnected?: boolean;
  /** An explicit local cutoff for every fact, beside the scopes. */
  recheckSince?: string;
  /** The scopes in `kb/curated/recheck.json`: a fact in one counts only reports after its date. */
  recheck?: readonly RecheckScope[];
}

/** readBaseline intentionally omits rank; read it locally without changing that reader or the importer. */
export function readCoverageBaseline(db: DB): { baseline: Baseline; rareIds: Set<number> } {
  const rareIds = new Set<number>();
  const rows = db.prepare("SELECT ext_id AS id, data FROM entities WHERE source_id = 'pfquest-classic'").iterate() as Iterable<{ id: string; data: string }>;
  for (const row of rows) {
    const data = JSON.parse(row.data) as { entity?: string; rank?: number };
    if (data.entity === "unit" && (data.rank === 2 || data.rank === 4)) rareIds.add(Number(row.id));
  }
  return { baseline: readBaseline(db), rareIds };
}

type Npc = Extract<IntakeRecord, { kind: "npc_sighting" }>;
type Point = { installId: string; capturedAt?: string; x: number; y: number };
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};
const ids = (values: Iterable<number>) => [...new Set(values)].sort((a, b) => a - b);

export function buildCoverageReport(input: CoverageInput): CoverageReport {
  const { baseline } = input;
  const map = input.mapData ?? WORLD_MAP_DATA;
  const zones = [...map.zones, ...map.heldBackZones];
  const records = foldRecorderInstalls(parseRecords(input.records).records);
  const npcs = records.filter((r): r is Npc => r.kind === "npc_sighting");
  const quests = records.filter(r => r.kind === "quest");
  const rows: CoverageRow[] = [];
  const asOf = input.dataAsOf ?? undefined;
  const scoreType = Object.fromEntries(Object.entries(EXPECTED_TYPE).map(([k, v]) => [v, k])) as Record<CoverageType, ScoreType>;
  const questRewards = new Map<number, Set<number>>();
  for (const r of quests) for (const item of r.rewardItemIds) questRewards.set(r.questId, (questRewards.get(r.questId) ?? new Set<number>()).add(item));
  const bossNpcs = new Map<string, number[]>();
  for (const r of records) if (r.kind === "encounter") bossNpcs.set(`${r.instanceMapId}:${r.encounterId}`, [...new Set([...(bossNpcs.get(`${r.instanceMapId}:${r.encounterId}`) ?? []), ...(r.npcIds ?? [])])]);
  // `--recheck-since` is one more scope, with nothing named, so it covers every fact.
  const scopes = [...(input.recheck ?? []), ...(input.recheckSince ? [{ since: input.recheckSince, source: "--recheck-since" }] : [])];
  // The latest cutoff that covers a fact, matched by type, zone and ids by the public score's own rule (`scopeSince`):
  // a quest names its rewards, a vendor offer its item, and every field of a boss its boss NPCs.
  const cutoff = (type: CoverageType, id: string, zone: string): string | undefined => {
    const parts = id.split(":").map(Number), head = parts[0]!;
    const refs = type === "quest" ? [head, ...(questRewards.get(head) ?? [])]
      : type === "vendor" ? parts.slice(0, 2)
      : type === "boss" ? [...parts.slice(0, 2), ...(bossNpcs.get(id) ?? [])]
      : [head];
    return scopeSince(scopes, { types: [scoreType[type]], zones: [/^\d+$/.test(zone) ? Number(zone) : null], ids: refs }) ?? undefined;
  };
  const zoneName = (zone: string) => zone === "unplaced" ? "Unplaced" : zone.startsWith("area:") ? `Area ${zone.slice(5)}` : zones.find(z => String(z.uiMapId) === zone)?.name ?? `UiMap ${zone}`;
  const baselineZone = (spawns: readonly Spawn[] | undefined): string => {
    const counts = new Map<string, number>();
    for (const s of spawns ?? []) {
      const zone = s.uiMapId === undefined ? `area:${s.areaId}` : String(s.uiMapId);
      counts.set(zone, (counts.get(zone) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "unplaced";
  };
  const npcZone = (id: number): string => {
    const maps = new Map<number, Set<string>>();
    for (const r of npcs) if (r.npcId === id && isPinPosition(r.positionKind)) {
      const voters = maps.get(r.mapId) ?? new Set<string>();
      voters.add(r.installId); maps.set(r.mapId, voters);
    }
    const agreed = [...maps].filter(([, voters]) => voters.size >= 3).sort((a, b) => b[1].size - a[1].size || a[0] - b[0]);
    return agreed.length ? String(agreed[0]![0]) : baselineZone(baseline.units.get(id)?.spawns);
  };
  const add = (type: CoverageType, id: string, field: string, name: string | undefined, zone: string, level: number | undefined | null, votes: VoteRow[]): CoverageRow => {
    const tally = tallyVotes(votes, { asOf, recheckSince: cutoff(type, id, zone) });
    const row: CoverageRow = {
      type, id, field, name: name?.trim() || "[?]", zone, zoneName: zoneName(zone), level: level ?? null,
      state: tally.state, contested: tally.contested, spread: false,
      values: tally.groups.map(g => ({ value: g.value, voters: g.voters.size, firstCapturedAt: g.firstCapturedAt, lastCapturedAt: g.lastCapturedAt })),
    };
    rows.push(row); return row;
  };
  const votes = <T extends { installId: string; capturedAt?: string }>(list: readonly T[], value: (r: T) => string | number | undefined): VoteRow[] => list.flatMap(r => {
    const v = value(r);
    return v === undefined ? [] : [{ installId: r.installId, capturedAt: r.capturedAt, value: v }];
  });
  const pin = (type: CoverageType, id: string, name: string | undefined, zone: string, level: number | undefined, points: Point[]) => {
    const row = add(type, id, "position", name, zone, level, votes(points, () => "position"));
    if (points.length) {
      const x = median(points.map(r => r.x)), y = median(points.map(r => r.y));
      row.spread = points.some(r => Math.hypot(r.x - x, r.y - y) > POSITION_TOLERANCE);
      // Spread is diagnostic, not a conflicting scalar; it must never settle a patrol.
      if (row.spread && row.state === "settled") row.state = "confirmed";
      row.values.forEach(v => { v.value = `${x}, ${y}`; });
    }
  };
  const npcName = (id: number) => baseline.units.get(id)?.name ?? npcs.find(r => r.npcId === id)?.name;
  const npcLevel = (id: number) => {
    const tally = tallyVotes(votes(npcs.filter(r => r.npcId === id), r => r.level));
    return typeof tally.winner?.value === "number" ? tally.winner.value : baseline.units.get(id)?.minLevel;
  };
  const rareIds = new Set(input.rareIds ?? []);
  for (const r of npcs) if (r.rank === "rare" || r.rank === "rare_elite") rareIds.add(r.npcId);
  for (const id of ids([...baseline.units.keys(), ...npcs.map(r => r.npcId)])) {
    const list = npcs.filter(r => r.npcId === id), zone = npcZone(id), name = npcName(id), level = npcLevel(id);
    for (const field of ["name", "level", "creatureType", "rank"] as const) add("npc", String(id), field, name, zone, level, votes(list, r => r[field]));
    const roles = new Set(list.flatMap(r => r.role ? [r.role] : []));
    if ([...baseline.items.values()].some(item => item.vendors.some(v => v.npc === id))) roles.add("vendor");
    if ([...baseline.quests.values()].some(q => q.start.U?.includes(id) || q.end.U?.includes(id))) roles.add("questgiver");
    for (const role of roles) add("npc", String(id), `role:${role}`, name, zone, level, votes(list.filter(r => r.role === role), () => role));
    if (rareIds.has(id)) add("rare", String(id), "name", name, zone, level, votes(list, r => r.name));
    const pins = list.filter(r => isPinPosition(r.positionKind));
    const maps = ids([...(baseline.units.get(id)?.spawns.flatMap(s => s.uiMapId === undefined ? [] : [s.uiMapId]) ?? []), ...pins.map(r => r.mapId)]);
    for (const mapId of maps) {
      const points = pins.filter(r => r.mapId === mapId);
      pin("npc_pin", `${id}:${mapId}`, name, String(mapId), level, points);
      if (rareIds.has(id)) pin("rare", `${id}:${mapId}`, name, String(mapId), level, points);
    }
  }
  for (const id of ids([...baseline.quests.keys(), ...(input.questIds ?? []), ...quests.map(r => r.questId)])) {
    const b = baseline.quests.get(id), list = quests.filter(r => r.questId === id);
    const giver = tallyVotes(votes(list, r => r.giverNpcId)).winner?.value;
    const unitId = typeof giver === "number" ? giver : b?.start.U?.[0];
    const zone = unitId === undefined ? baselineZone(baseline.objects.get(b?.start.O?.[0] ?? -1)?.spawns) : npcZone(unitId);
    const observedLevel = tallyVotes(votes(list, r => r.level)).winner?.value;
    const level = typeof observedLevel === "number" ? observedLevel : b?.lvl;
    const name = b?.title ?? list[0]?.title;
    const fields = { title: "title", level: "level", giver: "giverNpcId", "turn-in": "turnInNpcId", category: "category", "group-size": "suggestedGroup", tag: "tag" } as const;
    for (const [field, key] of Object.entries(fields)) add("quest", String(id), field, name, zone, level, votes(list, r => r[key as typeof fields[keyof typeof fields]]));
    const side = add("quest", String(id), "side", name, zone, level, votes(list, r => r.faction));
    const alliance = side.values.find(v => v.value === "alliance")?.voters ?? 0;
    const horde = side.values.find(v => v.value === "horde")?.voters ?? 0;
    // Both sides is a legitimate value, not a contested scalar. Special side settling is still pending.
    side.contested = false;
    side.state = alliance >= 3 && horde >= 3 || alliance >= 3 && horde === 0 || horde >= 3 && alliance === 0 ? "confirmed" : side.state === "missing" || side.state === "recheck" ? side.state : "reported";
    for (const item of ids(list.flatMap(r => r.rewardItemIds))) add("quest", String(id), `reward:${item}`, name, zone, level, votes(list.filter(r => r.rewardItemIds.includes(item)), () => item));
  }
  const offers = new Map<string, { npc: number; item: number; votes: Extract<IntakeRecord, { kind: "vendor" }>[] }>();
  for (const item of baseline.items.values()) for (const v of item.vendors) offers.set(`${v.npc}:${item.id}`, { npc: v.npc, item: item.id, votes: [] });
  for (const r of records) if (r.kind === "vendor") for (const item of r.items) {
    const key = `${r.vendorNpcId}:${item.itemId}`;
    const offer = offers.get(key) ?? { npc: r.vendorNpcId, item: item.itemId, votes: [] };
    offer.votes.push(r); offers.set(key, offer);
  }
  for (const [key, offer] of offers) for (const field of ["price", "stock"] as const) {
    add("vendor", key, field, `${baseline.items.get(offer.item)?.name ?? "[?]"} at ${npcName(offer.npc) ?? "[?]"}`, npcZone(offer.npc), npcLevel(offer.npc), votes(offer.votes, r => {
      const item = r.items.find(i => i.itemId === offer.item);
      return field === "price" ? item?.priceCopper : item ? item.limitedStock ?? "unlimited" : undefined;
    }));
  }
  // A source under a scope counts only the windows after its date, as the public rates do (`recheckLootRecords`).
  const scopedLoot = lootRecheckSince(records, scopes);
  const rates = rollupDrops(lootWindowsFromRecords(records)).rates;
  const counted = scopedLoot.size ? rollupDrops(lootWindowsFromRecords(recheckLootRecords(records, scopes))).rates : rates;
  const drops = new Map<string, { npc?: number; object?: number; item: number }>();
  for (const item of baseline.items.values()) for (const d of item.drops) drops.set(`${d.npc === undefined ? "obj" : "npc"}:${d.npc ?? d.object}:${item.id}`, { ...d, item: item.id });
  for (const r of rates) drops.set(`${r.sourceNpcId === undefined ? "obj" : "npc"}:${r.sourceNpcId ?? r.sourceObjectId}:${r.itemId}`, { npc: r.sourceNpcId, object: r.sourceObjectId, item: r.itemId });
  for (const [key, d] of drops) {
    const rate = rates.find(r => r.itemId === d.item && r.sourceNpcId === d.npc && r.sourceObjectId === d.object);
    const sourceName = d.npc === undefined ? baseline.objects.get(d.object!)?.name : npcName(d.npc);
    const row = add("drop", key, "rate", `${baseline.items.get(d.item)?.name ?? "[?]"} from ${sourceName ?? "[?]"}`, d.npc === undefined ? baselineZone(baseline.objects.get(d.object!)?.spawns) : npcZone(d.npc), d.npc === undefined ? undefined : npcLevel(d.npc), []);
    const recheck = scopedLoot.has(key.slice(0, key.lastIndexOf(":")));
    const now = recheck ? counted.find(r => r.itemId === d.item && r.sourceNpcId === d.npc && r.sourceObjectId === d.object) : rate;
    if (now) {
      row.measurement = measureDropRate(now, input.dataAsOf ?? "[?]");
      row.state = row.measurement.settled ? "settled" : now.public ? "confirmed" : recheck && rate?.public ? "recheck" : "reported";
      row.values = [{ value: `${now.drops}/${now.kills}`, voters: now.reporters, firstCapturedAt: null, lastCapturedAt: null }];
    } else if (recheck && rate?.public) row.state = "recheck";
  }
  const entrances = records.filter(r => r.kind === "instance_entrance");
  const entranceKeys = new Map<string, { instance: number; map: number | undefined; name?: string }>();
  for (const e of map.entrances) {
    const zone = zoneAt(zoneTable({ zones }), e, e.uiMapId);
    entranceKeys.set(`${e.mapId}:${zone?.mapId ?? "unplaced"}`, { instance: e.mapId, map: zone?.mapId, name: e.name });
  }
  for (const r of entrances) entranceKeys.set(`${r.instanceMapId}:${r.mapId}`, { instance: r.instanceMapId, map: r.mapId, name: r.name });
  for (const [key, e] of entranceKeys) {
    const list = entrances.filter(r => r.instanceMapId === e.instance && r.mapId === e.map);
    const zone = e.map === undefined ? "unplaced" : String(e.map);
    pin("entrance", key, e.name, zone, undefined, list);
    for (const field of ["name", "instanceType"] as const) add("entrance", key, field, e.name, zone, null, votes(list, r => r[field]));
  }
  const encounters = records.filter(r => r.kind === "encounter");
  const bosses = new Map((input.bosses ?? []).map(b => [`${b.instanceMapId ?? "unplaced"}:${b.encounterId}`, b]));
  for (const r of encounters) bosses.set(`${r.instanceMapId}:${r.encounterId}`, r);
  for (const [key, b] of bosses) {
    const list = encounters.filter(r => r.instanceMapId === b.instanceMapId && r.encounterId === b.encounterId);
    const zone = [...entranceKeys.values()].find(e => e.instance === b.instanceMapId)?.map;
    for (const field of ["listed", "name"] as const) add("boss", key, field, list[0]?.name, zone === undefined ? "unplaced" : String(zone), null, votes(list, r => field === "listed" ? "listed" : r.name));
    for (const npc of ids(list.flatMap(r => r.npcIds ?? []))) add("boss", key, `npc:${npc}`, list[0]?.name, zone === undefined ? "unplaced" : String(zone), null, votes(list.filter(r => r.npcIds?.includes(npc)), () => npc));
  }
  // Baseline spawn coordinates identify local candidate clusters only; they never become votes.
  const objects = [...objectSpawnRowsFromRecords(records), ...objectSightingRowsFromRecords(records)];
  for (const id of ids([...baseline.objects.keys(), ...objects.map(r => r.objectId)])) {
    const b = baseline.objects.get(id), list = objects.filter(r => r.objectId === id);
    const clusters: { map: number | undefined; area?: number; x: number; y: number; points: typeof list }[] = [];
    for (const s of b?.spawns ?? []) if (!clusters.some(c => c.map === s.uiMapId && c.area === s.areaId && Math.hypot(c.x - s.x, c.y - s.y) < SPAWN_RADIUS)) clusters.push({ map: s.uiMapId, area: s.areaId, x: s.x, y: s.y, points: [] });
    for (const r of [...list].sort((a, b) => (a.mapId ?? -1) - (b.mapId ?? -1) || (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0))) {
      if (r.mapId === undefined || r.x === undefined || r.y === undefined || r.gatherKind === "fishing") continue;
      let cluster = clusters.find(c => c.map === r.mapId && Math.hypot(c.x - r.x!, c.y - r.y!) < SPAWN_RADIUS);
      if (!cluster) { cluster = { map: r.mapId, x: r.x, y: r.y, points: [] }; clusters.push(cluster); }
      cluster.points.push(r);
    }
    if (!clusters.length) clusters.push({ map: undefined, x: 0, y: 0, points: [] });
    for (const [i, c] of clusters.entries()) {
      const key = `${id}:${i}`, zone = c.map === undefined ? c.area === undefined ? "unplaced" : `area:${c.area}` : String(c.map);
      const name = b?.name ?? list.find(r => r.name)?.name;
      pin("treasure", key, name, zone, undefined, c.points as Point[]);
      add("treasure", key, "name", name, zone, null, votes(list, r => r.name));
    }
  }
  rows.sort((a, b) => (a.zone === "unplaced" ? 1 : 0) - (b.zone === "unplaced" ? 1 : 0) || a.zoneName.localeCompare(b.zoneName) || (a.level ?? Infinity) - (b.level ?? Infinity) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id, "en", { numeric: true }) || a.field.localeCompare(b.field));
  const counts = new Map<string, CoverageExpected["zones"][number]>();
  for (const r of rows) {
    const zone = counts.get(r.zone) ?? { zone: r.zone, types: Object.fromEntries(COVERAGE_TYPES.map(t => [t, 0])) as Record<CoverageType, number>, fields: {} };
    zone.types[r.type]++;
    // Reward, role and boss-NPC identifiers belong only to the local detail.
    const field = r.field.split(":")[0]!;
    const fields = zone.fields[r.type] ?? {};
    fields[field] = (fields[field] ?? 0) + 1; zone.fields[r.type] = fields;
    counts.set(r.zone, zone);
  }
  const expected: CoverageExpected = { version: 1, dataAsOf: input.dataAsOf ?? null, zones: [...counts.values()].sort((a, b) => a.zone.localeCompare(b.zone, "en", { numeric: true })) };
  // The plateau as the public page states it: the released zones, with these counts as the denominator.
  const released = new Set(map.zones.map(z => z.uiMapId));
  const fileEntrances = map.entrances.flatMap(e => {
    const zone = zoneAt(zoneTable({ zones }), e, e.uiMapId);
    return zone && released.has(zone.mapId) ? [{ instanceMapIds: [e.mapId], zone: zone.mapId }] : [];
  });
  const scoreExpected = parseCoverageExpected(expected);
  const plateau = scoreExpected && computePlateau({
    records, asOf: input.dataAsOf, zones: map.zones.map(z => ({ mapId: z.uiMapId, name: z.name })),
    heldBack: map.heldBackZones.map(z => z.uiMapId), fileEntrances, expected: scoreExpected, recheck: input.recheck ?? [],
  });
  return {
    version: 1, commit: baseline.commit, dataAsOf: input.dataAsOf, connected: input.connected, clientConnected: input.clientConnected ?? false,
    notes: ["Local only: never published or committed. Counts are entity fields; shared loot tables stay a join.",
      "Unplaced and held-back zones remain in this local report. No counts are uploaded by this command.",
      "Quest-side settling is pending; confirmed sides keep collecting. Position spread prevents settling. Object loot without capture times cannot settle a pin.",
      `Recheck: ${(input.recheck ?? []).length} scopes from kb/curated/recheck.json${input.recheckSince ? `, and every fact from ${input.recheckSince}` : ""}. A fact in a scope that was confirmed before the scope's date counts only reports after it, and stays recheck (neither confirmed nor settled, here and in the plateau) until 3 new installs agree. ${rows.filter(r => r.state === "recheck").length} fact fields are in recheck. A drop source in a scope counts only the loot windows captured after its date, public rate or not.`,
      ...(input.connected ? [] : ["Uploads are disconnected or unreadable; missing is not a measured zero."]),
      ...(input.clientConnected ? [] : ["No client snapshot supplied: game-file-only quests and bosses are unknown ([?])."])],
    rows, expected, plateau,
  };
}

const share = (value: number | null) => (value === null ? "[?]" : `${(value * 100).toFixed(1)}%`);
function formatPlateau(plateau: PlateauReport | null): string[] {
  if (!plateau) return ["", "## Plateau", "", "[?]: the expected counts could not be read as the public score reads them."];
  const verdict = plateau.site === null ? "[?]" : plateau.site ? "yes" : "no";
  return ["", "## Plateau", "", `Site at its plateau: ${verdict}. Settled list refresh: every ${plateau.refreshDays} ${plateau.refreshDays === 1 ? "day" : "days"}.`,
    `Data as of ${plateau.dataAsOf ?? "[?]"}; window from ${plateau.windowStart ?? "[?]"}; ${plateau.installs} installs behind the counted facts, ${plateau.windowInstalls} reporting in the window.`,
    plateau.method, "", "| Type | Plateau | Confirmed | Settled | Newly confirmed | Recheck | Of |", "|---|---|---|---|---|---|---|",
    ...plateau.types.map(t => `| ${t.type} | ${t.atPlateau === null ? "[?]" : t.atPlateau ? "yes" : "no"} | ${share(t.shares.confirmed)} (${t.confirmed}) | ${share(t.shares.settled)} (${t.settled}) | ${share(t.shares.newlyConfirmed)} (${t.newlyConfirmed ?? "[?]"}) | ${t.recheck} | ${t.denominator ?? "[?]"} |`)];
}

const cell = (value: unknown) => String(value ?? "[?]").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
export function formatCoverageReport(report: CoverageReport): string {
  const lines = ["# Internal coverage report", "", ...report.notes, "", `Data as of: ${report.dataAsOf ?? "[?]"}. Baseline commit: ${report.commit ?? "[?]"}.`, ...formatPlateau(report.plateau)];
  let zone = "";
  for (const r of report.rows) {
    if (zone !== r.zone) {
      zone = r.zone;
      lines.push("", `## ${cell(r.zoneName)}`, "", "| Level | Type | Id | Name | Field | State | Values (voters) |", "|---|---|---|---|---|---|---|");
    }
    lines.push(`| ${cell(r.level)} | ${r.type} | ${cell(r.id)} | ${cell(r.name)} | ${cell(r.field)} | ${r.state}${r.contested ? "; contested" : ""}${r.spread ? "; spread" : ""} | ${cell(r.values.length ? r.values.map(v => `${v.value} (${v.voters})`).join("; ") : "[?]")} |`);
  }
  return `${lines.join("\n")}\n`;
}

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** Same boundary as writeBaselineReport; check before making any directory or artifact. */
export function writeCoverageReport(report: CoverageReport, outDir: string, repoRoot = REPO_ROOT): { markdown: string; json: string; expected: string } {
  const out = resolve(outDir), rel = relative(resolve(repoRoot), out);
  if (rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) throw new Error(`refusing to write the coverage report inside the repository (${out}); pick a folder outside it`);
  mkdirSync(out, { recursive: true });
  const paths = { markdown: join(out, "coverage-report.md"), json: join(out, "coverage-report.json"), expected: join(out, "coverage-expected.json") };
  writeFileSync(paths.markdown, formatCoverageReport(report));
  writeFileSync(paths.json, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(paths.expected, `${JSON.stringify(report.expected, null, 2)}\n`);
  return paths;
}
