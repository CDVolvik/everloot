import { expect, test } from "vitest";
import { countDamage, repairTemplates, REPAIRED_TEMPLATES } from "../src/importers/wiki-templates.js";

test("money templates render as gold, silver and copper", () => {
  expect(repairTemplates("purchased for {{cost|300}} at {{rep|honored}} standing")).toBe("purchased for 300g at Honored standing");
  expect(repairTemplates("{{cost|1|50|0}}")).toBe("1g 50s");
  expect(repairTemplates("{{cost|||25}}")).toBe("25c");
  expect(repairTemplates("{{money|2|5|9}}")).toBe("2g 5s 9c");
  expect(repairTemplates("5{{g}} 3{{s}} 7{{c}}")).toBe("5g 3s 7c");
});

test("NPC templates keep the name and drop the faction and icon", () => {
  expect(repairTemplates("{{NPC|Alliance|Hiren Loresong}} at [[Violet Rise]]")).toBe("Hiren Loresong at [[Violet Rise]]");
  expect(repairTemplates("{{NPC||Jaina Proudmoore|icon=Jaina2}}")).toBe("Jaina Proudmoore");
  expect(repairTemplates("{{npc|Horde|Vasarin Redmorn}}")).toBe("Vasarin Redmorn");
});

test("item, quest, spell, zone and ability links render as their display text or name", () => {
  expect(repairTemplates("{{item|Thunderfury}}")).toBe("Thunderfury");
  expect(repairTemplates("{{item|epic|Thunderfury}}")).toBe("Thunderfury");
  expect(repairTemplates("{{item|Thunderfury|the sword}}")).toBe("the sword");
  expect(repairTemplates("{{quest|Return to Sender}}")).toBe("Return to Sender");
  expect(repairTemplates("{{spell|Fireball}}, {{zone|Nazmir}}, {{ability|Charge}}")).toBe("Fireball, Nazmir, Charge");
  expect(repairTemplates("{{item|\n Thunderfury}}")).toBe("Thunderfury");
});

test("race, standing and patch templates render to words", () => {
  expect(repairTemplates("{{Race|High elf}}")).toBe("High elf");
  expect(repairTemplates("{{faction standing|Revered}}")).toBe("Revered");
  expect(repairTemplates("* {{Patch 5.2.0|note=Added.}}")).toBe("* Patch 5.2.0: Added.");
  expect(repairTemplates("* {{Patch 10.0.2|note=Now sold by {{NPC||Grex}}.}}")).toBe("* Patch 10.0.2: Now sold by Grex.");
});

test("icons, hatnotes and stubs vanish without leaving double spaces", () => {
  expect(repairTemplates("Sold by {{Horde icon small}} Grex")).toBe("Sold by Grex");
  expect(repairTemplates("{{Alliance icon}} Only")).toBe("Only");
  expect(repairTemplates("{{ss|Dread Wastes}}\n{{Stub/NPC}}\nText")).toBe("Text");
  expect(repairTemplates("{{for|the achievement|Kirin Tor Offensive (achievement)}}\n{{Removed|patch=4.0.1}}\nBody")).toBe("Body");
});

test("unknown templates are left for the converter", () => {
  expect(repairTemplates("{{Companions|Critter}} and {{npcbox|name=x}}")).toBe("{{Companions|Critter}} and {{npcbox|name=x}}");
});

test("the repaired list is exported for the coverage page", () => {
  expect(REPAIRED_TEMPLATES).toContain("cost");
  expect(REPAIRED_TEMPLATES).toContain("npc");
  expect(REPAIRED_TEMPLATES).toContain("rep");
});

test("countDamage counts the known breakage patterns", () => {
  expect(countDamage("purchased for at standing")).toBe(2);
  expect(countDamage("A clean sentence.")).toBe(0);
  expect(countDamage("two  spaces")).toBe(1);
  expect(countDamage("sold at  the shop")).toBe(2);
});
