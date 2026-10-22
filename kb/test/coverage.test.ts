import { expect, test } from "vitest";
import { POSITION_TOLERANCE as BASELINE_TOLERANCE, type Baseline } from "../src/baseline-report.js";
import { buildCoverageReport } from "../src/coverage-report.js";
import { computeCoverage, coverageShares, parseCoverageExpected, POSITION_TOLERANCE, RecheckFile, type CoverageExpected, type CoverageInput } from "../src/coverage.js";

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString();
const ZONES = [{ mapId: 1429, name: "Elwynn Forest" }, { mapId: 1411, name: "Durotar" }];
const base = (records: unknown[], extra: Partial<CoverageInput> = {}): CoverageInput => ({ records, asOf: day(30), zones: ZONES, ...extra });

/** `n` installs saw NPC `npcId` at a quest giver's window in `mapId`: a name, a role and a pin each. */
function npcs(n: number, npcId: number, opts: { mapId?: number; name?: string; x?: number; y?: number; at?: number; from?: number; rank?: string; spread?: number } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    kind: "npc_sighting", installId: `install-${(opts.from ?? 0) + i}`, npcId, name: opts.name ?? "Marshal Dughan", mapId: opts.mapId ?? 1429,
    x: (opts.x ?? 42) + (opts.spread ?? 0) * i, y: opts.y ?? 65, positionKind: "interaction", role: "questgiver", capturedAt: day(opts.at ?? 0),
    ...(opts.rank ? { rank: opts.rank } : {}),
  }));
}
/** Title, level, giver and turn-in: four field facts per quest. */
function quests(n: number, questId: number, giverNpcId: number, opts: { at?: number; from?: number; title?: string } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    kind: "quest", installId: `install-${(opts.from ?? 0) + i}`, questId, title: opts.title ?? "A Threat Within", level: 5, giverNpcId, turnInNpcId: giverNpcId,
    rewardItemIds: [], capturedAt: day(opts.at ?? 0),
  }));
}
const expected = (zones: CoverageExpected["zones"]): CoverageExpected => ({ version: 1, zones });
const zone = (report: ReturnType<typeof computeCoverage>, mapId: number) => report.zones.find((z) => z.mapId === mapId)!;
const field = (report: ReturnType<typeof computeCoverage>, mapId: number, type: string, name: string) => zone(report, mapId).fields.find((f) => f.type === type && f.field === name);

test("a fact is an entity field: three installs confirm it, five with the third 14 days old settle it", () => {
  const report = computeCoverage(base([...npcs(3, 1, { at: 0 }), ...npcs(2, 1, { at: 1, from: 3 }), ...npcs(3, 2, { at: 25 })]));
  const elwynn = zone(report, 1429);
  // Each NPC holds a name and a role: four field facts, the two of NPC 1 settled.
  expect(elwynn.types.npcs).toMatchObject({ observed: 4, confirmed: 4, settled: 2, reported: 0 });
  expect(field(report, 1429, "npcs", "name")).toMatchObject({ observed: 2, confirmed: 2, settled: 1 });
  expect(elwynn.types.pins).toMatchObject({ observed: 2, confirmed: 2, settled: 1 });
  expect(elwynn.installs).toBe(5);
  expect(report.installs).toBe(5);
});

test("the third voter 13 days before the corpus time does not settle", () => {
  const report = computeCoverage(base([...npcs(5, 1, { at: 17 })]));
  expect(zone(report, 1429).types.npcs).toMatchObject({ confirmed: 2, settled: 0 });
});

test("a pin with an install outside 5 map units stays confirmed: spread, never settled", () => {
  expect(POSITION_TOLERANCE).toBe(BASELINE_TOLERANCE);
  const tight = computeCoverage(base(npcs(5, 1, { spread: 1 })));
  const spread = computeCoverage(base(npcs(5, 1, { spread: 3 })));
  expect(zone(tight, 1429).types.pins.settled).toBe(1);
  expect(zone(spread, 1429).types.pins).toMatchObject({ confirmed: 1, settled: 0 });
});

test("the denominator is max(expected, observed) at the same field grain, so coverage never passes 100%", () => {
  const records = [...npcs(5, 1), ...npcs(5, 2), ...npcs(5, 3)];
  const report = computeCoverage(base(records, { expected: expected([
    { zone: "1429", types: { npc: 2 }, fields: { npc: { name: 2 } } },
    { zone: "1411", types: { npc: 10 }, fields: { npc: { name: 5, level: 5 } } },
  ]) }));
  const cell = zone(report, 1429).types.npcs;
  expect(cell).toMatchObject({ expected: 2, observed: 6, denominator: 6, settled: 6 });
  expect(coverageShares(cell)).toEqual({ settled: 1, confirmed: 1 });
  expect(field(report, 1429, "npcs", "name")).toMatchObject({ expected: 2, observed: 3, denominator: 3 });
  expect(zone(report, 1411).types.npcs).toMatchObject({ expected: 10, observed: 0, denominator: 10 });
  expect(coverageShares(zone(report, 1411).types.npcs)).toEqual({ settled: 0, confirmed: 0 });
  // A field the file expects that nobody reported still has its row, at 0 of its count.
  expect(field(report, 1411, "npcs", "level")).toMatchObject({ expected: 5, observed: 0, denominator: 5 });
  expect(report.totals.npcs).toMatchObject({ expected: 12, denominator: 16, settled: 6 });
});

test("Area ids, unplaced and held-back zones in the file stay out of every share and total", () => {
  const report = computeCoverage(base(npcs(3, 1), {
    zones: [...ZONES, { mapId: 1460, name: "Unreleased" }], heldBack: [1460],
    expected: expected([
      { zone: "1411", types: { quest: 4 }, fields: {} },
      { zone: "area:12", types: { npc: 99 }, fields: {} },
      { zone: "unplaced", types: { quest: 50 }, fields: {} },
      { zone: "1460", types: { quest: 70 }, fields: {} },
    ]),
  }));
  expect(report.totals.quests).toMatchObject({ expected: 4, denominator: 4 });
  expect(report.totals.npcs.expected).toBe(0);
  expect(report.unplaced.types.quests.denominator).toBeNull();
  // A released zone the file leaves out expects nothing, so it has no share rather than 100%.
  expect(zone(report, 1429).types.quests).toMatchObject({ expected: 0, denominator: 0 });
  expect(coverageShares(zone(report, 1429).types.quests)).toEqual({ settled: null, confirmed: null });
});

test("without the expected file there is no denominator, and the reported facts are still listed", () => {
  const report = computeCoverage(base([...npcs(2, 7), ...npcs(1, 8, { from: 5 })]));
  const elwynn = zone(report, 1429);
  expect(elwynn.types.npcs).toMatchObject({ expected: null, denominator: null, reported: 4 });
  expect(coverageShares(elwynn.types.npcs)).toEqual({ settled: null, confirmed: null });
  expect(report.expected).toBeNull();
  const names = elwynn.needs.filter((n) => n.type === "npcs" && n.field === "name");
  // The closest first: one more install for NPC 7, two for NPC 8. Labels carry ids only.
  expect(names.map((n) => [n.label, n.voters, n.need])).toEqual([["NPC 7", 2, 1], ["NPC 8", 1, 2]]);
  expect(names[0]!.href).toBe("/database/npcs/7");
});

test("no unagreed value reaches the output", () => {
  const report = computeCoverage(base([...npcs(2, 7, { name: "Secret Name" }), ...quests(1, 9, 7, { title: "Secret Title" })]));
  expect(JSON.stringify(report)).not.toContain("Secret");
});

test("the expected file is counts only under known keys: a name, an id or a stray key is refused whole", () => {
  const good = expected([{ zone: "1429", types: { quest: 40 }, fields: { quest: { title: 10, "turn-in": 10 } } }]);
  expect(parseCoverageExpected(good)).not.toBeNull();
  expect(parseCoverageExpected({ ...good, dataAsOf: "2026-10-22T00:00:00Z" })).not.toBeNull();
  expect(parseCoverageExpected(expected([{ zone: "1429", types: { quest: 40 }, fields: { quest: { "Hogger": 1 } } }]))).toBeNull();
  expect(parseCoverageExpected(expected([{ zone: "1429", types: { quest: 40, names: 1 } as never, fields: {} }]))).toBeNull();
  expect(parseCoverageExpected(expected([{ zone: "Elwynn", types: {}, fields: {} }]))).toBeNull();
  expect(parseCoverageExpected(expected([{ zone: "1429", types: { quest: -1 }, fields: {} }]))).toBeNull();
  expect(parseCoverageExpected({ ...good, rows: [] })).toBeNull();
  expect(parseCoverageExpected({ ...good, zones: [{ ...good.zones[0], name: "Elwynn Forest" }] })).toBeNull();
});

test("the maintainer report's expected counts pass this parser and score at the same grain", () => {
  const baseline: Baseline = { commit: "a".repeat(40),
    units: new Map([[10, { id: 10, name: "Local rat", minLevel: 5, spawns: [{ areaId: 12, uiMapId: 1429, x: 40, y: 60, respawnSecs: 30 }], refs: [] }]]),
    quests: new Map([[20, { id: 20, title: "Local errand", lvl: 5, start: { U: [10] }, end: { U: [10] } }]]),
    objects: new Map(), items: new Map([[30, { id: 30, name: "Local cheese", drops: [{ npc: 10, chance: 20 }], refs: [], vendors: [{ npc: 10, count: 1 }] }]]),
  };
  const local = buildCoverageReport({ baseline, records: [], dataAsOf: day(21), connected: true });
  const file = parseCoverageExpected(JSON.parse(JSON.stringify(local.expected)));
  expect(file).not.toBeNull();
  const report = computeCoverage(base(quests(3, 20, 10).concat(npcs(3, 10) as never[]), { expected: file }));
  const local1429 = local.expected.zones.find((z) => z.zone === "1429")!;
  expect(zone(report, 1429).types.quests.expected).toBe(local1429.types.quest);
  expect(field(report, 1429, "quests", "giver")).toMatchObject({ expected: local1429.fields.quest!.giver, confirmed: 1 });
  // Baseline names never reach the score.
  expect(JSON.stringify(report)).not.toMatch(/Local (rat|errand|cheese)/);
});

test("a quest is counted in its giver's zone; one with no placed giver is unplaced", () => {
  const report = computeCoverage(base([...npcs(3, 1), ...quests(3, 100, 1), ...quests(3, 101, 999)]));
  expect(zone(report, 1429).types.quests).toMatchObject({ observed: 4, confirmed: 4 });
  expect(report.unplaced.types.quests).toMatchObject({ observed: 4, confirmed: 4, denominator: null });
  expect(report.locate.quests).toEqual([[100, 1429], [101, null]]);
});

test("each field is its own fact: a quest's title can be confirmed while its turn-in is short", () => {
  const rows = quests(3, 100, 1).map((r, i) => (i === 0 ? r : { ...r, turnInNpcId: undefined }));
  const report = computeCoverage(base([...npcs(3, 1), ...rows]));
  expect(zone(report, 1429).types.quests).toMatchObject({ observed: 4, confirmed: 3, reported: 1 });
  expect(field(report, 1429, "quests", "title")).toMatchObject({ confirmed: 1 });
  expect(field(report, 1429, "quests", "turn-in")).toMatchObject({ reported: 1 });
});

test("held-back zones are left out entirely", () => {
  const report = computeCoverage(base(npcs(3, 1, { mapId: 1460 }), { zones: [...ZONES, { mapId: 1460, name: "Unreleased" }], heldBack: [1460] }));
  expect(report.zones.some((z) => z.mapId === 1460)).toBe(false);
  expect(report.unplaced.types.npcs.observed).toBe(0);
  expect(report.installs).toBe(0);
});

test("game-file entrances count with no voter, so entrances have a denominator of their own", () => {
  const rows = Array.from({ length: 3 }, (_, i) => ({
    kind: "instance_entrance", installId: `install-${i}`, instanceMapId: 36, name: "The Deadmines", instanceType: "party", mapId: 1436, x: 42, y: 72, capturedAt: day(0),
  }));
  const report = computeCoverage(base(rows, {
    zones: [...ZONES, { mapId: 1436, name: "Westfall" }],
    fileEntrances: [{ instanceMapIds: [36], zone: 1436 }, { instanceMapIds: [34], zone: 1429 }],
  }));
  // Position, name and type: three facts each.
  expect(zone(report, 1436).types.entrances).toMatchObject({ observed: 3, denominator: 3, confirmed: 3 });
  expect(zone(report, 1429).types.entrances).toMatchObject({ observed: 3, denominator: 3, confirmed: 0, reported: 0 });
});

test("a drop rate settles by the merged rule, from loot-api windows only", () => {
  const windows = (n: number, installs: number, evidence = "loot-api") => Array.from({ length: n }, (_, i) => ({
    kind: "loot", sourceEvidence: evidence, installId: `install-${i % installs}`, sourceNpcId: 1, items: [{ itemId: 2589, count: 1 }], capturedAt: day(0),
  }));
  const settled = computeCoverage(base([...npcs(3, 1), ...windows(60, 5)]));
  const thin = computeCoverage(base([...npcs(3, 1), ...windows(60, 4)]));
  const pending = computeCoverage(base([...npcs(3, 1), ...windows(60, 5, "recorder")]));
  expect(zone(settled, 1429).types.drops).toMatchObject({ observed: 1, settled: 1 });
  expect(zone(thin, 1429).types.drops).toMatchObject({ confirmed: 1, settled: 0 });
  expect(zone(pending, 1429).types.drops.observed).toBe(0);
});

test("a recheck scope counts only reports after its date", () => {
  const records = [...npcs(5, 1, { at: 0 })];
  const scope = { since: day(20), source: "build-watch wow_classic_beta-70500", type: "pins" as const, zones: [1429] };
  const before = computeCoverage(base(records, { recheck: [scope] }));
  expect(zone(before, 1429).types.pins).toMatchObject({ recheck: 1, confirmed: 0 });
  expect(zone(before, 1429).types.npcs.settled).toBe(2);
  const after = computeCoverage(base([...records, ...npcs(3, 1, { at: 21, from: 10 })], { recheck: [scope] }));
  expect(zone(after, 1429).types.pins).toMatchObject({ recheck: 0, confirmed: 1, settled: 0 });
  // A scope for another zone or id leaves the fact alone.
  const elsewhere = computeCoverage(base(records, { recheck: [{ ...scope, zones: [1411] }, { since: day(20), source: "x", ids: [999] }] }));
  expect(zone(elsewhere, 1429).types.pins.settled).toBe(1);
});

test("the recheck file is strict and every scope names something", () => {
  expect(RecheckFile.safeParse({ schema: "everloot.recheck/1", scopes: [] }).success).toBe(true);
  expect(RecheckFile.safeParse({ schema: "everloot.recheck/1", scopes: [{ since: day(0), source: "x" }] }).success).toBe(false);
  expect(RecheckFile.safeParse({ schema: "everloot.recheck/1", scopes: [{ since: day(0), source: "x", type: "quests", extra: 1 }] }).success).toBe(false);
});

test("one install reporting many times is one voter", () => {
  const rows = [...npcs(1, 5), ...npcs(1, 5), ...npcs(1, 5)];
  expect(zone(computeCoverage(base(rows)), 1429).types.npcs).toMatchObject({ reported: 2, confirmed: 0 });
});

test("rares: an NPC with an agreed rare rank, its name and each map's pin", () => {
  const report = computeCoverage(base([...npcs(3, 61, { rank: "rare" }), ...npcs(3, 62, { rank: "normal" })]));
  expect(zone(report, 1429).types.rares).toMatchObject({ observed: 2, confirmed: 2 });
  expect(field(report, 1429, "rares", "position")).toMatchObject({ confirmed: 1 });
});
