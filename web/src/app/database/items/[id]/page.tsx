import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { itemPage } from "../../../../../../kb/src/item-page";
import { loadItemFacts } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadItemFacts();
  const page = itemPage(Number(params.id), facts);
  return {
    title: !facts.unreachable && page.name ? page.name : `Item ${params.id}`,
    description: "A WoW: Forever item page from corroborated drops, names, and map pins.",
    alternates: { canonical: `/database/items/${params.id}` },
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

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · item</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">{title}</h1>
        <p className="text-sm text-parchment-100/60">
          {facts.unreachable
            ? STORAGE_UNREACHABLE
            : page.name
              ? `Item ${page.itemId}`
              : "No agreed name yet. A name needs 3 installs reporting the same one."}
        </p>
      </header>

      {facts.unreachable ? null : page.drops.length === 0 ? (
        <p className="text-parchment-100/75">Loot observations unrecorded. Public frequencies require source observations from 3 install IDs.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-parchment-100/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-parchment-900 text-xs uppercase tracking-wider text-parchment-100/60 text-left">
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Loot windows</th>
                <th className="px-4 py-3 text-right">Drops</th>
                <th className="px-4 py-3 text-right">Observed frequency</th>
                <th className="px-4 py-3 text-right">Install IDs</th>
              </tr>
            </thead>
            <tbody>
              {page.drops.map((drop) => (
                <tr key={drop.source} className="border-t border-parchment-100/10 bg-parchment-900 text-parchment-100/85">
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

      <p className="text-sm text-parchment-100/60">Loot windows are observations, not verified kills. These frequencies are not kill-based drop probabilities. Distinct install IDs do not prove independent players.</p>

      {facts.unreachable ? null : (
      <section className="space-y-2">
        <h2 className="font-display text-2xl text-parchment-100">Map</h2>
        {page.pins.length === 0 ? (
          <p className="text-sm text-parchment-100/70">No agreed position. A pin needs 3 installs on the same map.</p>
        ) : (
          <ul className="text-sm text-parchment-100/85 space-y-1">
            {page.pins.map((pin) => (
              <li key={`${pin.npcId}-${pin.mapId}`}>
                NPC {pin.npcId}
                {pin.name ? ` ${pin.name}` : ""} on map {pin.mapId} at {pin.x}, {pin.y} · {pin.reporters} reporters
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <p className="text-sm text-parchment-100/60">
        <Link href="/database/drops" className="text-gold-400 hover:underline underline-offset-4">
          All public loot observations
        </Link>
      </p>
    </article>
  );
}
