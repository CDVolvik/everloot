import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { GAME_DATA_CREDIT } from "@everloot/protocol";
import { CLIENT_LABEL } from "../../../../../kb/src/edges";
import { agreedItemNames, itemPage } from "../../../../../kb/src/item-page";
import { describe, filterItems, QUALITIES, resolveClass, resolveLegacyClass, resolveSubclass, slotOf, type ItemClass, type ItemSubclass } from "../../../../../kb/src/item-taxonomy";
import { CLIENT_LAYER, CLIENT_TAXONOMY as T, categoryNamedEnough, categoryQuery, ITEMS_PER_PAGE, itemsHref, type CategoryQuery } from "@/lib/items";
import { pageMetadata } from "@/lib/seo";
import { loadItemFacts } from "@/lib/rollup-compute";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import GameCredit from "@/components/game/GameCredit";

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

function FilterLinks({ label, options, current, href }: { label: string; options: { slug: string; name: string }[]; current?: string; href: (slug?: string) => string }) {
  if (options.length < 2) return null;
  return (
    <p className="text-sm text-fg-2">
      <span className="font-mono text-xs text-muted">{label} </span>
      {[{ slug: undefined, name: "All" }, ...options].map((o, i) => (
        <span key={o.slug ?? "all"}>
          {i > 0 ? " · " : ""}
          {o.slug === current ? <strong className="text-fg">{o.name}</strong> : <Link href={href(o.slug)} className="text-accent hover:underline underline-offset-4">{o.name}</Link>}
        </span>
      ))}
    </p>
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

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="font-mono text-xs text-muted">
          <Link href="/database/items" className="hover:underline underline-offset-4">Items</Link>
          {" › "}
          {sub ? <Link href={itemsHref(cls.slug)} className="hover:underline underline-offset-4">{cls.label}</Link> : cls.label}
          {sub ? <>{" › "}{subName(sub)}</> : null}
        </nav>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{sub ? subName(sub) : cls.label}</h1>
        <p className="text-sm text-muted">{rows.length.toLocaleString("en-US")} items · build {CLIENT_LAYER.build.version}</p>
      </header>

      {!sub && subclasses.length > 0 ? (
        <ul className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {subclasses.map((s) => (
            <li key={s.id}><Link href={itemsHref(cls.slug, s.slug)} className="text-accent hover:underline underline-offset-4">{subName(s)}</Link> <span className="text-muted">{s.items}</span></li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-1">
        <FilterLinks label="Slot" options={slots} current={q.slot} href={(slot) => here({ slot })} />
        <FilterLinks label="Quality" options={qualities} current={q.quality} href={(quality) => here({ quality })} />
      </div>

      {shown.length === 0 ? (
        <p className="text-fg-2">No items in this category match.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel text-xs font-mono text-muted text-left">
                <th className="px-4 py-3">Item</th>
                {sub ? null : <th className="px-4 py-3">Subclass</th>}
                <th className="px-4 py-3">Slot</th>
                <th className="px-4 py-3">Quality</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const c = describe(T, row);
                const tip = tips.get(row[0]);
                const name = (facts.unreachable ? null : itemPage(row[0], facts).name) ?? tip?.name ?? null;
                return (
                  <tr key={row[0]} className="border-t border-line bg-panel text-fg">
                    <td className="px-4 py-2"><span className="inline-flex items-center gap-2">{tip?.icon ? <GameIcon src={tip.icon} size={20} /> : null}<Link href={`/database/items/${row[0]}`} className="text-accent hover:underline underline-offset-4">{name ?? `Item ${row[0]}`}</Link></span></td>
                    {sub ? null : <td className="px-4 py-2">{c.subclass?.name ?? "—"}</td>}
                    <td className="px-4 py-2">{c.slot?.name ?? "—"}</td>
                    <td className="px-4 py-2">{c.quality?.name ?? "unrecorded"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex gap-4 text-sm">
          {q.page > 1 ? <Link href={itemsHref(cls.slug, sub?.slug, { ...q, page: q.page - 1 })} className="text-accent hover:underline underline-offset-4">Previous</Link> : null}
          <span className="text-muted">Page {q.page} of {pages}</span>
          {q.page < pages ? <Link href={itemsHref(cls.slug, sub?.slug, { ...q, page: q.page + 1 })} className="text-accent hover:underline underline-offset-4">Next</Link> : null}
        </nav>
      ) : null}

      {assets && [...tips.values()].some((t) => t.icon) ? <GameCredit version={assets.version} label={assets.label} /> : null}

      <p className="text-xs text-muted">
        Classes, subclasses, slots and qualities are {CLIENT_LABEL.toLowerCase()}: read from build {CLIENT_LAYER.build.version}, not yet seen in play.
        A quality reads unrecorded where the game files hold none we can read. Names are shown only once 3 installs report the same one. {GAME_DATA_CREDIT}
      </p>
    </article>
  );
}
