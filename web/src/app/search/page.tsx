import type { Metadata } from "next";
import Link from "next/link";
import LoreSearchForm from "@/components/LoreSearchForm";
import { loreSlug, MAX_QUERY, searchLore, UNAVAILABLE, UNAVAILABLE_COPY } from "@/lib/lore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search the lore archive",
  description: "Search Warcraft Wiki pages as of November 2023 (CC BY-SA 4.0). Lore and history, not collected WoW: Forever data.",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

function pageNumber(raw: string | undefined): number {
  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
}

function sourceHost(url: string): string {
  try { return new URL(url).hostname; } catch { return "source"; }
}

export default async function SearchPage(props: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await props.searchParams;
  const q = (params.q ?? "").trim().slice(0, MAX_QUERY);
  const page = pageNumber(params.page);
  const result = q ? searchLore(q, page) : null;

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">Lore archive · Warcraft Wiki, 2023 dump</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Search the lore archive</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          Pages named exactly what you typed come first. Every result links to its wiki source. This archive predates WoW: Forever.
        </p>
      </header>

      <LoreSearchForm query={q} />

      {result === UNAVAILABLE ? (
        <section className="space-y-2">
          <h2 className="font-display text-xl text-parchment-100">Lore archive unavailable</h2>
          <p className="text-sm text-parchment-100/75">{UNAVAILABLE_COPY}</p>
        </section>
      ) : result === null ? null : result.hits.length === 0 && page > 1 ? (
        <section className="space-y-2 text-sm text-parchment-100/75">
          <p>No more results.</p>
          <p><Link href={`/search?q=${encodeURIComponent(q)}`} className="text-gold-400 hover:underline underline-offset-4">Back to the first page</Link></p>
        </section>
      ) : result.hits.length === 0 ? (
        <section className="space-y-2 text-sm text-parchment-100/75">
          <p>No lore page matches that.</p>
          <p>
            Try the wiki&apos;s own search:{" "}
            <a href={`https://warcraft.wiki.gg/index.php?search=${encodeURIComponent(q)}`} rel="noopener" className="text-gold-400 hover:underline underline-offset-4">
              warcraft.wiki.gg
            </a>
          </p>
        </section>
      ) : (
        <section className="space-y-4">
          <ol className="space-y-4">
            {result.hits.map((hit) => (
              <li key={hit.id} className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-4">
                <Link href={`/lore/${loreSlug(hit)}`} className="font-display text-lg text-gold-400 hover:underline underline-offset-4">{hit.name}</Link>
                <p className="mt-1 text-sm text-parchment-100/80">{hit.snippet}</p>
                <p className="mt-2 text-xs text-parchment-100/55">
                  {hit.gameVersion === "lore" ? "lore · 2023" : `${hit.gameVersion} · ${hit.sourceId}`} · {sourceHost(hit.sourceUrl)}
                </p>
              </li>
            ))}
          </ol>
          <nav aria-label="Search pages" className="flex items-center gap-4 text-sm">
            {page > 1 && (
              <Link href={`/search?q=${encodeURIComponent(q)}&page=${page - 1}`} className="text-gold-400 hover:underline underline-offset-4">Previous</Link>
            )}
            <span className="text-parchment-100/60">Page {page}</span>
            {result.hasNext && (
              <Link href={`/search?q=${encodeURIComponent(q)}&page=${page + 1}`} className="text-gold-400 hover:underline underline-offset-4">Next</Link>
            )}
          </nav>
        </section>
      )}

      <p className="text-sm text-parchment-100/60">
        <Link href="/lore" className="text-gold-400 hover:underline underline-offset-4">About the lore archive</Link>
      </p>
    </article>
  );
}
