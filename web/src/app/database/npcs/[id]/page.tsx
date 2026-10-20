import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage, type NpcPin } from "../../../../../../kb/src/world-pages";
import type { DropRateRow } from "../../../../../../kb/src/item-page";
import { computeRollups, loadWorldFacts } from "@/lib/rollup-compute";
import { pinLink } from "@/lib/world-map";
import { trailFor } from "@/lib/breadcrumbs";
import { Container, DataTable, EmptyState, PageHeader, SourceLine, Tabs, TooltipFrame, type Column } from "@/components/ui";
import { EntityLayout, FactsCard, LINK, percent, Unreachable } from "../../entity";
import { loadItemFacts } from "@/lib/rollup-compute";
import { itemNames } from "@/lib/names";
import { loreForEntity } from "@/lib/lore";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import EntityLink from "@/components/EntityLink";
import GameCredit from "@/components/game/GameCredit";
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
  // Item names (and icons, when the game files have them) for the drop list; an item nobody named stays "Item N".
  const itemFacts = unreachable || dropped.length === 0 ? null : await loadItemFacts();
  const names = itemFacts && !itemFacts.unreachable ? itemNames(itemFacts) : new Map<number, string>();
  const assets = dropped.length > 0 ? await loadSiteAssets() : null;
  const tips = await loadItemTips(assets, dropped.map((row) => row.itemId));
  const lore = !unreachable && page.name ? loreForEntity("npc", page.name) : null;
  const dropColumns: Column<DropRateRow>[] = [
    { key: "item", header: "Item", cell: (r) => <EntityLink kind="item" id={r.itemId} name={names.get(r.itemId) ?? tips.get(r.itemId)?.name} icon={tips.get(r.itemId)?.icon} /> },
    { key: "windows", header: "Loot windows", numeric: true, cell: (r) => r.kills },
    { key: "drops", header: "Item observations", numeric: true, cell: (r) => r.drops },
    { key: "rate", header: "Observed frequency", numeric: true, cell: (r) => percent(r.rate) },
    { key: "installs", header: "Install IDs", numeric: true, cell: (r) => r.reporters },
  ];
  const trail = [...trailFor("/database/npcs")!, { name: title, path: `/database/npcs/${npcId}` }];
  const firstPin = page.pins[0];

  return (
    <Container width="wide">
      <article>
        <PageHeader trail={trail} title={title} meta={title !== `NPC ${npcId}` ? <span className="font-mono tabular-nums">NPC {npcId}</span> : undefined} />
        <EntityLayout
          rail={
            <>
              <TooltipFrame name={title} label={`${title}, as players saw it`}>
                {firstPin && <p>Map {firstPin.mapId} at {firstPin.x}, {firstPin.y}</p>}
              </TooltipFrame>
              {!unreachable && (
                <FactsCard
                  title="Seen by players"
                  facts={[
                    { label: "Name", value: page.name ?? undefined },
                    { label: "Map positions", value: page.pins.length ? page.pins.length : undefined },
                    { label: "Drops", value: zero ? `None in ${zero.kills} windows` : dropped.length ? `${dropped.length} items` : undefined },
                  ]}
                />
              )}
            </>
          }
        >
          <Tabs
            label={`${title}: relations`}
            tabs={[
              {
                id: "drops", label: "Drops", count: unreachable ? undefined : dropped.length,
                panel: (
                  <DataTable
                    caption={`What ${title} drops`}
                    columns={dropColumns}
                    rows={unreachable ? [] : dropped}
                    rowKey={(r) => String(r.itemId)}
                    empty={unreachable ? <Unreachable /> : zero
                      ? <p className="px-4 py-8 text-fg sm:px-6">No items observed in {zero.kills} recorded loot windows. {zero.reporters} install IDs.</p>
                      : <EmptyState framed={false} message="Nobody has looted this NPC in Forever yet. Its drops show here once 3 installs record them." />}
                    footer={dropped.length > 0 ? <span>A loot window is a recorded loot, not a verified kill, so a frequency is not a drop chance.</span> : undefined}
                  />
                ),
              },
              {
                id: "map", label: "Map", count: unreachable ? undefined : page.pins.length,
                panel: (
                  <DataTable
                    caption={`Where ${title} stands`}
                    columns={pinColumns}
                    rows={unreachable ? [] : page.pins}
                    rowKey={(p) => String(p.mapId)}
                    empty={unreachable ? <Unreachable /> : <EmptyState framed={false} message="No agreed position yet. A pin shows once 3 installs see this NPC on the same map." />}
                  />
                ),
              },
            ]}
          />
          <LoreSection match={lore} />
          {!unreachable && (page.name !== null || dropped.length > 0 || zero !== undefined) && <AdSlot slot="inContent" />}
        </EntityLayout>
        <SourceLine confirmed>
          Distinct install IDs do not prove independent players.
          {assets && tips.size > 0 && <>{" "}<GameCredit as="span" version={assets.version} label={assets.label} /></>}
        </SourceLine>
      </article>
    </Container>
  );
}
