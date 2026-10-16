import { expect, test } from "vitest";
import { classify, LORE_TYPES } from "../src/importers/wiki-classify.js";

test("the six types are known in priority order", () => {
  expect(LORE_TYPES).toEqual(["quest", "npc", "zone", "spell", "item", "other"]);
});

test.each([
  ["npcbox", ["Quest rewards"], "npc"],
  ["#data:itemtip", [], "item"],
  ["Itembox", [], "item"],
  ["Infobox item", [], "item"],
  ["questbox", ["Named mobs"], "quest"],
  ["Infobox quest", [], "quest"],
  ["zonebox", [], "zone"],
  ["Infobox instance", [], "zone"],
  ["Infobox pet ability", [], "spell"],
  ["Infobox talent", [], "spell"],
  ["Infobox faction", ["Named mobs"], "npc"],
  ["Infobox faction", [], "other"],
  ["#data:settip", [], "item"],
  ["infobox town", [], "zone"],
  ["#data:infobox talent", [], "spell"],
  ["#data:infobox glyph", [], "spell"],
  ["#data:infobox azerite trait", [], "spell"],
  ["#data:infobox ability", [], "spell"],
  ["#data:achievementtip", [], "other"],
])("rule 0: infobox %s with categories %j is %s", (template, categories, type) => {
  expect(classify(categories, template).type).toBe(type);
});

test.each([
  [["Daily quests"], "quest"],
  [["Quests"], "quest"],
  [["Battle for Azeroth world quests"], "quest"],
  [["Named mobs"], "npc"],
  [["Human characters"], "npc"],
  [["Stormwind City NPCs"], "npc"],
  [["Nazmir mobs"], "npc"],
  [["Bosses"], "npc"],
  [["Critters"], "npc"],
  [["Quest givers"], "npc"],
  [["Food and drink vendors"], "npc"],
  [["Flight masters"], "npc"],
  [["Caves"], "zone"],
  [["Pandaria zones"], "zone"],
  [["Northrend dungeons"], "zone"],
  [["Passive abilities"], "spell"],
  [["Shadow spells"], "spell"],
  [["Pet battle abilities"], "spell"],
  [["Food items"], "item"],
  [["World of Warcraft world drops"], "item"],
  [["Quest rewards"], "item"],
  [["Ground mounts"], "item"],
  [["Jewelcrafting crafted gems"], "item"],
  [["Keys"], "item"],
  [["Game terms"], "other"],
  [[], "other"],
])("category rule: %j is %s", (categories, type) => {
  expect(classify(categories).type).toBe(type);
});

test("rule order: quests beat NPCs and items; NPCs beat items", () => {
  expect(classify(["Quest rewards", "Named mobs"]).type).toBe("npc");
  expect(classify(["Legion world quests", "Legion world drops"]).type).toBe("quest");
  expect(classify(["Quest givers", "Quest rewards"]).type).toBe("npc");
});

test("categories are matched after trimming and ignoring case", () => {
  expect(classify([" named Mobs "]).type).toBe("npc");
  expect(classify(["DAILY QUESTS"]).type).toBe("quest");
});

test("facets come from the category text, sorted and de-duplicated", () => {
  const { facets } = classify([
    "Leatherworking crafted items", "Jewelcrafting design items", "Warrior characters", "Orc characters",
    "Nazmir mobs", "Dalaran (Northrend) NPCs", "Horde quests", "Alliance icon", "Wrath of the Lich King world drops",
    "Legion world quests", "Legion world drops",
  ]);
  expect(facets).toEqual({
    expansion: ["Legion", "Wrath of the Lich King"],
    profession: ["Jewelcrafting", "Leatherworking"],
    class: ["Warrior"],
    race: ["Orc"],
    zone: ["Dalaran (Northrend)", "Nazmir"],
    faction: ["Alliance", "Horde"],
  });
});

test("a class is never also a race, and non-character categories add no race", () => {
  const { facets } = classify(["Warrior characters", "Night elf characters", "Deceased characters", "Lore characters"]);
  expect(facets.class).toEqual(["Warrior"]);
  expect(facets.race).toEqual(["Night elf"]);
});

test("the empty case has a type and empty facets", () => {
  expect(classify([])).toEqual({
    type: "other",
    facets: { expansion: [], profession: [], class: [], race: [], zone: [], faction: [] },
  });
});

test("race and zone facets skip categories that are not races or zones", () => {
  const { facets } = classify([
    "Argent Crusade characters", "Hearthstone characters", "TCG characters", "Day of the Dragon characters",
    "Arthas: Rise of the Lich King characters", "World of Warcraft: The Comic characters", "Orc characters",
    "Battle for Azeroth rare mobs", "Battle for Azeroth rare elite mobs", "Eastern Kingdoms rare mobs", "Legion Invasion mobs", "Nazmir mobs",
  ]);
  expect(facets.race).toEqual(["Orc"]);
  expect(facets.zone).toEqual(["Nazmir"]);
});
