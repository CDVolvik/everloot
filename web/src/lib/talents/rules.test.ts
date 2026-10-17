import { describe, expect, test } from "vitest";
import {
  add, canAdd, canRemove, commit, levelFor, pointsAtLevel, pointsByTree, pointsSpent, redo, remove,
  startHistory, undo,
} from "./rules";
import { fixture } from "./fixture";
import type { Ranks } from "./types";

const ALL = 99;

/** Take `count` points on a node, failing the test if any is refused. */
function take(ranks: Ranks, id: number, count = 1, available = ALL, choice?: number): Ranks {
  let next = ranks;
  for (let i = 0; i < count; i++) {
    const after = add(fixture, next, id, available, choice);
    expect(after, `point ${i + 1} on ${id}`).not.toBe(next);
    next = after;
  }
  return next;
}

/** Ten points in row 1 and six in row 2: sixteen above row 4. */
function sixteen(): Ranks {
  let r: Ranks = {};
  r = take(r, 11, 5);
  r = take(r, 12, 5);
  r = take(r, 21, 5);
  return take(r, 22);
}

describe("adding", () => {
  test("a row opens only after enough points are spent on the rows above", () => {
    expect(canAdd(fixture, {}, 21, ALL)).toEqual({ ok: false, reason: "gate" });
    const four = take({}, 11, 4);
    expect(canAdd(fixture, four, 21, ALL).reason).toBe("gate");
    expect(canAdd(fixture, take({}, 11, 5), 21, ALL).ok).toBe(true);
  });

  test("a talent with a prerequisite needs it at full rank, not just started", () => {
    const base = take({}, 11, 5);
    expect(canAdd(fixture, base, 22, ALL).reason).toBe("prereq");
    const started = take(base, 12, 4);
    expect(canAdd(fixture, started, 22, ALL).reason).toBe("prereq");
    expect(canAdd(fixture, take(started, 12), 22, ALL).ok).toBe(true);
  });

  test("stops at max rank and when the level has no points left", () => {
    expect(canAdd(fixture, take({}, 11, 5), 11, ALL).reason).toBe("max-rank");
    expect(canAdd(fixture, take({}, 11, 2), 12, 2).reason).toBe("no-points");
    expect(add(fixture, take({}, 11, 2), 12, 2)).toEqual(take({}, 11, 2));
  });

  test("a refused point returns the same object, so it leaves no undo step", () => {
    const ranks: Ranks = {};
    expect(add(fixture, ranks, 21, ALL)).toBe(ranks);
    expect(add(fixture, ranks, 9999, ALL)).toBe(ranks);
  });

  test("a gate on points anywhere counts the other talents, in any tree", () => {
    const five = take({}, 51, 5);
    expect(canAdd(fixture, five, 52, ALL).reason).toBe("gate"); // 5 others, needs 6
    expect(canAdd(fixture, take(five, 11), 52, ALL).ok).toBe(true);
  });
});

describe("removing", () => {
  test("a point can be taken back when nothing depends on it", () => {
    const ranks = take({}, 11, 3);
    expect(remove(fixture, ranks, 11)).toEqual({ 11: { rank: 2 } });
    expect(remove(fixture, take({}, 11), 11)).toEqual({});
  });

  test("not when a later row would lose its gate", () => {
    const ranks = take(take({}, 11, 5), 21);
    expect(canRemove(fixture, ranks, 11)).toEqual({ ok: false, reason: "dependents" });
    expect(remove(fixture, ranks, 11)).toBe(ranks);
    // Take the dependent point first and the same removal works.
    expect(canRemove(fixture, remove(fixture, ranks, 21), 11).ok).toBe(true);
  });

  test("not when it is the prerequisite of a talent that has points", () => {
    let r = take({}, 11, 5);
    r = take(r, 12, 5);
    r = take(r, 22);
    expect(canRemove(fixture, r, 12).reason).toBe("dependents");
    expect(canRemove(fixture, r, 22).ok).toBe(true);
  });

  test("an empty talent has nothing to take back", () => {
    expect(canRemove(fixture, {}, 11)).toEqual({ ok: false, reason: "empty" });
  });
});

describe("the sixteen-point gate", () => {
  test("opens at exactly sixteen points above, not fifteen", () => {
    const fifteen = remove(fixture, sixteen(), 22);
    expect(pointsSpent(fifteen)).toBe(15);
    expect(canAdd(fixture, fifteen, 41, ALL).reason).toBe("gate");
    expect(canAdd(fixture, sixteen(), 41, ALL).ok).toBe(true);
  });

  test("once the sixteenth point is gone the talent behind it cannot stay", () => {
    const withGated = take(sixteen(), 41);
    expect(canRemove(fixture, withGated, 22)).toEqual({ ok: false, reason: "dependents" });
    expect(canRemove(fixture, withGated, 11).reason).toBe("dependents");
    expect(canRemove(fixture, withGated, 21).reason).toBe("dependents");
    // The gated talent itself can always be given back.
    expect(canRemove(fixture, withGated, 41).ok).toBe(true);
  });

  test("a point on a row between still counts toward the gate", () => {
    // One point on row 3 makes up for the one taken from row 2, so the gate at row 4 still holds.
    const bridged = take(take(sixteen(), 31), 41);
    expect(pointsSpent(bridged)).toBe(18);
    expect(canRemove(fixture, bridged, 21).ok).toBe(true);
    // A second point from row 2 leaves fifteen above row 4 again.
    const after = remove(fixture, bridged, 21);
    expect(canRemove(fixture, after, 21).reason).toBe("dependents");
  });

  test("a gate on points anywhere blocks the same way", () => {
    const r = take(take({}, 51, 5), 11);
    const gated = take(r, 52);
    expect(canRemove(fixture, gated, 11).reason).toBe("dependents");
    expect(canRemove(fixture, gated, 51).reason).toBe("dependents");
    expect(canRemove(fixture, gated, 52).ok).toBe(true);
  });
});

describe("choice nodes", () => {
  const open = () => take(take({}, 11, 5), 12, 5);

  test("take one entry for one point", () => {
    const r = take(open(), 32, 1, ALL, 1);
    expect(r[32]).toEqual({ rank: 1, choice: 1 });
    expect(pointsSpent(r)).toBe(11);
  });

  test("picking the other entry swaps it without spending a second point", () => {
    const r = take(open(), 32, 1, ALL, 0);
    const swapped = add(fixture, r, 32, ALL, 1);
    expect(swapped[32]).toEqual({ rank: 1, choice: 1 });
    expect(pointsSpent(swapped)).toBe(pointsSpent(r));
    expect(add(fixture, swapped, 32, ALL, 1)).toBe(swapped);
  });

  test("a swap works even with no points left", () => {
    const r = take(open(), 32, 1, ALL, 0);
    expect(add(fixture, r, 32, pointsSpent(r), 1)[32]?.choice).toBe(1);
  });

  test("the choice is gated like any node, and an unknown entry is refused", () => {
    expect(add(fixture, {}, 32, ALL, 0)).toEqual({});
    expect(add(fixture, open(), 32, ALL, 5)).toEqual(open());
  });

  test("taking the point back clears the choice", () => {
    const r = take(open(), 32, 1, ALL, 1);
    expect(remove(fixture, r, 32)[32]).toBeUndefined();
  });
});

describe("points and levels", () => {
  test("one point per level from level 10", () => {
    expect(pointsAtLevel(fixture, 9)).toBe(0);
    expect(pointsAtLevel(fixture, 10)).toBe(1);
    expect(pointsAtLevel(fixture, 40)).toBe(31);
    expect(pointsAtLevel(fixture, 60)).toBe(51);
    expect(pointsAtLevel(fixture, 99)).toBe(51);
  });

  test("levelFor is the lowest level that holds the points", () => {
    expect(levelFor(fixture, 0)).toBe(1);
    expect(levelFor(fixture, 1)).toBe(10);
    expect(levelFor(fixture, 51)).toBe(60);
    for (const p of [1, 7, 31, 51]) expect(pointsAtLevel(fixture, levelFor(fixture, p))).toBe(p);
  });

  test("points are counted per tree", () => {
    const r = take(take({}, 11, 3), 51, 2);
    expect([...pointsByTree(fixture, r)]).toEqual([[1, 3], [2, 2]]);
    expect([...pointsByTree(fixture, {})]).toEqual([[1, 0], [2, 0]]);
  });
});

describe("undo and redo", () => {
  test("walk back and forward through changes", () => {
    let h = startHistory<Ranks>({});
    h = commit(h, take({}, 11));
    h = commit(h, take(h.present, 11));
    expect(pointsSpent(h.present)).toBe(2);
    h = undo(h);
    expect(pointsSpent(h.present)).toBe(1);
    h = undo(h);
    expect(h.present).toEqual({});
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(pointsSpent(h.present)).toBe(2);
    expect(redo(h)).toBe(h);
  });

  test("a new change after an undo drops the redo branch", () => {
    let h = commit(commit(startHistory<Ranks>({}), take({}, 11)), take({}, 12));
    h = undo(h);
    h = commit(h, take({}, 51));
    expect(h.future).toEqual([]);
    expect(h.present).toEqual({ 51: { rank: 1 } });
  });

  test("committing the same state adds no step", () => {
    const h = startHistory<Ranks>({});
    expect(commit(h, h.present)).toBe(h);
  });

  test("reset is one undoable step", () => {
    let h = commit(startHistory<Ranks>({}), take({}, 11, 3));
    h = commit(h, {});
    expect(h.present).toEqual({});
    expect(pointsSpent(undo(h).present)).toBe(3);
  });
});
