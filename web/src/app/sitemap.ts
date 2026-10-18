import { MetadataRoute } from "next";
import { LAUNCH } from "@/data/wow-forever";
import { FAMILIES } from "@/data/families";
import { tools, toolHref } from "@/data/tools";
import { MAP_DATA_EXTRACTED_AT, TALENT_DATA_EXTRACTED_AT } from "@/lib/build-stamp";
import { loadTimeline } from "@/lib/changes";
import { TALENT_CLASSES } from "@/lib/talents/catalogs";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";

/**
 * A page gets a lastModified only when the site knows one: the newest change entry for /changes, the build's
 * extraction date for the pages drawn from the game files, the day the launch sentence was read for
 * /wow-forever. Every other page has none, because a made-up date teaches crawlers to ignore the field.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["/", "/wow-forever", "/methodology", "/about", "/privacy", "/contact", "/upload", "/lore", "/changes", "/map", "/database", "/database/drops", "/database/npcs", "/database/quests", "/database/vendors", "/tools/collections", "/tools/guild-board", "/tools/auctions", "/tools/gold-ledger", "/addons", "/addons/popular", "/addons/ecosystem", "/addons/polestar", "/addons/polestar/packs", "/addons/polestar/wanted", "/connect"];

  const talentRoutes = TALENT_CLASSES.map((slug) => `/tools/talents/${slug}`);
  const paths = [...new Set([...staticRoutes, ...talentRoutes, ...tools.filter((tool) => tool.status !== "coming-soon").map(toolHref)])];

  const newestChange = loadTimeline()[0]?.at;
  const modified = (path: string): Date | undefined => {
    if (path === "/changes") return newestChange ? new Date(newestChange) : undefined;
    if (path === "/map") return MAP_DATA_EXTRACTED_AT;
    if (path === "/tools/raid" || path === "/tools/talents" || path.startsWith("/tools/talents/")) return TALENT_DATA_EXTRACTED_AT;
    if (path === "/wow-forever") return new Date(LAUNCH.checkedOn);
    return undefined;
  };

  return [
    ...paths.map((path) => {
      const lastModified = modified(path);
      return { url: `${baseUrl}${path}`, ...(lastModified ? { lastModified } : {}) };
    }),
    ...FAMILIES.map((family) => ({ url: `${baseUrl}/guilds/${family.slug}` })),
  ];
}
