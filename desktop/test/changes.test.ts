import { expect, test, vi } from "vitest";
import { fetchChanges, parseFeed } from "../src/main/changes";

const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Everloot changes</title>
<item><title><![CDATA[Hotfixes: October 17]]></title><link>https://us.forums.blizzard.com/en/wow/t/1</link><pubDate>Fri, 17 Oct 2026 20:00:00 GMT</pubDate><description>&lt;p&gt;Fixed &amp;amp; adjusted &lt;b&gt;Molten Core&lt;/b&gt; loot.&lt;/p&gt;</description></item>
<item><title>Build 1.60.1.70450</title><link>http://insecure.example/x</link><pubDate>not a date</pubDate><description></description></item>
<item><title></title><link>https://x</link></item>
</channel></rss>`;

test("feed items keep title, https link, date and a plain-text summary; bad links and dates are dropped, not the item", () => {
  const items = parseFeed(FEED);
  expect(items).toHaveLength(2);
  expect(items[0]).toEqual({ title: "Hotfixes: October 17", link: "https://us.forums.blizzard.com/en/wow/t/1", date: "2026-10-17T20:00:00.000Z", summary: "Fixed & adjusted Molten Core loot." });
  expect(items[1]).toEqual({ title: "Build 1.60.1.70450", link: "", date: null, summary: "" });
  expect(parseFeed(FEED, 1)).toHaveLength(1);
});

test("the feed is read from the site", async () => {
  const send = vi.fn(async (url: string) => { expect(url).toBe("https://everloot.app/changes/feed.xml"); return new Response(FEED); });
  expect(await fetchChanges("https://everloot.app", send as unknown as typeof fetch)).toHaveLength(2);
  const down = vi.fn(async () => new Response("", { status: 500 }));
  await expect(fetchChanges("https://everloot.app", down as unknown as typeof fetch)).rejects.toThrow(/500/);
});
