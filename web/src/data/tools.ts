// Single source of truth for the tool catalog.
// Add a new tool here and it automatically appears in nav + landing page cards.

export type ToolStatus = "live" | "collecting" | "coming-soon";

export interface Tool {
  slug: string;
  href?: string;
  title: string;
  shortTitle: string;
  tagline: string;
  description: string;
  status: ToolStatus;
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
    href: "/tools/professions",
    title: "Profession Leveling Planner",
    shortTitle: "Profession Planner",
    tagline: "Recipe paths when enough uploads agree.",
    description:
      "A Forever leveling path from recipe uploads. A step appears when 3 installs agree, and the gold cost appears when 3 price uploads agree. No copied guide and no retail auction price.",
    status: "collecting",
    keywords: [
      "wow profession leveling",
      "blacksmithing guide",
      "alchemy leveling",
      "profession planner",
    ],
  },
  {
    slug: "completionist",
    href: "/tools/collections",
    title: "Completionist Tracker",
    shortTitle: "Completionist",
    tagline: "Compare uploaded collections and ownership.",
    description:
      "Owned versus missing in a collection. The list appears when 3 installs agree on the item and its source. Owned is one install's upload. Not a Battle.net profile.",
    status: "collecting",
    keywords: [
      "wow completionist",
      "mount tracker",
      "pet collection",
      "achievement tracker",
    ],
  },
  {
    slug: "guild-tracker",
    href: "/tools/guild-board",
    title: "Forever Guild Tracker",
    shortTitle: "Guilds",
    tagline: "Officer-published roster and progression.",
    description:
      "Raid progression, roster, loot, and item level for WoW: Forever guilds from authorized officer uploads. A figure is public when two uploads agree. A combined guild score is not available.",
    status: "collecting",
    keywords: [
      "wow forever guild tracker",
      "wow forever guild progression",
      "forever guild rankings",
      "guild progression",
    ],
  },
  {
    slug: "database",
    href: "/database",
    title: "Forever Database",
    shortTitle: "Database",
    tagline: "Browse uploaded observations and agreed facts.",
    description:
      "Loot-window observations, NPC sightings, quests and vendors from addon uploads. Install counts are not proof of independent players; observations are not kill-based drop probabilities.",
    status: "collecting",
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
    tagline: "Leveling routes from player data.",
    description:
      "One hub per Forever profession: skill-up paths and materials lists drawn from in-game collection. Hubs open their numbers as reports arrive.",
    status: "collecting",
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
    tagline: "Planned routes from uploaded sightings.",
    description:
      "Zone routes and respawn timing are planned. Upload sightings now, or calculate your own farm using the Gold/Hour Calculator.",
    status: "coming-soon",
    keywords: [
      "wow forever farming",
      "wow forever gold farm",
      "wow forever routes",
    ],
  },
  {
    slug: "raid",
    title: "Raid Group Builder",
    shortTitle: "Raid Builder",
    tagline: "Plan a raid and see which buffs it covers.",
    description:
      "Fill a 10, 20 or 40 player raid with classes and talent trees, and see which buffs and debuffs each group and the raid gets. Rules are stamped with a game build and marked unconfirmed. The plan lives in the link.",
    status: "live",
    keywords: ["wow forever raid composition", "raid builder", "raid buffs", "wow forever raid planner"],
  },
  {
    slug: "upload",
    href: "/upload",
    title: "Upload Addon Data",
    shortTitle: "Upload",
    tagline: "Send addon records with explicit sharing choices.",
    description: "Upload Everloot addon files. Public observations require corroboration; named sharing requires a reviewed grant.",
    status: "live",
    keywords: ["everloot upload", "wow forever addon"],
  },
];

export const toolHref = (tool: Tool): string => tool.href ?? `/tools/${tool.slug}`;

export const getTool = (slug: string): Tool | undefined =>
  tools.find((t) => t.slug === slug);

export const liveTools = () => tools.filter((t) => t.status === "live");
export const upcomingTools = () => tools.filter((t) => t.status === "coming-soon");
