import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import BrowseFilters from "@/components/BrowseFilters";
import {
  browse, BROWSE_HEADINGS, BROWSE_TYPES, FACET_KEYS, facetValues, hasTypes, LETTERS, lettersWithRows, loreSlug,
  parseLetter, PRE_CLASSIFICATION_COPY, UNAVAILABLE, UNAVAILABLE_COPY, type BrowseSlug, type FacetKey,
} from "@/lib/lore";

export const dynamic = "force-dynamic";

type RawQuery = Partial<Record<FacetKey | "letter" | "page", string | string[]>>;
type Query = Partial<Record<FacetKey | "letter" | "page", string>>;
type Props = { params: Promise<{ type: string }>; searchParams: Promise<RawQuery> };

/** Next hands a repeated parameter over as an array; the first value is the one we answer. */
function firstValues(raw: RawQuery): Query {
  const out: Query = {};
  for (const [k, v] of Object.entries(raw)) out[k as keyof Query] = Array.isArray(v) ? v[0] : v;
  return out;
}

function slugOf(type: string): BrowseSlug | null {
  return Object.hasOwn(BROWSE_TYPES, type) ? (type as BrowseSlug) : null;
}

function filtersOf(query: Query): Partial<Record<FacetKey, string>> {
  const out: Partial<Record<FacetKey, string>> = {};
  for (const key of FACET_KEYS) if (query[key]) out[key] = query[key];
  return out;
}

function pageNumber(raw: string | undefined): number {
  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
}

/** `/lore/<type>` for letter a, else `/lore/<type>?letter=<l>`: the only indexed form. */
function letterUrl(slug: BrowseSlug, letter: string): string {
  return letter === "a" ? `/lore/${slug}` : `/lore/${slug}?letter=${encodeURIComponent(letter)}`;
}

/** The letter to list: the given one; none when a facet filter is set without a letter; "a" otherwise. */
function letterOf(query: Query): string | null | undefined {
  if (query.letter === undefined) return Object.keys(filtersOf(query)).length > 0 ? null : "a";
  return parseLetter(query.letter) ?? undefined;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { type } = await props.params;
  const query = firstValues(await props.searchParams);
  const slug = slugOf(type);
  const letter = letterOf(query);
  if (!slug || letter === undefined) return { robots: { index: false, follow: true } };
  const typed = hasTypes();
  const clean = Object.keys(filtersOf(query)).length === 0 && !query.page;
  const letters = typed === true && letter !== null ? lettersWithRows(BROWSE_TYPES[slug]) : null;
  const emptyLetter = letter !== null && letters !== null && letters !== UNAVAILABLE && !letters.includes(letter);
  return {
    ...pageMetadata({
      title: `${BROWSE_HEADINGS[slug]}${letter ? ` starting with ${letter.toUpperCase()}` : ""} · Lore archive`,
      description: `${BROWSE_HEADINGS[slug]} from the Warcraft Wiki as of November 2023, CC BY-SA 4.0, by name. Not WoW: Forever data.`,
      path: letterUrl(slug, letter ?? "a"),
    }),
    robots: { index: typed === true && clean && !emptyLetter, follow: true },
  };
}

export default async function BrowsePage(props: Props) {
  const { type } = await props.params;
  const query = firstValues(await props.searchParams);
  const slug = slugOf(type);
  if (!slug) notFound();
  const letter = letterOf(query);
  if (letter === undefined) notFound();
  const heading = BROWSE_HEADINGS[slug];
  const label = "Lore archive · Warcraft Wiki, 2023 dump";
  const typed = hasTypes();

  if (typed === UNAVAILABLE) {
    return (
      <article className="space-y-4 max-w-4xl">
        <p className="font-mono text-xs text-muted">{label}</p>
        <h1 className="text-3xl font-bold text-fg">Lore archive unavailable</h1>
        <p className="text-fg-2">{UNAVAILABLE_COPY}</p>
      </article>
    );
  }
  if (!typed) {
    return (
      <article className="space-y-4 max-w-4xl">
        <p className="font-mono text-xs text-muted">{label}</p>
        <h1 className="text-3xl font-bold text-fg">{heading}</h1>
        <p className="text-fg-2">
          {PRE_CLASSIFICATION_COPY} Browsing by type arrives with the next knowledge release. Until then,{" "}
          <Link href="/search" className="text-accent hover:underline underline-offset-4">search the archive</Link>.
        </p>
      </article>
    );
  }

  const storedType = BROWSE_TYPES[slug];
  const filters = filtersOf(query);
  const page = pageNumber(query.page);
  const result = browse(storedType, letter, filters, page);
  const values = facetValues(storedType);
  if (result === UNAVAILABLE || values === UNAVAILABLE) {
    return (
      <article className="space-y-4 max-w-4xl">
        <h1 className="text-3xl font-bold text-fg">Lore archive unavailable</h1>
        <p className="text-fg-2">{UNAVAILABLE_COPY}</p>
      </article>
    );
  }
  const filterQuery = Object.entries(filters).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("");
  const letterQuery = letter ? `letter=${encodeURIComponent(letter)}` : "all=1";
  const pageUrl = (n: number) => `/lore/${slug}?${letterQuery}${filterQuery}${n > 1 ? `&page=${n}` : ""}`;
  const backUrl = letter ? letterUrl(slug, letter) : `/lore/${slug}`;

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">{label}</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{heading}</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          Pages the wiki&apos;s own categories and infoboxes mark as {heading.toLowerCase()}, by name. This archive predates WoW: Forever.
        </p>
      </header>

      <nav aria-label="First letter" className="flex flex-wrap gap-1 text-sm">
        {LETTERS.map((l) => (
          <Link key={l} href={letterUrl(slug, l)} aria-current={l === letter ? "page" : undefined}
            className={`min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg border ${l === letter ? "border-accent text-accent" : "border-edge text-fg-2 hover:text-accent"}`}>
            {l.toUpperCase()}
          </Link>
        ))}
      </nav>

      <BrowseFilters action={`/lore/${slug}`} letter={letter ?? ""} values={values} selected={filters} />

      {result.rows.length === 0 && page > 1 ? (
        <section className="space-y-2 text-sm text-fg-2">
          <p>No more results.</p>
          <p><Link href={backUrl} className="text-accent hover:underline underline-offset-4">Back to the first page</Link></p>
        </section>
      ) : result.rows.length === 0 ? (
        <p className="text-sm text-fg-2">No pages match these filters.</p>
      ) : (
        <section className="space-y-4">
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {result.rows.map((row) => (
              <li key={row.extId}>
                <Link href={`/lore/${loreSlug(row)}`} className="inline-flex items-center min-h-9 text-accent hover:underline underline-offset-4">{row.name}</Link>
              </li>
            ))}
          </ul>
          <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
            {page > 1 && <Link href={pageUrl(page - 1)} className="text-accent hover:underline underline-offset-4">Previous</Link>}
            <span className="text-muted">Page {page}</span>
            {result.hasNext && <Link href={pageUrl(page + 1)} className="text-accent hover:underline underline-offset-4">Next</Link>}
          </nav>
        </section>
      )}

      <p className="text-sm text-muted">
        <Link href="/lore" className="text-accent hover:underline underline-offset-4">About the lore archive</Link>
        {" "}· <Link href="/search" className="text-accent hover:underline underline-offset-4">Search</Link>
      </p>
    </article>
  );
}
