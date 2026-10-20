import type { Metadata } from "next";
import AdSlot from "@/components/AdSlot";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage, stockLabel, vendorPage, type VendorOffer } from "../../../../../../kb/src/world-pages";
import { loadWorldFacts } from "@/lib/rollup-compute";
import { pinLink } from "@/lib/world-map";
import { trailFor } from "@/lib/breadcrumbs";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import ItemTip from "@/components/game/ItemTip";
import GameCredit from "@/components/game/GameCredit";
import { Container, DataTable, EmptyState, PageHeader, SourceLine, Tabs, TooltipFrame } from "@/components/ui";
import { EntityLayout, FactsCard, LINK, Unreachable } from "../../entity";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadWorldFacts();
  const page = vendorPage(Number(params.id), facts);
  return {
    ...pageMetadata({ title: `Vendor ${params.id}`, description: "A WoW: Forever vendor page. A price is public after 3 installs agree on the item and the copper.", path: `/database/vendors/${params.id}` }),
    robots: { index: !facts.unreachable && page.offers.length > 0, follow: true },
  };
}

function formatCopper(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const coins = copper % 100;
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}g`);
  if (silver > 0 || gold > 0) parts.push(`${silver}s`);
  parts.push(`${coins}c`);
  return parts.join(" ");
}

interface Place { href: string; label: string }

export default async function VendorPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const facts = await loadWorldFacts();
  const page = vendorPage(Number(params.id), facts);
  // Where players saw this vendor stand: the NPC pins that 3 installs agree on, as links to the map.
  const places: Place[] = facts.unreachable ? [] : npcPage(page.vendorNpcId, facts).pins.flatMap((pin) => {
    const href = pinLink(pin.mapId, pin.x, pin.y);
    return href ? [{ href, label: `Map ${pin.mapId} at ${pin.x}, ${pin.y}` }] : [];
  });
  const assets = await loadSiteAssets();
  const tips = await loadItemTips(assets, facts.unreachable ? [] : page.offers.map((o) => o.itemId));
  const title = `Vendor NPC ${page.vendorNpcId}`;
  const trail = [...trailFor("/database/vendors")!, { name: title, path: `/database/vendors/${page.vendorNpcId}` }];

  return (
    <Container width="wide">
      <article>
        <PageHeader
          trail={trail}
          title={title}
          meta={<Link href={`/database/npcs/${page.vendorNpcId}`} className={LINK}>NPC {page.vendorNpcId}</Link>}
        />
        <EntityLayout
          rail={
            <>
              <TooltipFrame name={title} label={`${title}, as players saw it`}>
                {places[0] && <p>{places[0].label}</p>}
              </TooltipFrame>
              {!facts.unreachable && (
                <FactsCard
                  title="Seen by players"
                  facts={[
                    { label: "Goods", value: page.offers.length ? `${page.offers.length} prices` : undefined },
                    { label: "Map positions", value: places.length ? places.length : undefined },
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
                id: "goods", label: "Goods", count: facts.unreachable ? undefined : page.offers.length,
                panel: (
                  <DataTable
                    caption={`What ${title} sells`}
                    columns={[
                      { key: "item", header: "Item", cell: (o: VendorOffer) => <ItemTip tip={tips.get(o.itemId)}><Link href={`/database/items/${o.itemId}`} className={LINK}>Item {o.itemId}</Link></ItemTip> },
                      { key: "price", header: "Price", numeric: true, cell: (o: VendorOffer) => formatCopper(o.priceCopper) },
                      { key: "stock", header: "Stock", numeric: true, cell: (o: VendorOffer) => stockLabel(o) },
                      { key: "installs", header: "Reporters", numeric: true, cell: (o: VendorOffer) => o.reporters },
                    ]}
                    rows={facts.unreachable ? [] : page.offers}
                    rowKey={(o) => `${o.itemId}-${o.priceCopper}`}
                    empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="No agreed goods yet. A price shows once 3 installs agree on the item and the copper." />}
                    footer={page.offers.length > 1 ? <span>Two agreed prices for one item both stay listed.</span> : undefined}
                  />
                ),
              },
              {
                id: "map", label: "Map", count: facts.unreachable ? undefined : places.length,
                panel: (
                  <DataTable
                    caption={`Where ${title} stands`}
                    columns={[
                      { key: "where", header: "Position", cell: (p: Place) => p.label },
                      { key: "show", header: "", cell: (p: Place) => <Link href={p.href} className={LINK}>Show on the map</Link> },
                    ]}
                    rows={places}
                    rowKey={(p) => p.href}
                    empty={facts.unreachable ? <Unreachable /> : <EmptyState framed={false} message="No agreed position yet. A pin shows once 3 installs see this vendor on the same map." />}
                  />
                ),
              },
            ]}
          />
          {!facts.unreachable && page.offers.length > 0 && <AdSlot slot="inContent" />}
        </EntityLayout>
        <SourceLine confirmed>
          Distinct install IDs do not prove independent players.
          {assets && tips.size > 0 && <>{" "}<GameCredit inline version={assets.version} label={assets.label} /></>}
        </SourceLine>
      </article>
    </Container>
  );
}
