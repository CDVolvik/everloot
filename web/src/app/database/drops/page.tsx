import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { computeRollups } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import { trailFor } from "@/lib/breadcrumbs";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import { loadNames } from "@/lib/names";
import EntityLink from "@/components/EntityLink";
import ItemTip from "@/components/game/ItemTip";
import GameCredit from "@/components/game/GameCredit";
import { Card, Container, DataTable, EmptyState, PageHeader, SourceLine, type Column } from "@/components/ui";
import { percent } from "../entity";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Loot Observations", description: "Observed item frequency per recorded WoW: Forever loot window, with observation and install counts. These are not kill-based drop probabilities.", path: "/database/drops" }),
};
export const dynamic = "force-dynamic";

/** One public row: an item's frequency from a source, or a source whose windows held nothing (itemId null). */
interface Row { key: string; itemId: number | null; sourceNpcId?: number; sourceObjectId?: number; kills: number; drops: number; rate: number | null; reporters: number }

export default async function DropsPage() {
  const { rates, measuredZeros, stats } = await computeRollups();
  const live = rates.filter((r) => r.public);
  const zeros = measuredZeros.filter((z) => z.public);
  // Game icons and tooltips, only when the asset URL is set and the upload has the items.
  const assets = await loadSiteAssets();
  const tips = await loadItemTips(assets, live.map((r) => r.itemId));
  const names = await loadNames();
  const source = (r: Row) => (r.sourceNpcId !== undefined
    ? <EntityLink kind="npc" id={r.sourceNpcId} name={names.npcs.get(r.sourceNpcId)} />
    : <EntityLink kind="object" id={r.sourceObjectId!} />);
  const rows: Row[] = [
    ...live.map((r) => ({ key: `${r.sourceNpcId ?? r.sourceObjectId}-${r.itemId}`, itemId: r.itemId, sourceNpcId: r.sourceNpcId, sourceObjectId: r.sourceObjectId, kills: r.kills, drops: r.drops, rate: r.rate, reporters: r.reporters })),
    ...zeros.map((z) => ({ key: `zero-${z.sourceNpcId ?? "o"}-${z.sourceObjectId ?? "n"}`, itemId: null, sourceNpcId: z.sourceNpcId, sourceObjectId: z.sourceObjectId, kills: z.kills, drops: 0, rate: null, reporters: z.reporters })),
  ];
  const columns: Column<Row>[] = [
    {
      key: "item", header: "Item", cell: (r) => (r.itemId === null ? "No items observed" : (
        <ItemTip tip={tips.get(r.itemId)}>
          <EntityLink kind="item" id={r.itemId} name={names.items.get(r.itemId) ?? tips.get(r.itemId)?.name} />
        </ItemTip>
      )),
    },
    { key: "source", header: "Source", cell: source },
    { key: "windows", header: "Loot windows", numeric: true, cell: (r) => r.kills },
    { key: "drops", header: "Item observations", numeric: true, cell: (r) => r.drops },
    { key: "rate", header: "Observed frequency", numeric: true, cell: (r) => (r.rate === null ? "0 observed" : percent(r.rate)) },
    { key: "installs", header: "Install IDs", numeric: true, cell: (r) => r.reporters },
  ];

  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={trailFor("/database/drops")!}
          title="Forever loot observations"
          lede="How often an item came out of a recorded loot window, per creature or object."
          meta={!stats.unreachable && stats.lootWindows > 0
            ? <span className="font-mono tabular-nums">{stats.lootWindows} windows · {rows.length} public frequencies · {dataAgeLabel(stats.dataAsOf)}</span>
            : undefined}
        />
        {stats.unreachable ? (
          <Card><p className="text-fg-2">{STORAGE_UNREACHABLE}</p></Card>
        ) : (
          <DataTable
            caption="Public loot observations"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.key}
            empty={<EmptyState framed={false} message="No public frequencies yet. One shows here once 3 installs record loot windows from the same creature or object." />}
          />
        )}
        <SourceLine confirmed>
          A loot window is not a verified kill, so a frequency is not a drop chance. Install IDs do not prove independent people.
          {assets && tips.size > 0 && <>{" "}<GameCredit as="span" version={assets.version} label={assets.label} /></>}
        </SourceLine>
      </article>
    </Container>
  );
}
