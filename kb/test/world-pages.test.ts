import { expect, test } from "vitest";
import { handleNpcPage, handleQuestPage, handleVendorPage, worldFactsFromRecords } from "../src/world-pages.js";

test("three agreeing sightings publish a name and a pin, and a split name stays blank", () => {
  const sight = (installId: string, name: string, x: number) => ({
    kind: "npc_sighting",
    installId,
    npcId: 42,
    name,
    mapId: 12,
    x,
    y: 20,
  });
  const agreed = worldFactsFromRecords([
    sight("a", "Hogger", 40),
    sight("b", "hogger", 42),
    sight("c", "Hogger", 41),
    { kind: "npc_sighting" },
  ]);
  const text = handleNpcPage({ npcId: 42 }, agreed);
  expect(text).toContain("NPC 42 — Hogger");
  expect(text).toContain("Map 12 at 41, 20  3 reporters");

  const split = worldFactsFromRecords([
    sight("a", "Hogger", 40),
    sight("b", "Hogger", 42),
    sight("c", "Hogger", 41),
    sight("d", "Riverpaw", 10),
    sight("e", "Riverpaw", 10),
    sight("f", "Riverpaw", 10),
  ]);
  expect(handleNpcPage({ npcId: 42 }, split)).toContain("No agreed name");
  expect(handleNpcPage({ npcId: 0 })).toBe("Name an npc id.");
});

test("a quest publishes title, level, giver, and a reward only after 3 installs", () => {
  const quest = (installId: string, title: string, rewards: number[]) => ({
    kind: "quest",
    installId,
    questId: 9,
    title,
    level: 5,
    giverNpcId: 100,
    rewardItemIds: rewards,
  });
  const facts = worldFactsFromRecords([
    quest("a", "A New Threat", [1, 2]),
    quest("b", "A New Threat", [1, 2]),
    quest("c", "A New Threat", [1]),
    { kind: "quest", installId: "z" },
  ]);
  const text = handleQuestPage({ questId: 9 }, facts);
  expect(text).toContain("Quest 9 — A New Threat");
  expect(text).toContain("Level 5");
  expect(text).toContain("Giver NPC 100");
  expect(text).toContain("No agreed turn-in.");
  expect(text).toContain("Rewards: 1");
  expect(text).not.toContain("Rewards: 1, 2");

  const disputed = worldFactsFromRecords([
    { kind: "quest", installId: "a", questId: 10, title: "Alpha", level: 1, rewardItemIds: [] },
    { kind: "quest", installId: "b", questId: 10, title: "Alpha", level: 1, rewardItemIds: [] },
    { kind: "quest", installId: "c", questId: 10, title: "Alpha", level: 1, rewardItemIds: [] },
    { kind: "quest", installId: "d", questId: 10, title: "Beta", level: 2, rewardItemIds: [] },
    { kind: "quest", installId: "e", questId: 10, title: "Beta", level: 2, rewardItemIds: [] },
    { kind: "quest", installId: "f", questId: 10, title: "Beta", level: 2, rewardItemIds: [] },
  ]);
  expect(handleQuestPage({ questId: 10 }, disputed)).toContain("No agreed title");
  expect(handleQuestPage({ questId: 0 })).toBe("Name a quest id.");
});

test("two prices with 3 installs each both stay on the vendor page", () => {
  const vendor = (installId: string, priceCopper: number, limitedStock?: number) => ({
    kind: "vendor",
    installId,
    vendorNpcId: 80,
    items: [{ itemId: 5, priceCopper, ...(limitedStock ? { limitedStock } : {}) }],
  });
  const facts = worldFactsFromRecords([
    vendor("a", 100, 10),
    vendor("b", 100, 10),
    vendor("c", 100, 10),
    vendor("d", 200),
    vendor("e", 200),
    vendor("f", 200),
    { kind: "vendor", installId: "g", vendorNpcId: 80, items: [{ itemId: 5 }] },
  ]);
  const text = handleVendorPage({ vendorNpcId: 80 }, facts);
  expect(text).toContain("Item 5  1s 0c  stock 10  3 reporters");
  expect(text).toContain("Item 5  2s 0c  not limited  3 reporters");
  expect(handleVendorPage({ vendorNpcId: 1 })).toContain("No public goods");
  expect(handleVendorPage({ vendorNpcId: 0 })).toBe("Name a vendor id.");
});
