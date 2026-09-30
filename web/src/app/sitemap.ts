import { MetadataRoute } from "next";
import { FAMILIES } from "@/data/families";
import { tools } from "@/data/tools";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes = ["/", "/about", "/privacy", "/upload", "/database", "/database/drops"];

  return [
    ...staticRoutes.map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1.0 : 0.5,
    })),
    ...FAMILIES.map((family) => ({
      url: `${baseUrl}/guilds/${family.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...tools.map((t) => ({
      url: `${baseUrl}/tools/${t.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: t.status === "live" ? 0.9 : 0.6,
    })),
  ];
}
