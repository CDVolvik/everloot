import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";
import { handleProfessionPath, professionFactsFromRecords } from "../../../../../kb/src/profession-path";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forever Profession Hubs",
  description:
    "Leveling routes and material lists for WoW: Forever professions, built from player-collected recipes and prices. Collecting now.",
  keywords: ["wow forever professions", "wow forever profession leveling", "forever profession perks"],
  alternates: { canonical: "/tools/professions" },
};

const CARDS = [
  {
    title: "Leveling routes from real data",
    body: "Routes compare estimated reagent costs from reported recipes. Missing recipes remain gaps, and missing prices remain unknown.",
  },
  {
    title: "Materials shopping lists",
    body: "Estimated materials and costs use reported recipes and prices. Prices are not scoped to a realm, build or time; three install reports per reagent do not guarantee today's cheapest route.",
  },
  {
    title: "Gathering + crafting, planned",
    body: "Farming routes are planned, not built. When they exist, a route will say where to farm and the hub what the materials cost.",
  },
];

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function skill(value: string, fallback: number): number {
  if (!/^\d+$/.test(value)) return fallback;
  const n = Number(value);
  return n >= 1 && n <= 500 ? n : fallback;
}

export default async function ProfessionsPage(
  props: {
    searchParams: Promise<{ profession?: string | string[]; from?: string | string[]; to?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const profession = one(searchParams.profession).trim() || "Alchemy";
  const fromSkill = skill(one(searchParams.from), 1);
  const toSkill = skill(one(searchParams.to), 75);
  const corpus = await uploadStore.loadCorpus();
  const facts = corpus.unreachable
    ? { sightings: [], prices: [] }
    : professionFactsFromRecords(corpus.records);
  const answer = corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleProfessionPath({ profession, fromSkill, toSkill }, facts.sightings, facts.prices);
  const reports = facts.sightings.length;
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          {corpus.unreachable
            ? "Storage unreachable"
            : `Collecting data · ${reports} recipe ${reports === 1 ? "report" : "reports"}`}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">
          Forever Profession Hubs
        </h1>
        <p className="text-lg text-parchment-100/75 max-w-2xl">
          Estimate a profession path from uploaded recipes and prices. Missing recipes
          remain gaps, and missing prices remain unknown. Reported install IDs do not
          establish independent contributors or guarantee current realm prices.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-parchment-100">The path</h2>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          Choose a profession and skill range to see a path from available recipe uploads.
          Estimated costs use reported prices without realm, build or time guarantees.
        </p>
        <form method="get" className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm text-parchment-100/80 space-y-1">
              <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Profession</span>
              <input name="profession" defaultValue={profession} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
            </label>
            <label className="text-sm text-parchment-100/80 space-y-1">
              <span className="block text-xs uppercase tracking-wider text-parchment-100/50">From skill</span>
              <input name="from" defaultValue={fromSkill} inputMode="numeric" className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
            </label>
            <label className="text-sm text-parchment-100/80 space-y-1">
              <span className="block text-xs uppercase tracking-wider text-parchment-100/50">To skill</span>
              <input name="to" defaultValue={toSkill} inputMode="numeric" className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
            </label>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-gold-500 text-parchment-950 font-semibold hover:bg-gold-400 transition">
            Show the path
          </button>
        </form>
        <pre className="whitespace-pre-wrap text-sm text-parchment-100/85 rounded-xl border border-parchment-100/10 bg-parchment-900 p-5">
          {answer}
        </pre>
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
          The addon does not record recipes or prices yet, so these routes fill in only as that
          collection is added. Material drops it records already reach the drop pages. Upload on the{" "}
          <Link href="/upload" className="text-gold-400 hover:underline underline-offset-4">upload page</Link>.
        </p>
      </div>

      <div className="rounded-2xl border border-gold-500/30 bg-parchment-900 p-6 max-w-xl">
        <EmailCapture toolSlug="professions" />
      </div>
    </article>
  );
}
