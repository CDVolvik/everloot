import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage, type NpcPin } from "../../../../../../kb/src/world-pages";
import type { DropRateRow } from "../../../../../../kb/src/item-page";
import { computeRollups, loadWorldFacts } from "@/lib/rollup-compute";
import { pinLink, WORLD_MAP } from "@/lib/world-map";
import { zoneByMapId, zoneHref } from "@/lib/zones";
import { trailFor } from "@/lib/breadcrumbs";
import { Container, DataTable, Facts, Tabs, TooltipFrame, type Column } from "@/components/ui";
import { EmptyTab, EntityHeader, EntityTop, FREQUENCY, known, LINK, percent, Unreachable } from "../../entity";
import { loadItemFacts } from "@/lib/rollup-compute";
import { itemNames } from "@/lib/names";
import { loreForEntity } from "@/lib/lore";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import EntityLink from "@/components/EntityLink";
import LoreSection from "@/components/LoreSection";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadWorldFacts();
  const page = npcPage(Number(params.id), facts);
  return {
    ...pageMetadata({ title: !facts.unreachable && page.name ? page.name : `NPC ${params.id}`, description: "A WoW: Forever NPC page from corroborated names and map pins.", path: `/database/npcs/${params.id}` }),
    robots: { index: !facts.unreachable && Boolean(page.name || page.pins.length), follow: true },
  };
}

const pinColumns: Column<NpcPin>[] = [
  { key: "map", header: "Map", numeric: true, cell: (p) => p.mapId },
  { key: "at", header: "Position", numeric: true, cell: (p) => `${p.x}, ${p.y}` },
  { key: "installs", header: "Reporters", numeric: true, cell: (p) => p.reporters },
  { key: "show", header: "", cell: (p) => { const href = pinLink(p.mapId, p.x, p.y); return href ? <Link href={href} className={LINK}>Show on the map</Link> : null; } },
];

/**
 * In place of a tooltip, a small picture of the zone with the NPC's point on it, linked to the world map.
 * The zone's own map art when the asset manifest has it, otherwise a plain panel of the zone's shape.
 */
function MapThumb({ pin, zone, art }: { pin: NpcPin; zone: string; art: string | null }) {
  const shape = WORLD_MAP.zones.find((z) => z.uiMapId === pin.mapId);
  const href = pinLink(pin.mapId, pin.x, pin.y);
  if (!shape || !href) return null;
  const ratio = `${Math.abs(shape.bounds.left - shape.bounds.right)} / ${Math.abs(shape.bounds.top - shape.bounds.bottom)}`;
  return (
    <figure data-map-thumb className="w-full sm:max-w-tip">
      <Link href={href} aria-label={`${zone} at ${pin.x}, ${pin.y}, on the map`} className="relative block overflow-hidden rounded-[4px] border border-line bg-panel" style={{ aspectRatio: ratio }}>
        {/* The zone's picture from the asset bucket as it is; next/image would only proxy it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {art && <img src={art} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
        <span aria-hidden="true" className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-black/60" style={{ left: `${pin.x}%`, top: `${pin.y}%` }} />
      </Link>
      <figcaption className="mt-1 text-meta text-muted">{zone} · <span className="tabular-nums">{pin.x}, {pin.y}</span></figcaption>
    </figure>
  );
}

export default async function NpcPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const npcId = Number(params.id);
  const facts = await loadWorldFacts();
  const rollup = await computeRollups();
  const unreachable = facts.unreachable || rollup.stats.unreachable;
  const page = npcPage(npcId, facts);
  const title = unreachable ? `NPC ${page.npcId}` : page.name ?? `NPC ${page.npcId}`;
  const zero = rollup.measuredZeros.find((row) => row.public && row.sourceNpcId === npcId);
  const dropped = rollup.rates.filter((row) => row.public && row.sourceNpcId === npcId);
  const firstPin = unreachable ? undefined : page.pins[0];
  const zone = firstPin ? zoneByMapId(firstPin.mapId) : undefined;
  // Item names (and icons, when the game files have them) for the drop list; an item nobody named stays "Item N".
  const itemFacts = unreachable || dropped.length === 0 ? null : await loadItemFacts();
  const names = itemFacts && !itemFacts.unreachable ? itemNames(itemFacts) : new Map<number, string>();
  const assets = dropped.length > 0 || zone ? await loadSiteAssets() : null;
  const tips = await loadItemTips(assets, dropped.map((row) => row.itemId));
  const art = zone ? assets?.maps.find((m) => m.kind === "zone" && m.uiMapId === zone.mapId && !m.heldBack) : undefined;
  const lore = !unreachable && page.name ? loreForEntity("npc", page.name) : null;
  const dropColumns: Column<DropRateRow>[] = [
    { key: "item", header: "Item", cell: (r) => <EntityLink kind="item" id={r.itemId} name={names.get(r.itemId) ?? tips.get(r.itemId)?.name} icon={tips.get(r.itemId)?.icon} /> },
    { key: "windows", header: "Loot windows", numeric: true, cell: (r) => r.kills },
    { key: "drops", header: "Item observations", numeric: true, cell: (r) => r.drops },
    { key: "rate", header: FREQUENCY, numeric: true, cell: (r) => percent(r.rate) },
    { key: "installs", header: "Install IDs", numeric: true, cell: (r) => r.reporters },
  ];
  const trail = [...trailFor("/database/npcs")!, { name: title, path: `/database/npcs/${npcId}` }];
  const named = title !== `NPC ${npcId}`;

  return (
    <Container width="data">
      <article>
        <EntityHeader trail={trail} title={title} meta={["NPC", zone?.name, named ? <span className="tabular-nums">ID {npcId}</span> : null]} />
        <EntityTop
          box={(firstPin && zone && <MapThumb pin={firstPin} zone={zone.name} art={art?.smallUrl ?? art?.url ?? null} />) || (
            <TooltipFrame name={title} label={`${title}, as players saw it`}>
              {firstPin && <p>Map {firstPin.mapId} at {firstPin.x}, {firstPin.y}</p>}
            </TooltipFrame>
          )}
          facts={!unreachable && (
            <Facts
              layout="list"
              label={`${title}: quick facts`}
              items={[
                { label: "Reported name", value: known(page.name) },
                { label: "Zone", value: zone ? <Link href={zoneHref(zone.mapId, zone.name)} className={LINK}>{zone.name}</Link> : known(null) },
                { label: "Map positions", value: known(page.pins.length || null), numeric: true },
                { label: "Drops", value: known(zero ? `None in ${zero.kills} windows` : dropped.length ? `${dropped.length} items` : null) },
              ]}
            />
          )}
        />
        <Tabs
          label={`${title}: relations`}
          tabs={[
            {
              id: "drops", label: "Drops", count: unreachable ? undefined : dropped.length,
              panel: unreachable ? <Unreachable />
                : dropped.length ? <DataTable caption={`What ${title} drops`} columns={dropColumns} rows={dropped} rowKey={(r) => String(r.itemId)} />
                : zero ? <p className="py-3 text-meta text-fg">No items observed in {zero.kills} recorded loot windows. {zero.reporters} install IDs.</p>
                : <EmptyTab message="Nobody has looted this NPC in Forever yet." />,
            },
            {
              id: "map", label: "Map", count: unreachable ? undefined : page.pins.length,
              panel: unreachable ? <Unreachable />
                : page.pins.length ? <DataTable caption={`Where ${title} stands`} columns={pinColumns} rows={page.pins} rowKey={(p) => String(p.mapId)} />
                : <EmptyTab message="No agreed position yet." />,
            },
          ]}
        />
        <div className="mt-6 space-y-6 empty:hidden">
          <LoreSection match={lore} />
          {!unreachable && (page.name !== null || dropped.length > 0 || zero !== undefined) && <AdSlot slot="inContent" />}
        </div>
      </article>
    </Container>
  );
}
