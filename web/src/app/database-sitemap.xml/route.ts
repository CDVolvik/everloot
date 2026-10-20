import { DATABASE_CHUNK, DATABASE_SITEMAP_HEADERS, databasePaths, databaseUnavailable } from "@/lib/database-sitemap";
import { siteUrl } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** Sitemap index for the database detail pages: one chunk per DATABASE_CHUNK indexed pages (chunk 0 may be empty). */
export async function GET(): Promise<Response> {
  const paths = await databasePaths();
  if (!paths) return databaseUnavailable();
  const chunks = Math.max(1, Math.ceil(paths.length / DATABASE_CHUNK));
  const entries = Array.from({ length: chunks }, (_, n) => `<sitemap><loc>${siteUrl()}/database-sitemap/${n}.xml</loc></sitemap>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
  return new Response(xml, { headers: DATABASE_SITEMAP_HEADERS });
}
