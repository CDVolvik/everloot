import type { Metadata } from "next";
import Link from "next/link";
import { join } from "node:path";
import EmailCapture from "@/components/EmailCapture";
import ProfessionPathForm from "@/components/ProfessionPathForm";
import { handleProfessionPath, professionFactsFromRecords } from "../../../../../kb/src/profession-path";
import { loadUploadRecords } from "../../../../../kb/src/load-uploads";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forever Profession Hubs",
  description:
    "Leveling routes, material lists and perk tracking for WoW: Forever professions — built from player-collected data. Collecting now.",
  keywords: ["wow forever professions", "wow forever profession leveling", "forever profession perks"],
  alternates: { canonical: "/tools/professions" },
};

const CARDS = [
  {
    title: "Leveling routes from real data",
    body: "Skill-up-per-material paths computed from recipes players actually report — not copied from a ten-year-old guide. Routes go live per profession as reports arrive.",
  },
  {
    title: "Forever perk tracking",
    body: "Forever adds profession perks on top of the classic recipes. We track which perks players confirm in-game, with the exact wording as collected — flagged provisional until corroborated.",
  },
  {
    title: "Materials shopping lists",
    body: "Totals for the full path, grouped for the auction house. Cost estimates switch on once realm price feeds exist; until then the lists are exact quantities.",
  },
  {
    title: "Gathering + crafting, together",
    body: "Gatherers feed crafters: spawn maps from the farming routes plug straight into material lists, so a route tells you what to farm and the hub tells you what it's worth.",
  },
];

export default function ProfessionsPage() {
  const facts = professionFactsFromRecords(loadUploadRecords(join(process.cwd(), "data", "uploads")));
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          Collecting data · 0 reports yet
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">
          Forever Profession Hubs
        </h1>
        <p className="text-lg text-parchment-100/75 max-w-2xl">
          Every profession, one hub each: the cheapest skill-up path, the materials list,
          and the Forever perks — all drawn from data players collect in-game. No copied
          guides, no invented numbers: a hub opens its numbers when the reports exist.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-parchment-100">The path</h2>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          The path below reads recipe uploads stored on this server. The form asks the same engine
          without those files. The profession_path tool reads them when EVERLOOT_UPLOADS points at
          the same directory.
        </p>
        <pre className="whitespace-pre-wrap text-sm text-parchment-100/85 rounded-xl border border-parchment-100/10 bg-parchment-900 p-5">
          {handleProfessionPath({ profession: "Alchemy", fromSkill: 1, toSkill: 75 }, facts.sightings, facts.prices)}
        </pre>
        <ProfessionPathForm />
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {CARDS.map((s) => (
          <div key={s.title} className="rounded-xl border border-parchment-100/10 p-5 bg-parchment-900">
            <h2 className="font-display text-lg font-semibold text-gold-400">{s.title}</h2>
            <p className="mt-1 text-sm text-parchment-100/80">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-arcane/30 bg-parchment-900 p-6">
        <h2 className="font-display text-xl text-parchment-100">Feed your profession</h2>
        <p className="mt-1 text-sm text-parchment-100/75 max-w-xl">
          Run the Everloot addon while you level — recipe sightings and material drops flow
          into your profession&apos;s hub. Upload on the{" "}
          <Link href="/upload" className="text-gold-400 hover:underline underline-offset-4">upload page</Link>.
        </p>
      </div>

      <div className="rounded-2xl border border-gold-500/30 bg-parchment-900 p-6 max-w-xl">
        <EmailCapture toolSlug="professions" />
      </div>
    </article>
  );
}
