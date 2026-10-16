/** Shared bits for the lore sitemap index and its chunk files. */
export const SITEMAP_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
};

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";
}

export function loreUnavailable(): Response {
  return Response.json({ error: "Lore archive unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

/** `"3.xml"` → 3; anything else → null. */
export function chunkNumber(param: string): number | null {
  const m = param.match(/^(0|[1-9]\d*)\.xml$/);
  return m ? Number(m[1]) : null;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
