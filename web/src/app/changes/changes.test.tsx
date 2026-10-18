import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import type { ChangeEntry } from "@/lib/changes";

const timeline = vi.hoisted((): { entries: ChangeEntry[] } => ({ entries: [] }));
vi.mock("@/lib/changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/changes")>()),
  loadTimeline: () => timeline.entries,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className} {...rest}>{children}</a>
  ),
}));

import ChangesPage from "./page";
import { GET } from "./feed.xml/route";

const entries: ChangeEntry[] = [
  { id: "build:b", type: "build", game: "forever", at: "2026-10-17T06:00:00.000Z", title: "WoW: Forever build 1.60.1.70460", url: null, version: "1.60.1.70460", diffUrl: null },
  {
    id: "forum:1", type: "post", game: "forever", at: "2026-10-16T22:00:00.000Z", title: "Synthetic beta notice <b>", url: "https://us.forums.blizzard.com/en/wow/t/x/1",
    author: "Linxy", role: "Community Manager", category: "WoW: Forever Beta Discussion", source: "forum", excerpt: "A short excerpt. Second sentence.",
  },
  { id: "forum:2", type: "hotfix", game: "forever", at: "2026-10-16T18:00:00.000Z", title: "WoW: Forever Hotfixes", url: "https://us.forums.blizzard.com/en/wow/t/y/2", author: "Linxy", role: "Community Manager", category: "WoW: Forever", source: "forum", excerpt: "Fixed a thing." },
  { id: "forum:3", type: "post", game: "classic", at: "2026-10-15T18:00:00.000Z", title: "Classic realm move", url: "https://us.forums.blizzard.com/en/wow/t/z/3", author: "Fwoibles", role: "WoW Developer", category: "WoW Classic", source: "forum", excerpt: "Moving." },
  { id: "build:c", type: "build", game: "forever", at: "2026-10-14T06:00:00.000Z", title: "WoW: Forever build 1.60.1.70450", url: null, version: "1.60.1.70450", diffUrl: "https://everloot.app/changes/diff/70450" },
];
timeline.entries = entries;

const page = async (params: { show?: string; game?: string } = {}) =>
  renderToStaticMarkup(await ChangesPage({ searchParams: Promise.resolve(params) }));

test("shows Forever entries newest first, each post with its excerpt and a prominent link to the original", async () => {
  const html = await page();
  expect(html).toContain("WoW Forever Patch Notes and Blizzard Posts");
  expect(html).toContain("Latest build: WoW: Forever 1.60.1.70460, first seen by Everloot on 2026-10-17.");
  expect(html).toContain("Newest entry 2026-10-17 06:00 UTC");
  expect(html.indexOf("1.60.1.70460")).toBeLessThan(html.indexOf("Synthetic beta notice"));
  expect(html).toContain("A short excerpt. Second sentence.");
  expect(html).toContain('href="https://us.forums.blizzard.com/en/wow/t/x/1"');
  expect(html).toContain("Read the original on Blizzard&#x27;s forum");
  expect(html).toContain("Linxy, Community Manager");
  expect(html).not.toContain("Classic realm move");
});

test("markup in a title is escaped, not rendered", async () => {
  const html = await page();
  expect(html).toContain("Synthetic beta notice &lt;b&gt;");
  expect(html).not.toContain("<b>");
});

test("builds say they were first seen by Everloot, and leave a slot for the diff", async () => {
  const html = await page({ show: "builds" });
  expect(html).toContain("First seen by Everloot on this date");
  expect(html).toContain("not published yet");
  expect(html).toContain('href="https://everloot.app/changes/diff/70450"');
  expect(html).not.toContain("Synthetic beta notice");
});

test("the filters narrow the list and the current one is marked", async () => {
  const hotfixes = await page({ show: "hotfixes" });
  expect(hotfixes).toContain("WoW: Forever Hotfixes");
  expect(hotfixes).not.toContain("build 1.60.1.70460");
  expect(hotfixes).toContain('aria-current="page"');
  const posts = await page({ show: "posts" });
  expect(posts).toContain("Synthetic beta notice");
  expect(posts).not.toContain("WoW: Forever Hotfixes");
  expect(await page({ show: "nonsense" })).toContain("1.60.1.70460");
});

test("Classic is added only when asked for, and the toggle keeps the filter", async () => {
  const both = await page({ game: "all", show: "posts" });
  expect(both).toContain("Classic realm move");
  expect(both).toContain('href="/changes?show=posts"');
  expect(await page({ show: "posts" })).toContain('href="/changes?show=posts&amp;game=all"');
});

test("an empty filter says so in plain words", async () => {
  timeline.entries = [];
  expect(await page()).toContain("Nothing recorded for this filter yet.");
  timeline.entries = entries;
});

test("the page names its source rules and carries no ad or paid wording", async () => {
  const html = (await page()).toLowerCase();
  expect(html).toContain("robots rules");
  expect(html).toContain("data policy");
  for (const word of ["sponsor", "advert", "premium", "subscribe", "buy now"]) expect(html).not.toContain(word);
});

test("the RSS feed is Forever only, is RSS, and links to Blizzard's originals", async () => {
  const response = GET();
  expect(response.headers.get("content-type")).toContain("application/rss+xml");
  const xml = await response.text();
  expect(xml).toContain("<rss version=\"2.0\"");
  expect(xml).toContain("<link>https://us.forums.blizzard.com/en/wow/t/x/1</link>");
  expect(xml).not.toContain("Classic realm move");
  expect((xml.match(/<item>/g) ?? []).length).toBe(4);
});

test("a post whose stored link was not a web link shows no link, only a plain note", async () => {
  timeline.entries = [{ ...entries[1], url: null }];
  const html = await page();
  expect(html).toContain("The link to the original is unavailable.");
  expect(html).not.toContain("Read the original");
  timeline.entries = entries;
});

test("with the game art, a spell a post names gets its icon, its tooltip and a link to where the site shows it", async () => {
  const { siteManifest } = await import("@/lib/game-assets.fixture");
  const base = "https://assets.example.test/wow_classic_beta-70450-84bea423";
  vi.stubEnv("NEXT_PUBLIC_GAME_ASSETS_URL", base);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(siteManifest)));
  timeline.entries = [{ ...entries[1], excerpt: "Battle Shout now reaches the whole raid." }];
  const html = await page();
  expect(html).toMatch(/data-spell-tip[^>]*><img[^>]*icons\/8001\.webp[^>]*alt=""[^>]*\/?><a href="\/tools\/raid"[^>]*aria-describedby="[^"]+"[^>]*>Battle Shout<\/a>/);
  expect(html).toContain("Battle Shout. Raises attack power by 20 for 2 min. found in game files, unconfirmed · build 1.60.1.70450.");
  expect(html).toContain("</span></span> now reaches the whole raid.");
  expect(html).toContain("Icons, tooltip text and loading screen art from game build 1.60.1.70450");
  timeline.entries = entries;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  // Without the asset URL the same excerpt is plain text.
  timeline.entries = [{ ...entries[1], excerpt: "Battle Shout now reaches the whole raid." }];
  expect(await page()).toContain(">Battle Shout now reaches the whole raid.</p>");
  timeline.entries = entries;
});
