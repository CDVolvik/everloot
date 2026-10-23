import { expect, test } from "vitest";
import { buildItemSet } from "../src/assets/items.js";
import {
  CHECKED_WEAPONS, checkedDamageRange, confirmedReading, DAMAGE_READINGS, damageRange, type CheckedWeapon, type DamageReading,
} from "../src/assets/weapon-damage.js";
import type { Row, Rows } from "../src/talents/build-catalog.js";

const t = (rows: Row[]): Rows => new Map(rows.map((r, i) => [typeof r.ID === "number" ? r.ID : i + 1, r]));

// The item level 15 rows of the eight ItemDamage tables, as build 1.60.1.70450 holds them (one value per quality, 0 to 6).
const L15: Record<string, number[]> = {
  ItemDamageOneHand: [4.707848072052002, 6.957369327545166, 7.846413612365723, 10.635242462158203, 14.1300048828125, 14.1300048828125, 14.1300048828125],
  ItemDamageOneHandCaster: [4.707848072052002, 6.957369327545166, 7.846413612365723, 10.635242462158203, 14.1300048828125, 14.1300048828125, 14.1300048828125],
  ItemDamageTwoHand: [6.120202541351318, 9.044580459594727, 10.200337409973145, 13.825815200805664, 18.369007110595703, 18.369007110595703, 18.369007110595703],
  ItemDamageTwoHandCaster: [6.120202541351318, 9.044580459594727, 10.200337409973145, 13.825815200805664, 18.369007110595703, 18.369007110595703, 18.369007110595703],
  ItemDamageRanged: [3.672121524810791, 5.426747798919678, 6.120202541351318, 8.295489311218262, 11.021404266357422, 11.021404266357422, 11.021404266357422],
  ItemDamageThrown: [4.237063407897949, 6.261632442474365, 7.061772346496582, 9.571718215942383, 12.717004776000977, 12.717004776000977, 12.717004776000977],
  ItemDamageWand: [5.772976398468018, 9.678668022155762, 11.438450813293457, 16.051313400268555, 21.475955963134766, 21.475955963134766, 21.475955963134766],
  ItemDamageAmmo: [2.4480810165405273, 3.6178319454193115, 4.080134868621826, 5.530325889587402, 7.347602844238281, 7.347602844238281, 7.347602844238281],
};
const SPREAD = 0.6000000238418579; // ItemSparse.DmgVariance of most one-hand weapons, as the build stores it.

// Cutlass (851) as the build holds it; the other rows put the same weapon in each slot and kind, so each table is chosen.
const sparse = (id: number, InventoryType: number, extra: Record<string, unknown> = {}) => ({
  ID: id, Display_lang: `Weapon ${id}`, OverallQualityID: 1, ItemLevel: 15, InventoryType, ItemDelay: 2200, DmgVariance: SPREAD, DamageType: 0, Flags: [0, 0], ...extra,
});
const tables: Record<string, Rows> = {
  ItemSparse: t([
    sparse(851, 13, { Display_lang: "Cutlass", Flags: [0, 24576, 0, 0, 0] }), sparse(2, 13, { Flags: [0, 0x200] }), sparse(3, 17), sparse(4, 17, { Flags: [0, 0x200] }),
    sparse(5, 15), sparse(6, 25), sparse(7, 26, { DamageType: 2 }), sparse(8, 24, { ItemDelay: 3000, DmgVariance: 0 }), sparse(9, 23), sparse(10, 26),
  ]),
  Item: t([
    { ID: 851, ClassID: 2, SubclassID: 7 }, { ID: 2, ClassID: 2, SubclassID: 15 }, { ID: 3, ClassID: 2, SubclassID: 8 }, { ID: 4, ClassID: 2, SubclassID: 10 },
    { ID: 5, ClassID: 2, SubclassID: 2 }, { ID: 6, ClassID: 2, SubclassID: 16 }, { ID: 7, ClassID: 2, SubclassID: 19 }, { ID: 8, ClassID: 6, SubclassID: 2 },
    { ID: 9, ClassID: 2, SubclassID: 14 }, { ID: 10, ClassID: 2, SubclassID: 13 },
  ]),
  ...Object.fromEntries(Object.entries(L15).map(([name, Quality]) => [name, t([{ ID: 15, ItemLevel: 15, Quality }])])),
};
const { records } = buildItemSet((n) => tables[n]);
const rec = (id: number) => records.get(id)!;

test("each slot reads its own table, at the item's level and quality, and a slot with no table has no inputs", () => {
  const expected: [number, string][] = [
    [851, "ItemDamageOneHand"], [2, "ItemDamageOneHandCaster"], [3, "ItemDamageTwoHand"], [4, "ItemDamageTwoHandCaster"],
    [5, "ItemDamageRanged"], [6, "ItemDamageThrown"], [7, "ItemDamageWand"], [8, "ItemDamageAmmo"],
  ];
  for (const [id, table] of expected) expect(rec(id).w).toMatchObject({ t: table, dps: L15[table][1] });
  expect(rec(7).w!.ds).toBe(2);
  // A held-in-off-hand miscellaneous weapon and a fist weapon in a ranged slot: build 1.60.1 has one of each, and no table.
  expect(rec(9).w).toBeUndefined();
  expect(rec(10).w).toBeUndefined();
  for (const reading of Object.keys(DAMAGE_READINGS) as DamageReading[]) expect(damageRange(rec(9), reading)).toBeNull();
});

test("the two readings over the Cutlass's own numbers: 4 - 10 or 10 - 20", () => {
  expect(rec(851)).toMatchObject({ n: "Cutlass", l: 15, q: 1, d: 2200, w: { t: "ItemDamageOneHand", dps: 6.957369327545166, dv: SPREAD } });
  expect(damageRange(rec(851), "tableAlone")).toEqual({ min: 4, max: 10 });
  expect(damageRange(rec(851), "tableTimesSwing")).toEqual({ min: 10, max: 20 });
  // A two-hand at the same level: 9.0446 × (1 ± 0.3) and × 2.2 s.
  expect(damageRange(rec(3), "tableAlone")).toEqual({ min: 6, max: 12 });
  expect(damageRange(rec(3), "tableTimesSwing")).toEqual({ min: 13, max: 26 });
});

test("ammunition, a weapon with no swing time and a record without inputs get no range", () => {
  for (const reading of Object.keys(DAMAGE_READINGS) as DamageReading[]) {
    expect(damageRange(rec(8), reading)).toBeNull();
    expect(damageRange({ ...rec(851), d: 0 }, reading)).toBeNull();
    expect(damageRange({ d: 2200 }, reading)).toBeNull();
  }
});

// The checks below are made up: no weapon has been read off the game's tooltip yet.
const checked = (id: number, game: { min: number; max: number }, seen = "2026-11-04"): CheckedWeapon => {
  const r = rec(id);
  return { id, n: r.n, l: r.l, q: r.q, d: r.d, w: r.w!, game, seen, build: "1.60.1.99999" };
};

test("nothing is printed while no weapon has been checked", () => {
  expect(CHECKED_WEAPONS).toEqual([]);
  expect(confirmedReading()).toBeNull();
  for (const r of records.values()) expect(checkedDamageRange(r)).toBeNull();
});

test("the reading every check agrees with is the one used, and only for the tables a check came from", () => {
  const list = [checked(851, { min: 10, max: 20 }), checked(3, { min: 13, max: 26 }, "2026-11-05")];
  expect(confirmedReading(list)).toBe("tableTimesSwing");
  expect(checkedDamageRange(rec(851), list)).toEqual({ min: 10, max: 20, reading: "tableTimesSwing", table: "ItemDamageOneHand", checked: [list[0]] });
  expect(checkedDamageRange(rec(3), list)?.checked).toEqual([list[1]]);
  // No checked weapon came from the wand's, the thrown or the caster tables: they stay unknown.
  for (const id of [2, 4, 6, 7]) expect(checkedDamageRange(rec(id), list)).toBeNull();
});

test("a check that agrees with neither reading, or with both, confirms nothing", () => {
  expect(confirmedReading([checked(851, { min: 10, max: 20 }), checked(3, { min: 13, max: 25 })])).toBeNull();
  expect(confirmedReading([checked(851, { min: 9, max: 17 })])).toBeNull();
  const both = { ...checked(851, { min: 0, max: 0 }), d: 1000, w: { ...rec(851).w!, dps: 10, dv: 0 } };
  expect(confirmedReading([{ ...both, game: { min: 10, max: 10 } }])).toBeNull();
});

test("each weapon in the shipped list is whole, and the list confirms one reading", () => {
  for (const c of CHECKED_WEAPONS) {
    expect(c.id).toBeGreaterThan(0);
    expect(c.seen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(c.build).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(c.d).toBeGreaterThan(0);
  }
  if (CHECKED_WEAPONS.length) expect(confirmedReading()).not.toBeNull();
});
