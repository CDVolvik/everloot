import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { dataAgeLabel } from "@/lib/data-age";
import { BROWSE_HEADINGS, BROWSE_TYPES, coverage, FACET_KEYS, PRE_CLASSIFICATION_COPY, UNAVAILABLE, UNAVAILABLE_COPY, type BrowseSlug, type FacetKey } from "@/lib/lore";
import { getRelease } from "@/lib/release";

// Cached for a day (fixed release). The unavailable answer calls noStore() so it is never cached.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const available = getRelease() !== null;
  return {
    ...pageMetadata({
      title: available ? "Lore archive coverage" : "Lore archive unavailable",
      description: "What the Everloot lore archive covers: pages by type, facet, indexability and template damage, with the release date. The archive is the Warcraft Wiki as of November 2023, not WoW: Forever data.",
      path: "/lore/coverage",
    }),
    robots: { index: available, follow: true },
  };
}

const FACET_LABELS: Record<FacetKey, string> = {
  expansion: "Expansion", profession: "Profession", class: "Class", race: "Race", zone: "Zone", faction: "Faction",
};
const formatter = new Intl.NumberFormat("en-US");
const num = (n: number) => formatter.format(n);

export default async function CoveragePage() {
  const release = getRelease();
  const summary = coverage();
  if (!release || summary === UNAVAILABLE) {
    noStore();
    return (
      <article className="space-y-4 max-w-4xl">
        <p className="font-mono text-xs text-muted">Lore archive</p>
        <h1 className="text-3xl font-bold text-fg">Lore archive unavailable</h1>
        <p className="text-fg-2">{UNAVAILABLE_COPY}</p>
      </article>
    );
  }
  const wikiPages = release.manifest.counts["warcraft-wiki-2023"] ?? 0;
  const types = summary.types;
  const typeRows = (Object.keys(BROWSE_TYPES) as BrowseSlug[]).map((slug) => ({ slug, heading: BROWSE_HEADINGS[slug], n: types?.[BROWSE_TYPES[slug]] ?? 0 }));
  const other = types?.other ?? 0;

  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">Lore archive · Warcraft Wiki, 2023 dump</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">What the lore archive covers</h1>
        <p className="text-lg text-fg-2 max-w-2xl">
          Counts come from the release manifest and the release itself. Everything here is the Warcraft Wiki as of 13 November 2023, not WoW: Forever data.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-2xl text-fg">Pages</h2>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div className="rounded-xl border border-line bg-panel p-4"><dt className="text-xs font-mono text-muted">Wiki pages</dt><dd className="text-2xl text-accent">{num(wikiPages)}</dd></div>
          <div className="rounded-xl border border-line bg-panel p-4"><dt className="text-xs font-mono text-muted">Indexable pages</dt><dd className="text-2xl text-accent">{num(summary.indexable)}</dd></div>
          <div className="rounded-xl border border-line bg-panel p-4"><dt className="text-xs font-mono text-muted">Damaged pages</dt><dd className="text-2xl text-accent">{summary.damaged === null ? "not measured" : num(summary.damaged)}</dd></div>
          <div className="rounded-xl border border-line bg-panel p-4"><dt className="text-xs font-mono text-muted">Release</dt><dd className="text-lg text-accent">{summary.createdAt.slice(0, 10)}</dd></div>
        </dl>
        <p className="text-xs text-muted">{dataAgeLabel(summary.createdAt)}. A damaged page still shows a sentence where a wiki template dropped its value.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl text-fg">Types</h2>
        {types === null ? (
          <p className="text-sm text-fg-2">{PRE_CLASSIFICATION_COPY} Type counts arrive with the next knowledge release.</p>
        ) : (
          <table className="text-sm w-full max-w-md">
            <tbody>
              {typeRows.map((row) => (
                <tr key={row.slug} className="border-b border-line">
                  <th scope="row" className="text-left font-normal py-2"><Link href={`/lore/${row.slug}`} className="text-accent hover:underline underline-offset-4">{row.heading}</Link></th>
                  <td className="text-right py-2 tabular-nums">{num(row.n)}</td>
                </tr>
              ))}
              <tr><th scope="row" className="text-left font-normal py-2 text-fg-2">Other pages</th><td className="text-right py-2 tabular-nums">{num(other)}</td></tr>
            </tbody>
          </table>
        )}
      </section>

      {types !== null && (
        <section className="space-y-3">
          <h2 className="text-2xl text-fg">Facets</h2>
          <p className="text-sm text-fg-2">The ten most common values per facet family, taken from the wiki&apos;s own category names.</p>
          <div className="grid sm:grid-cols-2 gap-6 text-sm">
            {FACET_KEYS.filter((key) => summary.facets[key].length > 0).map((key) => (
              <div key={key}>
                <h3 className="text-lg text-fg">{FACET_LABELS[key]}</h3>
                <ul className="mt-1 space-y-1">
                  {summary.facets[key].map((f) => (
                    <li key={f.value} className="flex justify-between gap-4"><span>{f.value}</span><span className="tabular-nums text-muted">{num(f.n)}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-sm text-muted">
        <Link href="/lore" className="text-accent hover:underline underline-offset-4">About the lore archive</Link>
        {" "}· <Link href="/search" className="text-accent hover:underline underline-offset-4">Search</Link>
      </p>
    </article>
  );
}
