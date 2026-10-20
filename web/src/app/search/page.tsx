import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import LoreSearchForm from "@/components/LoreSearchForm";
import { Container, DataTable, DataTitle, Entry, EntryList, LinkTabs, Pager, QUALITY_TEXT, SearchBar, qualityOf, type Column } from "@/components/ui";
import { CC_BY_SA } from "@/lib/jsonld";
import { BROWSE_HEADINGS, BROWSE_TYPES, hasTypes, loreSlug, MAX_QUERY, searchLore, UNAVAILABLE, UNAVAILABLE_COPY, type BrowseSlug, type LoreType } from "@/lib/lore";
import { isScope, siteSearch, type Scope, type SearchGroup, type SearchResult } from "@/lib/site-search";
import { loadShownNames } from "@/lib/shown-item-names";

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

/** Rows a scoped search (`in=item`) lists; the overview lists 8 per type. */
const SCOPED_LIMIT = 50;

export default async function SearchPage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  const q = (first(params.q) ?? "").trim().slice(0, MAX_QUERY);
  // `in=lore` is the full lore list (with its type chips and pages) behind the lore group of the overview;
  // the links this page gave out before it searched the whole site (`page=`, `type=`) still open it.
  if (first(params.in) === "lore" || params.page !== undefined || params.type !== undefined) return <LoreResults q={q} params={params} />;
  const scope = isScope(first(params.in)) ? (first(params.in) as Scope) : undefined;

  // Items are found by the name their page shows (players' name, else the game files' name the wiki matches).
  const matched = q && (!scope || scope === "item") ? (await loadShownNames()).matched : null;
  const shownItemNames = matched ? new Map([...matched.names].map(([id, n]) => [id, n.name])) : undefined;
  const groups = q ? await siteSearch(q, { ...(scope ? { only: scope, limit: SCOPED_LIMIT } : {}), shownItemNames }) : null;
  const base = `/search?q=${encodeURIComponent(q)}`;
  const tabs = groups && groups.length > 0 && [
    { label: "All", href: base, current: !scope },
    ...groups.map((g) => ({
      label: g.heading,
      count: g.total,
      href: isScope(g.type) ? `${base}&in=${g.type}` : g.type === "lore" ? `${base}&in=lore` : `${base}#results-${g.type}`,
      current: scope === g.type,
    })),
  ];
  return (
    <Container width="data">
      <article>
        {/* One row on a wide screen: the title, the field and the result tabs, so the first result is in view. */}
        <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="[&>header]:mb-0"><DataTitle title="Search" /></div>
          <div className="w-full max-w-xl sm:flex-1">
            <SearchBar action="/search" id="search-page" label="Search Everloot" placeholder="A name or an id: Thrall, Elwynn Forest, 6948" defaultValue={q} defaultScope={scope ?? ""} compact />
          </div>
          {tabs && <LinkTabs label="Result types" tabs={tabs} />}
        </div>

        {groups === null ? null : groups.length === 0 ? (
          <p className="py-4 text-cell text-fg-2">Nothing matches that. Items, NPCs and quests are searchable once 3 installs agree on a name; an id always opens its page.</p>
        ) : (
          groups.map((group) => <ResultTable key={group.type} group={group} q={q} scoped={Boolean(scope)} />)
        )}
      </article>
    </Container>
  );
}

/** One type's results as a dense table; its heading is the first column's header. */
function ResultTable({ group, q, scoped }: { group: SearchGroup; q: string; scoped: boolean }) {
  const more = group.total > group.results.length;
  const all = isScope(group.type) ? `/search?q=${encodeURIComponent(q)}&in=${group.type}` : group.type === "lore" ? `/search?q=${encodeURIComponent(q)}&in=lore` : null;
  const name = (r: SearchResult) => {
    const colour = group.type === "item" && typeof r.quality === "number" && r.quality <= 5 ? QUALITY_TEXT[qualityOf(r.quality)] : "text-accent";
    return <Link href={r.href} className={`${colour} hover:underline underline-offset-4`}>{r.label}</Link>;
  };
  const columns: Column<SearchResult>[] = [
    { key: "name", header: <>{group.heading} <span className="font-normal tabular-nums">({group.total})</span></>, cell: name },
    { key: "about", header: group.type === "item" ? "Type" : "", cell: (r) => <span className="line-clamp-1 text-fg-2">{group.type === "item" ? r.meta ?? "" : r.id !== undefined ? "" : r.note ?? ""}</span> },
    { key: "id", header: "ID", numeric: true, cell: (r) => r.id ?? "" },
  ];
  return (
    <section id={`results-${group.type}`} aria-labelledby={`results-${group.type}-heading`} className="mb-6 scroll-mt-20">
      <h2 id={`results-${group.type}-heading`} className="sr-only">{group.heading}</h2>
      <DataTable
        dense
        caption={`${group.heading} matching ${q}`}
        columns={columns}
        rows={group.results}
        rowKey={(r) => r.href}
        meta={(r) => (group.type === "item" ? [r.meta, r.id !== undefined && `ID ${r.id}`] : [r.id !== undefined ? `ID ${r.id}` : r.note]).filter(Boolean).join(" · ")}
        footer={more && all && !scoped ? <Link href={all} className={link}>All {group.total} {group.type === "lore" ? "lore results" : group.heading.toLowerCase()}</Link> : undefined}
      />
    </section>
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
    <Container width="data">
      <article className="max-w-reading">
        <DataTitle title="Search the lore archive" />
        <LoreSearchForm query={q} />

        {result !== null && (
          <section aria-labelledby="lore-results" className="mt-6">
            <h2 id="lore-results" className="sr-only">Lore archive</h2>
            {chips.length > 0 && (
              <div className="mb-4">
                <LinkTabs label="Page type" tabs={chips} />
              </div>
            )}
            {result === UNAVAILABLE ? (
              <div className="py-4">
                <p className="font-semibold text-fg">Lore archive unavailable</p>
                <p className="mt-2 text-sm text-fg-2">{UNAVAILABLE_COPY}</p>
              </div>
            ) : result.hits.length === 0 && page > 1 ? (
              <p className="py-4 text-fg-2">No more results. <Link href={base} className={link}>Back to the first page</Link></p>
            ) : result.hits.length === 0 ? (
              <p className="py-4 text-fg-2">
                No lore page matches that. Try the wiki&apos;s own search:{" "}
                <a href={`https://warcraft.wiki.gg/index.php?search=${encodeURIComponent(q)}`} rel="noopener" className={link}>
                  warcraft.wiki.gg
                </a>
              </p>
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

        {/* The one line a lore page keeps (density spec, section 6): the source and the licence it requires. */}
        <p className="mt-6 text-xs text-muted">
          Source: <a href="https://warcraft.wiki.gg" rel="noopener" className={link}>Warcraft Wiki</a>, 13 November 2023,{" "}
          <a href={CC_BY_SA.url} rel="noopener" className={link}>CC BY-SA 4.0</a>
          {" · "}<Link href="/lore" className={link}>About the lore archive</Link>
          {q && <>{" · "}<Link href={`/search?q=${encodeURIComponent(q)}`} className={link}>Search all of Everloot</Link></>}
        </p>
      </article>
    </Container>
  );
}
