import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GAME_DATA_CREDIT } from "@everloot/protocol";
import { itemPage } from "../../../../../../kb/src/item-page";
import { loadItemFacts } from "@/lib/rollup-compute";
import { loadEdges } from "@/lib/edges";
import { RelationTarget, SameIcon } from "@/components/EntityRelations";
import { pinLink } from "@/lib/world-map";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import GameIcon from "@/components/game/GameIcon";
import GameCredit from "@/components/game/GameCredit";
import { Badge, Container, DataTable, EmptyState, PageHeader, QUALITY_TEXT, SourceLine, Tabs, TooltipFrame, qualityOf, type Column, type TabItem } from "@/components/ui";
import { categoryOf } from "../../../../../../kb/src/item-taxonomy";
import { edgesFrom, evidenceLabel, type Edge, type Rel } from "../../../../../../kb/src/edges";
import { CLIENT_LAYER, CLIENT_TAXONOMY, itemsHref } from "@/lib/items";
import type { Crumb } from "@/lib/jsonld";
import { CategoryPage, categoryMetadata } from "../category-page";
import { EntityLayout, FactsCard, LINK, percent, Unreachable } from "../../entity";

/** The segment is an item id, or a class slug (/database/items/weapons): numbers are items, words are classes. */
type Props = { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  if (/^[a-z][a-z0-9-]*$/.test(params.id)) return categoryMetadata(params.id, undefined, (await props.searchParams) ?? {});
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadItemFacts();
  const page = itemPage(Number(params.id), facts);
  return {
    ...pageMetadata({ title: !facts.unreachable && page.name ? page.name : `Item ${params.id}`, description: "A WoW: Forever item page from corroborated drops, names, and map pins.", path: `/database/items/${params.id}` }),
    robots: { index: !facts.unreachable && Boolean(page.name || page.drops.length || page.pins.length), follow: true },
  };
}

const BUILD = CLIENT_LAYER.build.version;

/** Who vouches for a relation row: the installs that agree, or the game files. */
const evidence = (e: Edge) => (e.evidence === "observed" ? evidenceLabel(e) : "Game files");

export default async function ItemPage(props: Props) {
  const params = await props.params;
  if (/^[a-z][a-z0-9-]*$/.test(params.id)) return CategoryPage({ classSlug: params.id, search: (await props.searchParams) ?? {} });
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const itemId = Number(params.id);
  const [facts, edges] = await Promise.all([loadItemFacts(), loadEdges()]);
  const page = itemPage(itemId, facts);
  const named = !facts.unreachable && page.name !== null;
  const title = named ? page.name! : `Item ${page.itemId}`;
  // The game file tooltip only for an item players have reported: any id can be typed into the URL, and
  // an item found only in the files may be unreleased (the spoiler rule in docs/DATA_POLICY.md).
  const seen = !facts.unreachable && Boolean(page.name || page.drops.length || page.pins.length);
  // The manifest is read only when there is art to show: the item's tooltip (players reported it) or the icon of
  // a spell the game files say makes or uses it. An id nobody reported and nothing links to reads nothing.
  const spellLinked = edges.client.some((e) => e.fromKind === "item" && e.fromId === itemId && e.toKind === "spell");
  const assets = seen || spellLinked ? await loadSiteAssets() : null;
  const tip = seen ? (await loadItemTips(assets, [itemId])).get(itemId) : undefined;
  const spellIcon = (spellId: number) => assets?.spellIcons.get(spellId);
  const relationIcons = edges.client.some((e) => e.fromKind === "item" && e.fromId === itemId && e.toKind === "spell" && spellIcon(e.toId));
  const category = categoryOf(CLIENT_TAXONOMY, itemId);
  const quality = category?.quality && category.quality.id <= 5 ? qualityOf(category.quality.id) : undefined;

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

  const relationColumns = (head: string): Column<Edge>[] => [
    { key: "target", header: head, cell: (e) => <span className="inline-flex flex-wrap items-center gap-1"><RelationTarget edge={e} rel={e.rel} client={edges.client} spellIcon={spellIcon} /></span> },
    { key: "source", header: "Source", cell: evidence, nowrap: true },
  ];
  const relationTab = (id: string, label: string, r: Rel, head: string, empty: string, action?: { href: string; label: string }): TabItem => {
    const rows = rel(r);
    return {
      id, label, count: rows.length,
      panel: <DataTable caption={`${label}: ${title}`} columns={relationColumns(head)} rows={rows} rowKey={(e) => `${e.evidence}-${e.toKind}-${e.toId}`} empty={<EmptyState framed={false} message={empty} action={action} />} />,
    };
  };

  const dropColumns: Column<(typeof page.drops)[number]>[] = [
    { key: "source", header: "Source", cell: (d) => <Link href={d.sourceNpcId !== undefined ? `/database/npcs/${d.sourceNpcId}` : `/database/objects/${d.sourceObjectId}`} className={LINK}>{d.source}</Link> },
    { key: "windows", header: "Loot windows", numeric: true, cell: (d) => d.kills },
    { key: "drops", header: "Drops", numeric: true, cell: (d) => d.drops },
    { key: "rate", header: "Observed frequency", numeric: true, cell: (d) => percent(d.rate) },
    { key: "installs", header: "Install IDs", numeric: true, cell: (d) => d.reporters },
  ];
  const pinColumns: Column<(typeof page.pins)[number]>[] = [
    { key: "npc", header: "NPC", cell: (p) => <Link href={`/database/npcs/${p.npcId}`} className={LINK}>{p.name ?? `NPC ${p.npcId}`}</Link> },
    { key: "map", header: "Map", numeric: true, cell: (p) => p.mapId },
    { key: "at", header: "Position", numeric: true, cell: (p) => `${p.x}, ${p.y}` },
    { key: "installs", header: "Reporters", numeric: true, cell: (p) => p.reporters },
    { key: "show", header: "", cell: (p) => { const href = pinLink(p.mapId, p.x, p.y); return href ? <Link href={href} className={LINK}>Show on the map</Link> : null; } },
  ];

  const related = [...rel("part_of_set"), ...rel("same_icon")];
  const tabs: TabItem[] = [
    {
      id: "dropped-by", label: "Dropped by", count: facts.unreachable ? undefined : page.drops.length,
      panel: (
        <DataTable
          caption={`Where ${title} drops`}
          columns={dropColumns}
          rows={facts.unreachable ? [] : page.drops}
          rowKey={(d) => d.source}
          empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="Nobody has looted this in Forever yet. A source shows here once 3 installs record it." />}
          footer={page.drops.length > 0 ? <span>A loot window is a recorded loot, not a verified kill, so a frequency is not a drop chance.</span> : undefined}
        />
      ),
    },
    relationTab("sold-by", "Sold by", "sold_by", "Vendor", "No vendor seen selling this yet. A vendor shows here once 3 installs agree."),
    relationTab("created-by", "Created by", "created_by", "Recipe", `No recipe in build ${BUILD} makes this.`, { href: "/tools/professions", label: "Profession hubs" }),
    relationTab("used-in", "Used in", "reagent_for", "Recipe", `No recipe in build ${BUILD} uses this.`, { href: "/tools/professions", label: "Profession hubs" }),
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
            { key: "target", header: "With", cell: (e: Edge) => (e.rel === "same_icon" ? <SameIcon edge={e} self={itemId} client={edges.client} /> : <RelationTarget edge={e} rel={e.rel} client={edges.client} />) },
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

  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={trail}
          title={title}
          quality={named ? quality : undefined}
          icon={tip?.icon ? <GameIcon src={tip.icon} size={48} className="rounded-control" /> : undefined}
          meta={
            <>
              {named && <span className="font-mono tabular-nums">Item {itemId}</span>}
              {category?.quality && <span className={quality ? QUALITY_TEXT[quality] : undefined}>{category.quality.name}</span>}
              {!named && <Badge tone="files">Unconfirmed</Badge>}
            </>
          }
        />
        <EntityLayout
          rail={
            <>
              <TooltipFrame name={tip?.name ?? title} quality={tip ? quality : undefined} label={`${tip?.name ?? title}, from the game files`} foot={`Build ${BUILD}`}>
                {tooltipLines.map((line, i) => <p key={i}>{line}</p>)}
              </TooltipFrame>
              <FactsCard
                title="Game files"
                unconfirmed
                facts={category ? [
                  { label: "Item ID", value: <span className="font-mono tabular-nums">{itemId}</span> },
                  { label: "Class", value: category.class ? <Link href={itemsHref(category.class.slug)} className={LINK}>{category.class.label}</Link> : "Not read" },
                  { label: "Subclass", value: category.class && category.subclass ? <Link href={itemsHref(category.class.slug, category.subclass.slug)} className={LINK}>{category.subclass.name ?? `Subclass ${category.subclass.id}`}</Link> : "Not read" },
                  { label: "Slot", value: category.slot?.name ?? "None" },
                  { label: "Quality", value: category.quality ? <span className={quality ? QUALITY_TEXT[quality] : undefined}>{category.quality.name}</span> : "Not read" },
                  { label: "Build", value: <span className="font-mono tabular-nums">{BUILD}</span> },
                ] : [
                  { label: "Item ID", value: <span className="font-mono tabular-nums">{itemId}</span> },
                  { label: `In build ${BUILD}`, value: "Not found" },
                ]}
              />
              {!facts.unreachable && (
                <FactsCard
                  title="Seen by players"
                  facts={[
                    { label: "Name", value: page.name ?? undefined },
                    { label: "Drop sources", value: page.drops.length ? page.drops.length : undefined },
                    { label: "Map positions", value: page.pins.length ? page.pins.length : undefined },
                  ]}
                />
              )}
            </>
          }
        >
          <Tabs label={`${title}: relations`} tabs={tabs} />
          {!facts.unreachable && (page.name !== null || page.drops.length > 0) && <AdSlot slot="inContent" />}
        </EntityLayout>
        <SourceLine build={BUILD}>
          {(category || all.some((e) => e.evidence === "client")) && GAME_DATA_CREDIT}
          {assets && (tip || relationIcons) && <>{" "}<GameCredit as="span" version={assets.version} label={assets.label} /></>}
        </SourceLine>
      </article>
    </Container>
  );
}
