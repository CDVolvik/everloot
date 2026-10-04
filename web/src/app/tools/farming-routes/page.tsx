import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";

export const metadata: Metadata = {
  title: "Forever Farming Routes",
  description:
    "Gold and material farming routes for WoW: Forever, drawn from real player spawn sightings. Collecting now.",
  keywords: ["wow forever farming", "wow forever gold farm", "wow forever routes"],
  alternates: { canonical: "/tools/farming-routes" },
};

const CARDS = [
  {
    title: "Spawn maps, not guesses",
    body: "Every node and mob position on a route comes from target and mouseover sightings players upload — with independent-player counts, so farmed-out spots show their age honestly.",
  },
  {
    title: "Gold-per-hour attached",
    body: "Each route links into the Gold/Hour Calculator with its own loot table, so a route tells you what to farm and the math tells you what it's worth right now.",
  },
  {
    title: "Respawns included",
    body: "Repeated sightings build respawn timing per spawn point. Routes optimize the loop order around real respawns instead of a static circle drawn in 2006.",
  },
  {
    title: "Gatherers + hunters",
    body: "Herb and mining nodes ride the same system as mob drops. One route page can carry the ore loop, the mob loop between nodes, and the combined gold rate.",
  },
];

export default function FarmingRoutesPage() {
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          Collecting data
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">
          Forever Farming Routes
        </h1>
        <p className="text-lg text-parchment-100/75 max-w-2xl">
          Zone-by-zone gold and material routes for WoW: Forever. No static circles from
          decades-old guides — routes are drawn from spawn sightings the community
          collects, and each one opens when its zone has the data.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {CARDS.map((s) => (
          <div key={s.title} className="rounded-xl border border-parchment-100/10 p-5 bg-parchment-900">
            <h2 className="font-display text-lg font-semibold text-gold-400">{s.title}</h2>
            <p className="mt-1 text-sm text-parchment-100/80">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-arcane/30 bg-parchment-900 p-6">
        <h2 className="font-display text-xl text-parchment-100">Draw the first route</h2>
        <p className="mt-1 text-sm text-parchment-100/75 max-w-xl">
          Farm with the Everloot addon running — your sightings become the first spawn
          maps. Upload on the{" "}
          <Link href="/upload" className="text-gold-400 hover:underline underline-offset-4">upload page</Link>,
          or math out your current farm in the{" "}
          <Link href="/tools/gold-per-hour" className="text-gold-400 hover:underline underline-offset-4">Gold/Hour Calculator</Link>.
        </p>
      </div>

      <div className="rounded-2xl border border-gold-500/30 bg-parchment-900 p-6 max-w-xl">
        <EmailCapture toolSlug="farming-routes" />
      </div>
    </article>
  );
}
