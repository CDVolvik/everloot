import type { Metadata } from "next";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";

export const metadata: Metadata = {
  title: "NPC lookup",
  description: "Look up a WoW: Forever NPC. A name or map pin is public after 3 installs agree.",
  alternates: { canonical: "/database/npcs" },
};

export default function NpcLookupPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · npcs</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">NPC lookup</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          A name or a map pin is public when 3 installs report the same NPC. One install repeating itself does not count.
        </p>
      </header>
      <IdLookup kind="npcs" label="NPC id" />
      <p className="text-sm text-parchment-100/60">
        <Link href="/database" className="text-gold-400 hover:underline underline-offset-4">Forever Database</Link>
      </p>
    </article>
  );
}
