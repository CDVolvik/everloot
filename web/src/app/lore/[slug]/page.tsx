import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BROWSE_HEADINGS, BROWSE_TYPES, CONVERSION_NOTE, FACET_KEYS, firstSentence, isIndexable, loreByExtId, loreSlug, parseLoreSlug, renderBody, UNAVAILABLE, UNAVAILABLE_COPY, type BrowseSlug, type LorePage as Lore } from "@/lib/lore";

const FACET_LABELS = { expansion: "Expansion", profession: "Profession", class: "Class", race: "Race", zone: "Zone", faction: "Faction" } as const;

/** The browse slug for a stored type, or null for `other` and untyped rows. */
function browseSlug(type: Lore["type"]): BrowseSlug | null {
  const entry = (Object.entries(BROWSE_TYPES) as [BrowseSlug, string][]).find(([, t]) => t === type);
  return entry ? entry[0] : null;
}

// Rendered per request: an ISR cache would keep a transient "unavailable" answer (and its noindex) for a day.
export const dynamic = "force-dynamic";

const UNAVAILABLE_TITLE = "Lore archive unavailable";

function label(page: Lore): string {
  return page.sourceId === "warcraft-wiki-2023" ? "Lore archive · Warcraft Wiki, 2023 dump" : `Lore archive · ${page.sourceId} · ${page.gameVersion}`;
}

function lookup(slug: string): Lore | null | typeof UNAVAILABLE {
  const parsed = parseLoreSlug(slug);
  return parsed ? loreByExtId(parsed.extId) : null;
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const page = lookup(slug);
  if (page === UNAVAILABLE) return { title: UNAVAILABLE_TITLE, robots: { index: false, follow: true } };
  if (!page) return { robots: { index: false, follow: true } };
  const description = firstSentence(page.body);
  const url = `/lore/${loreSlug(page)}`;
  return {
    title: `${page.name} · Lore archive`,
    description,
    alternates: { canonical: url },
    robots: { index: isIndexable(page.body), follow: true },
    openGraph: { type: "article", title: page.name, description, url, siteName: "Everloot" },
    twitter: { card: "summary", title: page.name, description },
  };
}

export default async function LorePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const parsed = parseLoreSlug(slug);
  if (!parsed) notFound();
  const page = loreByExtId(parsed.extId);
  if (page === UNAVAILABLE) {
    return (
      <article className="space-y-4 max-w-4xl">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">Lore archive</p>
        <h1 className="font-display text-3xl font-bold text-parchment-100">{UNAVAILABLE_TITLE}</h1>
        <p className="text-parchment-100/75">{UNAVAILABLE_COPY}</p>
      </article>
    );
  }
  if (!page) notFound();
  if (slug !== loreSlug(page)) permanentRedirect(`/lore/${loreSlug(page)}`);

  const blocks = renderBody(page.body);
  const wiki = page.sourceId === "warcraft-wiki-2023";
  const revised = page.revisionTimestamp ? page.revisionTimestamp.slice(0, 10) : null;
  const typeSlug = browseSlug(page.type);
  const facetLinks = typeSlug && page.facets
    ? FACET_KEYS.flatMap((key) => page.facets![key].map((value) => ({ key, value, href: `/lore/${typeSlug}?${key}=${encodeURIComponent(value)}` })))
    : [];
  const infoboxEntries = page.infobox ? Object.entries(page.infobox.fields) : [];
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">{label(page)}</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">{page.name}</h1>
        {revised && <p className="text-sm text-parchment-100/60">Last wiki revision {revised}</p>}
        {typeSlug && (
          <ul className="flex flex-wrap gap-2 text-xs">
            <li><Link href={`/lore/${typeSlug}`} className="rounded-full border border-gold-400/40 px-3 py-1 text-gold-400 hover:underline underline-offset-4">{BROWSE_HEADINGS[typeSlug]}</Link></li>
            {facetLinks.map((f) => (
              <li key={`${f.key}:${f.value}`}>
                <Link href={f.href} className="rounded-full border border-parchment-100/15 px-3 py-1 text-parchment-100/70 hover:text-gold-400">
                  {FACET_LABELS[f.key]}: {f.value}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </header>

      <section className="space-y-4 text-parchment-100/85 leading-relaxed">
        {blocks.map((block, i) =>
          block.type === "p" ? (
            <p key={i}>{block.text}</p>
          ) : (
            <ul key={i} className="list-disc pl-6 space-y-1">
              {block.items.map((item, j) => <li key={j}>{item}</li>)}
            </ul>
          ),
        )}
      </section>

      {infoboxEntries.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg text-parchment-100">Details from the wiki infobox</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            {infoboxEntries.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-parchment-100/60">{key}</dt><dd className="text-parchment-100/85">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-parchment-100/60">As written on the wiki in 2023; values are not interpreted and are not Forever data.</p>
        </section>
      )}

      {page.categories.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-lg text-parchment-100">Categories</h2>
          <ul className="flex flex-wrap gap-2 text-xs">
            {page.categories.map((c) => (
              <li key={c} className="rounded-full border border-parchment-100/15 px-3 py-1 text-parchment-100/70">{c}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-parchment-100/10 bg-parchment-900 p-5 text-sm text-parchment-100/75 space-y-2">
        <h2 className="font-display text-lg text-parchment-100">Source</h2>
        <p>
          <a href={page.sourceUrl} rel="noopener" className="text-gold-400 hover:underline underline-offset-4 break-all">{page.sourceUrl}</a>
          {" "}· retrieved {page.retrievedAt} · {page.licence.replace("CC-BY-SA-4.0", "CC BY-SA 4.0")}
        </p>
        {wiki && <p>{CONVERSION_NOTE}</p>}
      </section>

      <p className="text-sm text-parchment-100/60">
        {wiki && <>This archive predates WoW: Forever. For collected gameplay facts see the{" "}
        <Link href="/database" className="text-gold-400 hover:underline underline-offset-4">Forever database</Link>.{" "}</>}
        <Link href="/search" className="text-gold-400 hover:underline underline-offset-4">Search the archive</Link>.
      </p>
    </article>
  );
}
