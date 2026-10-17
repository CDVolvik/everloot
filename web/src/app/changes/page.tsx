import type { Metadata } from "next";
import Link from "next/link";
import {
  CHANGE_FILTERS, GAME_LABEL, TYPE_LABEL, filterTimeline, loadTimeline, parseFilter,
  type ChangeEntry, type ChangeFilter,
} from "@/lib/changes";
import { REPO_URL } from "@/lib/source";

export const metadata: Metadata = {
  title: "What changed in WoW: Forever",
  description:
    "Official Blizzard blue posts, hotfixes and new game builds for WoW: Forever, newest first. Each entry links to Blizzard's original.",
  alternates: { canonical: "/changes", types: { "application/rss+xml": "/changes/feed.xml" } },
};

const link = "text-accent hover:underline underline-offset-4";
const PAGE_SIZE = 60;

const FILTER_LABEL: Record<ChangeFilter, string> = { all: "Everything", posts: "Blue posts", hotfixes: "Hotfixes", builds: "Builds" };

const href = (show: ChangeFilter, both: boolean) => {
  const query = [show !== "all" ? `show=${show}` : "", both ? "game=all" : ""].filter(Boolean).join("&");
  return query ? `/changes?${query}` : "/changes";
};

/** UTC to the minute, whatever offset the time was written with. */
const stamp = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const ORIGIN_LABEL: Record<string, string> = { forum: "Blizzard's forum", bluesky: "Bluesky" };

function Entry({ entry }: { entry: ChangeEntry }) {
  return (
    <li className="rounded-xl border border-line bg-panel p-4 sm:p-5 space-y-2">
      <p className="font-mono text-xs text-muted">
        {TYPE_LABEL[entry.type]} · {GAME_LABEL[entry.game]} · <time dateTime={entry.at}>{stamp(entry.at)}</time>
      </p>
      <h2 className="text-lg font-semibold text-fg leading-snug">{entry.title}</h2>
      {entry.type === "build" ? (
        <>
          <p className="text-sm text-fg-2">
            First seen by Everloot on this date. Blizzard&apos;s own release time is not recorded.
          </p>
          <p className="text-sm">
            {entry.diffUrl ? (
              <a href={entry.diffUrl} className={`inline-flex items-center min-h-11 ${link}`}>See what changed in this build</a>
            ) : (
              <span className="text-muted">What changed in this build: not published yet.</span>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-fg-2">
            {[entry.author, entry.role].filter(Boolean).join(", ")} · {entry.category}
          </p>
          {entry.summary && <p className="text-fg"><span className="font-mono text-xs text-muted">Everloot summary </span>{entry.summary}</p>}
          {entry.excerpt && <p className="text-fg-2 border-l-2 border-line pl-3">{entry.excerpt}</p>}
          <p>
            {entry.url ? (
              <a href={entry.url} rel="noopener" className={`inline-flex items-center min-h-11 font-medium ${link}`}>
                Read the original on {ORIGIN_LABEL[entry.source ?? ""] ?? "Blizzard"}<span className="sr-only">: {entry.title}</span>
              </a>
            ) : (
              <span className="text-sm text-muted">The link to the original is unavailable.</span>
            )}
          </p>
        </>
      )}
    </li>
  );
}

export default async function ChangesPage({ searchParams }: { searchParams: Promise<{ show?: string; game?: string }> }) {
  const params = await searchParams;
  const show = parseFilter(params.show);
  const both = params.game === "all";
  const all = loadTimeline();
  const entries = filterTimeline(all, show, both ? undefined : "forever");
  const shown = entries.slice(0, PAGE_SIZE);
  // The newest thing we hold, not the time of the last check: a stalled schedule has to look stale.
  const newest = all[0]?.at;
  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} · {newest ? `Newest entry ${stamp(newest)}` : "Nothing recorded yet"}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">What changed in the game</h1>
        <p className="text-fg-2 max-w-2xl">
          Official posts from Blizzard staff and new game builds, newest first. Everloot shows the title, who posted it,
          when, and the first couple of sentences, with a link to the original. The full text is Blizzard&apos;s, so it
          stays on their site.
        </p>
        <p className="text-sm text-fg-2 max-w-2xl">
          A build&apos;s date is when Everloot first saw it, not when Blizzard shipped it. Sources are checked every
          30 minutes and the site updates after each check that finds something new.
        </p>
      </header>

      <nav aria-label="Filter changes" className="space-y-3">
        <ul className="flex flex-wrap gap-2">
          {CHANGE_FILTERS.map((f) => (
            <li key={f}>
              <Link href={href(f, both)} aria-current={f === show ? "page" : undefined} className={`btn min-h-11 text-sm ${f === show ? "btn-primary" : ""}`}>
                {FILTER_LABEL[f]}
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-fg-2">
          Showing {both ? "WoW: Forever and WoW Classic" : "WoW: Forever"}.{" "}
          <Link href={href(show, !both)} className={link}>{both ? "Show only WoW: Forever" : "Include WoW Classic"}</Link>
          {" · "}
          <a href="/changes/feed.xml" className={link}>RSS feed</a>
        </p>
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-6 space-y-2">
          <p className="text-fg">Nothing recorded for this filter yet.</p>
          <p className="text-sm text-muted">New entries appear after the next check.</p>
        </div>
      ) : (
        <ol className="space-y-4">
          {shown.map((entry) => <Entry key={entry.id} entry={entry} />)}
        </ol>
      )}
      {entries.length > shown.length && (
        <p className="text-sm text-muted">The {shown.length} newest are shown. The RSS feed carries the newest 50.</p>
      )}

      <footer className="border-t border-line pt-4 text-sm text-muted space-y-2">
        <p>
          Blue posts are read from Blizzard&apos;s public WoW forum and the official World of Warcraft account on Bluesky,
          politely and within their robots rules. How Everloot collects and publishes data is in the{" "}
          <a href={`${REPO_URL}/blob/main/docs/DATA_POLICY.md`} rel="noopener" className={link}>data policy</a>.
        </p>
      </footer>
    </article>
  );
}
