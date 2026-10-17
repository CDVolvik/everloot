import type { Metadata } from "next";
import Link from "next/link";
import EmailCapture from "@/components/EmailCapture";
import { handleProfessionPath } from "../../../../../kb/src/profession-path";
import { handleRecipeThresholds, pathFactsFromRecords } from "../../../../../kb/src/recipe-thresholds";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";

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
    ? { sightings: [], prices: [], observations: [], derived: [] }
    : pathFactsFromRecords(corpus.records);
  const answer = corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleProfessionPath({ profession, fromSkill, toSkill }, facts.sightings, facts.prices, facts.derived);
  const ranges = corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleRecipeThresholds({ profession }, facts.observations, facts.prices);
  const reports = facts.sightings.length + facts.observations.length;
  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          {corpus.unreachable
            ? "Storage unreachable"
            : `Collecting data · ${reports} recipe ${reports === 1 ? "report" : "reports"}`}
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">
          Forever Profession Hubs
        </h1>
        <p className="text-lg text-fg-2 max-w-2xl">
          Estimate a profession path from uploaded recipes and prices. Missing recipes
          remain gaps, and missing prices remain unknown. Reported install IDs do not
          establish independent contributors or guarantee current realm prices.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-2xl text-fg">The path</h2>
        <p className="text-sm text-fg-2 max-w-2xl">
          Choose a profession and skill range to see a path from available recipe uploads.
          Estimated costs use reported prices without realm, build or time guarantees.
        </p>
        <form method="get" className="rounded-xl border border-line bg-panel p-5 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm text-fg-2 space-y-1">
              <span className="block text-xs font-mono text-muted">Profession</span>
              <input name="profession" defaultValue={profession} className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-fg" />
            </label>
            <label className="text-sm text-fg-2 space-y-1">
              <span className="block text-xs font-mono text-muted">From skill</span>
              <input name="from" defaultValue={fromSkill} inputMode="numeric" className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-fg" />
            </label>
            <label className="text-sm text-fg-2 space-y-1">
              <span className="block text-xs font-mono text-muted">To skill</span>
              <input name="to" defaultValue={toSkill} inputMode="numeric" className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-fg" />
            </label>
          </div>
          <button type="submit" className="btn btn-primary">
            Show the path
          </button>
        </form>
        <pre className="whitespace-pre-wrap text-sm text-fg rounded-xl border border-line bg-panel p-5">
          {answer}
        </pre>
        {!corpus.unreachable && <p className="text-xs text-muted">{dataAgeLabel(corpus.dataAsOf)}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl text-fg">Recipe skill ranges</h2>
        <p className="text-sm text-fg-2 max-w-2xl">
          Where {profession} recipes turn yellow, green and grey, from the colours players&apos; profession windows
          showed (addon 0.2.3+). Shown as ranges once 3 installs agree, with the reagents 3 installs saw and an
          estimated cost per craft when every reagent has an agreed price.
        </p>
        <pre className="whitespace-pre-wrap text-sm text-fg rounded-xl border border-line bg-panel p-5">
          {ranges}
        </pre>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        {CARDS.map((s) => (
          <div key={s.title} className="rounded-xl border border-line p-5 bg-panel">
            <h2 className="text-lg font-semibold text-accent">{s.title}</h2>
            <p className="mt-1 text-sm text-fg-2">{s.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line bg-panel p-6">
        <h2 className="text-xl text-fg">Feed your profession</h2>
        <p className="mt-1 text-sm text-fg-2 max-w-xl">
          With auction capture on, the addon&apos;s auction scans price reagents here. Opening profession
          windows and trainers (addon 0.2.5) builds route steps: only the ranks where a recipe is known
          orange, once 3 installs agree. Ranks past that stay gaps. Material drops it records already
          reach the drop pages. Upload on the{" "}
          <Link href="/upload" className="text-accent hover:underline underline-offset-4">upload page</Link>.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-6 max-w-xl">
        <EmailCapture toolSlug="professions" />
      </div>
    </article>
  );
}
