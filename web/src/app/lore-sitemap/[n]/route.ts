import { CHUNK_SIZE, indexableChunk, indexableCount, loreSlug, releaseCreatedAt, UNAVAILABLE } from "@/lib/lore";
import { chunkNumber, escapeXml, loreUnavailable, SITEMAP_HEADERS, siteUrl } from "@/lib/lore-sitemap";

export const dynamic = "force-dynamic";

/** One sitemap chunk: up to CHUNK_SIZE canonical lore URLs for indexable pages, ordered by id. */
export async function GET(_req: Request, ctx: { params: Promise<{ n: string }> }): Promise<Response> {
  const { n: param } = await ctx.params;
  const n = chunkNumber(param);
  if (n === null) return new Response("Not found", { status: 404 });
  const count = indexableCount();
  const createdAt = releaseCreatedAt();
  if (count === UNAVAILABLE || createdAt === UNAVAILABLE) return loreUnavailable();
  if (n >= Math.ceil(count / CHUNK_SIZE)) return new Response("Not found", { status: 404 });
  const rows = indexableChunk(n);
  if (rows === UNAVAILABLE) return loreUnavailable();
  const base = siteUrl();
  const urls = rows.map((row) => `<url><loc>${base}/lore/${escapeXml(loreSlug(row))}</loc><lastmod>${createdAt}</lastmod></url>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(xml, { headers: SITEMAP_HEADERS });
}
