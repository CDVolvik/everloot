import { AUCTIONS_CHUNK, AUCTIONS_SITEMAP_HEADERS, auctionPaths, auctionsUnavailable } from "@/lib/auctions-sitemap";
import { siteUrl } from "@/lib/lore-sitemap";

export const dynamic = "force-dynamic";

/** Sitemap index for the Auction House: one chunk per AUCTIONS_CHUNK indexable price pages (chunk 0 may be empty). */
export async function GET(): Promise<Response> {
  const paths = await auctionPaths();
  if (!paths) return auctionsUnavailable();
  const chunks = Math.max(1, Math.ceil(paths.length / AUCTIONS_CHUNK));
  const entries = Array.from({ length: chunks }, (_, n) => `<sitemap><loc>${siteUrl()}/auctions-sitemap/${n}.xml</loc></sitemap>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;
  return new Response(xml, { headers: AUCTIONS_SITEMAP_HEADERS });
}
