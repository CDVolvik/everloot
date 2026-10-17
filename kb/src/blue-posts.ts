import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Official Blizzard posts about WoW: Forever (and Classic), for the "what changed" page.
 *
 * What it reads, and nothing else:
 *  - the Blizzard WoW forum's public Discourse JSON, one request per tracked staff account
 *    (`user_actions.json`), after checking robots.txt;
 *  - the official World of Warcraft account's public Bluesky feed.
 * What it keeps per post: source, link, title, author, role, times, category, game and an excerpt of
 * at most two sentences. Blizzard's post text is Blizzard's, so there is never a full copy here. The
 * research behind these choices is in the Everloot wiki note 2026-10-18-blue-tracker-sources.
 */

export type BlueSource = "forum" | "bluesky";
export type BlueGame = "forever" | "classic";

export interface BluePost {
  /** Stable across runs: `forum:<post id>` or `bluesky:<record key>`. */
  id: string;
  source: BlueSource;
  /** The original, which every page shows prominently. */
  url: string;
  title: string;
  author: string;
  /** The author's published forum title, such as "Community Manager"; empty when unknown. */
  role: string;
  postedAt: string;
  /** Not every source says; null means unknown, not never. */
  editedAt: string | null;
  category: string;
  game: BlueGame;
  kind: "post" | "hotfix";
  /** At most two sentences of the original; see excerptOf. */
  excerpt: string;
  /** One line a maintainer may write by hand. Never filled automatically, never overwritten by a fetch. */
  summary?: string;
  firstSeen: string;
}

export interface Validators { etag?: string; lastModified?: string }

export interface FetchState extends Validators {
  /** When we last asked this source, ISO. */
  at: string;
  /** Do not ask again before this time (a Retry-After we were given), ISO. */
  notBefore?: string;
}

export interface BlueStore {
  posts: BluePost[];
  fetched: Record<string, FetchState>;
}

export interface TrackedAccount { username: string; title: string }

/** Forum and feed constants. The category ids come from /en/wow/site.json (read 2026-10-17). */
export const FORUM_BASE = "https://us.forums.blizzard.com/en/wow";
export const BLUESKY_ACTOR = "worldofwarcraft.blizzard.com";
export const BLUESKY_FEED = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${BLUESKY_ACTOR}&filter=posts_no_replies&limit=30`;
export const USER_AGENT = "Everloot/1.0 (+https://everloot.app; hello@everloot.app)";

/** "WoW: Forever" 346 with its General Discussion 347 and Community Connections 348, and "Forever Beta Discussion" 349. */
const FOREVER_CATEGORIES = new Map<number, string>([
  [346, "WoW: Forever"],
  [347, "WoW: Forever General Discussion"],
  [348, "WoW: Forever Community Connections"],
  [349, "WoW: Forever Beta Discussion"],
]);
/** "WoW Classic" 197 and its sub-forums. */
const CLASSIC_CATEGORIES = new Map<number, string>([
  [197, "WoW Classic"], [172, "WoW Classic General Discussion"], [335, "The Burning Crusade Classic"],
  [254, "Mists of Pandaria Classic Discussion"], [199, "WoW Classic Bug Report"], [201, "WoW Classic New Guild Listings"],
  [200, "Classic Connections"], [302, "Season of Discovery"], [296, "WoW Classic Hardcore"],
]);

/** The game a post is about, or null when it is neither (retail threads are dropped). */
export function gameOf(categoryId: number | undefined, title: string): { game: BlueGame; category: string } | null {
  if (categoryId !== undefined && FOREVER_CATEGORIES.has(categoryId)) return { game: "forever", category: FOREVER_CATEGORIES.get(categoryId)! };
  if (/\bforever\b/i.test(title)) return { game: "forever", category: categoryId === undefined ? "" : `Category ${categoryId}` };
  if (categoryId !== undefined && CLASSIC_CATEGORIES.has(categoryId)) return { game: "classic", category: CLASSIC_CATEGORIES.get(categoryId)! };
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Plain text of an HTML-ish fragment: tags dropped, entities decoded, whitespace collapsed. */
export function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const MAX_EXCERPT_CHARS = 300;

/**
 * The first two sentences of a post, never more than 300 characters (cut at a word, with an ellipsis).
 * This is the only part of Blizzard's text we keep.
 */
export function excerptOf(raw: string): string {
  const text = plainText(raw);
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘'(\[])/);
  let out = sentences.slice(0, 2).join(" ");
  // A source that already cut with an ellipsis stays cut.
  if (out.length <= MAX_EXCERPT_CHARS) return out;
  out = out.slice(0, MAX_EXCERPT_CHARS - 1);
  const space = out.lastIndexOf(" ");
  return `${(space > 120 ? out.slice(0, space) : out).replace(/[\s.,;:!?-]+$/, "")}…`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Forum usernames carry a numeric suffix (`Rommax-244181`); the name shown to players does not. */
const displayName = (username: string, name: string) => name || username.replace(/-\d+$/, "");

/** Posts by tracked staff accounts from one `user_actions.json` answer. Anything about another game is dropped. */
export function parseForumActions(json: unknown, accounts: TrackedAccount[], now: Date): BluePost[] {
  if (!isRecord(json) || !Array.isArray(json.user_actions)) throw new Error("not a Discourse user_actions answer");
  const roster = new Map(accounts.map((a) => [a.username.toLowerCase(), a]));
  const posts: BluePost[] = [];
  for (const action of json.user_actions) {
    if (!isRecord(action) || action.deleted === true || action.hidden === true) continue;
    if (action.action_type !== 4 && action.action_type !== 5) continue;
    const username = str(action.acting_username) || str(action.username);
    const account = roster.get(username.toLowerCase());
    const title = plainText(str(action.title));
    const postId = action.post_id;
    const topicId = action.topic_id;
    const postNumber = action.post_number;
    const postedAt = str(action.created_at);
    if (!account || !title || !Number.isInteger(postId) || !Number.isInteger(topicId) || !Number.isInteger(postNumber) || !Number.isFinite(Date.parse(postedAt))) continue;
    const game = gameOf(typeof action.category_id === "number" ? action.category_id : undefined, title);
    if (!game) continue;
    const slug = /^[a-z0-9-]+$/i.test(str(action.slug)) ? str(action.slug) : "topic";
    posts.push({
      id: `forum:${postId}`,
      source: "forum",
      url: `${FORUM_BASE}/t/${slug}/${topicId}${postNumber === 1 ? "" : `/${postNumber}`}`,
      title,
      author: displayName(username, str(action.acting_name) || str(action.name)),
      role: account.title,
      postedAt: new Date(postedAt).toISOString(),
      editedAt: null,
      category: game.category,
      game: game.game,
      kind: /hotfix/i.test(title) ? "hotfix" : "post",
      excerpt: excerptOf(str(action.excerpt)),
      firstSeen: now.toISOString(),
    });
  }
  return posts;
}

/** The official WoW account's own posts that mention Forever or Classic. Reposts and replies are skipped. */
export function parseBlueskyFeed(json: unknown, now: Date): BluePost[] {
  if (!isRecord(json) || !Array.isArray(json.feed)) throw new Error("not a Bluesky author feed");
  const posts: BluePost[] = [];
  for (const item of json.feed) {
    if (!isRecord(item) || isRecord(item.reason) || !isRecord(item.post)) continue;
    const post = item.post;
    const record = post.record;
    const author = post.author;
    if (!isRecord(record) || !isRecord(author) || str(author.handle) !== BLUESKY_ACTOR || isRecord(record.reply)) continue;
    const key = str(post.uri).split("/").pop() ?? "";
    const text = str(record.text).trim();
    const postedAt = str(record.createdAt);
    if (!/^[a-z0-9]+$/i.test(key) || !text || !Number.isFinite(Date.parse(postedAt))) continue;
    const game = /\bforever\b/i.test(text) ? "forever" : /\bclassic\b/i.test(text) ? "classic" : null;
    if (!game) continue;
    const firstLine = plainText(text.split(/\n/).find((l) => l.trim()) ?? text);
    posts.push({
      id: `bluesky:${key}`,
      source: "bluesky",
      url: `https://bsky.app/profile/${BLUESKY_ACTOR}/post/${key}`,
      title: firstLine.length > 100 ? `${firstLine.slice(0, 99).replace(/\s+\S*$/, "")}…` : firstLine,
      author: str(author.displayName) || "World of Warcraft",
      role: "Official account",
      postedAt: new Date(postedAt).toISOString(),
      editedAt: null,
      category: "Bluesky",
      game,
      kind: /hotfix/i.test(text) ? "hotfix" : "post",
      excerpt: excerptOf(text),
      firstSeen: now.toISOString(),
    });
  }
  return posts;
}

/** Add new posts, refresh the ones already known. A maintainer's summary and the first-seen time are kept. */
export function mergePosts(store: BlueStore, incoming: BluePost[]): { store: BlueStore; added: BluePost[] } {
  const byId = new Map(store.posts.map((p) => [p.id, p]));
  const added: BluePost[] = [];
  for (const post of incoming) {
    const known = byId.get(post.id);
    if (!known) {
      byId.set(post.id, post);
      added.push(post);
    } else {
      byId.set(post.id, { ...post, firstSeen: known.firstSeen, ...(known.summary ? { summary: known.summary } : {}) });
    }
  }
  const posts = [...byId.values()].sort((a, b) => b.postedAt.localeCompare(a.postedAt) || a.id.localeCompare(b.id));
  return { store: { ...store, posts }, added };
}

// ---- robots.txt ----

interface RobotsRule { allow: boolean; pattern: RegExp; length: number }

function ruleFor(path: string, allow: boolean): RobotsRule | null {
  if (path === "") return null; // an empty Disallow allows everything; an empty Allow changes nothing
  const body = path.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return { allow, pattern: new RegExp(`^${body.endsWith("\\$") ? `${body.slice(0, -2)}$` : body}`), length: path.length };
}

/**
 * Whether robots.txt lets `agent` fetch `pathAndQuery`. The most specific group naming the agent wins,
 * otherwise `*`; within it the longest matching rule wins and Allow beats Disallow on a tie (RFC 9309).
 */
export function robotsAllows(robotsText: string, pathAndQuery: string, agent = "everloot"): boolean {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;
  for (const line of robotsText.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, "").trim();
    const colon = clean.indexOf(":");
    if (colon < 0) continue;
    const field = clean.slice(0, colon).trim().toLowerCase();
    const value = clean.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      const rule = ruleFor(value, field === "allow");
      if (rule) current.rules.push(rule);
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: RobotsRule | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!rule.pattern.test(pathAndQuery)) continue;
    if (!best || rule.length > best.length || (rule.length === best.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

// ---- storage ----

export const emptyStore = (): BlueStore => ({ posts: [], fetched: {} });

export function loadStore(path: string): BlueStore {
  if (!existsSync(path)) return emptyStore();
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.posts)) throw new Error(`${path} is not a blue post store`);
  return { posts: parsed.posts as BluePost[], fetched: isRecord(parsed.fetched) ? (parsed.fetched as Record<string, FetchState>) : {} };
}

/** Written beside the target and renamed into place, so a crash never leaves half a store. */
export function saveStore(path: string, store: BlueStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

export function loadAccounts(path: string): TrackedAccount[] {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.accounts)) throw new Error(`${path} has no accounts list`);
  return parsed.accounts.map((a: unknown) => {
    if (!isRecord(a) || !str(a.username) || !str(a.title)) throw new Error(`${path}: every account needs a username and a title`);
    return { username: str(a.username), title: str(a.title) };
  });
}

// ---- polite fetching ----

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

export interface IngestOptions {
  store: BlueStore;
  accounts: TrackedAccount[];
  fetcher: Fetcher;
  now: Date;
  /** A source asked less than this long ago is skipped. Default 25 minutes. */
  minIntervalMs?: number;
  /** Pause between two requests to the same host. Default 1.5 s. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface IngestResult {
  store: BlueStore;
  added: BluePost[];
  skipped: string[];
  errors: { source: string; error: string }[];
}

/** A server that says "slow down" or fails ends the run; the next scheduled run tries again. */
class Backoff extends Error {
  constructor(message: string, readonly notBefore?: string) { super(message); }
}

const forumPath = (username: string) => `/en/wow/user_actions.json?username=${encodeURIComponent(username)}&filter=4,5&offset=0`;

function retryAfter(res: Response, now: Date): string | undefined {
  const value = res.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  const at = Number.isFinite(seconds) ? now.getTime() + seconds * 1000 : Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : undefined;
}

/**
 * One scheduled pass. For each tracked forum account, and the official Bluesky feed: obey robots.txt, skip
 * a source asked too recently, send the validators the server last gave us, treat 304 as "nothing new" and
 * stop at the first 429 or server error. A source that fails is reported and left as it was.
 */
export async function ingestBluePosts(opts: IngestOptions): Promise<IngestResult> {
  const minInterval = opts.minIntervalMs ?? 25 * 60_000;
  const delay = opts.delayMs ?? 1500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let store = opts.store;
  const added: BluePost[] = [];
  const skipped: string[] = [];
  const errors: { source: string; error: string }[] = [];
  let backedOff = false;
  let lastForumRequest = false;

  const fetchJson = async (key: string, url: string): Promise<unknown | null> => {
    const state = store.fetched[key];
    if (state?.notBefore && Date.parse(state.notBefore) > opts.now.getTime()) { skipped.push(`${key}: asked to wait until ${state.notBefore}`); return null; }
    if (state && opts.now.getTime() - Date.parse(state.at) < minInterval) { skipped.push(`${key}: asked less than ${Math.round(minInterval / 60000)} minutes ago`); return null; }
    const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "application/json" };
    if (state?.etag) headers["If-None-Match"] = state.etag;
    if (state?.lastModified) headers["If-Modified-Since"] = state.lastModified;
    const res = await opts.fetcher(url, { headers });
    if (res.status === 429 || res.status >= 500) {
      const notBefore = retryAfter(res, opts.now);
      store = { ...store, fetched: { ...store.fetched, [key]: { ...(state ?? { at: opts.now.toISOString() }), ...(notBefore ? { notBefore } : {}) } } };
      throw new Backoff(`HTTP ${res.status}`, notBefore);
    }
    const next: FetchState = { at: opts.now.toISOString() };
    const etag = res.headers.get("etag");
    const lastModified = res.headers.get("last-modified");
    if (etag) next.etag = etag;
    if (lastModified) next.lastModified = lastModified;
    store = { ...store, fetched: { ...store.fetched, [key]: next } };
    if (res.status === 304) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };

  const take = (posts: BluePost[]) => {
    const merged = mergePosts(store, posts);
    store = merged.store;
    added.push(...merged.added);
  };

  // Forum: robots.txt first, then one request per account.
  let robots: string | null = null;
  try {
    const res = await opts.fetcher(`${FORUM_BASE.replace(/\/en\/wow$/, "")}/robots.txt`, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 404) robots = "";
    else if (res.ok) robots = await res.text();
    else throw new Error(`robots.txt: HTTP ${res.status}`);
  } catch (err) {
    errors.push({ source: "forum", error: err instanceof Error ? err.message : String(err) });
  }
  if (robots !== null) {
    for (const account of opts.accounts) {
      const key = `forum:${account.username}`;
      const path = forumPath(account.username);
      if (!robotsAllows(robots, path)) { errors.push({ source: key, error: "robots.txt disallows this path" }); continue; }
      if (backedOff) { skipped.push(`${key}: stopped after an earlier slow-down`); continue; }
      try {
        if (lastForumRequest) await sleep(delay);
        lastForumRequest = true;
        const json = await fetchJson(key, `https://us.forums.blizzard.com${path}`);
        if (json) take(parseForumActions(json, [account], opts.now));
      } catch (err) {
        errors.push({ source: key, error: err instanceof Error ? err.message : String(err) });
        if (err instanceof Backoff) backedOff = true;
      }
    }
  }

  // Bluesky: the public AppView API, one request.
  try {
    const json = await fetchJson("bluesky", BLUESKY_FEED);
    if (json) take(parseBlueskyFeed(json, opts.now));
  } catch (err) {
    errors.push({ source: "bluesky", error: err instanceof Error ? err.message : String(err) });
  }
  return { store, added, skipped, errors };
}
