import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { GAME_DATA_CREDIT } from "@everloot/protocol";
import { agreedItemNames, itemPage } from "../../../../../kb/src/item-page";
import { describe, filterItems, QUALITIES, resolveClass, resolveLegacyClass, resolveSubclass, slotOf, type ItemClass, type ItemRow, type ItemSubclass } from "../../../../../kb/src/item-taxonomy";
import { CLIENT_LAYER, CLIENT_TAXONOMY as T, categoryNamedEnough, categoryQuery, ITEMS_PER_PAGE, itemsHref, type CategoryQuery } from "@/lib/items";
import { pageMetadata } from "@/lib/seo";
import { loadItemFacts } from "@/lib/rollup-compute";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import GameCredit from "@/components/game/GameCredit";
import { Container, DataTable, PageHeader, QUALITY_TEXT, SourceLine, qualityOf, type Column } from "@/components/ui";
import type { Crumb } from "@/lib/jsonld";
import { LINK } from "../entity";

type Search = Record<string, string | string[] | undefined>;

/** The first category URLs used the client's singular names (/database/items/weapon); they move to the plural ones for good. */
function legacyHref(classSlug: string, subclassKey: string | undefined, search: Search): string | null {
  const cls = resolveLegacyClass(T, classSlug);
  if (!cls) return null;
  const sub = subclassKey === undefined ? null : resolveSubclass(T, cls.id, subclassKey);
  if (subclassKey !== undefined && !sub) return null;
  const q = categoryQuery(search);
  return q ? itemsHref(cls.slug, sub?.slug, q) : null;
}

/** The class and subclass a path names, and the filters; null when any part is unknown. */
function resolve(classSlug: string, subclassKey: string | undefined, search: Search): { cls: ItemClass; sub: ItemSubclass | null; q: CategoryQuery } | null {
  const cls = resolveClass(T, classSlug);
  if (!cls) return null;
  const sub = subclassKey === undefined ? null : resolveSubclass(T, cls.id, subclassKey);
  if (subclassKey !== undefined && !sub) return null;
  const q = categoryQuery(search);
  return q ? { cls, sub, q } : null;
}

const subName = (s: ItemSubclass) => s.name ?? `Subclass ${s.id}`;

export async function categoryMetadata(classSlug: string, subclassKey: string | undefined, search: Search): Promise<Metadata> {
  const r = resolve(classSlug, subclassKey, search);
  if (!r) return { robots: { index: false, follow: true } };
  const name = r.sub ? `${subName(r.sub)} (${r.cls.label})` : r.cls.label;
  const count = r.sub ? r.sub.items : r.cls.items;
  // Only the plain category page is indexed; filtered and later pages repeat it. And only once half its
  // rows have a name: until then it is a list of "Item N" (the sitemap leaves it out for the same reason).
  const plain = !r.q.slot && !r.q.quality && r.q.page === 1;
  const facts = plain ? await loadItemFacts() : null;
  const named = facts && !facts.unreachable ? agreedItemNames(facts) : new Map<number, string>();
  return {
    ...pageMetadata({
      title: r.sub ? `${name} items` : name,
      description: `${count.toLocaleString("en-US")} WoW: Forever items in ${name}, read from the game files of build ${CLIENT_LAYER.build.version} and unconfirmed until players see them.`,
      path: itemsHref(r.cls.slug, r.sub?.slug),
    }),
    robots: { index: plain && categoryNamedEnough(r.cls.id, r.sub?.id, named), follow: true },
  };
}

interface FilterOption { slug: string; name: string; count?: number }

/**
 * One row of quiet tabs above the table, each a link (the filters live in the URL). `current` undefined is All.
 * Drawn like the shared Tabs so the table's toolbar reads as one control.
 */
function FilterTabs({ label, options, current, href, allHref }: { label: string; options: FilterOption[]; current?: string; href: (slug: string) => string; allHref: string }) {
  if (options.length < 2) return null;
  const item = "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm";
  const all: FilterOption & { href: string } = { slug: "", name: "All", href: allHref };
  return (
    <nav aria-label={label} className="flex items-center gap-1 overflow-x-auto px-2 [&+nav]:border-t [&+nav]:border-line">
      <span className="shrink-0 px-2 font-mono text-xs text-muted">{label}</span>
      {[all, ...options.map((o) => ({ ...o, href: href(o.slug) }))].map((o) => {
        const on = (o.slug || undefined) === current;
        const count = o.count !== undefined && <span className="font-mono text-xs tabular-nums text-muted">{o.count.toLocaleString("en-US")}</span>;
        return on
          ? <span key={o.slug || "all"} aria-current="page" className={`${item} border-accent font-medium text-fg`}>{o.name}{count}</span>
          : <Link key={o.slug || "all"} href={o.href} className={`${item} border-transparent text-fg-2 hover:text-fg`}>{o.name}{count}</Link>;
      })}
    </nav>
  );
}

export async function CategoryPage({ classSlug, subclassKey, search }: { classSlug: string; subclassKey?: string; search: Search }) {
  const r = resolve(classSlug, subclassKey, search);
  if (!r) {
    const moved = legacyHref(classSlug, subclassKey, search);
    if (moved) permanentRedirect(moved);
    notFound();
  }
  const { cls, sub, q } = r;
  const inCategory = filterItems(T, { classId: cls.id, subclassId: sub?.id });
  const rows = filterItems(T, { classId: cls.id, subclassId: sub?.id, slot: q.slot, quality: q.quality });
  const pages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  if (q.page > pages) notFound();
  const shown = rows.slice((q.page - 1) * ITEMS_PER_PAGE, q.page * ITEMS_PER_PAGE);
  const facts = await loadItemFacts();
  // The game file name and icon only for items players reported (3 installs), as on the item page: a list of
  // every id in the files must not become a list of unreleased item names.
  const reported = facts.unreachable ? [] : shown.map((row) => row[0]).filter((id) => { const p = itemPage(id, facts); return Boolean(p.name || p.drops.length || p.pins.length); });
  const assets = reported.length ? await loadSiteAssets() : null;
  const tips = await loadItemTips(assets, reported);
  const slots = [...new Map(inCategory.map((x) => slotOf(x[3])).filter((s) => s !== null).map((s) => [s!.slug, { slug: s!.slug, name: s!.name }])).values()];
  const qualities = QUALITIES.filter((qq) => inCategory.some((x) => x[4] === qq.id)).map((qq) => ({ slug: qq.slug, name: qq.name }));
  const subclasses = T.subclasses.filter((s) => s.classId === cls.id && s.items > 0);
  const here = (over: Partial<CategoryQuery>) => itemsHref(cls.slug, sub?.slug, { ...q, page: 1, ...over });
  const title = sub ? subName(sub) : cls.label;
  const icons = [...tips.values()].some((t) => t.icon);

  const trail: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "Database", path: "/database" },
    { name: "Items", path: "/database/items" },
    { name: cls.label, path: itemsHref(cls.slug) },
    ...(sub ? [{ name: subName(sub), path: itemsHref(cls.slug, sub.slug) }] : []),
  ];

  const columns: Column<ItemRow>[] = [
    {
      key: "item", header: "Item", nowrap: true, cell: (row) => {
        const c = describe(T, row);
        const tip = tips.get(row[0]);
        const name = (facts.unreachable ? null : itemPage(row[0], facts).name) ?? tip?.name ?? null;
        const colour = c.quality && c.quality.id <= 5 ? QUALITY_TEXT[qualityOf(c.quality.id)] : "text-fg";
        return (
          <span className="inline-flex items-center gap-2">
            {tip?.icon ? <GameIcon src={tip.icon} size={20} /> : null}
            <Link href={`/database/items/${row[0]}`} className={`${colour} hover:underline underline-offset-4`}>{name ?? `Item ${row[0]}`}</Link>
          </span>
        );
      },
    },
    ...(sub ? [] : [{ key: "subclass", header: "Subclass", cell: (row: ItemRow) => describe(T, row).subclass?.name ?? "None" }]),
    { key: "slot", header: "Slot", cell: (row) => describe(T, row).slot?.name ?? "None" },
    { key: "quality", header: "Quality", cell: (row) => describe(T, row).quality?.name ?? "unrecorded" },
    { key: "id", header: "ID", numeric: true, cell: (row) => row[0] },
  ];

  const toolbar = (
    <>
      <FilterTabs
        label="Subclass"
        options={subclasses.map((s) => ({ slug: s.slug, name: subName(s), count: s.items }))}
        current={sub?.slug}
        href={(slug) => itemsHref(cls.slug, slug)}
        allHref={itemsHref(cls.slug)}
      />
      <FilterTabs label="Slot" options={slots} current={q.slot} href={(slot) => here({ slot })} allHref={here({ slot: undefined })} />
      <FilterTabs label="Quality" options={qualities} current={q.quality} href={(quality) => here({ quality })} allHref={here({ quality: undefined })} />
    </>
  );

  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={trail}
          title={title}
          meta={<><span className="font-mono tabular-nums">{rows.length.toLocaleString("en-US")} items</span><span>build <span className="font-mono tabular-nums">{CLIENT_LAYER.build.version}</span></span></>}
        />
        <DataTable
          caption={`${title} items`}
          columns={columns}
          rows={shown}
          rowKey={(row) => String(row[0])}
          toolbar={toolbar}
          empty={<p className="px-4 py-8 text-fg-2 sm:px-6">No items in this category match. <Link href={itemsHref(cls.slug, sub?.slug)} className={LINK}>Clear the filters</Link></p>}
          footer={pages > 1 ? (
            <>
              <span>Page {q.page} of {pages}</span>
              <nav aria-label="Pages" className="flex gap-4">
                {q.page > 1 ? <Link href={itemsHref(cls.slug, sub?.slug, { ...q, page: q.page - 1 })} className={LINK}>Previous</Link> : null}
                {q.page < pages ? <Link href={itemsHref(cls.slug, sub?.slug, { ...q, page: q.page + 1 })} className={LINK}>Next</Link> : null}
              </nav>
            </>
          ) : undefined}
        />
        <SourceLine build={CLIENT_LAYER.build.version}>
          Names show once 3 installs report the same one. {GAME_DATA_CREDIT}
          {assets && icons ? <>{" "}<GameCredit as="span" version={assets.version} label={assets.label} /></> : null}
        </SourceLine>
      </article>
    </Container>
  );
}
