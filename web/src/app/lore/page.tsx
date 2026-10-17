import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import LoreSearchForm from "@/components/LoreSearchForm";
import { BROWSE_HEADINGS, BROWSE_TYPES, hasTypes, UNAVAILABLE_COPY, type BrowseSlug } from "@/lib/lore";
import { getRelease } from "@/lib/release";

// Cached for a day: it only reads the manifest. Without a release the page calls noStore(), so an
// "unavailable" answer is rendered per request and never baked into a build or kept in the cache.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Lore archive",
  description: "Warcraft Wiki pages as of 13 November 2023, searchable and attributed under CC BY-SA 4.0. Lore and history, not collected WoW: Forever data.",
  alternates: { canonical: "/lore" },
  openGraph: { type: "website", title: "Lore archive", description: "Warcraft Wiki pages as of 13 November 2023, CC BY-SA 4.0. Lore and history, not collected WoW: Forever data.", url: "/lore", siteName: "Everloot" },
  twitter: { card: "summary", title: "Lore archive", description: "Warcraft Wiki pages as of 13 November 2023, CC BY-SA 4.0. Lore and history, not collected WoW: Forever data." },
};

const formatter = new Intl.NumberFormat("en-US");

export default async function LoreLanding() {
  const release = getRelease();
  if (!release) noStore();
  // The wiki count only: curated Forever rows are not part of the 2023 wiki.
  const pages = release ? release.manifest.counts["warcraft-wiki-2023"] ?? null : null;

  return (
    <article className="space-y-10 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">Lore archive · Warcraft Wiki, 2023 dump</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Lore archive</h1>
        <p className="text-lg text-fg-2 max-w-2xl">
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
                <Link key={slug} href={`/lore/${slug}`} className="btn min-h-11 px-3">
                  {BROWSE_HEADINGS[slug]}
                </Link>
              ))}
              <Link href="/lore/coverage" className="btn min-h-11 px-3">
                What the archive covers
              </Link>
            </nav>
          )}
          <section className="rounded-2xl border border-line bg-panel p-6 text-sm text-fg-2 space-y-2">
            <h2 className="text-xl text-fg">Licence and attribution</h2>
            <p>{release.manifest.notice}</p>
          </section>
        </>
      ) : (
        <section className="space-y-2">
          <h2 className="text-xl text-fg">Lore archive unavailable</h2>
          <p className="text-sm text-fg-2">{UNAVAILABLE_COPY}</p>
        </section>
      )}

      <p className="text-sm text-muted">
        This archive predates WoW: Forever. For collected gameplay facts see the{" "}
        <Link href="/database" className="text-accent hover:underline underline-offset-4">Forever database</Link>.
      </p>
    </article>
  );
}
