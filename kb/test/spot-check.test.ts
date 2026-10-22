import { expect, test } from "vitest";
import { computeCoverage, RecheckFile, type RecheckScope } from "../src/coverage.js";
import {
  addWeeks, isoWeek, isoWeekStart, isSpotChecked, SPOT_CHECK_BOOSTED_RATE, SPOT_CHECK_RATE, spotCheckConflicts, spotCheckFacts,
  spotCheckHash, spotCheckOutcome, spotCheckRate,
} from "../src/spot-check.js";

const day = (n: number) => new Date(Date.UTC(2026, 6, 1 + n)).toISOString();

function npc(n: number, npcId: number, opts: { at?: number; from?: number; name?: string; x?: number } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    kind: "npc_sighting", installId: `install-${(opts.from ?? 0) + i}`, npcId, name: opts.name ?? "Marshal Dughan", mapId: 1429,
    x: opts.x ?? 42, y: 65, positionKind: "npc", capturedAt: day(opts.at ?? 0),
  }));
}

test("ISO weeks: Monday starts, the Thursday rule at the year's edges, and back again", () => {
  expect(isoWeek("2026-10-21T12:00:00Z")).toBe("2026-W43");
  expect(isoWeekStart("2026-W43").toISOString()).toBe("2026-10-19T00:00:00.000Z");
  expect(isoWeek("2026-10-19T00:00:00Z")).toBe("2026-W43");
  expect(isoWeek("2026-10-18T23:59:59Z")).toBe("2026-W42");
  expect(isoWeek("2021-01-03T00:00:00Z")).toBe("2020-W53");
  expect(isoWeek("2024-12-30T00:00:00Z")).toBe("2025-W01");
  expect(isoWeekStart("2025-W01").toISOString()).toBe("2024-12-30T00:00:00.000Z");
  expect(addWeeks("2026-W01", -1)).toBe("2025-W52");
  expect(addWeeks("2020-W52", 1)).toBe("2020-W53");
});

test("the pick is deterministic, about 2% a week, and a different set each week", () => {
  const keys = Array.from({ length: 20_000 }, (_, i) => ({ key: `npc:${i + 1}`, zone: 1429 }));
  const pick = (week: string) => keys.filter((k) => isSpotChecked(k, week)).map((k) => k.key);
  const w43 = pick("2026-W43");
  expect(pick("2026-W43")).toEqual(w43);
  expect(w43.length / keys.length).toBeGreaterThan(0.017);
  expect(w43.length / keys.length).toBeLessThan(0.023);
  const w44 = new Set(pick("2026-W44"));
  expect(w43.filter((k) => w44.has(k)).length).toBeLessThan(w43.length * 0.1);
  expect(spotCheckHash("npc:1", "2026-W43")).toBe(spotCheckHash("npc:1", "2026-W43"));
  // Over a year, most facts are looked at again at least once.
  const year = Array.from({ length: 52 }, (_, i) => addWeeks("2026-W01", i));
  const seen = keys.slice(0, 2_000).filter((k) => year.some((w) => isSpotChecked(k, w))).length;
  expect(seen / 2_000).toBeGreaterThan(0.6);
});

test("a zone's rate goes to 10% for the four weeks after a spot check there found a conflict, and holds the base pick", () => {
  const scope: RecheckScope = { since: "2026-10-19T00:00:00.000Z", source: "spot-check 2026-W43", type: "npcs", zones: [1429], ids: [7] };
  expect(spotCheckRate(1429, "2026-W43", [scope])).toBe(SPOT_CHECK_RATE);
  for (const w of ["2026-W44", "2026-W45", "2026-W46", "2026-W47"]) expect(spotCheckRate(1429, w, [scope])).toBe(SPOT_CHECK_BOOSTED_RATE);
  expect(spotCheckRate(1429, "2026-W48", [scope])).toBe(SPOT_CHECK_RATE);
  expect(spotCheckRate(1411, "2026-W44", [scope])).toBe(SPOT_CHECK_RATE);
  expect(spotCheckRate(null, "2026-W44", [scope])).toBe(SPOT_CHECK_RATE);
  // A scope from a blue post or the build watch is not a spot check.
  expect(spotCheckRate(1429, "2026-W44", [{ ...scope, source: "build-watch wow_classic_beta-70450" }])).toBe(SPOT_CHECK_RATE);
  const keys = Array.from({ length: 5_000 }, (_, i) => ({ key: `quest:${i}`, zone: 1429 }));
  const base = keys.filter((k) => isSpotChecked(k, "2026-W44"));
  const boosted = keys.filter((k) => isSpotChecked(k, "2026-W44", [scope]));
  expect(base.every((k) => boosted.includes(k))).toBe(true);
  expect(boosted.length / keys.length).toBeGreaterThan(0.08);
});

test("entities at the settled list's grain, placed as the coverage score places them", () => {
  const records = [
    ...npc(3, 1),
    { kind: "quest", installId: "install-0", questId: 50, title: "A Threat Within", level: 5, giverNpcId: 1, rewardItemIds: [], capturedAt: day(0) },
    { kind: "vendor", installId: "install-0", vendorNpcId: 1, items: [{ itemId: 159, priceCopper: 5 }], capturedAt: day(0) },
  ];
  const facts = spotCheckFacts(records);
  expect(facts.map((f) => [f.key, f.zone])).toEqual([["npc:1", 1429], ["pin:1:1429", 1429], ["quest:50", 1429], ["vendor:1", 1429]]);
  expect([...facts.find((f) => f.key === "vendor:1")!.fields.keys()]).toEqual(["price:159", "stock:159"]);
});

/** The first NPC id, from 1, whose entity key the week picks. */
function pickedNpc(week: string, kind: "npc" | "pin"): number {
  for (let id = 1; ; id += 1) if (isSpotChecked({ key: kind === "npc" ? `npc:${id}` : `pin:${id}:1429`, zone: 1429 }, week)) return id;
}

test("a settled, spot-checked fact with another value reported since its week began goes to recheck from that week", () => {
  const week = isoWeek(day(100));
  const id = pickedNpc(week, "npc");
  const start = (isoWeekStart(week).getTime() - Date.UTC(2026, 6, 1)) / 86_400_000;
  const settled = npc(5, id, { at: 1 });
  expect(spotCheckOutcome(spotCheckFacts(settled).find((f) => f.key === `npc:${id}`)!, week)).toEqual({ settled: true, conflict: false });
  // The same name again is no conflict; a renamed NPC is.
  expect(spotCheckConflicts([...settled, ...npc(1, id, { at: start + 1, from: 9 })], week).conflicts).toEqual([]);
  const run = spotCheckConflicts([...settled, ...npc(1, id, { at: start + 1, from: 9, name: "Marshal McBride" })], week);
  expect(run.conflicts).toEqual([{
    key: `npc:${id}`, zone: 1429, checkedIn: week,
    scope: { since: isoWeekStart(week).toISOString(), source: `spot-check ${week}`, type: "npcs", zones: [1429], ids: [id], note: `spot-checked in ${week}` },
  }]);
  expect(RecheckFile.parse({ schema: "everloot.recheck/1", scopes: [run.conflicts[0]!.scope] }).scopes).toHaveLength(1);
  // A conflict before the week began, or for a fact the week did not pick, is not this check's.
  expect(spotCheckConflicts([...settled, ...npc(1, id, { at: start - 1, from: 9, name: "Marshal McBride" })], week).conflicts).toEqual([]);
  // Found again the next week, the fact already under a spot-check scope is not reported twice.
  const next = addWeeks(week, 1);
  expect(spotCheckConflicts([...settled, ...npc(1, id, { at: start + 1, from: 9, name: "Marshal McBride" })], next, [run.conflicts[0]!.scope]).conflicts).toEqual([]);
  // And the coverage score then counts the NPC's fields as recheck, not settled.
  const score = computeCoverage({ records: [...settled, ...npc(1, id, { at: start + 1, from: 9, name: "Marshal McBride" })], asOf: day(103), zones: [{ mapId: 1429, name: "Elwynn Forest" }], recheck: [run.conflicts[0]!.scope] });
  expect(score.zones[0]!.types.npcs).toMatchObject({ settled: 0, recheck: 1 });
});

test("a pin conflicts when a report since its week lies outside 5 map units of the settled median", () => {
  const week = isoWeek(day(100));
  const id = pickedNpc(week, "pin");
  const start = (isoWeekStart(week).getTime() - Date.UTC(2026, 6, 1)) / 86_400_000;
  const settled = npc(5, id, { at: 1 });
  const near = spotCheckConflicts([...settled, ...npc(1, id, { at: start + 1, from: 9, x: 45 })], week).conflicts.map((c) => c.key);
  expect(near).not.toContain(`pin:${id}:1429`);
  const far = spotCheckConflicts([...settled, ...npc(1, id, { at: start + 1, from: 9, x: 60 })], week).conflicts;
  expect(far.find((c) => c.key === `pin:${id}:1429`)?.scope).toMatchObject({ type: "pins", zones: [1429], ids: [id] });
});

test("a fact not settled when its week began is not counted or checked", () => {
  const week = isoWeek(day(100));
  const id = pickedNpc(week, "npc");
  const start = (isoWeekStart(week).getTime() - Date.UTC(2026, 6, 1)) / 86_400_000;
  // Four installs: confirmed, never settled.
  const run = spotCheckConflicts([...npc(4, id, { at: 1 }), ...npc(1, id, { at: start + 1, from: 9, name: "Other" })], week);
  expect(run.conflicts).toEqual([]);
  expect(run.settled).toBe(0);
});
