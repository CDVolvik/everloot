// Single source of truth for the tool catalog.
// Add a new tool here and it automatically appears in nav + landing page cards.

export type ToolStatus = "live" | "coming-soon";

export interface Tool {
  slug: string;
  title: string;
  shortTitle: string;
  tagline: string;
  description: string;
  status: ToolStatus;
  icon: string; // emoji for v1 — replace with SVGs later
  keywords: string[]; // for <meta>
}

export const tools: Tool[] = [
  {
    slug: "gold-per-hour",
    title: "Gold per Hour Calculator",
    shortTitle: "Gold/Hour",
    tagline: "Math out your gold farms the easy way.",
    description:
      "Input your farm route, items looted, and AH prices. Get a precise gold-per-hour breakdown you can share with your guild. Factors in the 5% auction house cut and vendor trash.",
    status: "live",
    icon: "🪙",
    keywords: [
      "wow gold per hour",
      "gold farming calculator",
      "wow gold calculator",
      "best gold farm wow",
      "gph calculator",
    ],
  },
  {
    slug: "profession-planner",
    title: "Profession Leveling Planner",
    shortTitle: "Profession Planner",
    tagline: "The cheapest route from 1 to max skill.",
    description:
      "A Forever leveling path from recipe uploads. A step appears when 3 installs agree, and the gold cost appears when 3 price uploads agree. No copied guide and no retail auction price.",
    status: "coming-soon",
    icon: "⚒️",
    keywords: [
      "wow profession leveling",
      "blacksmithing guide",
      "alchemy leveling",
      "profession planner",
    ],
  },
  {
    slug: "completionist",
    title: "Completionist Tracker",
    shortTitle: "Completionist",
    tagline: "See everything you haven't collected yet.",
    description:
      "Owned versus missing in a collection. The list appears when 3 installs agree on the item and its source. Owned is one install's upload. Not a Battle.net profile.",
    status: "coming-soon",
    icon: "🏆",
    keywords: [
      "wow completionist",
      "mount tracker",
      "pet collection",
      "achievement tracker",
    ],
  },
  {
    slug: "guild-tracker",
    title: "Forever Guild Tracker",
    shortTitle: "Guilds",
    tagline: "Progression, roster and the Everloot score.",
    description:
      "Raid progression, roster, loot, and item level for WoW: Forever guilds, published by their own officers. A figure is public when two uploads agree. score_v1 has no published weights, so there is no single score yet.",
    status: "coming-soon",
    icon: "🛡️",
    keywords: [
      "wow forever guild tracker",
      "wow forever guild progression",
      "forever guild rankings",
      "everloot score",
    ],
  },
  {
    slug: "database",
    title: "Forever Database",
    shortTitle: "Database",
    tagline: "Items, NPCs and quests from real drops.",
    description:
      "Drop rates with kill counts, spawn maps, quest givers and vendors — every fact corroborated by independent players running the Everloot addon. Thottbot reborn for Forever.",
    status: "coming-soon",
    icon: "📖",
    keywords: [
      "wow forever database",
      "wow forever drop rates",
      "wow forever items",
      "wow forever quests",
    ],
  },
  {
    slug: "professions",
    title: "Forever Profession Hubs",
    shortTitle: "Professions",
    tagline: "Leveling routes and perks from player data.",
    description:
      "One hub per Forever profession: skill-up paths, materials lists and perk tracking, all drawn from in-game collection. Hubs open their numbers as reports arrive.",
    status: "live",
    icon: "⚒️",
    keywords: [
      "wow forever professions",
      "wow forever profession leveling",
      "forever profession perks",
    ],
  },
  {
    slug: "farming-routes",
    title: "Forever Farming Routes",
    shortTitle: "Routes",
    tagline: "Spawn maps drawn from player sightings.",
    description:
      "Gold and material routes per zone with respawn timing and gold-per-hour attached — drawn from community spawn collection, not decades-old static circles.",
    status: "live",
    icon: "🗺️",
    keywords: [
      "wow forever farming",
      "wow forever gold farm",
      "wow forever routes",
    ],
  },
];

export const getTool = (slug: string): Tool | undefined =>
  tools.find((t) => t.slug === slug);

export const liveTools = () => tools.filter((t) => t.status === "live");
export const upcomingTools = () => tools.filter((t) => t.status === "coming-soon");
