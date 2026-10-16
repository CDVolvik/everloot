import { BROWSE_TYPES, hasTypes, LETTERS, releaseCreatedAt, UNAVAILABLE } from "@/lib/lore";
import { escapeXml, loreUnavailable, SITEMAP_HEADERS, siteUrl } from "@/lib/lore-sitemap";

export const dynamic = "force-dynamic";

/** The indexed browse pages (one per type and letter) plus the coverage page. Letter `a` is the bare type URL. */
export async function GET(): Promise<Response> {
  const typed = hasTypes();
  const createdAt = releaseCreatedAt();
  if (typed === UNAVAILABLE || createdAt === UNAVAILABLE) return loreUnavailable();
  if (!typed) return new Response("Not found", { status: 404 });
  const base = siteUrl();
  const urls: string[] = [];
  for (const slug of Object.keys(BROWSE_TYPES)) {
    for (const letter of LETTERS) {
      urls.push(letter === "a" ? `${base}/lore/${slug}` : `${base}/lore/${slug}?letter=${encodeURIComponent(letter)}`);
    }
  }
  urls.push(`${base}/lore/coverage`);
  const body = urls.map((u) => `<url><loc>${escapeXml(u)}</loc><lastmod>${createdAt}</lastmod></url>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
  return new Response(xml, { headers: SITEMAP_HEADERS });
}
