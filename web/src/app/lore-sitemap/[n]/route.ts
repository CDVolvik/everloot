import { indexableChunk, loreSlug, releaseCreatedAt, UNAVAILABLE } from "@/lib/lore";
import { chunkNumber, escapeXml, loreUnavailable, SITEMAP_HEADERS, siteUrl } from "@/lib/lore-sitemap";

export const dynamic = "force-dynamic";

/** One sitemap chunk: up to CHUNK_SIZE canonical lore URLs for indexable pages, ordered by id. */
export async function GET(_req: Request, ctx: { params: Promise<{ n: string }> }): Promise<Response> {
  const { n: param } = await ctx.params;
  const n = chunkNumber(param);
  if (n === null) return new Response("Not found", { status: 404 });
  const createdAt = releaseCreatedAt();
  const rows = indexableChunk(n);
  if (createdAt === UNAVAILABLE || rows === UNAVAILABLE) return loreUnavailable();
  // No full-table count here: a chunk past the end is simply empty. Chunk 0 may be legitimately empty.
  if (rows.length === 0 && n > 0) return new Response("Not found", { status: 404 });
  const base = siteUrl();
  const urls = rows.map((row) => `<url><loc>${base}/lore/${escapeXml(loreSlug(row))}</loc><lastmod>${createdAt}</lastmod></url>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(xml, { headers: SITEMAP_HEADERS });
}
