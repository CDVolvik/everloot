import { expect, test } from "vitest";
import { entityTitle, itemDescription, npcDescription, objectDescription, questDescription, vendorDescription } from "./entity-meta";
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "./seo";

const none = { dropSources: 0, vendors: 0, createdBy: 0, usedIn: 0, questRewards: 0 };
const PROVENANCE = /game files|wiki|build \d|confirmed|corroborated/i;

test("titles carry the name, WoW Forever and the kind; the layout adds the site name", () => {
  expect(entityTitle("Linen Cloth", "item")).toBe("Linen Cloth – WoW Forever item");
  expect(entityTitle("Hogger", "NPC")).toBe("Hogger – WoW Forever NPC");
});

test("an item description states its kind and the facts its page lists, and only those", () => {
  const cloth = itemDescription({ name: "Linen Cloth", id: 2589, quality: "Common", classLabel: "Trade Goods", subclass: "Cloth", ...none, vendors: 2, usedIn: 31 });
  expect(cloth).toBe("Linen Cloth is a common Trade Goods item (Cloth) in WoW: Forever. Sold by 2 vendors and used in 31 recipes. Item ID 2589.");
  expect(cloth).not.toMatch(/drops|made by|quest/);
  const bare = itemDescription({ name: "Item 118", id: 118, quality: null, classLabel: "Consumables", subclass: "Potions", ...none });
  expect(bare).toBe("Item 118 is a Consumables item (Potions) in WoW: Forever. Where it drops, who sells it and the recipes that make or use it. Item ID 118.");
  expect(itemDescription({ name: "Odd", id: 1, ...none })).toMatch(/^Odd is an item in WoW: Forever\./);
  expect(itemDescription({ name: "Epic Thing", id: 1, quality: "Epic", classLabel: "Armor", subclass: "Armor", ...none })).toMatch(/^Epic Thing is an epic Armor item in WoW: Forever\./);
});

test("descriptions stay within the snippet length and say nothing about where the data comes from", () => {
  const long = "A Remarkably Long Item Name That Goes On And On For The Test";
  const all = [
    itemDescription({ name: long, id: 21_999, quality: "Legendary", classLabel: "Weapons", subclass: "Two-Handed Swords", dropSources: 12, vendors: 3, createdBy: 2, usedIn: 40, questRewards: 4 }),
    itemDescription({ name: "Linen Cloth", id: 2589, quality: "Common", classLabel: "Trade Goods", subclass: "Cloth", ...none }),
    npcDescription({ name: "Hogger", id: 448, positions: 2 }),
    npcDescription({ name: long, id: 448, positions: 0 }),
    questDescription({ name: "Wanted: \"Hogger\"", id: 176, level: 11, giver: true, turnIn: true, rewards: 3 }),
    questDescription({ name: "Quest 176", id: 176, level: null, giver: false, turnIn: false, rewards: 0 }),
    objectDescription({ name: "Object 1731", id: 1731, items: 4, windows: 120 }),
    vendorDescription({ name: "Tharynn Bouden", id: 66, offers: 14 }),
  ];
  for (const d of all) {
    expect(d.length, d).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(d.length, d).toBeGreaterThanOrEqual(DESCRIPTION_MIN - 40);
    expect(d.replace(long, ""), d).not.toMatch(PROVENANCE);
  }
  // Facts that do not fit drop from the end; the lead always stays.
  expect(all[0]).toMatch(new RegExp(`^${long} is a legendary Weapons item \\(Two-Handed Swords\\) in WoW: Forever\\. Dropped by 12 sources`));
});

test("quest, NPC, object and vendor descriptions name what the page holds", () => {
  expect(questDescription({ name: "Wanted: Hogger", id: 176, level: 11, giver: true, turnIn: false, rewards: 2 }))
    .toBe("Wanted: Hogger is a level 11 quest in WoW: Forever. With its quest giver and 2 rewards. Who gives it, where to turn it in and what it rewards. Quest ID 176.");
  expect(npcDescription({ name: "Hogger", id: 448, positions: 0 })).toBe("Hogger is an NPC in WoW: Forever. Where it stands on the map, what it drops and the quests it gives. NPC ID 448.");
  expect(vendorDescription({ name: "Tharynn", id: 66, offers: 1 })).toMatch(/^Tharynn is a vendor in WoW: Forever\. Sells 1 item at agreed prices\./);
  expect(objectDescription({ name: "Object 1731", id: 1731, items: 2, windows: 30 })).toMatch(/^Object 1731 is a chest, herb, ore vein or fishing pool in WoW: Forever\. 2 items looted from it and 30 loot windows counted\./);
});
