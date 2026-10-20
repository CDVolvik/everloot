import { AUCTIONS_CHUNK, AUCTIONS_SITEMAP_HEADERS, auctionPaths, auctionsUnavailable } from "@/lib/auctions-sitemap";
import { chunkNumber, escapeXml, siteUrl } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** One chunk of indexable Auction House pages: realms first, then an item on a realm, then an item across realms. */
export async function GET(_req: Request, ctx: { params: Promise<{ n: string }> }): Promise<Response> {
  const n = chunkNumber((await ctx.params).n);
  if (n === null) return new Response("Not found", { status: 404 });
  const paths = await auctionPaths();
  if (!paths) return auctionsUnavailable();
  const chunk = paths.slice(n * AUCTIONS_CHUNK, (n + 1) * AUCTIONS_CHUNK);
  if (chunk.length === 0 && n > 0) return new Response("Not found", { status: 404 });
  const base = siteUrl();
  const urls = chunk.map((path) => `<url><loc>${escapeXml(`${base}${path}`)}</loc></url>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(xml, { headers: AUCTIONS_SITEMAP_HEADERS });
}
