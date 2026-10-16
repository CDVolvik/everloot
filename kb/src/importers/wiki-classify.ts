/**
 * A page's type and facets, read from its infobox template name and its wiki categories. Nothing
 * is inferred beyond the category text: a facet value is the category's own words.
 */

export type LoreType = "quest" | "npc" | "zone" | "spell" | "item" | "other";
/** Priority order: the first type whose rule matches wins. */
export const LORE_TYPES: LoreType[] = ["quest", "npc", "zone", "spell", "item", "other"];

export interface Facets {
  expansion: string[];
  profession: string[];
  class: string[];
  race: string[];
  zone: string[];
  faction: string[];
}

export const EXPANSIONS = [
  "World of Warcraft", "The Burning Crusade", "Wrath of the Lich King", "Cataclysm", "Mists of Pandaria",
  "Warlords of Draenor", "Legion", "Battle for Azeroth", "Shadowlands", "Dragonflight", "The War Within",
];
export const CLASSES = [
  "Death knight", "Demon hunter", "Druid", "Evoker", "Hunter", "Mage", "Monk", "Paladin", "Priest", "Rogue",
  "Shaman", "Warlock", "Warrior",
];
export const PROFESSIONS = [
  "Alchemy", "Blacksmithing", "Cooking", "Enchanting", "Engineering", "Fishing", "Herbalism", "Inscription",
  "Jewelcrafting", "Leatherworking", "Mining", "Skinning", "Tailoring",
];

/** Rule 0: infobox template name (lower-cased) → type. */
const INFOBOX_TYPES: Record<string, LoreType> = {
  npcbox: "npc",
  "#data:itemtip": "item", itembox: "item", "infobox item": "item",
  questbox: "quest", "infobox quest": "quest",
  zonebox: "zone", "infobox zone": "zone", "infobox instance": "zone",
  "infobox ability": "spell", "infobox pet ability": "spell", "infobox spell": "spell", "infobox talent": "spell",
};

const ends = (...suffixes: string[]) => (c: string) => suffixes.some((s) => c.endsWith(s));
const is = (...names: string[]) => (c: string) => names.some((n) => c === n.toLowerCase());
const any = (...tests: ((c: string) => boolean)[]) => (c: string) => tests.some((t) => t(c));

/** Category rules in priority order; categories arrive trimmed and lower-cased. */
const CATEGORY_RULES: [LoreType, (c: string) => boolean][] = [
  ["quest", any(ends(" quests", " world quests", " daily quests"), is("Quests"))],
  ["npc", any(
    ends(" characters", " npcs", " mobs", " bosses", " vendors", " trainers", " masters"),
    is("Named mobs", "Bosses", "Critters", "Quest givers", "Quest enders", "Vendors", "Flight masters", "Innkeepers", "Guards", "Followers"),
  )],
  ["zone", any(ends(" zones", " subzones", " locations", " dungeons", " raids", " instances", " regions"), is("Caves", "Camps"))],
  ["spell", any(ends(" abilities", " spells", " talents"), is("Passive abilities", "Pet battle abilities"))],
  ["item", any(
    ends(" items", " drops", " rewards", " weapons", " armor", " mounts", " gems"),
    is("Keys", "Chests", "Tomes", "Food items", "Alcoholic beverages", "Ensembles"),
  )],
];

const uniqSorted = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));

/** The text before a suffix, with the original casing, or null. */
function before(original: string, lower: string, suffix: string): string | null {
  return lower.endsWith(suffix) && lower.length > suffix.length ? original.trim().slice(0, -suffix.length).trim() : null;
}

export function classify(categories: readonly string[], infoboxTemplate?: string | null): { type: LoreType; facets: Facets } {
  const pairs = categories.map((c) => [c.trim(), c.trim().toLowerCase()] as const);
  const lowers = pairs.map(([, l]) => l);

  let type: LoreType = "other";
  const boxed = infoboxTemplate ? INFOBOX_TYPES[infoboxTemplate.trim().toLowerCase()] : undefined;
  if (boxed) type = boxed;
  else {
    for (const [t, test] of CATEGORY_RULES) {
      if (lowers.some(test)) { type = t; break; }
    }
  }

  const facets: Facets = { expansion: [], profession: [], class: [], race: [], zone: [], faction: [] };
  for (const [original, lower] of pairs) {
    for (const e of EXPANSIONS) if (lower.startsWith(`${e.toLowerCase()} `)) facets.expansion.push(e);
    for (const p of PROFESSIONS) {
      if (new RegExp(`^${p.toLowerCase()} (crafted|crafting|pattern|plan|recipe|design|schematic|technique|vendors)\\b`).test(lower)) facets.profession.push(p);
    }
    const character = before(original, lower, " characters");
    if (character) {
      const cls = CLASSES.find((c) => c.toLowerCase() === character.toLowerCase());
      if (cls) facets.class.push(cls);
      else if (!/^(deceased|lore|rpg|oddly classified|undead|unique|unknown|major|minor)$/i.test(character)) facets.race.push(character);
    }
    // Only "<Zone> NPCs" and "<Zone> mobs" name a zone; " quests" and " items" suffixes carry factions,
    // expansions and professions too often ("Horde quests", "Legion world quests").
    for (const suffix of [" npcs", " mobs"]) {
      const zone = before(original, lower, suffix);
      if (zone && !/^(named|boss related|mission|island expedition|faction assault|rare|rare elite)$/i.test(zone)) facets.zone.push(zone);
    }
    if (lower.startsWith("horde ")) facets.faction.push("Horde");
    if (lower.startsWith("alliance ")) facets.faction.push("Alliance");
    if (lower.startsWith("neutral ")) facets.faction.push("Neutral");
  }
  for (const key of Object.keys(facets) as (keyof Facets)[]) facets[key] = uniqSorted(facets[key]);
  return { type, facets };
}
