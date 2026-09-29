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
      "Pick your profession, current skill level, and expansion. We'll plan the optimal recipe path, build a materials shopping list, and estimate total cost based on your realm's AH prices.",
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
      "Enter your character and we'll surface every mount, pet, toy, and achievement you're missing — filtered by how obtainable each one is right now. The 'All the Things' experience, on the web.",
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
      "Raid progression, attendance and loot history for WoW: Forever guilds, published by their own officers through the Everloot addon. Ranked by an internal score from progression, roster strength and gear.",
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
    slug: "farming-routes",
    title: "Farming Routes",
    shortTitle: "Routes",
    tagline: "Spawn maps drawn from player data.",
    description:
      "Gold and material farming routes for WoW: Forever, drawn from real spawn sightings collected by the community. Zones, respawns and gold-per-hour in one page.",
    status: "coming-soon",
    icon: "🗺️",
    keywords: [
      "wow forever farming",
      "wow forever gold farm",
      "wow forever routes",
      "best gold farm forever",
    ],
  },
];

export const getTool = (slug: string): Tool | undefined =>
  tools.find((t) => t.slug === slug);

export const liveTools = () => tools.filter((t) => t.status === "live");
export const upcomingTools = () => tools.filter((t) => t.status === "coming-soon");
