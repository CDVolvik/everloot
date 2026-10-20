import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { itemPage } from "../../../../../kb/src/item-page";
import { describe, filterItems, QUALITIES, resolveClass, resolveLegacyClass, resolveSubclass, slotOf, type ItemClass, type ItemRow, type ItemSubclass } from "../../../../../kb/src/item-taxonomy";
import {
  activeFilters, CLIENT_LAYER, CLIENT_TAXONOMY as T, categoryNamedEnough, categoryQuery, itemFacets, ITEMS_PER_PAGE, itemsHref, listItems,
  NAME_SOURCE, shownItemName, toggled, UNRECORDED, type CategoryQuery,
} from "@/lib/items";
import { loadItemSeen } from "@/lib/item-seen";
import { pageMetadata } from "@/lib/seo";
import { loadShownNames } from "@/lib/shown-item-names";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import { Container, DataTable, DataTitle, FilterBar, QUALITY_TEXT, ResultStrip, qualityOf, type Column, type FilterControl } from "@/components/ui";
import type { Crumb } from "@/lib/jsonld";

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

/** The class and subclass a path names (none for /database/items), and the filters; null when any part is unknown. */
function resolve(classSlug: string | undefined, subclassKey: string | undefined, search: Search): { cls: ItemClass | null; sub: ItemSubclass | null; q: CategoryQuery } | null {
  const cls = classSlug === undefined ? null : resolveClass(T, classSlug);
  if (classSlug !== undefined && !cls) return null;
  const sub = subclassKey === undefined || !cls ? null : resolveSubclass(T, cls.id, subclassKey);
  if (subclassKey !== undefined && !sub) return null;
  const q = categoryQuery(search);
  return q ? { cls, sub, q } : null;
}

const subName = (s: ItemSubclass) => s.name ?? `Subclass ${s.id}`;

/** Only the plain list is indexed; a filter, a sort, a name search or a later page is noindex and points its canonical at it. */
const isPlain = (q: CategoryQuery) => activeFilters(q) === 0 && !q.sort && q.page === 1;

export const ALL_ITEMS = {
  title: "WoW Forever items by category",
  description: `Every WoW: Forever item in build ${CLIENT_LAYER.build.version} by class and subclass, read from the game files and unconfirmed until players see it in game.`,
};

export async function categoryMetadata(classSlug: string | undefined, subclassKey: string | undefined, search: Search): Promise<Metadata> {
  const r = resolve(classSlug, subclassKey, search);
  if (!r) return { robots: { index: false, follow: true } };
  if (!r.cls) return { ...pageMetadata({ ...ALL_ITEMS, path: "/database/items" }), ...(isPlain(r.q) ? {} : { robots: { index: false, follow: true } }) };
  const name = r.sub ? `${subName(r.sub)} (${r.cls.label})` : r.cls.label;
  const count = r.sub ? r.sub.items : r.cls.items;
  // Only the plain category page is indexed; filtered and later pages repeat it. And only once half its
  // rows have a name: until then it is a list of "Item N" (the sitemap leaves it out for the same reason).
  const plain = isPlain(r.q);
  const named = plain ? (await loadShownNames()).named : null;
  return {
    ...pageMetadata({
      title: r.sub ? `${name} items` : name,
      description: `${count.toLocaleString("en-US")} WoW: Forever items in ${name}, read from the game files of build ${CLIENT_LAYER.build.version} and unconfirmed until players see them.`,
      path: itemsHref(r.cls.slug, r.sub?.slug),
    }),
    robots: { index: named !== null && categoryNamedEnough(r.cls.id, r.sub?.id, named), follow: true },
  };
}

const plural = (n: number) => `${n.toLocaleString("en-US")} item${n === 1 ? "" : "s"}`;

export async function CategoryPage({ classSlug, subclassKey, search }: { classSlug?: string; subclassKey?: string; search: Search }) {
  const r = resolve(classSlug, subclassKey, search);
  if (!r) {
    const moved = classSlug === undefined ? null : legacyHref(classSlug, subclassKey, search);
    if (moved) permanentRedirect(moved);
    notFound();
  }
  const { cls, sub, q } = r;
  const base = cls ? filterItems(T, { classId: cls.id, subclassId: sub?.id }) : T.items;
  const [{ facts, agreed, matched }, seen] = await Promise.all([loadShownNames(), loadItemSeen()]);
  const nameOf = (id: number) => agreed.get(id) ?? matched?.names.get(id)?.name;
  const rows = listItems(base, q, { name: nameOf, seen: seen.seen });
  const pages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  if (q.page > pages) notFound();
  const shown = rows.slice((q.page - 1) * ITEMS_PER_PAGE, q.page * ITEMS_PER_PAGE);
  // The game file name and icon only for items players reported (3 installs), as on the item page, and for items
  // whose game file name the Warcraft Wiki gives too: a list of every id in the files must not become a list of
  // unreleased item names.
  const reported = facts.unreachable ? [] : shown.map((row) => row[0]).filter((id) => { const p = itemPage(id, facts); return Boolean(p.name || p.drops.length || p.pins.length); });
  const withArt = [...new Set([...reported, ...shown.map((row) => row[0]).filter((id) => matched?.names.has(id))])];
  const assets = withArt.length ? await loadSiteAssets() : null;
  const tips = await loadItemTips(assets, withArt);
  const names = new Map(shown.map((row) => [row[0], shownItemName(row[0], agreed, matched?.names, reported.includes(row[0]) ? tips.get(row[0]) : null)]));
  const icons = [...tips.values()].some((t) => t.icon);
  const here = (over: Partial<CategoryQuery>) => itemsHref(cls?.slug, sub?.slug, { ...q, page: 1, ...over });
  const title = sub ? subName(sub) : cls ? cls.label : "Items";

  const trail: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "Database", path: "/database" },
    { name: "Items", path: "/database/items" },
    ...(cls ? [{ name: cls.label, path: itemsHref(cls.slug) }] : []),
    ...(cls && sub ? [{ name: subName(sub), path: itemsHref(cls.slug, sub.slug) }] : []),
  ];

  const seenAs = (row: ItemRow) => seen.as.get(row[0])?.join(" · ") ?? null;
  const columns: Column<ItemRow>[] = [
    {
      key: "name", header: "Name", sortable: true, cell: (row) => {
        const c = describe(T, row);
        const tip = tips.get(row[0]);
        const name = names.get(row[0]);
        // A shown name carries its own quality colour; otherwise the game files' quality colours the row.
        const colour = name?.color ? "" : c.quality && c.quality.id <= 5 ? QUALITY_TEXT[qualityOf(c.quality.id)] : "text-fg";
        const unconfirmed = name?.source === "files";
        return (
          <span className="flex min-w-0 items-center gap-2">
            {icons && (tip?.icon
              // A name only the game files give is unconfirmed: a dashed edge on its icon, said in words to a screen reader.
              ? <span className={`shrink-0 rounded-sm ${unconfirmed ? "outline-dashed outline-1 outline-offset-1 outline-muted" : ""}`} title={unconfirmed ? "From the game files, not yet confirmed by players" : undefined}><GameIcon src={tip.icon} size={24} /></span>
              : <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-sm border border-line" />)}
            <span className="min-w-0">
              <Link href={`/database/items/${row[0]}`} className={`${colour} hover:underline underline-offset-4`} style={name?.color ? { color: name.color } : undefined}>{name?.name ?? `Item ${row[0]}`}</Link>
              {unconfirmed && <span className="sr-only"> (unconfirmed)</span>}
              {name?.wikiPage
                ? <a href={name.wikiPage} className="block text-cell-2 text-muted hover:underline underline-offset-4">{NAME_SOURCE.wiki}</a>
                : name?.source === "players" ? <span className="block text-cell-2 text-muted">{NAME_SOURCE.players}</span> : null}
            </span>
          </span>
        );
      },
    },
    ...(sub ? [] : [{ key: "type", header: "Type", sortable: true, cell: (row: ItemRow) => describe(T, row).subclass?.name ?? "None" }]),
    { key: "slot", header: "Slot", sortable: true, cell: (row) => slotOf(row[3])?.name ?? <span className="text-muted">—</span> },
    { key: "seen", header: "Seen as", sortable: true, cell: (row) => seenAs(row) ?? <span className="text-muted">—</span> },
    { key: "id", header: "ID", numeric: true, sortable: true, cell: (row) => row[0] },
  ];

  // Choices with their counts in this category, so a menu never offers an empty list.
  const counted = <K,>(key: (row: ItemRow) => K) => { const m = new Map<K, number>(); for (const row of base) m.set(key(row), (m.get(key(row)) ?? 0) + 1); return m; };
  const slots = counted((row) => slotOf(row[3])?.slug ?? null);
  const qualities = counted((row) => (row[4] === null ? UNRECORDED : QUALITIES[row[4]]?.slug ?? UNRECORDED));
  const facets = itemFacets();
  const inBase = (set: Set<number>) => base.reduce((n, row) => n + Number(set.has(row[0])), 0);
  const skills = facets.professions.map((p) => ({ ...p, count: inBase(facets.bySkill.get(p.id)!) })).filter((p) => p.count > 0);
  const slotNames = new Map(base.map((row) => slotOf(row[3])).filter((s) => s !== null).map((s) => [s!.slug, s!.name]));
  const toggle = (key: "crafted" | "reagent" | "set" | "seen", label: string, count: number): FilterControl[] =>
    count > 0 || q[key] ? [{ type: "toggle", key, label, href: here({ [key]: q[key] ? undefined : true }), on: Boolean(q[key]) }] : [];

  const controls: FilterControl[] = [
    {
      type: "menu", key: "class", label: "Class",
      options: [
        { label: "All classes", href: itemsHref(undefined, undefined, { ...q, page: 1 }), on: !cls, reset: true, count: T.items.length },
        ...T.classes.filter((c) => c.items > 0).map((c) => ({ label: c.label, href: itemsHref(c.slug, undefined, { ...q, page: 1 }), on: c.id === cls?.id, count: c.items })),
      ],
    },
    ...(cls ? [{
      type: "menu" as const, key: "type", label: "Type",
      options: [
        { label: `All ${cls.label.toLowerCase()}`, href: itemsHref(cls.slug, undefined, { ...q, page: 1 }), on: !sub, reset: true, count: cls.items },
        ...T.subclasses.filter((s) => s.classId === cls.id && s.items > 0).map((s) => ({ label: subName(s), href: itemsHref(cls.slug, s.slug, { ...q, page: 1 }), on: s.id === sub?.id, count: s.items })),
      ],
    }] : []),
    {
      type: "menu", key: "slot", label: "Slot", multi: true,
      options: [...slotNames].map(([slug, name]) => ({ label: name, href: itemsHref(cls?.slug, sub?.slug, toggled(q, "slot", slug)), on: Boolean(q.slot?.includes(slug)), count: slots.get(slug) ?? 0 })),
    },
    {
      type: "menu", key: "quality", label: "Quality", multi: true,
      options: [...QUALITIES.filter((x) => qualities.has(x.slug)).map((x) => ({
        label: x.name, className: x.id <= 5 ? QUALITY_TEXT[qualityOf(x.id)] : undefined,
        href: itemsHref(cls?.slug, sub?.slug, toggled(q, "quality", x.slug)), on: Boolean(q.quality?.includes(x.slug)), count: qualities.get(x.slug) ?? 0,
      })), ...(qualities.has(UNRECORDED) ? [{
        label: "Unrecorded", href: itemsHref(cls?.slug, sub?.slug, toggled(q, "quality", UNRECORDED)), on: Boolean(q.quality?.includes(UNRECORDED)), count: qualities.get(UNRECORDED) ?? 0,
      }] : [])],
    },
    ...(skills.length ? [{
      type: "menu" as const, key: "skill", label: "Profession",
      options: [
        { label: "Any profession", href: here({ skill: undefined }), on: !q.skill, reset: true },
        ...skills.map((p) => ({ label: p.name, href: here({ skill: p.slug }), on: q.skill === p.slug, count: p.count })),
      ],
    }] : []),
    ...toggle("crafted", "Crafted", inBase(facets.crafted)),
    ...toggle("reagent", "Reagent", inBase(facets.reagent)),
    ...toggle("set", "Set piece", inBase(facets.set)),
    ...toggle("seen", "Seen by players", seen.seen.size),
  ];
  // The name box keeps every other filter (not the page) as hidden fields.
  const keep = Object.fromEntries(new URLSearchParams(itemsHref(undefined, undefined, { ...q, q: undefined, page: 1 }).split("?")[1] ?? ""));
  const pageHref = (page: number) => itemsHref(cls?.slug, sub?.slug, { ...q, page });
  const strip = <ResultStrip total={rows.length} noun={rows.length === 1 ? "item" : "items"} page={q.page} perPage={ITEMS_PER_PAGE} href={pageHref} label="Item pages" />;
  const active = activeFilters(q);

  const chips = [
    ...(q.q ? [{ label: `Name: ${q.q}`, href: here({ q: undefined }) }] : []),
    ...(q.slot ?? []).map((s) => ({ label: slotNames.get(s) ?? s, href: itemsHref(cls?.slug, sub?.slug, toggled(q, "slot", s)) })),
    ...(q.quality ?? []).map((s) => ({ label: QUALITIES.find((x) => x.slug === s)?.name ?? "Unrecorded", href: itemsHref(cls?.slug, sub?.slug, toggled(q, "quality", s)) })),
    ...(q.skill ? [{ label: facets.professions.find((p) => p.slug === q.skill)?.name ?? q.skill, href: here({ skill: undefined }) }] : []),
    ...(q.crafted ? [{ label: "Crafted", href: here({ crafted: undefined }) }] : []),
    ...(q.reagent ? [{ label: "Reagent", href: here({ reagent: undefined }) }] : []),
    ...(q.set ? [{ label: "Set piece", href: here({ set: undefined }) }] : []),
    ...(q.seen ? [{ label: "Seen by players", href: here({ seen: undefined }) }] : []),
  ];
  const empty = active > 0 ? (
    <div className="flex flex-wrap items-center gap-2 py-4 text-cell text-fg-2">
      <span>No items match these filters.</span>
      {chips.map((c) => (
        <Link key={c.href} href={c.href} className="inline-flex h-6 items-center gap-1 rounded-full border border-edge px-2 text-cell-2 text-fg-2 hover:border-fg-2 hover:text-fg">
          {c.label}<span aria-hidden="true">×</span><span className="sr-only">(remove)</span>
        </Link>
      ))}
      <Link href={itemsHref(cls?.slug, sub?.slug)} className="text-accent hover:underline underline-offset-4">Clear filters</Link>
    </div>
  ) : <p className="py-4 text-cell text-fg-2">No items in this category.</p>;

  return (
    <Container width="data">
      <article>
        <DataTitle title={title} trail={trail} aside={strip} />
        <FilterBar
          label="Item filters"
          search={{ action: itemsHref(cls?.slug, sub?.slug), value: q.q, placeholder: "Name or id", label: "Filter by name or id", keep }}
          controls={controls}
          active={active}
          clearHref={itemsHref(cls?.slug, sub?.slug)}
        />
        <div className="mt-2">
          <DataTable
            dense
            caption={`${title}: ${plural(rows.length)}`}
            columns={columns}
            rows={shown}
            rowKey={(row) => String(row[0])}
            sort={q.sort ? { key: q.sort.key, direction: q.sort.desc ? "desc" : "asc" } : { key: "id", direction: "asc" }}
            sortHref={(key, dir) => here({ sort: key === "id" && dir === "asc" ? undefined : { key: key as NonNullable<CategoryQuery["sort"]>["key"], desc: dir === "desc" } })}
            meta={(row) => [slotOf(row[3])?.name, sub ? null : describe(T, row).subclass?.name, seenAs(row)].filter(Boolean).join(" · ")}
            empty={empty}
          />
        </div>
        {pages > 1 && <div className="mt-2">{strip}</div>}
      </article>
    </Container>
  );
}
