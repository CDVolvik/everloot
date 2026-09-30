import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { npcPage } from "../../../../../../kb/src/world-pages";
import { loadWorldFacts } from "@/lib/rollup-compute";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  return {
    title: `NPC ${params.id}`,
    description: "A WoW: Forever NPC page from corroborated names and map pins.",
    alternates: { canonical: `/database/npcs/${params.id}` },
  };
}

export default async function NpcPage({ params }: { params: { id: string } }) {
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const page = npcPage(Number(params.id), await loadWorldFacts());
  const title = page.name ?? `NPC ${page.npcId}`;

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · npc</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">{title}</h1>
        <p className="text-sm text-parchment-100/60">
          {page.name ? `NPC ${page.npcId}` : "No agreed name yet. A name needs 3 installs reporting the same one."}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="font-display text-2xl text-parchment-100">Map</h2>
        {page.pins.length === 0 ? (
          <p className="text-sm text-parchment-100/70">No agreed position. A pin needs 3 installs on the same map.</p>
        ) : (
          <ul className="text-sm text-parchment-100/85 space-y-1">
            {page.pins.map((pin) => (
              <li key={pin.mapId}>
                Map {pin.mapId} at {pin.x}, {pin.y} · {pin.reporters} reporters
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-parchment-100/60">
        <Link href="/database/npcs" className="text-gold-400 hover:underline underline-offset-4">NPC lookup</Link>
      </p>
    </article>
  );
}
