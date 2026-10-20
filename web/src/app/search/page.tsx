import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import LoreSearchForm from "@/components/LoreSearchForm";
import DatabaseResults from "@/components/DatabaseResults";
import { databaseHits } from "@/lib/database-search";
import { Card, Container, Entry, EntryList, LinkTabs, PageHeader, Pager, SectionHeading, SourceLine } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { BROWSE_HEADINGS, BROWSE_TYPES, hasTypes, loreSlug, MAX_QUERY, searchLore, UNAVAILABLE, UNAVAILABLE_COPY, type BrowseSlug, type LoreType } from "@/lib/lore";

/** A `type=` value is one of the stored types; anything else means All. */
function typeOf(raw: string | undefined): LoreType | undefined {
  return raw && (Object.values(BROWSE_TYPES) as string[]).includes(raw) ? (raw as LoreType) : undefined;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Search the Database and Lore Archive", description: "Search the WoW: Forever database for items, NPCs, quests and objects, and the lore archive: the Warcraft Wiki as of November 2023 (CC BY-SA 4.0).", path: "/search" }),
  robots: { index: false, follow: true },
};

function pageNumber(raw: string | undefined): number {
  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
}

function sourceHost(url: string): string {
  try { return new URL(url).hostname; } catch { return "source"; }
}

/** Next hands a repeated parameter over as an array; the first value is the one we answer. */
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const link = "text-accent hover:underline underline-offset-4";

export default async function SearchPage(props: { searchParams: Promise<{ q?: string | string[]; page?: string | string[]; type?: string | string[] }> }) {
  const params = await props.searchParams;
  const q = (first(params.q) ?? "").trim().slice(0, MAX_QUERY);
  const page = pageNumber(first(params.page));
  const typed = hasTypes() === true;
  const type = typed ? typeOf(first(params.type)) : undefined;
  const result = q ? searchLore(q, page, type) : null;
  // Database matches lead the first page only; the pages after it are the archive's.
  const dbHits = q && page === 1 ? await databaseHits(q) : [];
  const typeQuery = type ? `&type=${type}` : "";
  const chips = typed && q
    ? [
        { label: "All", href: `/search?q=${encodeURIComponent(q)}`, current: !type },
        ...(Object.keys(BROWSE_TYPES) as BrowseSlug[]).map((slug) => ({
          label: BROWSE_HEADINGS[slug], href: `/search?q=${encodeURIComponent(q)}&type=${BROWSE_TYPES[slug]}`, current: type === BROWSE_TYPES[slug],
        })),
      ]
    : [];

  return (
    <Container width="reading">
      <article>
        <PageHeader
          trail={trailFor("/search")!}
          title="Search Everloot"
          lede="The WoW: Forever database and the lore archive. Names that match exactly come first."
        />
        <LoreSearchForm query={q} />

        {/* Database matches lead the first page; the lore archive follows. */}
        {dbHits.length > 0 && (
          <div className="mt-12">
            <DatabaseResults hits={dbHits} />
          </div>
        )}

        {/* One section per kind of result, so another source (the database) can sit beside the lore archive. */}
        {result !== null && (
          <section aria-labelledby="lore-results" className="mt-12">
            <SectionHeading id="lore-results">Lore archive</SectionHeading>
            {chips.length > 0 && (
              <div className="mb-6">
                <LinkTabs label="Page type" tabs={chips} />
              </div>
            )}
            {result === UNAVAILABLE ? (
              <Card>
                <p className="font-semibold text-fg">Lore archive unavailable</p>
                <p className="mt-2 text-sm text-fg-2">{UNAVAILABLE_COPY}</p>
              </Card>
            ) : result.hits.length === 0 && page > 1 ? (
              <Card>
                <p className="text-fg-2">No more results.</p>
                <p className="mt-2 text-sm"><Link href={`/search?q=${encodeURIComponent(q)}`} className={link}>Back to the first page</Link></p>
              </Card>
            ) : result.hits.length === 0 ? (
              <Card>
                <p className="text-fg-2">No lore page matches that.</p>
                <p className="mt-2 text-sm text-fg-2">
                  Try the wiki&apos;s own search:{" "}
                  <a href={`https://warcraft.wiki.gg/index.php?search=${encodeURIComponent(q)}`} rel="noopener" className={link}>
                    warcraft.wiki.gg
                  </a>
                </p>
              </Card>
            ) : (
              <>
                <EntryList ordered label="Lore pages, best match first">
                  {result.hits.map((hit) => (
                    <Entry
                      key={hit.id}
                      as="h3"
                      href={`/lore/${loreSlug(hit)}`}
                      title={hit.name}
                      meta={<>{hit.gameVersion === "lore" ? "lore · 2023" : `${hit.gameVersion} · ${hit.sourceId}`} · {sourceHost(hit.sourceUrl)}</>}
                    >
                      <p>{hit.snippet}</p>
                    </Entry>
                  ))}
                </EntryList>
                <Pager
                  label="Search pages"
                  page={page}
                  prevHref={page > 1 ? `/search?q=${encodeURIComponent(q)}${typeQuery}&page=${page - 1}` : null}
                  nextHref={result.hasNext ? `/search?q=${encodeURIComponent(q)}${typeQuery}&page=${page + 1}` : null}
                />
              </>
            )}
          </section>
        )}

        <SourceLine
          source={dbHits.length > 0
            ? <>Database entries from the game files and player reports; lore from the Warcraft Wiki, 13 November 2023, which predates WoW: Forever</>
            : <>Warcraft Wiki, 13 November 2023, which predates WoW: Forever</>}
          licence="Warcraft Wiki contributors, CC BY-SA 4.0"
        >
          <Link href="/lore" className={link}>About the lore archive</Link>
        </SourceLine>
      </article>
    </Container>
  );
}
