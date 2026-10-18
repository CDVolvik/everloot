import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { itemPage } from "../../../../../../kb/src/item-page";
import { loadItemFacts } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { pinLink } from "@/lib/world-map";
import { loadItemTips, loadSiteAssets } from "@/lib/game-assets";
import ItemCard from "@/components/game/ItemCard";
import GameCredit from "@/components/game/GameCredit";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadItemFacts();
  const page = itemPage(Number(params.id), facts);
  return {
    ...pageMetadata({ title: !facts.unreachable && page.name ? page.name : `Item ${params.id}`, description: "A WoW: Forever item page from corroborated drops, names, and map pins.", path: `/database/items/${params.id}` }),
    robots: { index: !facts.unreachable && Boolean(page.name || page.drops.length || page.pins.length), follow: true },
  };
}

export default async function ItemPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const itemId = Number(params.id);
  const facts = await loadItemFacts();
  const page = itemPage(itemId, facts);
  const title = facts.unreachable ? `Item ${page.itemId}` : page.name ?? `Item ${page.itemId}`;
  // The game file tooltip only for an item players have reported: any id can be typed into the URL, and
  // an item found only in the files may be unreleased (the spoiler rule in docs/DATA_POLICY.md).
  const seen = !facts.unreachable && Boolean(page.name || page.drops.length || page.pins.length);
  const assets = seen ? await loadSiteAssets() : null;
  const tip = (await loadItemTips(assets, [itemId])).get(itemId);

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · item</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{title}</h1>
        <p className="text-sm text-muted">
          {facts.unreachable
            ? STORAGE_UNREACHABLE
            : page.name
              ? `Item ${page.itemId}`
              : "No agreed name yet. A name needs 3 installs reporting the same one."}
        </p>
      </header>

      {tip && <ItemCard tip={tip} />}

      {facts.unreachable ? null : page.drops.length === 0 ? (
        <p className="text-fg-2">Loot observations unrecorded. Public frequencies require source observations from 3 install IDs.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel text-xs font-mono text-muted text-left">
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Loot windows</th>
                <th className="px-4 py-3 text-right">Drops</th>
                <th className="px-4 py-3 text-right">Observed frequency</th>
                <th className="px-4 py-3 text-right">Install IDs</th>
              </tr>
            </thead>
            <tbody>
              {page.drops.map((drop) => (
                <tr key={drop.source} className="border-t border-line bg-panel text-fg">
                  <td className="px-4 py-3">{drop.source}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{drop.kills}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{drop.drops}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{`${(drop.rate * 100).toFixed(1)}%`}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{drop.reporters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm text-muted">Loot windows are observations, not verified kills. These frequencies are not kill-based drop probabilities. Distinct install IDs do not prove independent players.</p>

      {facts.unreachable ? null : (
      <section className="space-y-2">
        <h2 className="text-2xl text-fg">Map</h2>
        {page.pins.length === 0 ? (
          <p className="text-sm text-fg-2">No agreed position. A pin needs 3 installs on the same map.</p>
        ) : (
          <ul className="text-sm text-fg space-y-1">
            {page.pins.map((pin) => (
              <li key={`${pin.npcId}-${pin.mapId}`}>
                NPC {pin.npcId}
                {pin.name ? ` ${pin.name}` : ""} on map {pin.mapId} at {pin.x}, {pin.y} · {pin.reporters} reporters
                {pinLink(pin.mapId, pin.x, pin.y) && <>{" · "}<Link href={pinLink(pin.mapId, pin.x, pin.y)!} className="text-accent hover:underline underline-offset-4">Show on the map</Link></>}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <p className="text-sm text-muted">
        <Link href="/database/drops" className="text-accent hover:underline underline-offset-4">
          All public loot observations
        </Link>
      </p>
      {assets && tip && <GameCredit version={assets.version} label={assets.label} />}
    </article>
  );
}
