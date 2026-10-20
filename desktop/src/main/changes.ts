import type { ChangeItem } from "../shared/types";

// The site's change tracker, read from its RSS feed (`/changes/feed.xml`): Blizzard posts, hotfixes, builds.

const unescape = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
// The feed escapes its HTML for XML, so the text comes out after two passes: XML, then the HTML inside.
const strip = (s: string) => unescape(unescape(s).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const tag = (item: string, name: string): string => {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(item);
  return m ? m[1] : "";
};

/** Items in document order (the feed is newest first). Anything without a title is skipped; links must be https. */
export function parseFeed(xml: string, limit = 30): ChangeItem[] {
  const items: ChangeItem[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const item = m[1];
    const title = strip(tag(item, "title"));
    if (!title) continue;
    const link = strip(tag(item, "link"));
    const pub = strip(tag(item, "pubDate"));
    const when = pub ? new Date(pub) : null;
    items.push({
      title,
      link: /^https:\/\//.test(link) ? link : "",
      date: when && !Number.isNaN(when.getTime()) ? when.toISOString() : null,
      summary: strip(tag(item, "description")).slice(0, 300),
    });
    if (items.length >= limit) break;
  }
  return items;
}

export async function fetchChanges(endpoint: string, send: typeof fetch = fetch): Promise<ChangeItem[]> {
  const res = await send(`${endpoint}/changes/feed.xml`, { headers: { accept: "application/rss+xml" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`changes feed: ${res.status}`);
  return parseFeed(await res.text());
}
