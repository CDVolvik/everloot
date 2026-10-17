import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  emptyStore, excerptOf, gameOf, ingestBluePosts, loadFetchState, loadStore, mergePosts, parseBlueskyFeed, parseForumActions,
  robotsAllows, saveFetchState, saveStore, type BlueStore, type Fetcher, type TrackedAccount,
} from "../src/blue-posts.js";

const fixtureText = (name: string) => readFileSync(new URL(`./fixtures/blue/${name}`, import.meta.url), "utf8");
const actions = () => JSON.parse(fixtureText("user_actions.json"));
const feed = () => JSON.parse(fixtureText("bluesky-feed.json"));
const now = new Date("2026-10-17T12:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
const roster: TrackedAccount[] = [
  { username: "Zorbrix-83447", title: "Game Producer" },
  { username: "Linxy", title: "Community Manager" },
  { username: "Rommax-244181", title: "WoW Developer" },
];
const FORUM_IDS = ["forum:70000001", "forum:70000002", "forum:70000004", "forum:70000010", "forum:70000008"];

test("forum actions: only tracked staff, only Forever or Classic categories, real posts only", () => {
  const posts = parseForumActions(actions(), roster, now);
  expect(posts.map((p) => p.id).sort()).toEqual([...FORUM_IDS].sort());
  expect(posts.find((p) => p.id === "forum:70000004")?.game).toBe("classic");
  expect(posts.filter((p) => p.game === "forever")).toHaveLength(4);
});

test("forum actions: title, link, author, role, category and time are carried over", () => {
  const posts = parseForumActions(actions(), roster, now);
  const first = posts.find((p) => p.id === "forum:70000001")!;
  expect(first).toMatchObject({
    source: "forum",
    title: "Synthetic Beta Realm Maintenance & Restart",
    url: "https://us.forums.blizzard.com/en/wow/t/synthetic-beta-maintenance/9000001",
    author: "Zorbrix",
    role: "Game Producer",
    category: "WoW: Forever Beta Discussion",
    postedAt: "2026-10-16T22:42:05.842Z",
    editedAt: null,
    kind: "post",
    firstSeen: now.toISOString(),
  });
  // A reply links to its own post number; a topic's first post links to the topic.
  expect(posts.find((p) => p.id === "forum:70000002")!.url).toBe("https://us.forums.blizzard.com/en/wow/t/synthetic-forever-hotfixes/9000002/14");
  const launch = posts.find((p) => p.id === "forum:70000008")!;
  expect(launch.url).toBe("https://us.forums.blizzard.com/en/wow/t/synthetic-launch-note/9000008");
  expect(launch.author).toBe("Linxy");
});

test("forum actions: hotfix titles are marked; retail threads are dropped, even with Forever in the title", () => {
  const posts = parseForumActions(actions(), roster, now);
  expect(posts.find((p) => p.id === "forum:70000002")?.kind).toBe("hotfix");
  expect(posts.some((p) => p.title.includes("Midnight"))).toBe(false);
  expect(posts.some((p) => p.id === "forum:70000009")).toBe(false);
});

test("forum actions: an answer that is not a user_actions list is an error, not an empty list", () => {
  expect(() => parseForumActions({ errors: ["nope"] }, roster, now)).toThrow(/user_actions/);
});

test("game filter: Forever and Classic categories only; a title never decides", () => {
  expect(gameOf(349)?.game).toBe("forever");
  expect(gameOf(347)?.category).toBe("WoW: Forever General Discussion");
  expect(gameOf(302)?.game).toBe("classic");
  expect(gameOf(171)).toBeNull();
  expect(gameOf(undefined)).toBeNull();
});

test("excerpt: at most two sentences, entities decoded, tags dropped", () => {
  expect(excerptOf("<p>One &amp; two. Three.</p> Four.")).toBe("One & two. Three.");
  expect(excerptOf("First sentence. Second one! Third one? Fourth.")).toBe("First sentence. Second one!");
  expect(excerptOf("Dungeons: a boss no longer resets early.&hellip;")).toBe("Dungeons: a boss no longer resets early.…");
  expect(excerptOf("")).toBe("");
});

test("excerpt: a sentence that starts in lowercase still counts as a sentence", () => {
  expect(excerptOf("Fixed a bug. we also changed a thing. more words here.")).toBe("Fixed a bug. we also changed a thing.");
  expect(excerptOf("Done. 70450 is out. Third.")).toBe("Done. 70450 is out.");
  expect(parseForumActions(actions(), roster, now).find((p) => p.id === "forum:70000010")!.excerpt).toBe("Fixed a bug. we also changed a thing.");
});

test("excerpt: common abbreviations, initials, list numbers and version numbers do not end a sentence", () => {
  expect(excerptOf("Use e.g. the ladder, it helps. Then rest. Third.")).toBe("Use e.g. the ladder, it helps. Then rest.");
  expect(excerptOf("Dr. Smith fixed it. Next one. Third.")).toBe("Dr. Smith fixed it. Next one.");
  expect(excerptOf("Ask J. Smith about it. Then wait. Third.")).toBe("Ask J. Smith about it. Then wait.");
  expect(excerptOf("1. Fix the boss. 2. Fix the door. 3. Done.")).toBe("1. Fix the boss. 2. Fix the door.");
  expect(excerptOf("Build 1.60.1.70450 is live. Restart now. Third.")).toBe("Build 1.60.1.70450 is live. Restart now.");
});

test("excerpt: a long sentence is cut at a word under 300 characters", () => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
  const out = excerptOf(long);
  expect(out.length).toBeLessThanOrEqual(300);
  expect(out).not.toMatch(/\s…$/);
  expect(out).toMatch(/word\d+…$/);
});

test("the forum excerpt never keeps more than the first two sentences", () => {
  const first = parseForumActions(actions(), roster, now).find((p) => p.id === "forum:70000001")!;
  expect(first.excerpt).toBe("The beta realms will restart soon for a test fix. Expect about an hour of downtime.");
});

test("bluesky: the official account's own posts with a Forever or Classic signal; no reposts, replies, retail or bare words", () => {
  const posts = parseBlueskyFeed(feed(), now);
  expect(posts.map((p) => p.id)).toEqual(["bluesky:3synthetic6", "bluesky:3synthetic1", "bluesky:3synthetic5"]);
  const stream = posts.find((p) => p.id === "bluesky:3synthetic1")!;
  expect(stream).toMatchObject({
    source: "bluesky",
    url: "https://bsky.app/profile/worldofwarcraft.blizzard.com/post/3synthetic1",
    title: "Synthetic: WoW: Forever server stream is coming. Join us on the day!",
    author: "World of Warcraft",
    role: "Official account",
    game: "forever",
    kind: "post",
  });
  expect(posts.find((p) => p.id === "bluesky:3synthetic5")).toMatchObject({ game: "classic", kind: "hotfix" });
});

test("bluesky: a pinned post is kept when it links to a Forever page", () => {
  const pinned = parseBlueskyFeed(feed(), now).find((p) => p.id === "bluesky:3synthetic6")!;
  expect(pinned.game).toBe("forever");
  expect(pinned.postedAt).toBe("2026-09-01T10:00:00.000Z");
});

test("bluesky: the excerpt is what follows the title, never the title again", () => {
  const posts = parseBlueskyFeed(feed(), now);
  expect(posts.find((p) => p.id === "bluesky:3synthetic1")!.excerpt).toBe("More text on a later line.");
  expect(posts.find((p) => p.id === "bluesky:3synthetic5")!.excerpt).toBe("");
});

test("merging adds new posts, keeps first-seen and a maintainer's summary, and sorts newest first", () => {
  const first = mergePosts(emptyStore(), parseForumActions(actions(), roster, now));
  expect(first.added).toHaveLength(5);
  expect(first.store.posts.map((p) => p.id)).toEqual(FORUM_IDS);
  const withSummary = {
    ...first.store,
    posts: first.store.posts.map((p) => (p.id === "forum:70000001" ? { ...p, summary: "Beta restarts tonight." } : p)),
  };
  const again = mergePosts(withSummary, parseForumActions(actions(), roster, minutes(360)));
  expect(again.added).toEqual([]);
  const kept = again.store.posts.find((p) => p.id === "forum:70000001")!;
  expect(kept.summary).toBe("Beta restarts tonight.");
  expect(kept.firstSeen).toBe(now.toISOString());
});

test("robots: the forum's rules block category and topic .rss and search, and allow the JSON we read", () => {
  const robots = fixtureText("robots.txt");
  expect(robotsAllows(robots, "/en/wow/user_actions.json?username=Linxy&filter=4,5&offset=0")).toBe(true);
  expect(robotsAllows(robots, "/en/wow/c/wow-forever/346.rss")).toBe(false);
  expect(robotsAllows(robots, "/en/wow/t/some-topic/123.rss")).toBe(false);
  expect(robotsAllows(robots, "/en/wow/search?q=x")).toBe(false);
  expect(robotsAllows(robots, "/en/wow/latest.rss")).toBe(true);
  expect(robotsAllows(robots, "/en/wow/anything?x=1&api_key=abc")).toBe(false);
});

test("robots: longest rule wins, Allow beats Disallow on a tie, a named group beats *, $ anchors", () => {
  expect(robotsAllows("User-agent: *\nDisallow: /a/\nAllow: /a/ok", "/a/ok")).toBe(true);
  expect(robotsAllows("User-agent: *\nDisallow: /a\nAllow: /a", "/a")).toBe(true);
  expect(robotsAllows("User-agent: *\nDisallow: /\n\nUser-agent: Everloot\nAllow: /", "/x")).toBe(true);
  expect(robotsAllows("User-agent: *\nDisallow: /x$", "/x")).toBe(false);
  expect(robotsAllows("User-agent: *\nDisallow: /x$", "/xy")).toBe(true);
  expect(robotsAllows("", "/anything")).toBe(true);
});

test("robots: an empty User-agent value names nobody, so it neither matches us nor widens the * group", () => {
  expect(robotsAllows("User-agent:\nDisallow: /", "/x")).toBe(true);
  expect(robotsAllows("User-agent: *\nDisallow: /secret\n\nUser-agent:\nAllow: /secret", "/secret")).toBe(false);
});

// ---- the polite fetcher, against a fake server ----

interface Call { url: string; headers: Record<string, string> }

const jsonRes = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

function fakeServer(over: { robots?: Response; forum?: (url: string, n: number) => Response; bluesky?: (url: string, n: number) => Response } = {}) {
  const calls: Call[] = [];
  let forumCalls = 0;
  let blueskyCalls = 0;
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (url.endsWith("/robots.txt")) return over.robots ?? new Response(fixtureText("robots.txt"), { status: 200 });
    if (url.includes("/user_actions.json")) return over.forum ? over.forum(url, ++forumCalls) : jsonRes(actions());
    if (url.includes("getAuthorFeed")) return over.bluesky ? over.bluesky(url, ++blueskyCalls) : jsonRes(feed());
    return new Response("not found", { status: 404 });
  };
  return { fetcher, calls };
}

const run = (server: ReturnType<typeof fakeServer>, extra: Partial<Parameters<typeof ingestBluePosts>[0]> = {}) =>
  ingestBluePosts({ store: emptyStore(), accounts: roster, fetcher: server.fetcher, now, sleep: async () => {}, ...extra });
const forumCalls = (s: ReturnType<typeof fakeServer>) => s.calls.filter((c) => c.url.includes("/user_actions.json"));
const blueskyCalls = (s: ReturnType<typeof fakeServer>) => s.calls.filter((c) => c.url.includes("getAuthorFeed"));

test("ingest: robots.txt first, one request per account and one for Bluesky, named user agent", async () => {
  const server = fakeServer();
  const result = await run(server);
  expect(server.calls[0].url).toBe("https://us.forums.blizzard.com/robots.txt");
  expect(forumCalls(server)).toHaveLength(3);
  expect(blueskyCalls(server)).toHaveLength(1);
  expect(server.calls).toHaveLength(5);
  for (const call of server.calls) expect(call.headers["User-Agent"]).toBe("Everloot/1.0 (+https://everloot.app; hello@everloot.app)");
  expect(result.errors).toEqual([]);
  // The same fixture answers all three accounts, but each account only keeps its own posts.
  expect(result.store.posts.filter((p) => p.source === "forum").map((p) => p.id)).toEqual(FORUM_IDS);
  expect(result.store.posts.filter((p) => p.source === "bluesky")).toHaveLength(3);
});

test("ingest: waits between forum requests", async () => {
  const waits: number[] = [];
  await run(fakeServer(), { sleep: async (ms) => { waits.push(ms); } });
  expect(waits).toEqual([1500, 1500]);
});

const sendFull = (offset: number, count = 30) => ({
  user_actions: Array.from({ length: count }, (_, i) => ({
    action_type: 5, created_at: new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - (offset + i) * 60_000).toISOString(), slug: "s",
    topic_id: 1000 + offset + i, post_id: 50000 - offset - i, post_number: 2, username: "Linxy", title: `Synthetic post ${offset + i}`,
    category_id: 347, excerpt: "Text.",
  })),
});
const offsetOf = (url: string) => Number(new URL(url).searchParams.get("offset"));

test("ingest: a first read pages up to three times per account, no further", async () => {
  const server = fakeServer({ forum: (url) => jsonRes(sendFull(offsetOf(url))) });
  const result = await run(server, { accounts: [roster[1]] });
  expect(forumCalls(server).map((c) => offsetOf(c.url))).toEqual([0, 30, 60]);
  expect(result.store.posts.filter((p) => p.source === "forum")).toHaveLength(90);
  expect(result.store.fetched["forum:Linxy"].newestSeen).toBe("2026-10-16T12:00:00.000Z");
});

test("ingest: a later read stops at the first page that reaches what it already saw", async () => {
  const server = fakeServer({ forum: (url) => jsonRes(sendFull(offsetOf(url))) });
  const first = await run(server, { accounts: [roster[1]] });
  const again = fakeServer({ forum: (url) => jsonRes(sendFull(offsetOf(url))) });
  await run(again, { accounts: [roster[1]], store: first.store, now: minutes(60) });
  expect(forumCalls(again)).toHaveLength(1);
});

test("ingest: a short page ends paging", async () => {
  const server = fakeServer({ forum: (url) => jsonRes(sendFull(offsetOf(url), 5)) });
  await run(server, { accounts: [roster[1]] });
  expect(forumCalls(server)).toHaveLength(1);
});

const blueskyPage = (n: number, cursor?: string) => ({
  ...(cursor ? { cursor } : {}),
  feed: Array.from({ length: 30 }, (_, i) => ({
    post: {
      uri: `at://did:plc:x/app.bsky.feed.post/p${n}x${i}`, author: { handle: "worldofwarcraft.blizzard.com", displayName: "World of Warcraft" },
      record: { createdAt: new Date(Date.UTC(2026, 9, 16, 12, 0, 0) - (n * 30 + i) * 60_000).toISOString(), text: `WoW: Forever note ${n}-${i}. Details.` },
    },
  })),
});

test("ingest: Bluesky follows its cursor, up to three pages, and stops when there is no cursor", async () => {
  const three = fakeServer({ bluesky: (_url, n) => jsonRes(blueskyPage(n, `c${n}`)) });
  const result = await run(three, { accounts: [] });
  expect(blueskyCalls(three).map((c) => new URL(c.url).searchParams.get("cursor"))).toEqual([null, "c1", "c2"]);
  expect(result.store.posts).toHaveLength(90);
  const two = fakeServer({ bluesky: (_url, n) => jsonRes(blueskyPage(n, n === 1 ? "c1" : undefined)) });
  await run(two, { accounts: [] });
  expect(blueskyCalls(two)).toHaveLength(2);
});

test("ingest: a source asked recently is skipped, and validators from the last answer are sent back", async () => {
  const server = fakeServer({ forum: () => new Response(JSON.stringify(actions()), { status: 200, headers: { etag: '"v1"', "last-modified": "Fri, 16 Oct 2026 22:00:00 GMT" } }) });
  const first = await run(server);
  const quick = fakeServer();
  const soon = await run(quick, { store: first.store, now: minutes(10) });
  expect(soon.skipped).toHaveLength(4);
  expect(quick.calls.map((c) => c.url)).toEqual(["https://us.forums.blizzard.com/robots.txt"]);
  const later = fakeServer({ forum: () => new Response(null, { status: 304 }) });
  const result = await run(later, { store: first.store, now: minutes(60) });
  const forumCall = forumCalls(later)[0];
  expect(forumCall.headers["If-None-Match"]).toBe('"v1"');
  expect(forumCall.headers["If-Modified-Since"]).toBe("Fri, 16 Oct 2026 22:00:00 GMT");
  expect(result.added).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(result.store.posts.length).toBe(first.store.posts.length);
});

test("ingest: a 304 without an ETag keeps the stored validators, and they survive a round trip through the state file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "blue-state-"));
  const statePath = join(dir, "state.json");
  const first = await run(fakeServer({ forum: () => new Response(JSON.stringify(actions()), { status: 200, headers: { etag: '"v1"' } }) }));
  saveFetchState(statePath, first.store.fetched);
  // Nothing new: every source answers 304, and this one leaves the ETag out.
  const nothing = fakeServer({ forum: () => new Response(null, { status: 304 }), bluesky: () => new Response(null, { status: 304 }) });
  const second = await run(nothing, { store: { posts: first.store.posts, fetched: loadFetchState(statePath) }, now: minutes(60) });
  expect(second.added).toEqual([]);
  saveFetchState(statePath, second.store.fetched);
  expect(second.store.fetched["forum:Linxy"].etag).toBe('"v1"');
  const third = fakeServer({ forum: () => new Response(null, { status: 304 }) });
  await run(third, { store: { posts: second.store.posts, fetched: loadFetchState(statePath) }, now: minutes(120) });
  expect(forumCalls(third)[0].headers["If-None-Match"]).toBe('"v1"');
});

test("ingest: a new ETag on a 304 replaces the old one", async () => {
  const first = await run(fakeServer({ forum: () => new Response(JSON.stringify(actions()), { status: 200, headers: { etag: '"v1"' } }) }));
  const second = await run(fakeServer({ forum: () => new Response(null, { status: 304, headers: { etag: '"v2"' } }) }), { store: first.store, now: minutes(60) });
  expect(second.store.fetched["forum:Linxy"].etag).toBe('"v2"');
});

test("ingest: an answer that fails to parse saves no validators and no last-asked time", async () => {
  const server = fakeServer({ forum: () => new Response(JSON.stringify({ oops: true }), { status: 200, headers: { etag: '"bad"' } }) });
  const result = await run(server);
  expect(result.errors.map((e) => e.source)).toEqual(["forum:Zorbrix-83447", "forum:Linxy", "forum:Rommax-244181"]);
  expect(result.store.fetched["forum:Linxy"]).toBeUndefined();
  expect(result.store.posts.some((p) => p.source === "bluesky")).toBe(true);
  const retry = fakeServer();
  await run(retry, { store: result.store, now: minutes(1) });
  expect(forumCalls(retry)[0].headers["If-None-Match"]).toBeUndefined();
  expect(forumCalls(retry)).toHaveLength(3);
});

test("ingest: a page that fails halfway leaves the source as it was", async () => {
  const server = fakeServer({ forum: (url) => (offsetOf(url) === 0 ? jsonRes(sendFull(0)) : jsonRes({ oops: true })) });
  const result = await run(server, { accounts: [roster[1]] });
  expect(result.errors.map((e) => e.source)).toEqual(["forum:Linxy"]);
  expect(result.store.posts.filter((p) => p.source === "forum")).toEqual([]);
  expect(result.store.fetched["forum:Linxy"]).toBeUndefined();
});

test("ingest: a 429 ends the forum pass, honours Retry-After, and still lets Bluesky run", async () => {
  const server = fakeServer({ forum: () => new Response("slow down", { status: 429, headers: { "retry-after": "7200" } }) });
  const result = await run(server);
  expect(forumCalls(server)).toHaveLength(1);
  expect(result.errors.map((e) => e.source)).toEqual(["forum:Zorbrix-83447"]);
  expect(result.skipped.filter((s) => s.includes("stopped after"))).toHaveLength(2);
  expect(result.store.fetched["forum:Zorbrix-83447"].notBefore).toBe("2026-10-17T14:00:00.000Z");
  expect(result.store.posts.every((p) => p.source === "bluesky")).toBe(true);
});

test("ingest: Retry-After survives a run that found nothing new, because the state is its own file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "blue-state-"));
  const statePath = join(dir, "state.json");
  const limited = await run(fakeServer({ forum: () => new Response("slow down", { status: 429, headers: { "retry-after": "7200" } }) }));
  saveFetchState(statePath, limited.store.fetched);
  // The next scheduled run starts from files only (a fresh checkout plus the cached state file).
  const next = fakeServer();
  const result = await run(next, { store: { posts: [], fetched: loadFetchState(statePath) }, now: minutes(60) });
  expect(result.skipped.some((s) => s.startsWith("forum:Zorbrix-83447: asked to wait"))).toBe(true);
  expect(forumCalls(next).some((c) => c.url.includes("Zorbrix"))).toBe(false);
  // Once the wait is over it asks again.
  const after = fakeServer();
  await run(after, { store: { posts: [], fetched: loadFetchState(statePath) }, now: minutes(130) });
  expect(forumCalls(after).some((c) => c.url.includes("Zorbrix"))).toBe(true);
});

test("ingest: the posts file never carries the fetch state", () => {
  const dir = mkdtempSync(join(tmpdir(), "blue-"));
  const path = join(dir, "blue-posts.json");
  const store: BlueStore = { posts: mergePosts(emptyStore(), parseBlueskyFeed(feed(), now)).store.posts, fetched: { bluesky: { at: now.toISOString(), etag: '"x"' } } };
  saveStore(path, store);
  expect(Object.keys(JSON.parse(readFileSync(path, "utf8")))).toEqual(["posts"]);
});

test("ingest: a path robots.txt disallows is never requested", async () => {
  const server = fakeServer({ robots: new Response("User-agent: *\nDisallow: /en/wow/user_actions.json", { status: 200 }) });
  const result = await run(server);
  expect(forumCalls(server)).toHaveLength(0);
  expect(result.errors.filter((e) => e.error.includes("robots.txt"))).toHaveLength(3);
});

test("ingest: an unreadable robots.txt means no forum requests at all", async () => {
  const server = fakeServer({ robots: new Response("down", { status: 503 }) });
  const result = await run(server);
  expect(forumCalls(server)).toHaveLength(0);
  expect(result.errors[0]).toEqual({ source: "forum", error: "robots.txt: HTTP 503" });
});

test("ingest: a redirect is reported and not followed", async () => {
  const server = fakeServer({ forum: () => new Response(null, { status: 301, headers: { location: "https://elsewhere.example/x" } }) });
  const result = await run(server, { accounts: [roster[1]] });
  expect(result.errors).toEqual([{ source: "forum:Linxy", error: "HTTP 301 redirect not followed" }]);
  expect(server.calls.some((c) => c.url.includes("elsewhere"))).toBe(false);
  const moved = await run(fakeServer({ robots: new Response(null, { status: 302, headers: { location: "/x" } }) }));
  expect(moved.errors[0].error).toBe("robots.txt: HTTP 302");
});

test("the store survives a write and a read, and a missing file is an empty store", () => {
  const dir = mkdtempSync(join(tmpdir(), "blue-"));
  const path = join(dir, "nested", "blue-posts.json");
  expect(loadStore(join(dir, "none.json"))).toEqual(emptyStore());
  const store = mergePosts(emptyStore(), parseBlueskyFeed(feed(), now)).store;
  saveStore(path, store);
  expect(loadStore(path)).toEqual(store);
});

test("loading a hand-edited store clamps every limit and drops what cannot be shown", () => {
  const dir = mkdtempSync(join(tmpdir(), "blue-"));
  const path = join(dir, "blue-posts.json");
  const good = parseForumActions(actions(), roster, now)[0];
  writeFileSync(path, JSON.stringify({
    fetched: { bluesky: { at: "x" } },
    posts: [
      { ...good, excerpt: "One. Two. Three. Four. Five.", url: "javascript:alert(1)" },
      { ...good, id: "forum:bad-date", postedAt: "not a date" },
      { ...good, id: "forum:no-title", title: "" },
      { ...good, id: "forum:other-game", game: "retail" },
      "not an object",
    ],
  }));
  const loaded = loadStore(path);
  expect(loaded.fetched).toEqual({});
  expect(loaded.posts).toHaveLength(1);
  expect(loaded.posts[0].excerpt).toBe("One. Two.");
  expect(loaded.posts[0].url).toBeNull();
});
