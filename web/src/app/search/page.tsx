import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import LoreSearchForm from "@/components/LoreSearchForm";
import { Card, Container, Entry, EntryList, LinkTabs, PageHeader, Pager, SectionHeading, SourceLine } from "@/components/ui";
import { trailFor } from "@/lib/breadcrumbs";
import { BROWSE_HEADINGS, BROWSE_TYPES, hasTypes, loreSlug, MAX_QUERY, searchLore, UNAVAILABLE, UNAVAILABLE_COPY, type BrowseSlug, type LoreType } from "@/lib/lore";
import { siteSearch } from "@/lib/site-search";

/** A `type=` value is one of the stored types; anything else means All. */
function typeOf(raw: string | undefined): LoreType | undefined {
  return raw && (Object.values(BROWSE_TYPES) as string[]).includes(raw) ? (raw as LoreType) : undefined;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "Search Everloot", description: "Search WoW: Forever items, NPCs, quests, zones, lore archive pages and Everloot tools by name or id. An exact match comes first.", path: "/search" }),
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

type Params = { q?: string | string[]; page?: string | string[]; type?: string | string[]; in?: string | string[] };

export default async function SearchPage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  const q = (first(params.q) ?? "").trim().slice(0, MAX_QUERY);
  // `in=lore` is the full lore list (with its type chips and pages) behind the lore group of the overview;
  // the links this page gave out before it searched the whole site (`page=`, `type=`) still open it.
  if (first(params.in) === "lore" || params.page !== undefined || params.type !== undefined) return <LoreResults q={q} params={params} />;

  const groups = q ? await siteSearch(q) : null;
  return (
    <Container width="reading">
      <article>
        <PageHeader
          trail={trailFor("/search")!}
          title="Search Everloot"
          lede="Items, NPCs, quests, zones, lore pages and tools. An exact id or name comes first."
        />
        <LoreSearchForm query={q} label="Search Everloot" placeholder="A name or an id: Thrall, Elwynn Forest, 6948" />

        {groups === null ? null : groups.length === 0 ? (
          <Card className="mt-12">
            <p className="text-fg-2">Nothing matches that. Items, NPCs and quests are searchable once 3 installs agree on a name; an id always opens its page.</p>
          </Card>
        ) : (
          groups.map((group) => (
            <section key={group.type} aria-labelledby={`results-${group.type}`} className="mt-12">
              <SectionHeading
                id={`results-${group.type}`}
                action={group.type === "lore" ? <Link href={`/search?q=${encodeURIComponent(q)}&in=lore`} className={link}>All lore results</Link> : undefined}
              >
                {group.heading}
              </SectionHeading>
              <Card padding="none">
                <ul className="divide-y divide-line">
                  {group.results.map((result) => (
                    <li key={result.href} className="px-4 py-3">
                      <Link href={result.href} className={link}>{result.label}</Link>
                      {result.note && <p className="mt-1 text-sm text-fg-2">{result.note}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))
        )}
      </article>
    </Container>
  );
}

function LoreResults({ q, params }: { q: string; params: Params }) {
  const page = pageNumber(first(params.page));
  const typed = hasTypes() === true;
  const type = typed ? typeOf(first(params.type)) : undefined;
  const result = q ? searchLore(q, page, type) : null;
  const base = `/search?q=${encodeURIComponent(q)}&in=lore`;
  const typeQuery = type ? `&type=${type}` : "";
  const chips = typed && q
    ? [
        { label: "All", href: base, current: !type },
        ...(Object.keys(BROWSE_TYPES) as BrowseSlug[]).map((slug) => ({
          label: BROWSE_HEADINGS[slug], href: `${base}&type=${BROWSE_TYPES[slug]}`, current: type === BROWSE_TYPES[slug],
        })),
      ]
    : [];

  return (
    <Container width="reading">
      <article>
        <PageHeader
          trail={trailFor("/search")!}
          title="Search the lore archive"
          lede="Pages named exactly what you typed come first. Every result links to its wiki source."
        />
        <LoreSearchForm query={q} />

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
                <p className="mt-2 text-sm"><Link href={base} className={link}>Back to the first page</Link></p>
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
                  prevHref={page > 1 ? `${base}${typeQuery}&page=${page - 1}` : null}
                  nextHref={result.hasNext ? `${base}${typeQuery}&page=${page + 1}` : null}
                />
              </>
            )}
          </section>
        )}

        <SourceLine source={<>Warcraft Wiki, 13 November 2023, which predates WoW: Forever</>} licence="Warcraft Wiki contributors, CC BY-SA 4.0">
          <Link href="/lore" className={link}>About the lore archive</Link>
          {q && <>{" · "}<Link href={`/search?q=${encodeURIComponent(q)}`} className={link}>Search all of Everloot</Link></>}
        </SourceLine>
      </article>
    </Container>
  );
}
