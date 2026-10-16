import type { Metadata } from "next";
import Link from "next/link";
import LoreSearchForm from "@/components/LoreSearchForm";
import { BROWSE_HEADINGS, BROWSE_TYPES, hasTypes, UNAVAILABLE_COPY, type BrowseSlug } from "@/lib/lore";
import { getRelease } from "@/lib/release";

// Rendered per request: it only reads the manifest, and a static build without the release would bake "unavailable".
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lore archive",
  description: "Warcraft Wiki pages as of 13 November 2023, searchable and attributed under CC BY-SA 4.0. Lore and history, not collected WoW: Forever data.",
  alternates: { canonical: "/lore" },
  openGraph: { type: "website", title: "Lore archive", description: "Warcraft Wiki pages as of 13 November 2023, CC BY-SA 4.0. Lore and history, not collected WoW: Forever data.", url: "/lore", siteName: "Everloot" },
};

const formatter = new Intl.NumberFormat("en-US");

export default async function LoreLanding() {
  const release = getRelease();
  // The wiki count only: curated Forever rows are not part of the 2023 wiki.
  const pages = release ? release.manifest.counts["warcraft-wiki-2023"] ?? null : null;

  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">Lore archive · Warcraft Wiki, 2023 dump</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Lore archive</h1>
        <p className="text-lg text-parchment-100/75 max-w-2xl">
          The Warcraft Wiki as it stood on 13 November 2023
          {pages !== null ? <>, {formatter.format(pages)} pages</> : null}, published under CC BY-SA 4.0 with a source link on every page.
          Lore, history, characters and places. Not collected WoW: Forever data.
        </p>
      </header>

      {release ? (
        <>
          <LoreSearchForm />
          {hasTypes() === true && (
            <nav aria-label="Browse by type" className="flex flex-wrap gap-2 text-sm">
              {(Object.keys(BROWSE_TYPES) as BrowseSlug[]).map((slug) => (
                <Link key={slug} href={`/lore/${slug}`} className="min-h-11 inline-flex items-center rounded-lg border border-parchment-100/15 px-3 text-parchment-100/80 hover:text-gold-400 hover:border-gold-400/40">
                  {BROWSE_HEADINGS[slug]}
                </Link>
              ))}
              <Link href="/lore/coverage" className="min-h-11 inline-flex items-center rounded-lg border border-parchment-100/15 px-3 text-parchment-100/80 hover:text-gold-400 hover:border-gold-400/40">
                What the archive covers
              </Link>
            </nav>
          )}
          <section className="rounded-2xl border border-parchment-100/10 bg-parchment-900 p-6 text-sm text-parchment-100/75 space-y-2">
            <h2 className="font-display text-xl text-parchment-100">Licence and attribution</h2>
            <p>{release.manifest.notice}</p>
          </section>
        </>
      ) : (
        <section className="space-y-2">
          <h2 className="font-display text-xl text-parchment-100">Lore archive unavailable</h2>
          <p className="text-sm text-parchment-100/75">{UNAVAILABLE_COPY}</p>
        </section>
      )}

      <p className="text-sm text-parchment-100/60">
        This archive predates WoW: Forever. For collected gameplay facts see the{" "}
        <Link href="/database" className="text-gold-400 hover:underline underline-offset-4">Forever database</Link>.
      </p>
    </article>
  );
}
