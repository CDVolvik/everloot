import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { optOutPath, playerPagesOn, playerPath } from "@/lib/player-pages";
import { playerStore } from "@/lib/player-store";
import { describePlayer, playerRobots } from "../../../player-view";

/** One hour. An opt-out clears the page at once (api/players/opt-out), so this only bounds how stale a level can be. */
export const revalidate = 3600;

/** No page is built ahead of time; the first visit to a character renders it and caches it for `revalidate`. */
export function generateStaticParams() { return []; }

type Params = { ruleset: string; realm: string; name: string };

const lookup = (p: Params) => playerStore().get(decodeURIComponent(p.ruleset), decodeURIComponent(p.realm), decodeURIComponent(p.name));

export async function generateMetadata(props: { params: Promise<Params> }): Promise<Metadata> {
  if (!playerPagesOn()) return { title: "Page not found", robots: { index: false } };
  const player = await lookup(await props.params);
  if (!player) return { title: "Page not found", robots: { index: false } };
  return {
    ...pageMetadata({ title: `${player.name}, ${describePlayer(player)}`, description: `${player.name} on ${player.realm}: ${describePlayer(player)}, as last seen by the Everloot addon.`, path: playerPath(player) }),
    robots: playerRobots(),
  };
}

const link = "text-accent hover:underline underline-offset-4";

export default async function PlayerPage(props: { params: Promise<Params> }) {
  if (!playerPagesOn()) notFound();
  const player = await lookup(await props.params);
  if (!player) notFound();

  return (
    <article className="space-y-8 max-w-3xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          <Link href="/players" className="hover:underline underline-offset-4">Players</Link> · {player.realm}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{player.name}</h1>
        <p className="text-fg-2">{describePlayer(player)}</p>
      </header>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-panel p-4">
          <dt className="text-xs font-mono text-muted">Guild</dt>
          <dd className="mt-1 text-lg text-fg">{player.guild ?? "None seen"}</dd>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <dt className="text-xs font-mono text-muted">Last seen</dt>
          <dd className="mt-1 text-lg text-fg tabular-nums">{player.lastSeen}</dd>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <dt className="text-xs font-mono text-muted">Realm</dt>
          <dd className="mt-1 text-lg text-fg">{player.realm}</dd>
        </div>
      </dl>

      <section className="space-y-2 text-sm text-fg-2 max-w-2xl">
        <p>
          This is what a player running the Everloot addon last saw of this character, on the day above. It is not checked
          against the game, and it may be out of date: the level and guild are as of that day. The page holds no position,
          gear or history.
        </p>
        <p>
          Is this your character, and do you want it off Everloot?{" "}
          <Link href={optOutPath(player)} rel="nofollow" className={link}>Hide this character</Link>. No account is needed.
          How the data is handled: <Link href="/privacy#player-pages" className={link}>privacy policy</Link>.
        </p>
      </section>
    </article>
  );
}
