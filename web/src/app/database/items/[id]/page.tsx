import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { itemPage } from "../../../../../../kb/src/item-page";
import { loadShownNames } from "@/lib/shown-item-names";
import { loadEdges } from "@/lib/edges";
import { RelationTarget, SameIcon } from "@/components/EntityRelations";
import { pinLink } from "@/lib/world-map";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import { Badge, Container, DataTable, Facts, QUALITY_TEXT, Tabs, TooltipFrame, qualityOf, type Column, type Fact, type TabItem } from "@/components/ui";
import { categoryOf } from "../../../../../../kb/src/item-taxonomy";
import { edgesFrom, evidenceLabel, type Edge, type Rel } from "../../../../../../kb/src/edges";
import { CLIENT_LAYER, CLIENT_TAXONOMY, itemsHref, shownItemName } from "@/lib/items";
import type { Crumb } from "@/lib/jsonld";
import { loadNames, nameOf } from "@/lib/names";
import { loreForEntity } from "@/lib/lore";
import EntityLink from "@/components/EntityLink";
import LoreSection from "@/components/LoreSection";
import { CategoryPage, categoryMetadata } from "../category-page";
import { EmptyTab, EntityHeader, EntityIcon, EntityTop, FREQUENCY, known, LINK, percent, Unreachable } from "../../entity";

const PROFESSIONS = { href: "/tools/professions", label: "Professions" };

/** The segment is an item id, or a class slug (/database/items/weapons): numbers are items, words are classes. */
type Props = { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  if (/^[a-z][a-z0-9-]*$/.test(params.id)) return categoryMetadata(params.id, undefined, (await props.searchParams) ?? {});
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const { facts, agreed, matched } = await loadShownNames();
  const page = itemPage(Number(params.id), facts);
  const name = shownItemName(Number(params.id), agreed, matched?.names);
  const description = name?.source === "wiki"
    ? `${name.name}, a WoW: Forever item. The name is read from the game files of build ${CLIENT_LAYER.build.version}, where the Warcraft Wiki gives the same one; not yet confirmed in play.`
    : "A WoW: Forever item page from corroborated drops, names, and map pins.";
  return {
    ...pageMetadata({ title: name?.name ?? `Item ${params.id}`, description, path: `/database/items/${params.id}` }),
    // Indexed once players have reported the item, or once its name is shown from the game files and the wiki.
    robots: { index: (!facts.unreachable && Boolean(page.name || page.drops.length || page.pins.length)) || name?.source === "wiki", follow: true },
  };
}

/** Who vouches for a relation row: the installs that agree, or (the quiet marker) the game files. */
const evidence = (e: Edge) => (e.evidence === "observed" ? evidenceLabel(e) : <Badge tone="files" />);

export default async function ItemPage(props: Props) {
  const params = await props.params;
  if (/^[a-z][a-z0-9-]*$/.test(params.id)) return CategoryPage({ classSlug: params.id, search: (await props.searchParams) ?? {} });
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const itemId = Number(params.id);
  const [{ facts, agreed, matched, showsTip }, edges] = await Promise.all([loadShownNames(), loadEdges()]);
  const page = itemPage(itemId, facts);
  // Named by players (3 installs agree); the badge and the facts card say so.
  const confirmed = !facts.unreachable && page.name !== null;
  // The name players agree on; else the game file name where the Warcraft Wiki gives the same one; else "Item N".
  const name = shownItemName(itemId, agreed, matched?.names);
  const title = name?.name ?? `Item ${page.itemId}`;
  const seen = !facts.unreachable && Boolean(page.name || page.drops.length || page.pins.length);
  // The game file tooltip only for an item players have reported or whose name shows under the item name rule:
  // any id can be typed into the URL, and an item found only in the files may be unreleased (docs/DATA_POLICY.md).
  const tipped = showsTip(itemId);
  // The manifest is read only when there is art to show: the item's tooltip or the icon of a spell the game
  // files say makes or uses it. An id nobody reported or named and nothing links to reads nothing.
  const spellLinked = edges.client.some((e) => e.fromKind === "item" && e.fromId === itemId && e.toKind === "spell");
  const assets = tipped || spellLinked ? await loadSiteAssets() : null;
  const tip = tipped ? (await loadItemTips(assets, [itemId])).get(itemId) : undefined;
  const spellIcon = (spellId: number) => assets?.spellIcons.get(spellId);
  const category = categoryOf(CLIENT_TAXONOMY, itemId);
  const quality = category?.quality && category.quality.id <= 5 ? qualityOf(category.quality.id) : undefined;
  const names = await loadNames();
  const nameFor = nameOf(names);
  const lore = seen && page.name ? loreForEntity("item", page.name) : null;

  const all = edgesFrom([...edges.observed, ...edges.client], "item", itemId);
  const rel = (r: Rel) => all.filter((e) => e.rel === r);

  const trail: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "Database", path: "/database" },
    { name: "Items", path: "/database/items" },
    ...(category?.class ? [{ name: category.class.label, path: itemsHref(category.class.slug) }] : []),
    ...(category?.class && category.subclass ? [{ name: category.subclass.name ?? `Subclass ${category.subclass.id}`, path: itemsHref(category.class.slug, category.subclass.slug) }] : []),
    { name: title, path: `/database/items/${itemId}` },
  ];

  // The "Seen" column only where some row was seen in play; a tab read wholly from the game files carries
  // the item's own unconfirmed marker instead of one per row.
  const relationColumns = (head: string, rows: Edge[]): Column<Edge>[] => [
    { key: "target", header: head, cell: (e) => <span className="inline-flex flex-wrap items-center gap-1"><RelationTarget edge={e} rel={e.rel} client={edges.client} spellIcon={spellIcon} nameOf={nameFor} /></span> },
    ...(rows.some((e) => e.evidence === "observed") ? [{ key: "source", header: "Seen", cell: evidence, nowrap: true }] : []),
  ];
  // A relation tab from player reports (sold by) empties with the agreement meter; one from the game files
  // (created by, used in) with a plain line and its own link.
  const relationTab = (id: string, label: string, r: Rel, head: string, empty: string, files?: { href: string; label: string }): TabItem => {
    const rows = rel(r);
    return {
      id, label, count: rows.length,
      panel: rows.length
        ? <DataTable caption={`${label}: ${title}`} columns={relationColumns(head, rows)} rows={rows} rowKey={(e) => `${e.evidence}-${e.toKind}-${e.toId}`} />
        : <EmptyTab message={empty} {...(files ? { players: false, action: files } : {})} />,
    };
  };

  const dropColumns: Column<(typeof page.drops)[number]>[] = [
    { key: "source", header: "Source", cell: (d) => (d.sourceNpcId !== undefined
      ? <EntityLink kind="npc" id={d.sourceNpcId} name={names.npcs.get(d.sourceNpcId)} />
      : <EntityLink kind="object" id={d.sourceObjectId!} />) },
    { key: "windows", header: "Loot windows", numeric: true, cell: (d) => d.kills },
    { key: "drops", header: "Drops", numeric: true, cell: (d) => d.drops },
    { key: "rate", header: FREQUENCY, numeric: true, cell: (d) => percent(d.rate) },
    { key: "installs", header: "Install IDs", numeric: true, cell: (d) => d.reporters },
  ];
  const pinColumns: Column<(typeof page.pins)[number]>[] = [
    { key: "npc", header: "NPC", cell: (p) => <EntityLink kind="npc" id={p.npcId} name={p.name ?? names.npcs.get(p.npcId)} /> },
    { key: "map", header: "Map", numeric: true, cell: (p) => p.mapId },
    { key: "at", header: "Position", numeric: true, cell: (p) => `${p.x}, ${p.y}` },
    { key: "installs", header: "Reporters", numeric: true, cell: (p) => p.reporters },
    { key: "show", header: "", cell: (p) => { const href = pinLink(p.mapId, p.x, p.y); return href ? <Link href={href} className={LINK}>Show on the map</Link> : null; } },
  ];

  const related = [...rel("part_of_set"), ...rel("same_icon")];
  const tabs: TabItem[] = [
    {
      id: "dropped-by", label: "Dropped by", count: facts.unreachable ? undefined : page.drops.length,
      panel: facts.unreachable ? <Unreachable />
        : page.drops.length ? <DataTable caption={`Where ${title} drops`} columns={dropColumns} rows={page.drops} rowKey={(d) => d.source} />
        : <EmptyTab message="Nobody has looted this in Forever yet." />,
    },
    relationTab("sold-by", "Sold by", "sold_by", "Vendor", "No vendor seen selling this yet."),
    relationTab("created-by", "Created by", "created_by", "Recipe", "No recipe makes this.", PROFESSIONS),
    relationTab("used-in", "Used in", "reagent_for", "Recipe", "No recipe uses this.", PROFESSIONS),
    ...(rel("reward_from").length ? [relationTab("reward-from", "Reward from", "reward_from", "Quest", "")] : []),
    ...(page.pins.length ? [{
      id: "map", label: "Map", count: page.pins.length,
      panel: <DataTable caption={`Where ${title} is found on the map`} columns={pinColumns} rows={page.pins} rowKey={(p) => `${p.npcId}-${p.mapId}`} />,
    }] : []),
    ...(related.length ? [{
      id: "related", label: "Related", count: related.length,
      panel: (
        <DataTable
          caption={`Items related to ${title}`}
          columns={[
            { key: "what", header: "Relation", nowrap: true, cell: (e: Edge) => (e.rel === "same_icon" ? "Same icon" : "Part of set") },
            { key: "target", header: "With", cell: (e: Edge) => (e.rel === "same_icon" ? <SameIcon edge={e} self={itemId} client={edges.client} /> : <RelationTarget edge={e} rel={e.rel} client={edges.client} nameOf={nameFor} />) },
          ]}
          rows={related}
          rowKey={(e) => `${e.rel}-${e.toId}`}
        />
      ),
    }] : []),
  ];

  const tooltipLines = tip
    ? [...tip.lines, ...(tip.partial ? ["[?] marks a value the game files do not give us yet."] : [])]
    : [category?.subclass?.name ?? category?.class?.label, category?.slot?.name].filter((l): l is string => Boolean(l));
  // The quality colour only where the name is shown from players or the wiki: an id nobody reported stays plain.
  const shownQuality = name ? quality : undefined;
  const subclassLabel = category?.subclass ? category.subclass.name ?? `Subclass ${category.subclass.id}` : undefined;

  const quickFacts: Fact[] = [
    ...(category ? [
      { label: "Class", value: category.class ? <Link href={itemsHref(category.class.slug)} className={LINK}>{category.class.label}</Link> : known(null) },
      { label: "Subclass", value: category.class && category.subclass ? <Link href={itemsHref(category.class.slug, category.subclass.slug)} className={LINK}>{subclassLabel}</Link> : known(null) },
      { label: "Slot", value: category.slot?.name ?? "None" },
      { label: "Quality", value: category.quality ? <span className={shownQuality ? QUALITY_TEXT[shownQuality] : undefined}>{category.quality.name}</span> : known(null) },
    ] : [{ label: "Game files", value: "Not found" }]),
    ...(facts.unreachable ? [] : [
      { label: "Reported name", value: known(page.name) },
      { label: "Drop sources", value: known(page.drops.length || null), numeric: true },
      { label: "Map positions", value: known(page.pins.length || null), numeric: true },
    ]),
  ];

  return (
    <Container width="data">
      <article>
        <EntityHeader
          trail={trail}
          title={title}
          quality={shownQuality}
          icon={<EntityIcon src={tip?.icon} unconfirmed={!confirmed} />}
          meta={[category?.class?.label, subclassLabel, name ? <span className="tabular-nums">ID {itemId}</span> : null]}
        />
        <EntityTop
          box={
            <TooltipFrame name={tip?.name ?? title} quality={tip ? quality : undefined} label={`${tip?.name ?? title}, from the game files`}>
              {tooltipLines.map((line, i) => <p key={i}>{line}</p>)}
            </TooltipFrame>
          }
          facts={<Facts layout="list" label={`${title}: quick facts`} items={quickFacts} />}
        />
        <Tabs label={`${title}: relations`} tabs={tabs} />
        <div className="mt-6 space-y-6 empty:hidden">
          <LoreSection match={lore} />
          {!facts.unreachable && (page.name !== null || page.drops.length > 0) && <AdSlot slot="inContent" />}
        </div>
      </article>
    </Container>
  );
}
