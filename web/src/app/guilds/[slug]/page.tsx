import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FAMILIES, figureLabel, getFamily, type FamilyFact } from "@/data/families";

const KIND_LABEL: Record<FamilyFact["kind"], string> = {
  "guild-site": "Their page",
  claim: "Published claim",
  sighting: "Name sighted",
};

export function generateStaticParams() {
  return FAMILIES.map((family) => ({ slug: family.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const family = getFamily(params.slug);
  if (!family) return { title: "Guild family" };
  return {
    title: `${family.name} family record`,
    description: family.summary,
    alternates: { canonical: `/guilds/${family.slug}` },
  };
}

export default function GuildFamilyPage({ params }: { params: { slug: string } }) {
  const family = getFamily(params.slug);
  if (!family) notFound();

  const halls = family.facts.filter((fact) => fact.kind === "guild-site");
  const claims = family.facts.filter((fact) => fact.kind === "claim");
  const sightings = family.facts.filter((fact) => fact.kind === "sighting");
  const api = family.blizzard;

  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">
          WoW: Forever · guild family
        </p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">
          {family.name}
        </h1>
        <p className="text-parchment-100/75 max-w-2xl">{family.summary}</p>
        <p className="text-sm text-parchment-100/60 max-w-2xl">
          A guild hall can list its own members and say how it knows. This page does that
          for the whole family. Each row is someone else&apos;s published sentence, with the
          page and the date beside it.
        </p>
      </header>

      <FactTable title="Guild halls" caption="A guild's own site. The count is theirs." rows={halls} />
      <FactTable title="What has been published about the family" caption="Claims, in the order they were said. They do not add up to one census." rows={claims} />
      <FactTable title="Names sighted" caption="A public page named a guild. That is not a member list." rows={sightings} />

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-parchment-100">Battle.net guild profile</h2>
        <p className="text-sm text-parchment-100/75 max-w-2xl">
          The same columns, filled by Blizzard&apos;s guild API the day Forever has a namespace.
          Checked {api.checked}: retail guild profile and Classic Era both answered from the
          client we already have. Guessed Forever namespaces were refused. The open question is
          on{" "}
          <a
            href={api.forumUrl}
            className="text-gold-400 hover:underline underline-offset-4"
          >
            Blizzard&apos;s API forum
          </a>
          . When a namespace is published, it is one line in the local adapter. Those responses
          stay off this page, because the site runs ads and Blizzard&apos;s terms keep API data
          in a local cache.
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ApiStat label="Retail guild profile" value={api.retailProfile} />
          <ApiStat label="Classic Era" value={api.classicEraStatic} />
          <ApiStat label="Forever, guessed names" value={api.foreverGuessed} />
        </dl>
      </section>

      <p className="text-sm text-parchment-100/60">
        Progression, loot, and the score are still the{" "}
        <Link href="/tools/guild-tracker" className="text-gold-400 hover:underline underline-offset-4">
          guild tracker
        </Link>
        . A guild the public web has not mentioned is left off this page.
      </p>
    </article>
  );
}

function ApiStat({ label, value }: { label: string; value: "answers" | "refused" }) {
  return (
    <div className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-4">
      <dt className="text-xs uppercase tracking-wider text-parchment-100/50">{label}</dt>
      <dd className="mt-1 font-display text-lg text-parchment-100">
        {value === "answers" ? "Answers" : "Refused"}
      </dd>
    </div>
  );
}

function FactTable({ title, caption, rows }: { title: string; caption: string; rows: FamilyFact[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-2xl text-parchment-100">{title}</h2>
        <p className="text-sm text-parchment-100/60">{caption}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-parchment-100/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-parchment-900 text-xs uppercase tracking-wider text-parchment-100/60 text-left">
              <th className="px-4 py-3">What was published</th>
              <th className="px-4 py-3">Figure</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">As of</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((fact) => (
              <tr key={fact.id} className="border-t border-parchment-100/10 bg-parchment-900 align-top text-parchment-100/85">
                <td className="px-4 py-3 max-w-md">
                  <span className="text-[10px] uppercase tracking-wider text-gold-500/80">
                    {KIND_LABEL[fact.kind]}
                    {fact.guild ? ` · ${fact.guild}` : ""}
                  </span>
                  <p className="mt-1">{fact.statement}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gold-400">{figureLabel(fact)}</td>
                <td className="px-4 py-3">
                  <a href={fact.url} className="text-gold-400 hover:underline underline-offset-4">
                    {fact.sourceName}
                  </a>
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{fact.asOf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
