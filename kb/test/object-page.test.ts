import { expect, test } from "vitest";
import { handleObjectPage, objectFactsFromRecords, objectList, objectPage } from "../src/object-page.js";

const loot = (installId: string, objectId: number, items: number[], n = 0) => ({
  kind: "loot", sourceEvidence: "loot-api", installId, eventId: `${installId}:${objectId}:${n}`, capturedAt: "2026-10-10T00:00:00Z",
  sourceObjectId: objectId, items: items.map((itemId) => ({ itemId, count: 1 })),
});
const name = (installId: string, itemId: number, n: string) => ({ kind: "item_seen", installId, capturedAt: "2026-10-10T00:00:00Z", itemId, name: n, quality: "common" });

const records = [
  // Copper vein 1731: three installs, copper ore in two of four windows.
  loot("a", 1731, [2770]), loot("b", 1731, [2770, 2835]), loot("c", 1731, []), loot("c", 1731, [], 1),
  // An herb two installs looted: not public yet.
  loot("a", 1618, [765]), loot("b", 1618, [765]),
  // A chest three installs opened and found empty: a measured zero.
  loot("a", 2843, []), loot("b", 2843, []), loot("c", 2843, []),
  // An NPC's loot is not an object's.
  { ...loot("a", 1, [1]), sourceObjectId: undefined, sourceNpcId: 448 },
  ...["a", "b", "c"].map((i) => name(i, 2770, "Copper Ore")),
  // The chest's name: three installs agree, whatever the case and spacing. The herb's: only two installs so far.
  ...["a", "b", "c"].map((i, n) => ({ ...loot(i, 2843, [], 5 + n), sourceObjectName: n === 2 ? " large iron bound chest" : "Large Iron Bound Chest" })),
  { ...loot("a", 1618, [765], 5), sourceObjectName: "Peacebloom" }, { ...loot("b", 1618, [765], 5), sourceObjectName: "Peacebloom" },
];

test("an object page: public drops with windows, items and installs, agreed item names, or a measured zero", () => {
  const facts = objectFactsFromRecords(records);
  const vein = objectPage(1731, facts);
  expect(vein.drops.map((d) => [d.itemId, d.kills, d.drops, d.reporters, d.itemName])).toEqual([
    [2770, 4, 2, 3, "Copper Ore"],
    [2835, 4, 1, 3, null],
  ]);
  expect(vein.zero).toBeNull();
  expect(objectPage(1618, facts)).toMatchObject({ drops: [], zero: null, queued: true });
  expect(objectPage(2843, facts)).toMatchObject({ drops: [], zero: { kills: 6, reporters: 3 } });
  expect(vein.name).toBeNull();
  expect(objectPage(2843, facts).name).toBe("Large Iron Bound Chest");
  expect(objectPage(1618, facts).name).toBeNull();
  expect(objectPage(999, facts)).toMatchObject({ drops: [], zero: null, queued: false });
});

test("the object list holds only objects with public observations, most-looted first", () => {
  expect(objectList(objectFactsFromRecords(records))).toEqual([
    { objectId: 2843, name: "Large Iron Bound Chest", windows: 6, items: 0, reporters: 3 },
    { objectId: 1731, name: null, windows: 4, items: 2, reporters: 3 },
  ]);
});

test("the object answer says what is known and what is not", () => {
  const facts = objectFactsFromRecords(records);
  const text = handleObjectPage({ objectId: 1731 }, facts);
  expect(text).toContain("Object 1731");
  expect(text).toContain("Item 2770 Copper Ore  4 observed loot windows  2 windows with this item  50.0%  3 distinct install reports");
  expect(text).toContain("No agreed name yet");
  expect(handleObjectPage({ objectId: 2843 }, facts)).toContain("Object 2843 — Large Iron Bound Chest");
  expect(handleObjectPage({ objectId: 2843 }, facts)).toContain("0 items in 6 observed loot windows");
  expect(handleObjectPage({ objectId: 1618 }, facts)).toContain("Loot observations unrecorded");
  expect(handleObjectPage({ objectId: 0 }, facts)).toBe("Name an object id.");
});
