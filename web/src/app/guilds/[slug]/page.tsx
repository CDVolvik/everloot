import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
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

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const family = getFamily(params.slug);
  if (!family) return { title: "Guild family" };
  return pageMetadata({ title: `${family.name} family record`, description: family.summary, path: `/guilds/${family.slug}` });
}

export default async function GuildFamilyPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const family = getFamily(params.slug);
  if (!family) notFound();

  const halls = family.facts.filter((fact) => fact.kind === "guild-site");
  const claims = family.facts.filter((fact) => fact.kind === "claim");
  const sightings = family.facts.filter((fact) => fact.kind === "sighting");
  const api = family.blizzard;

  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">
          WoW: Forever · guild family
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">
          {family.name}
        </h1>
        <p className="text-fg-2 max-w-2xl">{family.summary}</p>
        <p className="text-sm text-muted max-w-2xl">
          A guild hall can list its own members and say how it knows. This page does that
          for the whole family. Each row is someone else&apos;s published sentence, with the
          page and the date beside it.
        </p>
      </header>

      <FactTable title="Guild halls" caption="A guild's own site. The count is theirs." rows={halls} />
      <FactTable title="What has been published about the family" caption="Claims, in the order they were said. They do not add up to one census." rows={claims} />
      <FactTable title="Names sighted" caption="A public page named a guild. That is not a member list." rows={sightings} />

      <section className="space-y-3">
        <h2 className="text-2xl text-fg">Battle.net guild profile</h2>
        <p className="text-sm text-fg-2 max-w-2xl">
          The same columns, filled by Blizzard&apos;s guild API the day Forever has a namespace.
          Checked {api.checked}: the retail guild profile and Classic Era both answered our
          requests. Guessed Forever namespaces were refused. The open question is
          on{" "}
          <a
            href={api.forumUrl}
            className="text-accent hover:underline underline-offset-4"
          >
            Blizzard&apos;s API forum
          </a>
          . Once Blizzard publishes one, Everloot can read it. Those responses
          stay off this page, because Blizzard&apos;s terms keep API data in a local
          cache.
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ApiStat label="Retail guild profile" value={api.retailProfile} />
          <ApiStat label="Classic Era" value={api.classicEraStatic} />
          <ApiStat label="Forever, guessed names" value={api.foreverGuessed} />
        </dl>
      </section>

      <p className="text-sm text-muted">
        Progression, roster, and loot from officer uploads are on the{" "}
        <Link href="/tools/guild-board" className="text-accent hover:underline underline-offset-4">
          guild board
        </Link>
        . A guild the public web has not mentioned is left off this page.
      </p>
    </article>
  );
}

function ApiStat({ label, value }: { label: string; value: "answers" | "refused" }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <dt className="text-xs font-mono text-muted">{label}</dt>
      <dd className="mt-1 text-lg text-fg">
        {value === "answers" ? "Answers" : "Refused"}
      </dd>
    </div>
  );
}

function FactTable({ title, caption, rows }: { title: string; caption: string; rows: FamilyFact[] }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-2xl text-fg">{title}</h2>
        <p className="text-sm text-muted">{caption}</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-panel text-xs font-mono text-muted text-left">
              <th className="px-4 py-3">What was published</th>
              <th className="px-4 py-3">Figure</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">As of</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((fact) => (
              <tr key={fact.id} className="border-t border-line bg-panel align-top text-fg">
                <td className="px-4 py-3 max-w-md">
                  <span className="text-[10px] font-mono text-muted">
                    {KIND_LABEL[fact.kind]}
                    {fact.guild ? ` · ${fact.guild}` : ""}
                  </span>
                  <p className="mt-1">{fact.statement}</p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-accent">{figureLabel(fact)}</td>
                <td className="px-4 py-3">
                  <a href={fact.url} className="text-accent hover:underline underline-offset-4">
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
