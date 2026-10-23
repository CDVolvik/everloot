import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { pageMetadata } from "@/lib/seo";
import { optOutPath, playerPagesOn, playerPath, searchPrefix } from "@/lib/player-pages";
import { playerStore } from "@/lib/player-store";
import { describePlayer, PLAYER_SEARCH_TAG, playerRobots } from "./player-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { searchParams: Promise<{ q?: string | string[] }> }): Promise<Metadata> {
  const params = await props.searchParams;
  return {
    ...pageMetadata({ title: "Find a player", description: "Look up a WoW: Forever character by the start of its name: the race, class, level and guild the Everloot addon last saw, and the day it saw them.", path: "/players" }),
    robots: playerRobots(Boolean(params.q)),
  };
}

/** One search per prefix is kept five minutes, so a repeated search never reaches the database again. */
const search = unstable_cache((prefix: string) => playerStore().search(prefix), ["player-search"], { revalidate: 300, tags: [PLAYER_SEARCH_TAG] });

const link = "text-accent hover:underline underline-offset-4";
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function PlayersPage(props: { searchParams: Promise<{ q?: string | string[] }> }) {
  if (!playerPagesOn()) notFound();
  const params = await props.searchParams;
  const q = (first(params.q) ?? "").trim().slice(0, 40);
  const prefix = q ? searchPrefix(q) : null;
  const results = prefix ? await search(prefix.toLowerCase()) : null;

  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · players</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Find a player</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          Characters the Everloot addon has seen, by the start of their name. Each page shows what the addon last saw:
          race, class, level, guild and the day. Not where they were, what they wear or what they did.
          To have a character removed, use the hide link on its page or the{" "}
          <Link href="/players/opt-out" className={link}>hide form</Link>.
        </p>
      </header>

      <form action="/players" method="get" role="search" className="flex flex-col sm:flex-row gap-2 max-w-xl">
        <label htmlFor="player-q" className="sr-only">Character name</label>
        <input id="player-q" name="q" type="search" defaultValue={q} maxLength={40} autoComplete="off"
          placeholder="Start of a name, 2 letters or more"
          className="flex-1 min-h-11 rounded-lg border border-edge bg-canvas px-3 text-fg placeholder:text-muted" />
        <button type="submit" className="btn btn-primary min-h-11">Search</button>
      </form>

      {q && !prefix && <p className="text-sm text-fg-2">Type 2 to 12 letters. Names have no digits or spaces.</p>}
      {results && results.length === 0 && <p className="text-sm text-fg-2">No character starts with &ldquo;{prefix}&rdquo;. The addon has not seen one, or it was hidden.</p>}
      {results && results.length > 0 && (
        <section aria-labelledby="player-results" className="space-y-3">
          <h2 id="player-results" className="text-xl text-fg">
            {results.length === 25 ? "The first 25 names" : `${results.length} ${results.length === 1 ? "name" : "names"}`} starting with &ldquo;{prefix}&rdquo;
          </h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
            {results.map((p) => (
              <li key={`${p.realm}/${p.name}`} className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
                <Link href={playerPath(p)} className={`${link} font-medium`}>{p.name}</Link>
                <span className="text-sm text-fg-2">{describePlayer(p)} · {p.realm}</span>
                <Link href={optOutPath(p)} className="text-xs text-muted hover:underline underline-offset-4">Hide</Link>
              </li>
            ))}
          </ul>
          {results.length === 25 && <p className="text-sm text-muted">Type more of the name to narrow it down.</p>}
        </section>
      )}
    </article>
  );
}
