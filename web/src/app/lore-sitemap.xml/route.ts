import { CHUNK_SIZE, indexableCount, releaseCreatedAt, UNAVAILABLE } from "@/lib/lore";
import { loreUnavailable, SITEMAP_HEADERS, siteUrl } from "@/lib/lore-sitemap";

export const dynamic = "force-dynamic";

/** Sitemap index: one chunk file per CHUNK_SIZE indexable lore pages. */
export async function GET(): Promise<Response> {
  const count = indexableCount();
  const createdAt = releaseCreatedAt();
  if (count === UNAVAILABLE || createdAt === UNAVAILABLE) return loreUnavailable();
  const chunks = Math.ceil(count / CHUNK_SIZE);
  const entries = Array.from({ length: chunks }, (_, n) =>
    `<sitemap><loc>${siteUrl()}/lore-sitemap/${n}.xml</loc><lastmod>${createdAt}</lastmod></sitemap>`,
  ).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
  return new Response(xml, { headers: SITEMAP_HEADERS });
}
