/** Shared bits for the sitemap indexes and their chunk files. */

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://everloot.app";
}

/** `"3.xml"` → 3; anything else → null. */
export function chunkNumber(param: string): number | null {
  const m = param.match(/^(0|[1-9]\d*)\.xml$/);
  return m ? Number(m[1]) : null;
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
