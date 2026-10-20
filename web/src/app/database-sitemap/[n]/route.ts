import { DATABASE_CHUNK, DATABASE_SITEMAP_HEADERS, databasePaths, databaseUnavailable } from "@/lib/database-sitemap";
import { chunkNumber, escapeXml, siteUrl } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";

/** One chunk of indexed database pages: items, then NPCs, quests, objects and vendors, each by id. */
export async function GET(_req: Request, ctx: { params: Promise<{ n: string }> }): Promise<Response> {
  const n = chunkNumber((await ctx.params).n);
  if (n === null) return new Response("Not found", { status: 404 });
  const paths = await databasePaths();
  if (!paths) return databaseUnavailable();
  const chunk = paths.slice(n * DATABASE_CHUNK, (n + 1) * DATABASE_CHUNK);
  if (chunk.length === 0 && n > 0) return new Response("Not found", { status: 404 });
  const base = siteUrl();
  const urls = chunk.map((path) => `<url><loc>${escapeXml(`${base}${path}`)}</loc></url>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(xml, { headers: DATABASE_SITEMAP_HEADERS });
}
