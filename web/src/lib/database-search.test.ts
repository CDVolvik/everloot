import { expect, test } from "vitest";
import { searchDatabase } from "./database-search";
import { CLIENT_TAXONOMY } from "./items";

const agreed = (itemId: number, name: string, installs = ["a", "b", "c"]) => installs.map((installId) => ({ installId, itemId, name }));
const npc = (npcId: number, name: string, installs = ["a", "b", "c"]) =>
  installs.map((installId) => ({ installId, npcId, name, positionKind: "npc" as const, mapId: 1429, x: 40, y: 60 }));
const quest = (questId: number, title: string) =>
  ["a", "b", "c"].map((installId) => ({ installId, questId, title, level: 5, rewardItemIds: [] }));
const noWorld = { npcs: [], quests: [], vendors: [] };

test("an id finds the item in the game files with its category, and offers the NPC, quest and object pages", () => {
  const [itemId] = CLIENT_TAXONOMY.items[0];
  const hits = searchDatabase(String(itemId), { names: [] }, noWorld);
  expect(hits.map((h) => h.kind)).toEqual(["item", "npc", "quest", "object"]);
  expect(hits[0]).toMatchObject({ name: `Item ${itemId}`, href: `/database/items/${itemId}` });
  expect(hits[0].detail).toMatch(/^Item · /);
});

test("an id the game files do not have is no item hit", () => {
  expect(searchDatabase("999999999", { names: [] }, noWorld).map((h) => h.kind)).toEqual(["npc", "quest", "object"]);
});

test("names match only once 3 installs agree, the same rule the pages use", () => {
  const names = [...agreed(2589, "Linen Cloth"), ...agreed(2592, "Wool Cloth", ["a", "b"])];
  const world = { ...noWorld, npcs: [...npc(448, "Hogger"), ...npc(449, "Clothier", ["a"])], quests: quest(176, "Wanted: Hogger") };
  expect(searchDatabase("cloth", { names }, world).map((h) => h.name)).toEqual(["Linen Cloth"]);
  const hogger = searchDatabase("hogger", { names }, world);
  expect(hogger.map((h) => h.name)).toEqual(["Hogger", "Wanted: Hogger"]);
  expect(hogger[1]).toMatchObject({ kind: "quest", href: "/database/quests/176", detail: "Quest · level 5" });
});

test("a one-letter query and an empty one find nothing", () => {
  expect(searchDatabase("h", { names: agreed(1, "Hat") }, noWorld)).toEqual([]);
  expect(searchDatabase("  ", { names: [] }, noWorld)).toEqual([]);
});
