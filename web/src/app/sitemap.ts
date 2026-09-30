import { MetadataRoute } from "next";
import { tools } from "@/data/tools";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes = ["/", "/about", "/privacy", "/upload", "/database"];

  return [
    ...staticRoutes.map((path) => ({
      url: `${baseUrl}${path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1.0 : 0.5,
    })),
    ...tools.map((t) => ({
      url: `${baseUrl}/tools/${t.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: t.status === "live" ? 0.9 : 0.6,
    })),
  ];
}
