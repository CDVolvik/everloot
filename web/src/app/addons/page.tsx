import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Addons", description: "Addons for WoW Forever: Everloot's collection addon, and Polestar, a leveling-guide addon with community guide packs. Licences and sources are listed.", path: "/addons" }),
};

const CARDS = [
  {
    href: "/upload",
    title: "Everloot",
    by: "Ours",
    text: "Records what you see in game (drops, vendors, trainers, auctions, gold) so this site can publish facts several players agree on.",
    link: "Download and upload",
  },
  {
    href: "/addons/polestar",
    title: "Polestar",
    by: "Independent, by its own authors",
    text: "Leveling guides from 1 to 60 with a waypoint arrow, built from simulated routes. Anyone can add guides as a guide pack.",
    link: "Polestar, its packs and pack ideas",
  },
];

export default function AddonsPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Addons</h1>
        <p className="text-fg-2 max-w-2xl">
          The addon we build, and Polestar, which we list. Polestar is made by its own authors; Everloot is not part
          of it.
        </p>
      </header>
      <ul className="grid sm:grid-cols-2 gap-4">
        {CARDS.map((card) => (
          <li key={card.href} className="rounded-xl border border-line bg-panel/40 p-5 space-y-2">
            <p className="font-mono text-xs text-muted">{card.by}</p>
            <h2 className="text-xl font-semibold text-fg">{card.title}</h2>
            <p className="text-sm text-fg-2">{card.text}</p>
            <Link href={card.href} className="inline-flex items-center min-h-11 text-accent hover:underline underline-offset-4">
              {card.link}
            </Link>
          </li>
        ))}
      </ul>
      <section className="space-y-2" aria-labelledby="popular">
        <h2 id="popular" className="text-xl font-semibold text-fg">What Forever players run</h2>
        <p className="text-sm text-fg-2 max-w-2xl">
          Players who turn on the addon list send it with their uploads. An addon is counted once three installs report
          it.
        </p>
        <Link href="/addons/popular" className="inline-flex items-center min-h-11 text-accent hover:underline underline-offset-4">
          Popular addons
        </Link>
      </section>
      <section className="space-y-2" aria-labelledby="ecosystem">
        <h2 id="ecosystem" className="text-xl font-semibold text-fg">Forever addons and projects</h2>
        <p className="text-sm text-fg-2 max-w-2xl">
          A community list of addons and tools made for Forever, ranked on boards for installs, activity, releases and
          upkeep, with a check of each addon&apos;s .toc.
        </p>
        <Link href="/addons/ecosystem" className="inline-flex items-center min-h-11 text-accent hover:underline underline-offset-4">
          The ecosystem tracker
        </Link>
      </section>
    </article>
  );
}
