import type { BlueGame, BluePost } from "./blue-posts.js";

/**
 * "What changed in the game": official blue posts and game builds in one list, newest first.
 * Pure functions only; the site, the RSS feed and the MCP tool all read through here.
 */

export type ChangeType = "post" | "hotfix" | "build";
export type ChangeFilter = "all" | "posts" | "hotfixes" | "builds";
export const CHANGE_FILTERS: readonly ChangeFilter[] = ["all", "posts", "hotfixes", "builds"];

/** What the timeline needs from a registry entry (kb/src/builds.ts). `diffUrl` is the slot for the auto-diff pipeline. */
export interface BuildLike {
  key: string;
  product: string;
  buildId: number;
  version: string;
  firstSeen: string;
  diffUrl?: string | null;
}

export interface ChangeEntry {
  id: string;
  type: ChangeType;
  game: BlueGame;
  /** Posts: when Blizzard posted. Builds: when Everloot first saw the build, not when Blizzard shipped it. */
  at: string;
  title: string;
  /** The original post, or the version service's build for builds (null: there is no page for it). */
  url: string | null;
  author?: string;
  role?: string;
  category?: string;
  source?: string;
  excerpt?: string;
  /** A maintainer's own one-line summary, when written. */
  summary?: string;
  version?: string;
  /** Link to the build's diff once the auto-diff pipeline publishes it; null until then. */
  diffUrl?: string | null;
}

/** Which game each version-service product is. Anything not listed is not shown. */
const PRODUCT_GAME: Record<string, BlueGame> = {
  wow_classic_beta: "forever",
  wow_classic_era: "classic",
  wow_classic: "classic",
};

export const GAME_LABEL: Record<BlueGame, string> = { forever: "WoW: Forever", classic: "WoW Classic" };

export function buildTimeline(posts: BluePost[], builds: BuildLike[]): ChangeEntry[] {
  const fromPosts: ChangeEntry[] = posts.map((p) => ({
    id: p.id, type: p.kind, game: p.game, at: p.postedAt, title: p.title, url: p.url,
    author: p.author, role: p.role, category: p.category, source: p.source, excerpt: p.excerpt,
    ...(p.summary ? { summary: p.summary } : {}),
  }));
  const fromBuilds: ChangeEntry[] = builds.flatMap((b) => {
    const game = PRODUCT_GAME[b.product];
    if (!game) return [];
    return [{
      id: `build:${b.key}`, type: "build" as const, game, at: b.firstSeen,
      title: `${GAME_LABEL[game]} build ${b.version}`, url: null, version: b.version, diffUrl: b.diffUrl ?? null,
    }];
  });
  return [...fromPosts, ...fromBuilds].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

const FILTER_TYPES: Record<Exclude<ChangeFilter, "all">, ChangeType[]> = {
  // Hotfixes are blue posts too, but they have their own filter, so "posts" shows the rest.
  posts: ["post"],
  hotfixes: ["hotfix"],
  builds: ["build"],
};

export function filterTimeline(entries: ChangeEntry[], filter: ChangeFilter, game?: BlueGame): ChangeEntry[] {
  return entries.filter((e) => (filter === "all" || FILTER_TYPES[filter].includes(e.type)) && (!game || e.game === game));
}

export function parseFilter(value: unknown): ChangeFilter {
  return CHANGE_FILTERS.includes(value as ChangeFilter) ? (value as ChangeFilter) : "all";
}

export const TYPE_LABEL: Record<ChangeType, string> = { post: "Blue post", hotfix: "Hotfix", build: "Build" };

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
// Characters XML 1.0 cannot carry would make the whole feed unreadable; drop them.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

/** One feed line for a person or a feed reader: what it is, and when. */
export function entryDescription(e: ChangeEntry): string {
  if (e.type === "build") {
    return `${GAME_LABEL[e.game]} build ${e.version} was first seen by Everloot on ${e.at.slice(0, 10)}. Blizzard's own release time is not recorded.`;
  }
  const by = [e.author, e.role].filter(Boolean).join(", ");
  const lead = e.summary ? `${e.summary} ` : "";
  return `${lead}${e.excerpt ? `"${e.excerpt}" ` : ""}From ${by || "Blizzard"} on ${e.category || e.source}. Read the original post for the full text.`.trim();
}

/** RSS 2.0 of the timeline. Every item links to the original post, or to the changes page for a build. */
export function renderFeed(entries: ChangeEntry[], site: { baseUrl: string; now: Date; limit?: number }): string {
  const base = site.baseUrl.replace(/\/$/, "");
  const items = entries.slice(0, site.limit ?? 50).map((e) => {
    const link = e.url ?? e.diffUrl ?? `${base}/changes?show=builds`;
    return [
      "    <item>",
      `      <title>${xml(clean(`${TYPE_LABEL[e.type]}: ${e.title}`))}</title>`,
      `      <link>${xml(link)}</link>`,
      `      <guid isPermaLink="false">${xml(e.id)}</guid>`,
      `      <pubDate>${new Date(e.at).toUTCString()}</pubDate>`,
      `      <category>${xml(TYPE_LABEL[e.type])}</category>`,
      `      <description>${xml(clean(entryDescription(e)))}</description>`,
      "    </item>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>Everloot: what changed in WoW: Forever</title>",
    `    <link>${xml(`${base}/changes`)}</link>`,
    `    <atom:link href="${xml(`${base}/changes/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    "    <description>Official Blizzard posts and new game builds for WoW: Forever, newest first. Each item links to Blizzard's original.</description>",
    "    <language>en-us</language>",
    `    <lastBuildDate>${(entries[0] ? new Date(entries[0].at) : site.now).toUTCString()}</lastBuildDate>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** Text answer for the `recent_changes` MCP tool. */
export function handleRecentChanges(
  entries: ChangeEntry[] | null,
  args: { filter?: ChangeFilter; game?: BlueGame; limit?: number },
): string {
  if (entries === null) return "The changes timeline is not connected here, so this is not a measured zero.";
  const shown = filterTimeline(entries, args.filter ?? "all", args.game).slice(0, args.limit ?? 10);
  if (shown.length === 0) return "No changes recorded for that filter yet.";
  const lines = shown.map((e) => {
    const head = `${e.at.slice(0, 16).replace("T", " ")} UTC  [${TYPE_LABEL[e.type]}, ${GAME_LABEL[e.game]}] ${e.title}`;
    const detail = e.type === "build"
      ? `First seen by Everloot, not Blizzard's release time.${e.diffUrl ? ` Diff: ${e.diffUrl}` : ""}`
      : `${[e.author, e.role].filter(Boolean).join(", ")}${e.excerpt ? `: "${e.excerpt}"` : ""}\nOriginal: ${e.url}`;
    return `${head}\n${detail}`;
  });
  return `${lines.join("\n\n")}\n\nBlue-post text is Blizzard's; these are excerpts, so open the link for the full post.`;
}
