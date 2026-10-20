import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { describe, filterItems, QUALITIES, resolveClass, resolveLegacyClass, resolveSubclass, slotOf, type ItemClass, type ItemRow, type ItemSubclass } from "../../../../../kb/src/item-taxonomy";
import {
  activeFilters, BINDINGS, CLIENT_LAYER, CLIENT_TAXONOMY as T, categoryNamedEnough, categoryQuery, itemFacets, ITEM_LEVEL_BRACKETS, ITEMS_PER_PAGE, itemsHref,
  listItems, SOURCES, shownItemName, subclassLabel, toggled, UNRECORDED, type CategoryQuery, type NameSource,
} from "@/lib/items";
import { loadItemSeen } from "@/lib/item-seen";
import { pageMetadata } from "@/lib/seo";
import { loadShownNames } from "@/lib/shown-item-names";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import Badge, { UNCONFIRMED_TITLE } from "@/components/ui/Badge";
import { Container, DataTable, DataTitle, FilterBar, filledColumns, QUALITY_TEXT, ResultStrip, qualityOf, type FilterControl, type SparseColumn } from "@/components/ui";
import type { Crumb } from "@/lib/jsonld";
import { LEVEL_BRACKETS } from "../list-parts";

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

/** The tooltip on a shown name: where it comes from (DATA_POLICY, item names). */
export const NAME_TITLE: Record<NameSource, string> = {
  players: "Name confirmed by players",
  wiki: "Name from the Warcraft Wiki",
  files: UNCONFIRMED_TITLE,
};

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
/** A level range as a menu writes it: "11–20", "81+" for the open top bracket. */
const bracket = (r: { min: number; max: number }) => (r.max >= 999 ? `${r.min}+` : r.min === r.max ? String(r.min) : `${r.min}–${r.max}`);

export async function CategoryPage({ classSlug, subclassKey, search }: { classSlug?: string; subclassKey?: string; search: Search }) {
  const r = resolve(classSlug, subclassKey, search);
  if (!r) {
    const moved = classSlug === undefined ? null : legacyHref(classSlug, subclassKey, search);
    if (moved) permanentRedirect(moved);
    notFound();
  }
  const { cls, sub, q } = r;
  const base = cls ? filterItems(T, { classId: cls.id, subclassId: sub?.id }) : T.items;
  const [{ agreed, matched, showsTip }, seen] = await Promise.all([loadShownNames(), loadItemSeen()]);
  const nameOf = (id: number) => agreed.get(id) ?? matched?.names.get(id)?.name;
  // The game file name, icon and tooltip facts only for items players reported (3 installs) or the item name rule
  // names, as on the item page: a list of every id in the files must not become a list of unreleased items.
  const tipsFor = async (ids: number[]) => loadItemTips(ids.length ? await loadSiteAssets() : null, ids);
  // A level or binding filter or sort reads the facts of every row that may show them; otherwise only this page's.
  const wide = Boolean(q.ilvl || q.req || q.bind) || q.sort?.key === "ilvl" || q.sort?.key === "req";
  const every = wide ? await tipsFor(base.map((row) => row[0]).filter(showsTip)) : null;
  const rows = listItems(base, q, { name: nameOf, seen: seen.seen, sources: (id) => seen.from.get(id), tip: (id) => every?.get(id) });
  const pages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
  if (q.page > pages) notFound();
  const shown = rows.slice((q.page - 1) * ITEMS_PER_PAGE, q.page * ITEMS_PER_PAGE);
  const tips = every ?? await tipsFor(shown.map((row) => row[0]).filter(showsTip));
  const names = new Map(shown.map((row) => [row[0], shownItemName(row[0], agreed, matched?.names, tips.get(row[0]))]));
  const icons = shown.some((row) => tips.get(row[0])?.icon);
  const here = (over: Partial<CategoryQuery>) => itemsHref(cls?.slug, sub?.slug, { ...q, page: 1, ...over });
  const title = sub ? subclassLabel(sub).label : cls ? cls.label : "Items";

  const trail: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "Database", path: "/database" },
    { name: "Items", path: "/database/items" },
    ...(cls ? [{ name: cls.label, path: itemsHref(cls.slug) }] : []),
    ...(cls && sub ? [{ name: subName(sub), path: itemsHref(cls.slug, sub.slug) }] : []),
  ];

  /** Where players have seen the item come from, as compact labels ("Drop, Vendor"). */
  const sourceOf = (row: ItemRow) => seen.from.get(row[0])?.map((x) => SOURCES.find((s) => s.slug === x)!.label).join(", ") ?? null;
  const columns: SparseColumn<ItemRow>[] = [
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
              ? <GameIcon src={tip.icon} size={24} />
              : <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-sm border border-line" />)}
            {/* Where the name comes from is the name's tooltip (and words for a screen reader), never a printed label;
                a name only the game files give carries the quiet unconfirmed marker. */}
            <Link href={`/database/items/${row[0]}`} title={name ? NAME_TITLE[name.source] : undefined} className={`min-w-0 ${colour} hover:underline underline-offset-4`} style={name?.color ? { color: name.color } : undefined}>
              {name?.name ?? `Item ${row[0]}`}
              {name && name.source !== "files" && <span className="sr-only"> ({NAME_TITLE[name.source].toLowerCase()})</span>}
            </Link>
            {unconfirmed && <Badge tone="files" />}
          </span>
        );
      },
    },
    // Levels from the tooltip facts: blank for an item that shows none, and for "no required level".
    { key: "ilvl", header: "Item level", numeric: true, sortable: true, cell: (row) => tips.get(row[0])?.level || <span className="text-muted">—</span> },
    { key: "req", header: "Req. level", numeric: true, sortable: true, cell: (row) => tips.get(row[0])?.required || <span className="text-muted">—</span> },
    ...(sub ? [] : [{ key: "type", header: "Type", sortable: true, cell: (row: ItemRow) => describe(T, row).subclass?.name ?? "None" }]),
    { key: "slot", header: "Slot", sortable: true, cell: (row) => slotOf(row[3])?.name ?? <span className="text-muted">—</span> },
    { key: "seen", header: "Source", sortable: true, cell: (row) => sourceOf(row) ?? <span className="text-muted">—</span>, blank: (row) => !seen.from.has(row[0]) },
    { key: "id", header: "ID", numeric: true, sortable: true, cell: (row) => row[0] },
  ];

  // Choices with their counts in this category, so a menu never offers an empty list.
  const counted = <K,>(key: (row: ItemRow) => K) => { const m = new Map<K, number>(); for (const row of base) m.set(key(row), (m.get(key(row)) ?? 0) + 1); return m; };
  const slots = counted((row) => slotOf(row[3])?.slug ?? null);
  const qualities = counted((row) => (row[4] === null ? UNRECORDED : QUALITIES[row[4]]?.slug ?? UNRECORDED));
  const sourceOptions = SOURCES.map((x) => ({
    label: x.menu, href: itemsHref(cls?.slug, sub?.slug, toggled(q, "src", x.slug)), on: Boolean(q.src?.includes(x.slug)),
    count: base.reduce((n, row) => n + Number(seen.from.get(row[0])?.includes(x.slug) ?? false), 0),
  }))
    .filter((o) => o.count > 0 || o.on);
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
        ...T.subclasses.filter((s) => s.classId === cls.id && s.items > 0).map((s) => ({ label: subclassLabel(s).label, href: itemsHref(cls.slug, s.slug, { ...q, page: 1 }), on: s.id === sub?.id, count: s.items })),
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
    ...(sourceOptions.length ? [{ type: "menu" as const, key: "src", label: "Source", multi: true, options: sourceOptions }] : []),
    {
      type: "menu", key: "ilvl", label: "Item level",
      options: [{ label: "Any item level", href: here({ ilvl: undefined }), on: !q.ilvl, reset: true }, ...ITEM_LEVEL_BRACKETS.map((b) => ({
        label: bracket(b), href: here({ ilvl: b }), on: q.ilvl?.min === b.min && q.ilvl?.max === b.max,
      }))],
    },
    {
      type: "menu", key: "req", label: "Req. level",
      options: [{ label: "Any required level", href: here({ req: undefined }), on: !q.req, reset: true }, ...LEVEL_BRACKETS.map((b) => ({
        label: bracket(b), href: here({ req: b }), on: q.req?.min === b.min && q.req?.max === b.max,
      }))],
    },
    {
      type: "menu", key: "bind", label: "Binding",
      options: [
        { label: "Any binding", href: here({ bind: undefined }), on: !q.bind, reset: true },
        ...BINDINGS.map((b) => ({ label: b.label, href: here({ bind: b.slug }), on: q.bind === b.slug })),
      ],
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
    ...(q.src ?? []).map((s) => ({ label: SOURCES.find((x) => x.slug === s)!.menu, href: itemsHref(cls?.slug, sub?.slug, toggled(q, "src", s)) })),
    ...(q.ilvl ? [{ label: `Item level ${bracket(q.ilvl)}`, href: here({ ilvl: undefined }) }] : []),
    ...(q.req ? [{ label: `Req. level ${bracket(q.req)}`, href: here({ req: undefined }) }] : []),
    ...(q.bind ? [{ label: BINDINGS.find((b) => b.slug === q.bind)?.label ?? q.bind, href: here({ bind: undefined }) }] : []),
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
            // A column with nothing in the whole result (Source, before anyone reports one) is left out.
            columns={filledColumns(columns, rows)}
            rows={shown}
            rowKey={(row) => String(row[0])}
            // The default order (named items first) is no one column, so no header shows an arrow for it.
            sort={q.sort ? { key: q.sort.key, direction: q.sort.desc ? "desc" : "asc" } : undefined}
            sortHref={(key, dir) => here({ sort: { key: key as NonNullable<CategoryQuery["sort"]>["key"], desc: dir === "desc" } })}
            meta={(row) => [tips.get(row[0])?.level ? `Item level ${tips.get(row[0])!.level}` : null, slotOf(row[3])?.name, sub ? null : describe(T, row).subclass?.name, sourceOf(row)].filter(Boolean).join(" · ")}
            empty={empty}
          />
        </div>
        {pages > 1 && <div className="mt-2">{strip}</div>}
      </article>
    </Container>
  );
}
