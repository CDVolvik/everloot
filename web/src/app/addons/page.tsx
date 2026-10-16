import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Addons for WoW: Forever",
  description: "Everloot's own collection addon and Polestar, the leveling-guide addon, with its guide packs and pack ideas.",
  alternates: { canonical: "/addons" },
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
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Addons</h1>
        <p className="text-parchment-100/80 max-w-2xl">
          Addons we build or that work well with Everloot. Polestar is made by its own authors; Everloot lists it
          and is not part of it.
        </p>
      </header>
      <ul className="grid sm:grid-cols-2 gap-4">
        {CARDS.map((card) => (
          <li key={card.href} className="rounded-xl border border-parchment-100/15 bg-parchment-900/40 p-5 space-y-2">
            <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">{card.by}</p>
            <h2 className="font-display text-xl font-semibold text-parchment-100">{card.title}</h2>
            <p className="text-sm text-parchment-100/75">{card.text}</p>
            <Link href={card.href} className="inline-flex items-center min-h-11 text-gold-400 hover:underline underline-offset-4">
              {card.link}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
