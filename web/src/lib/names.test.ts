import { expect, test } from "vitest";
import { idForName, itemNames, nameOf, npcNames, questTitles } from "./names";

const names = (rows: [string, number, string][]) => rows.flatMap(([install, id, name]) => [{ installId: install, itemId: id, name }]);
const three = (id: number, name: string) => names([["a", id, name], ["b", id, name], ["c", id, name]]);

test("item names need 3 installs to agree, and are kept per fact set", () => {
  const facts = { names: [...three(1, "Linen Cloth"), ...names([["a", 2, "Wool Cloth"], ["b", 2, "Wool Cloth"]])] };
  const map = itemNames(facts);
  expect(map.get(1)).toBe("Linen Cloth");
  expect(map.has(2)).toBe(false);
  expect(itemNames(facts)).toBe(map);
});

test("NPC names and quest titles follow the same rule", () => {
  const sight = (installId: string) => ({ installId, npcId: 7, name: "Thrall", mapId: 1, x: 1, y: 1 });
  expect(npcNames({ npcs: [sight("a"), sight("b"), sight("c")] }).get(7)).toBe("Thrall");
  expect(npcNames({ npcs: [sight("a"), sight("b")] }).size).toBe(0);
  const quest = (installId: string) => ({ installId, questId: 9, title: "Return to Sender", level: 1, rewardItemIds: [] });
  expect(questTitles({ quests: [quest("a"), quest("b"), quest("c")] }).get(9)).toBe("Return to Sender");
});

test("idForName finds the one entity with that name in any case, and nothing when two share it", () => {
  const map = new Map([[1, "Thrall"], [2, "Jaina"], [3, "Jaina"]]);
  expect(idForName(map, " thrall ")).toBe(1);
  expect(idForName(map, "Jaina")).toBeNull();
  expect(idForName(map, "Garrosh")).toBeNull();
});

test("nameOf reads the item, NPC, quest and object sets and nothing for other kinds", () => {
  const of = nameOf({ items: new Map([[1, "Cloth"]]), npcs: new Map([[1, "Thrall"]]), quests: new Map([[1, "Quest name"]]), objects: new Map([[1, "Peacebloom"]]) });
  expect([of("item", 1), of("npc", 1), of("quest", 1), of("object", 1), of("spell", 1), of("item", 2)]).toEqual(["Cloth", "Thrall", "Quest name", "Peacebloom", undefined, undefined]);
});
