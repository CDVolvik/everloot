import { expect, test } from "vitest";
import { handleItemPage, itemPage, type DropRateRow, type ItemFacts, type NpcSighting } from "../src/item-page.js";

const rate = (extra: Partial<DropRateRow> = {}): DropRateRow => ({
  sourceNpcId: 456,
  itemId: 1234,
  kills: 12,
  drops: 4,
  rate: 4 / 12,
  reporters: 3,
  public: true,
  ...extra,
});

const npc = (installId: string, x: number, extra: Partial<NpcSighting> = {}): NpcSighting => ({
  installId,
  npcId: 456,
  name: "Forest Spider",
  mapId: 141,
  x,
  y: 61,
  ...extra,
});

const facts = (extra: Partial<ItemFacts> = {}): ItemFacts => ({
  rates: [rate()],
  names: ["a", "b", "c"].map((installId) => ({ installId, itemId: 1234, name: "Peacebloom" })),
  npcs: [npc("a", 42), npc("b", 43), npc("c", 44)],
  ...extra,
});

test("a public drop, an agreed name, and a median pin become the page", () => {
  const page = itemPage(1234, facts());
  expect(page.name).toBe("Peacebloom");
  expect(page.drops[0]).toMatchObject({ source: "NPC 456 Forest Spider", kills: 12, drops: 4, reporters: 3 });
  expect(page.pins).toEqual([{ npcId: 456, name: "Forest Spider", mapId: 141, x: 43, y: 61, reporters: 3 }]);
  expect(handleItemPage({ itemId: 1234 }, facts())).toContain("33.3%");
});

test("two installs, a second name, or a private rate stay off the page", () => {
  const page = itemPage(1234, facts({
    rates: [rate({ public: false })],
    names: [
      ...["a", "b", "c"].map((installId) => ({ installId, itemId: 1234, name: "Peacebloom" })),
      ...["d", "e", "f"].map((installId) => ({ installId, itemId: 1234, name: "Silverleaf" })),
    ],
    npcs: [npc("a", 42), npc("a", 10), npc("b", 80)],
  }));
  expect(page.name).toBeNull();
  expect(page.drops).toHaveLength(0);
  expect(page.pins).toHaveLength(0);
  expect(handleItemPage({ itemId: 1234 }, { rates: [], names: [], npcs: [] })).toContain("Drop rate unrecorded");
  expect(handleItemPage({ itemId: 0 })).toBe("Name an item id.");
});

test("zero drops in a public sample names the kills", () => {
  const text = handleItemPage({ itemId: 1234 }, facts({ rates: [rate({ drops: 0, kills: 9, rate: 0 })] }));
  expect(text).toContain("0 drops in 9 kills");
  expect(text).not.toContain("Drop rate unrecorded");
  expect(text).not.toContain("0.0%");
});
