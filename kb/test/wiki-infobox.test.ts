import { expect, test } from "vitest";
import { extractInfobox, plainValue } from "../src/importers/wiki-infobox.js";

const NPCBOX = `{{Stub/NPC}}
{{ss|Dread Wastes}}
{{npcbox
|name=Resilient Roach
|image=Resilient Roach.jpg
|race=Roach
|creature=Critter
|location=[[Dread Wastes]]
}}
{{Pet Battle}}

==Battles==
Text.`;

const ITEMTIP = `
{{#data:itemtip
|name=Cinch of the Dead Forest's Vigil
|quality=epic
|ilvl=476
|itemid=95530
|slot=Waist
|type=Leather
|rfaction=Kirin Tor Offensive
|rep=Honored
|sellprice=250000
}}{{#data:#Horde
|name=Cinch of the Dead Forest's Vigil
|itemid=95521
}}

'''Cinch''' is purchased for {{cost|300}}.`;

const FACTION = `{{for|the achievement|Kirin Tor Offensive (achievement)}}
{{Infobox faction
|name        = Kirin Tor Offensive
|races       = {{Race|Human}}<br />{{Race|High elf}}<br />{{Race|Night elf}}
|leader      = {{NPC||Jaina Proudmoore|icon=Jaina2}}
|quartermaster = {{npc||Hiren Loresong|icon=HighElf Male}}
|tokens      =
|rewards     = [[Reins of the Golden Primal Direhorn]]
}}
Body.`;

const ABILITY = `{{Removed|patch=4.0.1}}
{{Infobox pet ability
|name=Soothing Kiss
|class=[[Warlock]]
|pet=[[Succubus (warlock minion)|Succubus]]
|cooldown=4 seconds
|Foo
}}
'''Soothing Kiss''' is an ability.`;

test("reads an npcbox with links reduced to their text", () => {
  expect(extractInfobox(NPCBOX)).toEqual({
    template: "npcbox",
    fields: { name: "Resilient Roach", image: "Resilient Roach.jpg", race: "Roach", creature: "Critter", location: "Dread Wastes" },
  });
});

test("reads a #data:itemtip block and stops at its closing braces", () => {
  const box = extractInfobox(ITEMTIP);
  expect(box?.template).toBe("#data:itemtip");
  expect(box?.fields).toMatchObject({ ilvl: "476", itemid: "95530", slot: "Waist", type: "Leather", rfaction: "Kirin Tor Offensive", rep: "Honored", sellprice: "250000" });
  expect(box?.fields).not.toHaveProperty("name", "95521");
});

test("skips hatnotes and renders nested Race and NPC templates and <br /> inside fields", () => {
  const box = extractInfobox(FACTION);
  expect(box?.template).toBe("infobox faction");
  expect(box?.fields.races).toBe("Human, High elf, Night elf");
  expect(box?.fields.leader).toBe("Jaina Proudmoore");
  expect(box?.fields.quartermaster).toBe("Hiren Loresong");
  expect(box?.fields.rewards).toBe("Reins of the Golden Primal Direhorn");
  expect(box?.fields).not.toHaveProperty("tokens");
});

test("skips a leading non-infobox template; drops positional fields; keeps piped link text", () => {
  const box = extractInfobox(ABILITY);
  expect(box?.template).toBe("infobox pet ability");
  expect(box?.fields).toEqual({ name: "Soothing Kiss", class: "Warlock", pet: "Succubus", cooldown: "4 seconds" });
});

test("caps fields at 40 and values at 200 characters", () => {
  const many = Array.from({ length: 45 }, (_, i) => `|f${i}=v${i}`).join("\n");
  const box = extractInfobox(`{{npcbox\n${many}\n|long=${"x".repeat(300)}\n}}`);
  expect(Object.keys(box!.fields)).toHaveLength(40);
  expect(box!.fields.f0).toBe("v0");
  expect(box!.fields).not.toHaveProperty("long");
  const short = extractInfobox(`{{npcbox\n|long=${"x".repeat(300)}\n}}`);
  expect(short!.fields.long).toHaveLength(200);
});

test("no infobox is null", () => {
  expect(extractInfobox("plain text with {{cost|300}} only")).toBeNull();
  expect(extractInfobox("")).toBeNull();
});

test("plainValue strips links, renders name templates, removes other templates and tags", () => {
  expect(plainValue("[[Dread Wastes]]")).toBe("Dread Wastes");
  expect(plainValue("[[Succubus (warlock minion)|Succubus]]")).toBe("Succubus");
  expect(plainValue("{{Race|Human}}<br />{{Race|High elf}}")).toBe("Human, High elf");
  expect(plainValue("{{NPC|Alliance|Hiren Loresong|icon=x}}")).toBe("Hiren Loresong");
  expect(plainValue("{{item|epic|Thunderfury}} and {{item|Fang|the fang}}")).toBe("Thunderfury and the fang");
  expect(plainValue("''[[Seabolt|The Seabolt]]'' and <b>bold</b> {{Unknown|x}} end")).toBe("The Seabolt and bold end");
});
