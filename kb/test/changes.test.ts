import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { emptyStore, mergePosts, parseBlueskyFeed, parseForumActions } from "../src/blue-posts.js";
import { buildTimeline, filterTimeline, handleRecentChanges, parseFilter, renderFeed, type BuildLike } from "../src/changes.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/blue/${name}`, import.meta.url), "utf8"));
const seen = new Date("2026-10-17T12:00:00Z");
const accounts = [
  { username: "Zorbrix-83447", title: "Game Producer" },
  { username: "Linxy", title: "Community Manager" },
  { username: "Rommax-244181", title: "WoW Developer" },
];
const posts = mergePosts(mergePosts(emptyStore(), parseForumActions(fixture("user_actions.json"), accounts, seen)).store, parseBlueskyFeed(fixture("bluesky-feed.json"), seen)).store.posts;
const builds: BuildLike[] = [
  { key: "wow_classic_beta:aaa", product: "wow_classic_beta", buildId: 70450, version: "1.60.1.70450", firstSeen: "2026-10-16T20:00:00.000Z" },
  { key: "wow_classic_beta:bbb", product: "wow_classic_beta", buildId: 70460, version: "1.60.1.70460", firstSeen: "2026-10-17T06:00:00.000Z", diffUrl: "https://everloot.app/changes/diff/70460" },
  { key: "wow_classic_era:ccc", product: "wow_classic_era", buildId: 70001, version: "1.15.9.70001", firstSeen: "2026-10-10T06:00:00.000Z" },
  { key: "wow_retail:ddd", product: "wow", buildId: 99999, version: "12.0.0.99999", firstSeen: "2026-10-17T07:00:00.000Z" },
];
const timeline = buildTimeline(posts, builds);

test("the timeline merges posts and builds, newest first, and leaves out products that are not Forever or Classic", () => {
  expect(timeline.map((e) => e.at)).toEqual([...timeline.map((e) => e.at)].sort().reverse());
  expect(timeline.some((e) => e.version === "12.0.0.99999")).toBe(false);
  expect(timeline[0]).toMatchObject({ type: "build", version: "1.60.1.70460" });
  expect(timeline).toHaveLength(4 + 2 + 3);
});

test("a build is labelled as first seen by Everloot and carries an empty diff slot until one exists", () => {
  const early = timeline.find((e) => e.version === "1.60.1.70450")!;
  expect(early).toMatchObject({ game: "forever", title: "WoW: Forever build 1.60.1.70450", url: null, diffUrl: null });
  expect(timeline.find((e) => e.version === "1.60.1.70460")!.diffUrl).toBe("https://everloot.app/changes/diff/70460");
  expect(timeline.find((e) => e.version === "1.15.9.70001")!.game).toBe("classic");
});

test("filters: blue posts, hotfixes, builds, and a game", () => {
  expect(filterTimeline(timeline, "builds").every((e) => e.type === "build")).toBe(true);
  expect(filterTimeline(timeline, "builds")).toHaveLength(3);
  expect(filterTimeline(timeline, "hotfixes").map((e) => e.type)).toEqual(["hotfix", "hotfix"]);
  expect(filterTimeline(timeline, "posts").every((e) => e.type === "post")).toBe(true);
  expect(filterTimeline(timeline, "all", "forever").every((e) => e.game === "forever")).toBe(true);
  expect(filterTimeline(timeline, "all")).toHaveLength(timeline.length);
  expect(parseFilter("builds")).toBe("builds");
  expect(parseFilter("nonsense")).toBe("all");
  expect(parseFilter(undefined)).toBe("all");
});

test("RSS: valid shape, newest first, every post item links to Blizzard's original", () => {
  const xml = renderFeed(timeline, { baseUrl: "https://everloot.app/", now: seen });
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
  expect(xml).toContain("<link>https://everloot.app/changes</link>");
  expect(xml).toContain('<atom:link href="https://everloot.app/changes/feed.xml" rel="self"');
  expect((xml.match(/<item>/g) ?? []).length).toBe(timeline.length);
  expect(xml).toContain("<link>https://us.forums.blizzard.com/en/wow/t/synthetic-beta-maintenance/9000001</link>");
  expect(xml).toContain("<link>https://bsky.app/profile/worldofwarcraft.blizzard.com/post/3synthetic1</link>");
  expect(xml).toContain('<guid isPermaLink="false">build:wow_classic_beta:aaa</guid>');
  expect(xml).toContain("<link>https://everloot.app/changes/diff/70460</link>");
  expect(xml).toContain("<link>https://everloot.app/changes?show=builds</link>");
  expect(xml).toContain("<pubDate>Fri, 16 Oct 2026 22:42:05 GMT</pubDate>");
  // Only the excerpt, never more.
  expect(xml).not.toContain("should never be kept");
  expect(xml.indexOf("1.60.1.70460")).toBeLessThan(xml.indexOf("1.60.1.70450"));
});

test("RSS: markup in titles and excerpts is escaped and control characters are dropped", () => {
  const nasty = { ...posts[0], title: "A <b>bold</b> & \"quoted\" \u0007 title", excerpt: "x < y & z" };
  const xml = renderFeed(buildTimeline([nasty], []), { baseUrl: "https://everloot.app", now: seen });
  expect(xml).toContain("A &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot;  title");
  expect(xml).toContain("x &lt; y &amp; z");
  expect(xml).not.toContain("\u0007");
});

test("RSS: an empty timeline is still a valid feed", () => {
  const xml = renderFeed([], { baseUrl: "https://everloot.app", now: seen });
  expect(xml).toContain("<lastBuildDate>Sat, 17 Oct 2026 12:00:00 GMT</lastBuildDate>");
  expect(xml).not.toContain("<item>");
});

test("a maintainer's summary is shown in front of the excerpt, and only a maintainer writes it", () => {
  const withSummary = posts.map((p) => (p.id === "forum:70000001" ? { ...p, summary: "Beta restarts tonight." } : p));
  const entry = buildTimeline(withSummary, []).find((e) => e.id === "forum:70000001")!;
  expect(entry.summary).toBe("Beta restarts tonight.");
  expect(posts.every((p) => p.summary === undefined)).toBe(true);
});

test("recent_changes text: filter, limit, source link and the honesty lines", () => {
  const text = handleRecentChanges(timeline, { filter: "hotfixes" });
  expect(text).toContain("[Hotfix, WoW: Forever] WoW: Forever Hotfixes - October 16");
  expect(text).toContain("Original: https://us.forums.blizzard.com/en/wow/t/synthetic-forever-hotfixes/9000002/14");
  expect(text).toContain("Blizzard's");
  const builds3 = handleRecentChanges(timeline, { filter: "builds", limit: 1 });
  expect(builds3).toContain("1.60.1.70460");
  expect(builds3).not.toContain("1.60.1.70450");
  expect(builds3).toContain("First seen by Everloot, not Blizzard's release time. Diff: https://everloot.app/changes/diff/70460");
});

test("recent_changes text: not connected is not the same as nothing", () => {
  expect(handleRecentChanges(null, {})).toMatch(/not connected/);
  expect(handleRecentChanges([], {})).toMatch(/No changes recorded/);
});
