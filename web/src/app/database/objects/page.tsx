import type { Metadata } from "next";
import Link from "next/link";
import { objectList } from "../../../../../kb/src/object-page";
import IdLookup from "@/components/IdLookup";
import { loadObjectFacts } from "@/lib/objects";
import { pageMetadata } from "@/lib/seo";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";

export const metadata: Metadata = pageMetadata({
  title: "WoW Forever objects: chests, herbs and ore",
  description: "Chests, herbs, ore veins and fishing pools players looted in WoW: Forever, with what came out of them. A frequency is public after 3 install reports.",
  path: "/database/objects",
});
export const dynamic = "force-dynamic";

export default async function ObjectsPage() {
  const facts = await loadObjectFacts();
  const objects = objectList(facts);
  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · objects</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Objects</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          Chests, herbs, ore veins and fishing pools, by the id in their GUID, with what players looted from them.
          An object is listed once 3 installs have reported loot windows from it.
        </p>
      </header>
      <IdLookup kind="objects" label="Object id" />
      {facts.unreachable ? (
        <p className="text-fg-2">{STORAGE_UNREACHABLE}</p>
      ) : objects.length === 0 ? (
        <p className="text-fg-2">No object has public loot observations yet. Each needs loot windows from 3 install IDs.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel text-xs font-mono text-muted text-left">
                <th className="px-4 py-3">Object</th>
                <th className="px-4 py-3 text-right">Loot windows</th>
                <th className="px-4 py-3 text-right">Items seen</th>
                <th className="px-4 py-3 text-right">Install IDs</th>
              </tr>
            </thead>
            <tbody>
              {objects.map((o) => (
                <tr key={o.objectId} className="border-t border-line bg-panel text-fg">
                  <td className="px-4 py-3"><Link href={`/database/objects/${o.objectId}`} className="text-accent hover:underline underline-offset-4">Object {o.objectId}</Link></td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.windows}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.items}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{o.reporters}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted">
        <Link href="/database" className="text-accent hover:underline underline-offset-4">Forever Database</Link>
      </p>
    </article>
  );
}
