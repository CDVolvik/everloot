import { expect, test } from "vitest";
import { computeCoverage, type CoverageExpected, type CoverageInput } from "../src/coverage.js";
import { computePlateau, measurePlateau, PLATEAU_TYPES, plateauInput, SETTLED_LIST_REFRESH_DAYS } from "../src/plateau.js";

const day = (n: number) => new Date(Date.UTC(2026, 6, 1 + n)).toISOString();
const ZONES = [{ mapId: 1429, name: "Elwynn Forest" }];
const AS_OF = 100;

/** `n` installs saw NPC `npcId` (a pin position and a name), from install `from`, on day `at`. */
function npc(n: number, npcId: number, opts: { at?: number; from?: number; name?: string } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    kind: "npc_sighting", installId: `install-${(opts.from ?? 0) + i}`, npcId, name: opts.name ?? `NPC ${npcId}`, mapId: 1429,
    x: 40, y: 60, positionKind: "npc", capturedAt: day(opts.at ?? 0),
  }));
}
/** Every type the site's plateau reads expects `pins` facts; NPC names expect as many. */
const expected = (pins: number, rest = 0): CoverageExpected => ({
  version: 1, dataAsOf: day(AS_OF),
  zones: [{ zone: "1429", types: { npc: pins, npc_pin: pins, quest: rest, vendor: rest, drop: rest }, fields: { npc: { name: pins }, npc_pin: { position: pins } } }],
});
const input = (records: unknown[], extra: Partial<CoverageInput> = {}): CoverageInput => ({ records, asOf: day(AS_OF), zones: ZONES, expected: expected(10), ...extra });
const pins = (r: ReturnType<typeof computePlateau>) => r.types.find((t) => t.type === "pins")!;

test("a type at 90% confirmed, 75% settled and nothing newly confirmed in 28 days is at its plateau", () => {
  // Ten NPCs, all settled long ago: 100% confirmed and settled, none new.
  const old = Array.from({ length: 10 }, (_, i) => npc(5, 100 + i, { at: 1 })).flat();
  const report = computePlateau(input(old));
  expect(pins(report)).toMatchObject({ denominator: 10, confirmed: 10, settled: 10, newlyConfirmed: 0, atPlateau: true });
  expect(pins(report).shares).toEqual({ confirmed: 1, settled: 1, newlyConfirmed: 0 });
  expect(report.windowStart).toBe(day(AS_OF - 28));
  expect(report.dataAsOf).toBe(day(AS_OF));
  expect(report.installs).toBe(5);
  expect(report.windowInstalls).toBe(0);
  // Quests, vendors and drops expect nothing here: unknown, so the site is not claimed.
  expect(report.types.find((t) => t.type === "quests")!.atPlateau).toBeNull();
  expect(report.site).toBeNull();
  expect(report.refreshDays).toBe(SETTLED_LIST_REFRESH_DAYS.collecting);
  expect(PLATEAU_TYPES).toEqual(["quests", "pins", "vendors", "drops"]);
});

test("a fact confirmed inside the window counts as newly confirmed; one confirmed before it does not", () => {
  const old = Array.from({ length: 9 }, (_, i) => npc(5, 100 + i, { at: 1 })).flat();
  // Day 80 is inside the 28 days before day 100: one of 10 expected pins is new, 10% >= 0.5%.
  const report = computePlateau(input([...old, ...npc(3, 200, { at: 80 })]));
  expect(pins(report)).toMatchObject({ confirmed: 10, settled: 9, newlyConfirmed: 1, atPlateau: false });
  expect(pins(report).shares.newlyConfirmed).toBeCloseTo(0.1);
  expect(report.windowInstalls).toBe(3);
  const before = computePlateau(input([...old, ...npc(3, 200, { at: 60 })]));
  expect(pins(before)).toMatchObject({ newlyConfirmed: 0, atPlateau: true });
});

test("below 90% confirmed or 75% settled is not the plateau, whatever the rate", () => {
  const seven = Array.from({ length: 7 }, (_, i) => npc(5, 100 + i, { at: 1 })).flat();
  const twoFresh = Array.from({ length: 2 }, (_, i) => npc(3, 300 + i, { at: 1, from: 10 })).flat();
  // 9 of 10 confirmed (90%) but 7 settled (70%): no.
  const report = computePlateau(input([...seven, ...twoFresh]));
  expect(pins(report)).toMatchObject({ confirmed: 9, settled: 7, newlyConfirmed: 0, atPlateau: false });
});

test("the site is at its plateau when quests, pins, vendors and drops all are, and its list then refreshes weekly", () => {
  const now = computeCoverage(input([]));
  const all = (n: number) => ({ denominator: n, reported: 0, recheck: 0, confirmed: n, settled: n, expected: n, observed: n });
  for (const t of PLATEAU_TYPES) now.totals[t] = all(100);
  const report = measurePlateau(now, now, []);
  expect(report.site).toBe(true);
  expect(report.refreshDays).toBe(SETTLED_LIST_REFRESH_DAYS.plateau);
  now.totals.drops = { ...all(100), settled: 74 };
  expect(measurePlateau(now, now, []).site).toBe(false);
});

test("without an expected file or a data date every share is unknown, never a claim", () => {
  const records = npc(5, 100, { at: 1 });
  const noFile = computePlateau(input(records, { expected: null }));
  expect(pins(noFile)).toMatchObject({ denominator: null, atPlateau: null, shares: { confirmed: null, settled: null } });
  expect(noFile.expected).toBeNull();
  const noDate = computePlateau(input(records, { asOf: null }));
  expect(noDate.windowStart).toBeNull();
  expect(pins(noDate)).toMatchObject({ newlyConfirmed: null, atPlateau: null });
  expect(plateauInput(input(records, { asOf: null }))).toBeNull();
});

test("a fact in recheck is neither confirmed nor settled, and a scope that began inside the window is not applied to its start", () => {
  const old = Array.from({ length: 10 }, (_, i) => npc(5, 100 + i, { at: 1 })).flat();
  const scope = { since: day(90), source: "https://example.test/hotfix", type: "pins" as const, ids: [100, 101] };
  const report = computePlateau(input(old, { recheck: [scope] }));
  expect(pins(report)).toMatchObject({ confirmed: 8, settled: 8, recheck: 2, atPlateau: false });
  expect(plateauInput(input(old, { recheck: [scope] }))!.recheck).toEqual([]);
  // Three new installs after the scope confirm one again. It was confirmed at the window's start too, so the rise
  // between the two scores does not count it as new: the rate measures facts joining, not facts coming back.
  const back = computePlateau(input([...old, ...npc(3, 100, { at: 95, from: 20 })], { recheck: [scope] }));
  expect(pins(back)).toMatchObject({ confirmed: 9, recheck: 1, newlyConfirmed: 0, atPlateau: true });
});

test("the window's start keeps only reports captured by then", () => {
  const records = [...npc(3, 100, { at: 1 }), ...npc(3, 200, { at: 99 }), { kind: "npc_sighting", installId: "x", npcId: 300 }];
  const earlier = plateauInput(input(records))!;
  expect(earlier.asOf).toBe(day(72));
  expect(earlier.records).toHaveLength(3);
});
