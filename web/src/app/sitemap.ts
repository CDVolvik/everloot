import { MetadataRoute } from "next";
import { FAMILIES } from "@/data/families";
import { tools, toolHref } from "@/data/tools";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["/", "/about", "/privacy", "/contact", "/upload", "/database", "/database/drops", "/database/npcs", "/database/quests", "/database/vendors", "/tools/collections", "/tools/guild-board", "/tools/auctions", "/tools/gold-ledger", "/addons", "/addons/polestar", "/addons/polestar/packs", "/addons/polestar/wanted"];

  const paths = [...new Set([...staticRoutes, ...tools.filter((tool) => tool.status !== "coming-soon").map(toolHref)])];
  return [
    ...paths.map((path) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1.0 : 0.5,
    })),
    ...FAMILIES.map((family) => ({
      url: `${baseUrl}/guilds/${family.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
