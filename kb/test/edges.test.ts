import { expect, test } from "vitest";
import { clientEdges, edgesFrom, groupByRel, handleEntityRelations, observedEdges, type Edge } from "../src/edges.js";

type Rows = Map<number, Record<string, unknown>>;
const rows = (list: Record<string, unknown>[]): Rows => new Map(list.map((r) => [r.ID as number, r]));
const build = { version: "1.60.1.70450", extractedAt: "2026-10-18T08:08:17.671Z" };

function tables(): (t: string) => Rows | undefined {
  const all: Record<string, Rows> = {
    SpellEffect: rows([
      { ID: 1, SpellID: 2660, Effect: 24, EffectItemType: 2862, DifficultyID: 0 }, // Rough Sharpening Stone
      { ID: 2, SpellID: 133, Effect: 2, EffectItemType: 0, DifficultyID: 0 }, // Fireball: not a create-item effect
      { ID: 3, SpellID: 9999, Effect: 24, EffectItemType: 0, DifficultyID: 0 }, // create-item with no item
    ]),
    SpellReagents: rows([{ ID: 7, SpellID: 2660, Reagent: [2835, 0, 0, 0, 0, 0, 0, 0], ReagentCount: [1, 0, 0, 0, 0, 0, 0, 0] }]),
    ItemSet: rows([{ ID: 209, Name_lang: "Battlegear of Might", ItemID: [16862, 16863, 0] }]),
    Item: rows([
      { ID: 2862, IconFileDataID: 135249 }, { ID: 2863, IconFileDataID: 135249 },
      { ID: 2835, IconFileDataID: 135232 }, // alone with its icon: no same-icon edge
      { ID: 16862, IconFileDataID: 0 },
    ]),
  };
  return (t) => all[t];
}

test("client edges: created by, reagent for, part of set, same icon, each from the game files", () => {
  const edges = clientEdges(tables(), build);
  const pick = (e: Edge) => [e.fromKind, e.fromId, e.rel, e.toKind, e.toId];
  expect(edges.map(pick)).toEqual([
    ["item", 2862, "created_by", "spell", 2660],
    ["item", 2835, "reagent_for", "spell", 2660],
    ["item", 16862, "part_of_set", "item_set", 209],
    ["item", 16863, "part_of_set", "item_set", 209],
    // One edge per item to the shared icon file, not one per pair: one icon is shared by 1,141 items in 1.60.1.
    ["item", 2862, "same_icon", "icon", 135249],
    ["item", 2863, "same_icon", "icon", 135249],
  ]);
  expect(edges.every((e) => e.evidence === "client" && e.build === "1.60.1.70450" && e.installs === null)).toBe(true);
  expect(edges[0]).toMatchObject({ firstSeen: build.extractedAt, lastSeen: build.extractedAt });
});

test("a table the build does not have gives no edges of that kind, not an error", () => {
  expect(clientEdges(() => undefined, build)).toEqual([]);
});

const rec = (r: Record<string, unknown>) => ({ capturedAt: "2026-10-10T12:00:00Z", ...r });
const loot = (installId: string, capturedAt: string, items: number[], source = { sourceNpcId: 448 }) =>
  rec({ kind: "loot", sourceEvidence: "loot-api", installId, capturedAt, ...source, items: items.map((itemId) => ({ itemId, count: 1 })) });

test("observed edges follow the 3-install rule and carry how many installs agree and when", () => {
  const records = [
    loot("install-a", "2026-10-01T10:00:00Z", [1307]),
    loot("install-b", "2026-10-03T10:00:00Z", []),
    loot("install-c", "2026-10-05T10:00:00Z", [1307]),
    // Two installs only: not public.
    loot("install-a", "2026-10-01T10:00:00Z", [2589], { sourceObjectId: 1617 } as never),
    loot("install-b", "2026-10-02T10:00:00Z", [2589], { sourceObjectId: 1617 } as never),
    ...["a", "b", "c"].map((i) => rec({ kind: "vendor", installId: `install-${i}`, vendorNpcId: 1250, items: [{ itemId: 159, priceCopper: 25 }] })),
    ...["a", "b", "c"].map((i) => rec({ kind: "quest", installId: `install-${i}`, questId: 176, title: "Wanted: Hogger", level: 11, rewardItemIds: [1909] })),
    ...["a", "b", "c"].map((i) => rec({ kind: "npc_sighting", installId: `install-${i}`, npcId: 448, name: "Hogger", mapId: 1429, x: 26, y: 92, positionKind: "npc" })),
    // Player positions never place an NPC.
    ...["a", "b", "c"].map((i) => rec({ kind: "npc_sighting", installId: `install-${i}`, npcId: 448, name: "Hogger", mapId: 1436, x: 1, y: 1, positionKind: "player" })),
  ];
  const edges = observedEdges(records, "2026-10-18T00:00:00Z");
  const pick = (e: Edge) => [e.fromKind, e.fromId, e.rel, e.toKind, e.toId, e.installs];
  expect(edges.map(pick)).toEqual([
    ["item", 1307, "dropped_by", "npc", 448, 3],
    ["item", 159, "sold_by", "npc", 1250, 3],
    ["item", 1909, "reward_from", "quest", 176, 3],
    ["npc", 448, "located_in", "zone", 1429, 3],
  ]);
  expect(edges[0]).toMatchObject({ evidence: "observed", build: null, firstSeen: "2026-10-01T10:00:00.000Z", lastSeen: "2026-10-05T10:00:00.000Z" });
});

test("a capture time after the data was current does not move last seen", () => {
  const records = ["a", "b", "c"].map((i, n) =>
    rec({ kind: "quest", installId: `install-${i}`, questId: 1, title: "Q", level: 1, rewardItemIds: [5], capturedAt: n === 2 ? "2099-01-01T00:00:00Z" : "2026-10-02T00:00:00Z" }));
  expect(observedEdges(records, "2026-10-18T00:00:00Z")[0]).toMatchObject({ installs: 3, lastSeen: "2026-10-02T00:00:00.000Z" });
});

test("the relations answer lists both directions, labels file edges with their build and credits each kind of evidence", () => {
  const client = clientEdges(tables(), build);
  const observed = observedEdges(["a", "b", "c"].map((i) =>
    rec({ kind: "vendor", installId: `install-${i}`, vendorNpcId: 1250, items: [{ itemId: 2862, priceCopper: 10 }] })), "2026-10-18T00:00:00Z");
  const text = handleEntityRelations({ kind: "item", id: 2862 }, observed, client);
  expect(text).toContain("Item 2862");
  expect(text).toContain("Sold by: NPC 1250 (3 installs, last seen 2026-10-10)");
  expect(text).toContain("Created by: spell 2660 (found in game files, unconfirmed; build 1.60.1.70450)");
  expect(text).toContain("Same icon: icon file 135249, shared with item 2863");
  expect(text).toContain("CC BY-SA 4.0");
  expect(text).toContain("Blizzard");
  // The other direction: what a spell makes and uses.
  const spell = handleEntityRelations({ kind: "spell", id: 2660 }, observed, client);
  expect(spell).toContain("Creates: item 2862");
  expect(spell).toContain("Uses reagent: item 2835");
  expect(handleEntityRelations({ kind: "item", id: 1 }, [], [])).toContain("No relations recorded for item 1");
  expect(handleEntityRelations({ kind: "item", id: 2862, rel: "sold_by" }, observed, client)).not.toContain("Created by");
});

test("edges from one entity, grouped by relation in a fixed order", () => {
  const all = [...clientEdges(tables(), build), ...observedEdges([
    ...["a", "b", "c"].map((i) => rec({ kind: "vendor", installId: `install-${i}`, vendorNpcId: 1250, items: [{ itemId: 2862, priceCopper: 10 }] })),
  ], "2026-10-18T00:00:00Z")];
  const groups = groupByRel(edgesFrom(all, "item", 2862));
  expect(groups.map((g) => [g.rel, g.edges.length])).toEqual([["sold_by", 1], ["created_by", 1], ["same_icon", 1]]);
});
