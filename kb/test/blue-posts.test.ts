import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  emptyStore, excerptOf, gameOf, ingestBluePosts, loadStore, mergePosts, parseBlueskyFeed, parseForumActions, robotsAllows,
  saveStore, type Fetcher, type TrackedAccount,
} from "../src/blue-posts.js";

const fixtureText = (name: string) => readFileSync(new URL(`./fixtures/blue/${name}`, import.meta.url), "utf8");
const actions = () => JSON.parse(fixtureText("user_actions.json"));
const feed = () => JSON.parse(fixtureText("bluesky-feed.json"));
const now = new Date("2026-10-17T12:00:00Z");
const roster: TrackedAccount[] = [
  { username: "Zorbrix-83447", title: "Game Producer" },
  { username: "Linxy", title: "Community Manager" },
  { username: "Rommax-244181", title: "WoW Developer" },
];

test("forum actions: only tracked staff, only Forever or Classic, real posts only", () => {
  const posts = parseForumActions(actions(), roster, now);
  expect(posts.map((p) => p.id)).toEqual(["forum:70000001", "forum:70000002", "forum:70000004", "forum:70000008"]);
  expect(posts.map((p) => p.game)).toEqual(["forever", "forever", "classic", "forever"]);
});

test("forum actions: title, link, author, role, category and time are carried over", () => {
  const [first, second, , launch] = parseForumActions(actions(), roster, now);
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
  expect(second.url).toBe("https://us.forums.blizzard.com/en/wow/t/synthetic-forever-hotfixes/9000002/14");
  expect(launch.url).toBe("https://us.forums.blizzard.com/en/wow/t/synthetic-launch-note/9000008");
  expect(launch.author).toBe("Linxy");
});

test("forum actions: hotfix titles are marked, retail threads are dropped", () => {
  const posts = parseForumActions(actions(), roster, now);
  expect(posts.find((p) => p.id === "forum:70000002")?.kind).toBe("hotfix");
  expect(posts.some((p) => p.title.includes("Midnight"))).toBe(false);
});

test("forum actions: an answer that is not a user_actions list is an error, not an empty list", () => {
  expect(() => parseForumActions({ errors: ["nope"] }, roster, now)).toThrow(/user_actions/);
});

test("game filter: Forever categories and titles, Classic categories, nothing else", () => {
  expect(gameOf(349, "anything")?.game).toBe("forever");
  expect(gameOf(171, "WoW Forever launch hours")?.game).toBe("forever");
  expect(gameOf(302, "Season notes")?.game).toBe("classic");
  expect(gameOf(171, "Midnight hotfixes")).toBeNull();
  expect(gameOf(undefined, "Forevermore")).toBeNull();
});

test("excerpt: at most two sentences, entities decoded, tags dropped", () => {
  expect(excerptOf("<p>One &amp; two. Three.</p> Four.")).toBe("One & two. Three.");
  expect(excerptOf("First sentence. Second one! Third one? Fourth.")).toBe("First sentence. Second one!");
  expect(excerptOf("Dungeons: a boss no longer resets early.&hellip;")).toBe("Dungeons: a boss no longer resets early.…");
  expect(excerptOf("")).toBe("");
});

test("excerpt: a long sentence is cut at a word under 300 characters", () => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
  const out = excerptOf(long);
  expect(out.length).toBeLessThanOrEqual(300);
  expect(out.endsWith("…")).toBe(true);
  expect(out).not.toMatch(/\s…$/);
  expect(out).toMatch(/word\d+…$/);
});

test("the forum excerpt never keeps more than the first two sentences", () => {
  const first = parseForumActions(actions(), roster, now)[0];
  expect(first.excerpt).toBe("The beta realms will restart soon for a test fix. Expect about an hour of downtime.");
});

test("bluesky: the official account's own Forever or Classic posts, no reposts or replies", () => {
  const posts = parseBlueskyFeed(feed(), now);
  expect(posts.map((p) => p.id)).toEqual(["bluesky:3synthetic1", "bluesky:3synthetic5"]);
  expect(posts[0]).toMatchObject({
    source: "bluesky",
    url: "https://bsky.app/profile/worldofwarcraft.blizzard.com/post/3synthetic1",
    title: "Synthetic: a Forever server stream is coming. Join us on the day!",
    author: "World of Warcraft",
    role: "Official account",
    game: "forever",
    kind: "post",
  });
  expect(posts[0].excerpt).toBe("Synthetic: a Forever server stream is coming. Join us on the day!");
  expect(posts[1]).toMatchObject({ game: "classic", kind: "hotfix" });
});

test("merging adds new posts, keeps first-seen and a maintainer's summary, and sorts newest first", () => {
  const first = mergePosts(emptyStore(), parseForumActions(actions(), roster, now));
  expect(first.added).toHaveLength(4);
  expect(first.store.posts.map((p) => p.postedAt)).toEqual([...first.store.posts.map((p) => p.postedAt)].sort().reverse());
  const withSummary = {
    ...first.store,
    posts: first.store.posts.map((p) => (p.id === "forum:70000001" ? { ...p, summary: "Beta restarts tonight." } : p)),
  };
  const later = new Date("2026-10-17T18:00:00Z");
  const again = mergePosts(withSummary, parseForumActions(actions(), roster, later));
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

// ---- the polite fetcher, against a fake server ----

interface Call { url: string; headers: Record<string, string> }

function fakeServer(over: { robots?: Response; forum?: (url: string, n: number) => Response; bluesky?: () => Response } = {}) {
  const calls: Call[] = [];
  let forumCalls = 0;
  const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
  const fetcher: Fetcher = async (url, init) => {
    calls.push({ url, headers: init.headers });
    if (url.endsWith("/robots.txt")) return over.robots ?? new Response(fixtureText("robots.txt"), { status: 200 });
    if (url.includes("/user_actions.json")) return over.forum ? over.forum(url, ++forumCalls) : json(actions());
    if (url.includes("getAuthorFeed")) return over.bluesky ? over.bluesky() : json(feed());
    return new Response("not found", { status: 404 });
  };
  return { fetcher, calls };
}

const run = (server: ReturnType<typeof fakeServer>, extra: Partial<Parameters<typeof ingestBluePosts>[0]> = {}) =>
  ingestBluePosts({ store: emptyStore(), accounts: roster, fetcher: server.fetcher, now, sleep: async () => {}, ...extra });

test("ingest: robots.txt first, one request per account and one for Bluesky, named user agent", async () => {
  const server = fakeServer();
  const result = await run(server);
  expect(server.calls[0].url).toBe("https://us.forums.blizzard.com/robots.txt");
  expect(server.calls.filter((c) => c.url.includes("/user_actions.json"))).toHaveLength(3);
  expect(server.calls.filter((c) => c.url.includes("getAuthorFeed"))).toHaveLength(1);
  expect(server.calls).toHaveLength(5);
  for (const call of server.calls) expect(call.headers["User-Agent"]).toBe("Everloot/1.0 (+https://everloot.app; hello@everloot.app)");
  expect(result.errors).toEqual([]);
  // The same fixture answers all three accounts, but each account only keeps its own posts.
  expect(result.store.posts.filter((p) => p.source === "forum").map((p) => p.id)).toEqual(["forum:70000001", "forum:70000002", "forum:70000004", "forum:70000008"]);
  expect(result.store.posts.filter((p) => p.source === "bluesky")).toHaveLength(2);
});

test("ingest: waits between forum requests", async () => {
  const waits: number[] = [];
  await run(fakeServer(), { sleep: async (ms) => { waits.push(ms); } });
  expect(waits).toEqual([1500, 1500]);
});

test("ingest: a source asked recently is skipped, and validators from the last answer are sent back", async () => {
  const server = fakeServer({ forum: () => new Response(JSON.stringify(actions()), { status: 200, headers: { etag: '"v1"', "last-modified": "Fri, 16 Oct 2026 22:00:00 GMT" } }) });
  const first = await run(server);
  const quick = fakeServer();
  const soon = await run(quick, { store: first.store, now: new Date(now.getTime() + 10 * 60_000) });
  expect(soon.skipped).toHaveLength(4);
  expect(quick.calls.map((c) => c.url)).toEqual(["https://us.forums.blizzard.com/robots.txt"]);
  const later = fakeServer({ forum: () => new Response(null, { status: 304 }) });
  const result = await run(later, { store: first.store, now: new Date(now.getTime() + 60 * 60_000) });
  const forumCall = later.calls.find((c) => c.url.includes("/user_actions.json"))!;
  expect(forumCall.headers["If-None-Match"]).toBe('"v1"');
  expect(forumCall.headers["If-Modified-Since"]).toBe("Fri, 16 Oct 2026 22:00:00 GMT");
  expect(result.added).toEqual([]);
  expect(result.errors).toEqual([]);
  expect(result.store.posts.length).toBe(first.store.posts.length);
});

test("ingest: a 429 ends the forum pass, honours Retry-After, and still lets Bluesky run", async () => {
  const server = fakeServer({ forum: () => new Response("slow down", { status: 429, headers: { "retry-after": "3600" } }) });
  const result = await run(server);
  expect(server.calls.filter((c) => c.url.includes("/user_actions.json"))).toHaveLength(1);
  expect(result.errors.map((e) => e.source)).toEqual(["forum:Zorbrix-83447"]);
  expect(result.skipped.filter((s) => s.includes("stopped after"))).toHaveLength(2);
  expect(result.store.fetched["forum:Zorbrix-83447"].notBefore).toBe("2026-10-17T13:00:00.000Z");
  expect(result.store.posts.every((p) => p.source === "bluesky")).toBe(true);
  const retry = fakeServer();
  const early = await run(retry, { store: result.store, now: new Date(now.getTime() + 30 * 60_000) });
  expect(early.skipped.some((s) => s.startsWith("forum:Zorbrix-83447: asked to wait"))).toBe(true);
});

test("ingest: a path robots.txt disallows is never requested", async () => {
  const server = fakeServer({ robots: new Response("User-agent: *\nDisallow: /en/wow/user_actions.json", { status: 200 }) });
  const result = await run(server);
  expect(server.calls.some((c) => c.url.includes("/user_actions.json"))).toBe(false);
  expect(result.errors.filter((e) => e.error.includes("robots.txt"))).toHaveLength(3);
});

test("ingest: an unreadable robots.txt means no forum requests at all", async () => {
  const server = fakeServer({ robots: new Response("down", { status: 503 }) });
  const result = await run(server);
  expect(server.calls.some((c) => c.url.includes("/user_actions.json"))).toBe(false);
  expect(result.errors[0]).toEqual({ source: "forum", error: "robots.txt: HTTP 503" });
});

test("ingest: an answer that is not JSON of the right shape is reported and the rest still update", async () => {
  const server = fakeServer({ forum: () => new Response(JSON.stringify({ oops: true }), { status: 200 }) });
  const result = await run(server);
  expect(result.errors.map((e) => e.source)).toEqual(["forum:Zorbrix-83447", "forum:Linxy", "forum:Rommax-244181"]);
  expect(result.store.posts.some((p) => p.source === "bluesky")).toBe(true);
});

test("the store survives a write and a read, and a missing file is an empty store", () => {
  const dir = mkdtempSync(join(tmpdir(), "blue-"));
  const path = join(dir, "nested", "blue-posts.json");
  expect(loadStore(join(dir, "none.json"))).toEqual(emptyStore());
  const store = mergePosts(emptyStore(), parseBlueskyFeed(feed(), now)).store;
  saveStore(path, store);
  expect(loadStore(path)).toEqual(store);
});
