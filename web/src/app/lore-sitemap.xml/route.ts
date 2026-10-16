import { CHUNK_SIZE, hasTypes, indexableCount, releaseCreatedAt, UNAVAILABLE } from "@/lib/lore";
import { loreUnavailable, SITEMAP_HEADERS, siteUrl } from "@/lib/lore-sitemap";

export const dynamic = "force-dynamic";

/** Sitemap index: one chunk file per CHUNK_SIZE indexable lore pages, plus the browse pages when typed. */
export async function GET(): Promise<Response> {
  const count = indexableCount();
  const createdAt = releaseCreatedAt();
  const typed = hasTypes();
  if (count === UNAVAILABLE || createdAt === UNAVAILABLE || typed === UNAVAILABLE) return loreUnavailable();
  const chunks = Math.ceil(count / CHUNK_SIZE);
  const files = [...Array.from({ length: chunks }, (_, n) => `${n}.xml`), ...(typed ? ["pages.xml"] : [])];
  const entries = files
    .map((file) => `<sitemap><loc>${siteUrl()}/lore-sitemap/${file}</loc><lastmod>${createdAt}</lastmod></sitemap>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
  return new Response(xml, { headers: SITEMAP_HEADERS });
}
