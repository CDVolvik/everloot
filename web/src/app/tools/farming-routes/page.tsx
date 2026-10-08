import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";

export const metadata: Metadata = {
  title: "Forever Farming Routes",
  description:
    "Planned WoW: Forever farming routes from uploaded sightings. Route optimization and respawn timing are not available yet.",
  keywords: ["wow forever farming", "wow forever gold farm", "wow forever routes"],
  alternates: { canonical: "/tools/farming-routes" },
};

const CARDS = [
  {
    title: "Spawn maps, not guesses",
    body: "Planned maps will use uploaded sightings. Distinct install IDs are not verified independent players, and sightings do not establish respawn timing.",
  },
  {
    title: "Gold-per-hour attached",
    body: "Route-linked estimates are planned. The available Gold/Hour Calculator uses the time, quantities and prices you enter yourself.",
  },
  {
    title: "Respawns included",
    body: "Respawn measurement and loop optimization are not available yet. Repeated sightings alone do not prove a respawn interval.",
  },
  {
    title: "Gatherers + hunters",
    body: "Combined gathering and mob routes are planned, pending verified collection and enough usable observations.",
  },
];

export default function FarmingRoutesPage() {
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          Planned · routes not yet available
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">
          Forever Farming Routes
        </h1>
        <p className="text-lg text-parchment-100/75 max-w-2xl">
          Zone-by-zone gold and material routes are planned. No optimized routes or
          respawn estimates are available yet. You can upload sightings or use the
          calculator for a farm you already know.
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
