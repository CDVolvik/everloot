import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sanitizePost } from "./changes.js";
import { clampExcerpt, clampText, isoTime, plainText } from "./text-safety.js";

export { clampExcerpt as excerptOf, plainText } from "./text-safety.js";

/**
 * Official Blizzard posts about WoW: Forever (and Classic), for the "what changed" page.
 *
 * What it reads, and nothing else:
 *  - the Blizzard WoW forum's public Discourse JSON, one request per tracked staff account and page
 *    (`user_actions.json`), after checking robots.txt;
 *  - the official World of Warcraft account's public Bluesky feed.
 * What it keeps per post: source, link, title, author, role, times, category, game and an excerpt of
 * at most two sentences. Blizzard's post text is Blizzard's, so there is never a full copy here. The
 * research behind these choices is in the Everloot wiki note 2026-10-18-blue-tracker-sources.
 *
 * Caps: at most MAX_PAGES pages (30 items each) per source per run, and a run stops paging as soon as a
 * page reaches items it has already seen. A normal run is one page per source.
 */

export type BlueSource = "forum" | "bluesky";
export type BlueGame = "forever" | "classic";

export interface BluePost {
  /** Stable across runs: `forum:<post id>` or `bluesky:<record key>`. */
  id: string;
  source: BlueSource;
  /** The original, which every page shows prominently. Null only if a stored link was not a web link. */
  url: string | null;
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
  /** At most two sentences of the original; see clampExcerpt. */
  excerpt: string;
  /** One line a maintainer may write by hand. Never filled automatically, never overwritten by a fetch. */
  summary?: string;
  firstSeen: string;
}

export interface Validators { etag?: string; lastModified?: string }

/** What the next run needs to stay polite. Kept in the Actions cache or on the maintainer's machine, not in git. */
export interface FetchState extends Validators {
  /** When this source was last read in full, ISO. */
  at: string;
  /** Do not ask again before this time (a Retry-After we were given), ISO. */
  notBefore?: string;
  /** Time of the newest item the source showed at the last read; paging stops once it reaches this. */
  newestSeen?: string;
}

export interface BlueStore {
  posts: BluePost[];
  fetched: Record<string, FetchState>;
}

export interface TrackedAccount { username: string; title: string }

/** Forum and feed constants. The category ids come from /en/wow/site.json (read 2026-10-17). */
export const FORUM_HOST = "https://us.forums.blizzard.com";
export const FORUM_BASE = `${FORUM_HOST}/en/wow`;
export const BLUESKY_ACTOR = "worldofwarcraft.blizzard.com";
export const BLUESKY_FEED = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${BLUESKY_ACTOR}&filter=posts_no_replies&limit=30`;
export const USER_AGENT = "Everloot/1.0 (+https://everloot.app; hello@everloot.app)";
export const MAX_PAGES = 3;
const PAGE_SIZE = 30;

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

/** The game a forum post is about, by category alone, or null (retail threads and any other category are dropped). */
export function gameOf(categoryId: number | undefined): { game: BlueGame; category: string } | null {
  if (categoryId === undefined) return null;
  if (FOREVER_CATEGORIES.has(categoryId)) return { game: "forever", category: FOREVER_CATEGORIES.get(categoryId)! };
  if (CLASSIC_CATEGORIES.has(categoryId)) return { game: "classic", category: CLASSIC_CATEGORIES.get(categoryId)! };
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Forum usernames carry a numeric suffix (`Rommax-244181`); the name shown to players does not. */
const displayName = (username: string, name: string) => name || username.replace(/-\d+$/, "");

export interface PageInfo { count: number; oldest: string | null; newest: string | null; next: string | null }

/** Size and time span of one `user_actions.json` answer, kept or not, so paging knows when to stop. */
export function forumPageInfo(json: unknown): PageInfo {
  if (!isRecord(json) || !Array.isArray(json.user_actions)) throw new Error("not a Discourse user_actions answer");
  const times = json.user_actions.map((a) => isoTime(isRecord(a) ? a.created_at : null)).filter((t): t is string => t !== null).sort();
  return { count: json.user_actions.length, oldest: times[0] ?? null, newest: times.at(-1) ?? null, next: null };
}

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
    const title = clampText(action.title, 200);
    const postId = action.post_id;
    const topicId = action.topic_id;
    const postNumber = action.post_number;
    const postedAt = isoTime(action.created_at);
    if (!account || !title || !Number.isInteger(postId) || !Number.isInteger(topicId) || !Number.isInteger(postNumber) || !postedAt) continue;
    const game = gameOf(typeof action.category_id === "number" ? action.category_id : undefined);
    if (!game) continue;
    const slug = /^[a-z0-9-]+$/i.test(str(action.slug)) ? str(action.slug) : "topic";
    posts.push({
      id: `forum:${postId}`,
      source: "forum",
      url: `${FORUM_BASE}/t/${slug}/${topicId}${postNumber === 1 ? "" : `/${postNumber}`}`,
      title,
      author: displayName(username, str(action.acting_name) || str(action.name)),
      role: account.title,
      postedAt,
      editedAt: null,
      category: game.category,
      game: game.game,
      kind: /hotfix/i.test(title) ? "hotfix" : "post",
      excerpt: clampExcerpt(action.excerpt),
      firstSeen: now.toISOString(),
    });
  }
  return posts;
}

/** A Forever-specific signal: the game's name, its beta, its hashtag, or a link to its pages. Bare "forever" is not one. */
const FOREVER_SIGNAL = /\b(?:wow|world of warcraft)\s*:?\s*forever\b|\bforever beta\b|#wowforever\b|worldofwarcraft\.blizzard\.com\/[a-z-]+\/forever|forums\.blizzard\.com\/[a-z]+\/wow\/c\/wow-forever/i;
const CLASSIC_SIGNAL = /\b(?:wow|world of warcraft)\s+classic\b|\b(?:burning crusade|mists of pandaria|wrath of the lich king|cataclysm) classic\b|\bclassic (?:era|anniversary)\b|\bseason of discovery\b/i;

/** Every link a Bluesky record carries: facets and an external-link embed. */
function recordLinks(record: Record<string, unknown>): string[] {
  const links: string[] = [];
  if (Array.isArray(record.facets)) {
    for (const facet of record.facets) {
      if (!isRecord(facet) || !Array.isArray(facet.features)) continue;
      for (const feature of facet.features) if (isRecord(feature) && typeof feature.uri === "string") links.push(feature.uri);
    }
  }
  const embed = record.embed;
  if (isRecord(embed) && isRecord(embed.external) && typeof embed.external.uri === "string") links.push(embed.external.uri);
  return links;
}

/** Newest and oldest time of a Bluesky page, ignoring a pinned post (it sits first whatever its age). */
export function blueskyPageInfo(json: unknown): PageInfo {
  if (!isRecord(json) || !Array.isArray(json.feed)) throw new Error("not a Bluesky author feed");
  const times = json.feed
    .filter((i) => isRecord(i) && !(isRecord(i.reason) && /reasonPin/.test(str(i.reason.$type))))
    .map((i) => (isRecord(i) && isRecord(i.post) && isRecord(i.post.record) ? isoTime(i.post.record.createdAt) : null))
    .filter((t): t is string => t !== null)
    .sort();
  return { count: json.feed.length, oldest: times[0] ?? null, newest: times.at(-1) ?? null, next: typeof json.cursor === "string" && json.cursor ? json.cursor : null };
}

/**
 * The official WoW account's own posts about Forever or Classic. Replies and reposts are skipped; a pinned
 * post is kept when it matches. The title is the first line and the excerpt is what follows it, never the same words twice.
 */
export function parseBlueskyFeed(json: unknown, now: Date): BluePost[] {
  if (!isRecord(json) || !Array.isArray(json.feed)) throw new Error("not a Bluesky author feed");
  const posts: BluePost[] = [];
  for (const item of json.feed) {
    if (!isRecord(item) || !isRecord(item.post)) continue;
    if (isRecord(item.reason) && /reasonRepost/.test(str(item.reason.$type))) continue;
    const post = item.post;
    const record = post.record;
    const author = post.author;
    if (!isRecord(record) || !isRecord(author) || str(author.handle) !== BLUESKY_ACTOR || isRecord(record.reply)) continue;
    const key = str(post.uri).split("/").pop() ?? "";
    const text = str(record.text).trim();
    const postedAt = isoTime(record.createdAt);
    if (!/^[a-z0-9]+$/i.test(key) || !text || !postedAt) continue;
    const haystack = `${text}\n${recordLinks(record).join("\n")}`;
    const game = FOREVER_SIGNAL.test(haystack) ? "forever" : CLASSIC_SIGNAL.test(haystack) ? "classic" : null;
    if (!game) continue;
    const firstLine = plainText(text.split(/\n/).find((l) => l.trim()) ?? text);
    const title = firstLine.length > 100 ? `${firstLine.slice(0, 99).replace(/\s+\S*$/, "")}…` : firstLine;
    const whole = plainText(text);
    const core = title.replace(/…$/, "");
    const rest = (whole.startsWith(core) ? whole.slice(core.length) : whole).replace(/^[\s.:;,\-–—]+/, "");
    posts.push({
      id: `bluesky:${key}`,
      source: "bluesky",
      url: `https://bsky.app/profile/${BLUESKY_ACTOR}/post/${key}`,
      title,
      author: clampText(author.displayName, 100) || "World of Warcraft",
      role: "Official account",
      postedAt,
      editedAt: null,
      category: "Bluesky",
      game,
      kind: /hotfix/i.test(text) ? "hotfix" : "post",
      excerpt: clampExcerpt(rest),
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
 * An empty `User-agent:` names nobody.
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
      if (value) current.agents.push(value.toLowerCase());
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

/** The committed posts file. Every post is re-clamped on the way in, so a hand-edited file cannot widen a limit. */
export function loadStore(path: string): BlueStore {
  if (!existsSync(path)) return emptyStore();
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.posts)) throw new Error(`${path} is not a blue post store`);
  const posts = (parsed.posts as unknown[]).map(sanitizePost).filter((p): p is BluePost => p !== null);
  return { posts, fetched: {} };
}

/** Written beside the target and renamed into place, so a crash never leaves half a store. Posts only: fetch state stays out of git. */
export function saveStore(path: string, store: BlueStore): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify({ posts: store.posts }, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

/** The politeness state (last asked, validators, Retry-After) of the previous run; empty if there was none. */
export function loadFetchState(path: string): Record<string, FetchState> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(parsed) && isRecord(parsed.fetched) ? (parsed.fetched as Record<string, FetchState>) : {};
  } catch {
    return {};
  }
}

export function saveFetchState(path: string, fetched: Record<string, FetchState>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify({ fetched }, null, 2)}\n`);
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

const forumPath = (username: string, offset: number) => `/en/wow/user_actions.json?username=${encodeURIComponent(username)}&filter=4,5&offset=${offset}`;

function retryAfter(res: Response, now: Date): string | undefined {
  const value = res.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  const at = Number.isFinite(seconds) ? now.getTime() + seconds * 1000 : Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : undefined;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * One scheduled pass. For each tracked forum account, and the official Bluesky feed: obey robots.txt, skip
 * a source asked too recently or told to wait, send the validators the server last gave us, treat 304 as
 * "nothing new", never follow a redirect, and stop at the first 429 or server error. A source is read up to
 * MAX_PAGES pages, stopping when a page reaches what the last read already showed. A source that fails is
 * reported and left exactly as it was: its validators, last-asked time and newest-seen time only move after
 * every page of the read parsed.
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
  const lastRequest = new Map<string, number>();

  const setState = (key: string, state: FetchState) => { store = { ...store, fetched: { ...store.fetched, [key]: state } }; };

  /** One GET, with the politeness rules that apply to every request. */
  const get = async (host: string, key: string, url: string, headers: Record<string, string>): Promise<Response> => {
    if (lastRequest.has(host)) await sleep(delay);
    lastRequest.set(host, 1);
    const res = await opts.fetcher(url, { headers: { "User-Agent": USER_AGENT, ...headers } });
    if (res.status === 429 || res.status >= 500) {
      const notBefore = retryAfter(res, opts.now);
      const previous = store.fetched[key];
      setState(key, { ...(previous ?? { at: opts.now.toISOString() }), ...(notBefore ? { notBefore } : {}) });
      throw new Backoff(`HTTP ${res.status}`, notBefore);
    }
    // A redirect could lead somewhere robots.txt was never read for, so it is reported, not followed.
    if (res.status >= 300 && res.status < 400 && res.status !== 304) throw new Error(`HTTP ${res.status} redirect not followed`);
    return res;
  };

  /**
   * Read one source, page by page. `urlFor(page, cursor)` builds each request, `info` measures a page and
   * `parse` turns it into posts. Nothing is merged or remembered unless every page succeeded.
   */
  const readSource = async (
    key: string, host: string, urlFor: (page: number, cursor: string | null) => string,
    info: (json: unknown) => PageInfo, parse: (json: unknown) => BluePost[],
  ): Promise<void> => {
    const state = store.fetched[key];
    if (state?.notBefore && Date.parse(state.notBefore) > opts.now.getTime()) { skipped.push(`${key}: asked to wait until ${state.notBefore}`); return; }
    if (state && opts.now.getTime() - Date.parse(state.at) < minInterval) { skipped.push(`${key}: asked less than ${Math.round(minInterval / 60000)} minutes ago`); return; }
    const found: BluePost[] = [];
    let validators: Validators = {};
    let newest: string | null = null;
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (page === 0 && state?.etag) headers["If-None-Match"] = state.etag;
      if (page === 0 && state?.lastModified) headers["If-Modified-Since"] = state.lastModified;
      const res = await get(host, key, urlFor(page, cursor), headers);
      if (res.status === 304) {
        // Nothing new. A 304 that omits a validator does not erase the one we hold.
        const next: FetchState = { ...state, at: opts.now.toISOString() };
        const etag = res.headers.get("etag");
        const lastModified = res.headers.get("last-modified");
        if (etag) next.etag = etag;
        if (lastModified) next.lastModified = lastModified;
        delete next.notBefore;
        setState(key, next);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const measured = info(json);
      found.push(...parse(json));
      if (page === 0) {
        validators = { ...(res.headers.get("etag") ? { etag: res.headers.get("etag")! } : {}), ...(res.headers.get("last-modified") ? { lastModified: res.headers.get("last-modified")! } : {}) };
        newest = measured.newest;
      }
      cursor = measured.next;
      const reachedKnown = state?.newestSeen !== undefined && measured.oldest !== null && measured.oldest <= state.newestSeen;
      if (reachedKnown || measured.count < PAGE_SIZE || (key === "bluesky" && !cursor)) break;
    }
    const merged = mergePosts(store, found);
    store = merged.store;
    added.push(...merged.added);
    const newestSeen = [newest, state?.newestSeen].filter((t): t is string => !!t).sort().at(-1);
    setState(key, { at: opts.now.toISOString(), ...validators, ...(newestSeen ? { newestSeen } : {}) });
  };

  // Forum: robots.txt first, then each account.
  let robots: string | null = null;
  try {
    const res = await opts.fetcher(`${FORUM_HOST}/robots.txt`, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 404) robots = "";
    else if (res.ok) robots = await res.text();
    else throw new Error(`robots.txt: HTTP ${res.status}`);
  } catch (err) {
    errors.push({ source: "forum", error: message(err) });
  }
  if (robots !== null) {
    for (const account of opts.accounts) {
      const key = `forum:${account.username}`;
      if (!robotsAllows(robots, forumPath(account.username, 0))) { errors.push({ source: key, error: "robots.txt disallows this path" }); continue; }
      if (backedOff) { skipped.push(`${key}: stopped after an earlier slow-down`); continue; }
      try {
        await readSource(
          key, "forum",
          (page) => `${FORUM_HOST}${forumPath(account.username, page * PAGE_SIZE)}`,
          forumPageInfo, (json) => parseForumActions(json, [account], opts.now),
        );
      } catch (err) {
        errors.push({ source: key, error: message(err) });
        if (err instanceof Backoff) backedOff = true;
      }
    }
  }

  // Bluesky: the public AppView API.
  try {
    await readSource(
      "bluesky", "bluesky",
      (_page, cursor) => (cursor ? `${BLUESKY_FEED}&cursor=${encodeURIComponent(cursor)}` : BLUESKY_FEED),
      blueskyPageInfo, (json) => parseBlueskyFeed(json, opts.now),
    );
  } catch (err) {
    errors.push({ source: "bluesky", error: message(err) });
  }
  return { store, added, skipped, errors };
}
