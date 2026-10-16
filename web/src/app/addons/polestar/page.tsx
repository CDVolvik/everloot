import type { Metadata } from "next";
import Link from "next/link";
import { POLESTAR } from "@/data/polestar";
import { polestarLive } from "@/lib/polestar-github";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Polestar: leveling guides for WoW: Forever",
  description: "What Polestar is, how to install it, its commands and licence, where it needs help, and its guide packs.",
  alternates: { canonical: "/addons/polestar" },
};

const link = "text-gold-400 hover:underline underline-offset-4";
const button = "inline-flex items-center min-h-11 px-4 rounded-lg border border-gold-400/50 text-gold-400 hover:bg-gold-400/10";

export default async function PolestarPage() {
  const live = await polestarLive();
  const plus = live?.capped ? "+" : "";
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">Addons · independent</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Polestar</h1>
        <p className="text-parchment-100/80 max-w-2xl">
          Polestar is a leveling-guide addon for WoW: Forever. A guide window tells you the next step, an arrow points
          the way, and goals tick themselves off as you play. Its 1 to 60 routes come from a simulator that tries
          millions of quest orders for each starting race, and the guides are then written by hand from the best one.
        </p>
        <p className="text-parchment-100/80 max-w-2xl">
          It is free and open source, made by its own authors. Anyone can add guides of their own as a guide pack.
        </p>
      </header>

      <section className="space-y-3" aria-labelledby="install">
        <h2 id="install" className="font-display text-xl text-parchment-100">Install</h2>
        <div className="flex flex-wrap gap-3">
          <a className={button} href={POLESTAR.curseforge}>CurseForge</a>
          <a className={button} href={POLESTAR.releases}>GitHub releases</a>
          <a className={button} href={POLESTAR.discord}>Discord</a>
        </div>
        {live ? (
          <p className="text-sm text-parchment-100/70">
            Latest release <a className={link} href={live.release.url}>{live.release.tag}</a>, published {live.release.date}.
          </p>
        ) : (
          <p className="text-sm text-parchment-100/60">
            Live details from GitHub are unavailable right now. The <a className={link} href={POLESTAR.releases}>releases page</a> has
            the newest version.
          </p>
        )}
        <p className="text-sm text-parchment-100/70">
          From a download, unzip the Polestar folders straight into the game&apos;s AddOns folder and restart the game
          completely; a /reload does not load new addons.
        </p>
      </section>

      <section className="space-y-3" aria-labelledby="commands">
        <h2 id="commands" className="font-display text-xl text-parchment-100">Commands</h2>
        <table className="w-full text-sm">
          <tbody>
            {POLESTAR.commands.map(([command, text]) => (
              <tr key={command} className="border-b border-parchment-100/10 align-top">
                <th scope="row" className="py-2 pr-4 text-left font-mono font-normal text-gold-300 whitespace-nowrap">{command}</th>
                <td className="py-2 text-parchment-100/75">{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-3" aria-labelledby="packs">
        <h2 id="packs" className="font-display text-xl text-parchment-100">Guide packs</h2>
        <p className="text-parchment-100/80">
          A guide pack is someone else&apos;s guides for Polestar, published as its own addon. Polestar does not host or
          recommend packs, so Everloot keeps an independent list.
        </p>
        <ul className="space-y-1">
          <li><Link className={link} href="/addons/polestar/packs">Guide packs you can install</Link></li>
          <li><Link className={link} href="/addons/polestar/wanted">Routes and guides worth building</Link></li>
          <li><a className={link} href={POLESTAR.handbook}>Polestar&apos;s handbook for writing a pack</a></li>
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="help">
        <h2 id="help" className="font-display text-xl text-parchment-100">Help Polestar</h2>
        {live ? (
          <>
            {live.helpWanted.length > 0 && (
              <ul className="list-disc pl-6 space-y-1 text-parchment-100/80">
                {live.helpWanted.map((issue) => (
                  <li key={issue.number}><a className={link} href={issue.url}>#{issue.number} {issue.title}</a></li>
                ))}
              </ul>
            )}
            <p className="text-sm text-parchment-100/70">
              {live.guideReports}{plus} open guide reports from players and {live.openIssues}{plus} open issues in
              all, <a className={link} href={POLESTAR.issues}>on GitHub</a>. Reports are welcome on the Discord too.
            </p>
          </>
        ) : (
          <p className="text-sm text-parchment-100/60">
            Live details from GitHub are unavailable right now. Open requests are on <a className={link} href={POLESTAR.issues}>GitHub</a>.
          </p>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="licence">
        <h2 id="licence" className="font-display text-xl text-parchment-100">Licence</h2>
        <p className="text-parchment-100/80">
          Polestar is GPL-3.0 (<a className={link} href={POLESTAR.license}>LICENSE</a>). An added permission
          (<a className={link} href={POLESTAR.licenseException}>LICENSE-EXCEPTION.md</a>) lets authors publish packs built
          with its tools under terms of their choice. It does not cover Polestar&apos;s code or text copied from its own
          guides.
        </p>
      </section>

      <footer className="border-t border-parchment-100/10 pt-4 text-sm text-parchment-100/60 space-y-2">
        <p>
          Not affiliated with or endorsed by Polestar&apos;s authors. Everloot&apos;s maintainer contributes to Polestar:{" "}
          <a className={link} href={POLESTAR.maintainerPrs}>their pull requests</a>.
        </p>
        <p>Facts checked against Polestar&apos;s repository on {POLESTAR.checked}.</p>
      </footer>
    </article>
  );
}
