import type { Metadata } from "next";
import Link from "next/link";
import { computeRollups } from "@/lib/rollup-compute";

export const metadata: Metadata = {
  title: "Forever Database",
  description:
    "Drop rates, spawn maps, quests and vendors for WoW: Forever — every fact corroborated by independent players.",
  alternates: { canonical: "/database" },
};
export const dynamic = "force-dynamic";

const SECTIONS = [
  { title: "Drop rates", body: "Rates ship with kill counts. A fact goes public after 3+ independent installs report it." },
  { title: "Spawn maps", body: "NPC positions from corroborated sightings. Single reports stay queued, never published." },
  { title: "Quests + vendors", body: "Givers, turn-ins, rewards and merchant lists with provenance on every row." },
  { title: "Guilds", body: "Progression, roster and the Everloot score — published by officers, linked from the tracker." },
];

export default async function DatabasePage() {
  const { rates, stats } = await computeRollups();
  const live = rates.filter((r) => r.public).length;
  const queued = rates.length - live;
  const counts = [
    { label: "Uploads", value: stats.uploads },
    { label: "Loot windows", value: stats.lootWindows },
    { label: "Public rates", value: live },
    { label: "Queued facts", value: queued },
  ];
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          Thottbot reborn · corroborated only
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">
          Forever Database
        </h1>
        <p className="text-lg text-parchment-100/75 max-w-2xl">
          Items, NPCs, quests and vendors for WoW: Forever — built from data players
          collect, published only when independent uploads agree. No scrapes, no guesses.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {counts.map((c) => (
          <div key={c.label} className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 text-center">
            <div className="font-display text-3xl font-bold text-gold-400">{c.value}</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-parchment-100/60">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-xl border border-parchment-100/10 p-5 bg-parchment-900">
            <h2 className="font-display text-lg font-semibold text-gold-400">{s.title}</h2>
            <p className="mt-1 text-sm text-parchment-100/80">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-arcane/30 bg-parchment-900 p-6">
        <h2 className="font-display text-xl text-parchment-100">Be the first source</h2>
        <p className="mt-1 text-sm text-parchment-100/75 max-w-xl">
          Every number above starts at zero and fills as uploads arrive. Run the addon,
          send data on the{" "}
          <Link href="/upload" className="text-gold-400 hover:underline underline-offset-4">upload page</Link>,
          and watch your farms become the reference.
        </p>
      </div>
    </article>
  );
}
