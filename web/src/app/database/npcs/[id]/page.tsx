import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage } from "../../../../../../kb/src/world-pages";
import { computeRollups, loadWorldFacts } from "@/lib/rollup-compute";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";
import { pinLink } from "@/lib/world-map";

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

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · npc</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">{title}</h1>
        <p className="text-sm text-muted">
          {unreachable
            ? STORAGE_UNREACHABLE
            : page.name
              ? `NPC ${page.npcId}`
              : "No agreed name yet. A name needs 3 installs reporting the same one."}
        </p>
      </header>

      {unreachable ? null : (
      <section className="space-y-2">
        <h2 className="text-2xl text-fg">Drops</h2>
        {zero ? (
          <p className="text-sm text-fg">No items observed in {zero.kills} recorded loot windows. {zero.reporters} install IDs.</p>
        ) : dropped.length === 0 ? (
          <p className="text-sm text-fg-2">Loot observations unrecorded. Public frequencies require source observations from 3 install IDs.</p>
        ) : (
          <ul className="text-sm text-fg space-y-1">
            {dropped.map((row) => (
              <li key={row.itemId}>
                <Link href={`/database/items/${row.itemId}`} className="text-accent hover:underline underline-offset-4">Item {row.itemId}</Link>
                {" "}· {row.drops} item observations in {row.kills} loot windows · {row.reporters} install IDs
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <p className="text-sm text-muted">Loot windows are observations, not verified kills. Distinct install IDs do not prove independent players.</p>

      {unreachable ? null : (
      <section className="space-y-2">
        <h2 className="text-2xl text-fg">Map</h2>
        {page.pins.length === 0 ? (
          <p className="text-sm text-fg-2">No agreed position. A pin needs 3 installs on the same map.</p>
        ) : (
          <ul className="text-sm text-fg space-y-1">
            {page.pins.map((pin) => (
              <li key={pin.mapId}>
                Map {pin.mapId} at {pin.x}, {pin.y} · {pin.reporters} reporters
                {pinLink(pin.mapId, pin.x, pin.y) && <>{" · "}<Link href={pinLink(pin.mapId, pin.x, pin.y)!} className="text-accent hover:underline underline-offset-4">Show on the map</Link></>}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <p className="text-sm text-muted">
        <Link href="/database/npcs" className="text-accent hover:underline underline-offset-4">NPC lookup</Link>
      </p>
    </article>
  );
}
