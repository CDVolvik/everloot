/**
 * The lists /database links under "Seen by players", in the order it shows them. The sitemap lists the same pages,
 * so a hub is added here once and is linked and listed together; what count to print beside it is the hub page's own
 * business, and a row with none prints none. A page that asks for noindex is added with `unlisted`: it is linked
 * and left out of the sitemap, as the sitemap's rule is that only a page that asks to be indexed is listed.
 */
export interface DatabaseHub { href: string; label: string; unlisted?: true }

export const DATABASE_HUBS: readonly DatabaseHub[] = [
  { href: "/database/npcs", label: "NPCs" },
  { href: "/database/quests", label: "Quests" },
  { href: "/database/vendors", label: "Vendors" },
  { href: "/database/objects", label: "Objects: chests, herbs, ore" },
  { href: "/database/spells", label: "Spells" },
  { href: "/database/achievements", label: "Achievements" },
  { href: "/database/factions", label: "Factions" },
  { href: "/database/titles", label: "Titles" },
  { href: "/database/quest-chains", label: "Quest chains" },
  { href: "/database/drops", label: "Loot observations" },
  { href: "/database/coverage", label: "Coverage: where the data is thin" },
  { href: "/database/zones", label: "Zones" },
  { href: "/database/instances", label: "Dungeons and raids" },
  { href: "/tools/guild-board", label: "Guilds" },
];

/** The hub pages the sitemap lists whatever the data: the database landing page, the all-items list and each listed hub. */
export const DATABASE_HUB_PATHS: readonly string[] = ["/database", "/database/items", ...DATABASE_HUBS.filter((h) => !h.unlisted).map((h) => h.href)];
