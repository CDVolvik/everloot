import { expect, test } from "vitest";
import { parseSiteManifest } from "./game-assets";
import { siteManifest } from "./game-assets.fixture";
import { mentionIndex, siteSpellNames, splitMentions, type NamedSpell } from "./spell-mentions";

const BASE = "https://assets.example.test/wow_classic_beta-70450-84bea423";
// Talent 101 has text, 102 has nothing to show; "Mortal Strike" is both a warrior and (invented) a rogue talent.
const assets = parseSiteManifest({
  ...siteManifest,
  spells: {
    "101": { spellId: 1, name: "Improved Charge", icon: "5001.webp", passive: false, description: { text: "Charge gives 3 more rage.", unresolved: [] } },
    "102": { spellId: 2, name: "Silent Talent", icon: null, passive: null, description: null },
    "103": { spellId: 3, name: "Mortal Strike", icon: null, passive: false, description: { text: "A strike.", unresolved: [] } },
    "104": { spellId: 4, name: "Mortal Strike", icon: null, passive: false, description: { text: "Another.", unresolved: [] } },
    "105": { spellId: 5, name: "Toughness", icon: null, passive: true, description: { text: "Armor.", unresolved: [] } },
  },
}, BASE)!;
const spells: NamedSpell[] = [
  { name: "Improved Charge", href: "/tools/talents/warrior", talent: 101 },
  { name: "Silent Talent", href: "/tools/talents/warrior", talent: 102 },
  { name: "Mortal Strike", href: "/tools/talents/warrior", talent: 103 },
  { name: "Mortal Strike", href: "/tools/talents/rogue", talent: 104 },
  { name: "Toughness", href: "/tools/talents/warrior", talent: 105 },
  { name: "Battle Shout", href: "/tools/raid", spellIds: [6673] },
];

test("only names of two words or more, with something to show, on one page", () => {
  const index = mentionIndex(assets, spells);
  expect([...index.byName.keys()].sort()).toEqual(["Battle Shout", "Improved Charge"]);
  expect(index.byName.get("Improved Charge")).toEqual({
    href: "/tools/talents/warrior",
    tip: { name: "Improved Charge", icon: `${BASE}/icons/5001.webp`, text: "Charge gives 3 more rage.", partial: false, label: "found in game files, unconfirmed · build 1.60.1.70450" },
  });
  expect(index.byName.get("Battle Shout")?.tip).toMatchObject({ icon: `${BASE}/icons/8001.webp`, text: "Raises attack power by 20 for 2 min." });
});

test("text is cut at whole names, in the game's case; other text stays one piece", () => {
  const index = mentionIndex(assets, spells);
  const pieces = splitMentions("Battle Shout and Improved Charge now stack. battle shout, Battle Shouting.", index);
  expect(pieces.map((p) => (typeof p === "string" ? p : `[${p.text}]`)).join("")).toBe("[Battle Shout] and [Improved Charge] now stack. battle shout, Battle Shouting.");
  expect(splitMentions("Nothing here.", index)).toEqual(["Nothing here."]);
});

test("without the asset files nothing is matched", () => {
  const index = mentionIndex(null, spells);
  expect(index.pattern).toBeNull();
  expect(splitMentions("Battle Shout", index)).toEqual(["Battle Shout"]);
});

test("the site's spell names cover every talent calculator and the raid buffs", async () => {
  const names = await siteSpellNames();
  expect(names.some((n) => n.href === "/tools/talents/druid" && typeof n.talent === "number")).toBe(true);
  expect(names).toContainEqual(expect.objectContaining({ name: "Battle Shout", href: "/tools/raid" }));
});
