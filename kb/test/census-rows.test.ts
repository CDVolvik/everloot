import { expect, test } from "vitest";
import { mergeCensusRows } from "../src/census-rows.js";

const key = "b".repeat(64);
const row = (over: Record<string, unknown> = {}) => ({
  kind: "census_seen", installId: "install-one", eventId: `census_seen:2026-10-18:${key.slice(0, 24)}`, capturedAt: "2026-10-18T10:00:00Z",
  characterKey: key, serverId: 4395, race: "Orc", class: "WARRIOR", level: 20, faction: "Horde", via: "target", ...over,
});

test("a repeat of the same event keeps the latest capturedAt, in either order", () => {
  const early = row();
  const late = row({ capturedAt: "2026-10-18T18:00:00Z", level: 22 });
  expect(mergeCensusRows([], [early, late])).toEqual([late]);
  expect(mergeCensusRows([], [late, early])).toEqual([late]);
  expect(mergeCensusRows(mergeCensusRows([], [late]), [early])).toEqual([late]);
});

test("the same time compares as a time, not as text, and a tie keeps the higher level", () => {
  const utc = row({ capturedAt: "2026-10-18T18:00:00Z", level: 21 });
  const offset = row({ capturedAt: "2026-10-18T13:00:00-05:00", level: 23 });
  expect(mergeCensusRows([], [utc, offset])).toEqual([offset]);
  expect(mergeCensusRows([], [offset, utc])).toEqual([offset]);
});

test("a full tie is settled the same way whatever the order, and never drops both", () => {
  const a = row({ via: "target" });
  const b = row({ via: "group" });
  const one = mergeCensusRows([], [a, b]);
  expect(one).toHaveLength(1);
  expect(mergeCensusRows([], [b, a])).toEqual(one);
});

test("different installs and different days are different events", () => {
  const rows = [row(), row({ installId: "install-two" }), row({ eventId: `census_seen:2026-10-19:${key.slice(0, 24)}`, capturedAt: "2026-10-19T10:00:00Z" })];
  expect(mergeCensusRows([], rows)).toHaveLength(3);
});

test("anything that is not a stored census row is skipped without an error, a GUID-bearing row included", () => {
  const sent = { ...row(), characterKey: undefined, serverId: undefined, guid: "Player-4395-0A1B2C3D" };
  const loot = { kind: "loot", installId: "install-one", eventId: "e:1", capturedAt: "2026-10-18T10:00:00Z", sourceNpcId: 1, items: [] };
  expect(() => mergeCensusRows([], [null, 7, "x", {}, sent, loot, row({ level: 61 })])).not.toThrow();
  expect(mergeCensusRows([], [null, 7, "x", {}, sent, loot, row({ level: 61 }), row()])).toEqual([row()]);
});

test("across uploads one install keeps at most the daily allowance, the same rows whatever the order", () => {
  const hex = (i: number) => i.toString(16).padStart(64, "0");
  const seen = (i: number, day = "2026-10-18") => row({ characterKey: hex(i), eventId: `census_seen:${day}:${hex(i).slice(-24)}`, capturedAt: `${day}T10:00:00Z` });
  const first = Array.from({ length: 300 }, (_, i) => seen(i));
  const second = Array.from({ length: 300 }, (_, i) => seen(1000 + i));
  const folded = mergeCensusRows(mergeCensusRows([], first), second);
  expect(folded).toHaveLength(500);
  expect(mergeCensusRows(mergeCensusRows([], second), first)).toEqual(folded);
  expect(mergeCensusRows([], [...second, ...first])).toEqual(folded);
  // Another install and another day each have their own allowance.
  expect(mergeCensusRows(folded, [seen(5000, "2026-10-19"), { ...seen(5001), installId: "install-two" }])).toHaveLength(502);
});
