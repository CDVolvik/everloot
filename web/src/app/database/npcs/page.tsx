import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import IdLookup from "@/components/IdLookup";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever NPC Lookup", description: "Look up a WoW: Forever NPC by id. A name or a map pin becomes public only after three installs agree, and single reports stay queued.", path: "/database/npcs" }),
};

export default function NpcLookupPage() {
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · npcs</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">NPC lookup</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          A name or a map pin is public when 3 installs report the same NPC. One install repeating itself does not count.
        </p>
      </header>
      <IdLookup kind="npcs" label="NPC id" />
      <p className="text-sm text-muted">
        <Link href="/database" className="text-accent hover:underline underline-offset-4">Forever Database</Link>
      </p>
    </article>
  );
}
