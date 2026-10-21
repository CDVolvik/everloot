/**
 * What /wow-forever says about the launch, and where it comes from. The quote is Blizzard's own sentence;
 * nothing else on the page is attributed to the source. web/src/data/wow-forever.test.ts checks that the
 * source link and date agree with the curated lore row (kb/curated/forever.yaml).
 */
export const LAUNCH = {
  quote: "World of Warcraft: Forever launches globally on November 4, 2026, at 3:00 p.m. PST",
  /** The date inside the quote, ISO form. */
  date: "2026-11-04",
  sourceTitle: "[Updated 9/24] Pre-Purchase the World of Warcraft®: Forever Collector’s Edition",
  sourceName: "Blizzard News",
  sourceUrl: "https://news.blizzard.com/en-us/article/24302498/updated-9-24-pre-purchase-the-world-of-warcraft-forever-collectors-edition",
  /** The day a person read the source and found this sentence in it. Update it when the source is read again. */
  checkedOn: "2026-10-17",
} as const;

/** The launch instant. 3:00 p.m. PST is 23:00 UTC; daylight saving ends on November 1, 2026. */
export const LAUNCH_AT = "2026-11-04T23:00:00Z";

/**
 * When the beta closes. The client's own beta notice carries the date, and the site's player-pages
 * design spec (2026-10-20) works to the same day. It moves when the client says so, not when a
 * page is edited, so it is one dated fact here.
 */
export const BETA = {
  endsOn: "2026-10-21",
  source: "the beta client's own notice",
  checkedOn: "2026-10-20",
} as const;

export const CLASSES = ["Druid", "Hunter", "Mage", "Paladin", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"] as const;
export type ClassName = (typeof CLASSES)[number];

/**
 * Who can play what, copied from the two tables in Blizzard's race and class article. Skyborne is on
 * both factions with a different class list on each. NEW_COMBOS are the combinations the article
 * names as new; the tables themselves don't mark them.
 */
export const RACES = {
  sourceTitle: "Create the Hero You Want to Be in World of Warcraft: Forever",
  sourceName: "Blizzard News",
  sourceUrl: "https://news.blizzard.com/en-us/article/24304075/create-the-hero-you-want-to-be-in-world-of-warcraft-forever",
  published: "2026-09-22",
  checkedOn: "2026-10-18",
  factions: {
    Horde: {
      Orc: ["Hunter", "Mage", "Rogue", "Shaman", "Warlock", "Warrior"],
      Tauren: ["Druid", "Hunter", "Shaman", "Warrior"],
      Troll: ["Hunter", "Mage", "Priest", "Rogue", "Shaman", "Warlock", "Warrior"],
      Undead: ["Mage", "Paladin", "Priest", "Rogue", "Warlock", "Warrior"],
      Skyborne: ["Druid", "Hunter", "Rogue", "Shaman", "Warrior"],
    },
    Alliance: {
      Dwarf: ["Hunter", "Paladin", "Priest", "Rogue", "Shaman", "Warrior"],
      Gnome: ["Mage", "Priest", "Rogue", "Warlock", "Warrior"],
      Human: ["Hunter", "Mage", "Paladin", "Priest", "Rogue", "Warlock", "Warrior"],
      "Night Elf": ["Druid", "Hunter", "Priest", "Rogue", "Warrior"],
      Skyborne: ["Druid", "Hunter", "Mage", "Rogue", "Warrior"],
    },
  } satisfies Record<string, Record<string, readonly ClassName[]>>,
} as const;

export const NEW_COMBOS: readonly (readonly [race: string, cls: ClassName])[] = [
  ["Orc", "Mage"], ["Troll", "Warlock"], ["Undead", "Paladin"],
  ["Human", "Hunter"], ["Gnome", "Priest"], ["Dwarf", "Shaman"],
];

const MONTHS =["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 17, 2026" from an ISO date, without a time zone shifting the day. */
export const longDate = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
