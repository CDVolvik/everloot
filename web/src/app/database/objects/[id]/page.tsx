import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { objectPage } from "../../../../../../kb/src/object-page";
import { formatMeasuredZero } from "../../../../../../kb/src/item-page";
import { loadObjectFacts } from "@/lib/objects";
import { pageMetadata } from "@/lib/seo";
import { STORAGE_UNREACHABLE } from "@/lib/upload-store";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) return { robots: { index: false, follow: true } };
  const facts = await loadObjectFacts();
  const page = objectPage(Number(params.id), facts);
  return {
    ...pageMetadata({ title: `Object ${params.id}`, description: "A WoW: Forever object (chest, herb, ore vein or fishing pool) and what players looted from it.", path: `/database/objects/${params.id}` }),
    robots: { index: !facts.unreachable && Boolean(page.drops.length || page.zero), follow: true },
  };
}

export default async function ObjectPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!/^[1-9]\d*$/.test(params.id)) notFound();
  const facts = await loadObjectFacts();
  const page = objectPage(Number(params.id), facts);

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · object</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Object {page.objectId}</h1>
        <p className="text-sm text-muted">
          {facts.unreachable ? STORAGE_UNREACHABLE : "A chest, herb, ore vein, fishing pool or other object players looted, known by the id in its GUID. Uploads carry no object names yet."}
        </p>
      </header>

      {facts.unreachable ? null : (
        <section className="space-y-2">
          <h2 className="text-2xl text-fg">Drops</h2>
          {page.zero ? (
            <p className="text-sm text-fg">{formatMeasuredZero(page.zero.kills)} · {page.zero.reporters} install IDs.</p>
          ) : page.drops.length === 0 ? (
            <p className="text-sm text-fg-2">
              {page.queued ? "Observed, not yet public: " : ""}Loot observations unrecorded. Public frequencies require source observations from 3 install IDs.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-panel text-xs font-mono text-muted text-left">
                    <th className="px-4 py-3">Item</th>
                    <th className="px-4 py-3 text-right">Loot windows</th>
                    <th className="px-4 py-3 text-right">Drops</th>
                    <th className="px-4 py-3 text-right">Observed frequency</th>
                    <th className="px-4 py-3 text-right">Install IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {page.drops.map((d) => (
                    <tr key={d.itemId} className="border-t border-line bg-panel text-fg">
                      <td className="px-4 py-3"><Link href={`/database/items/${d.itemId}`} className="text-accent hover:underline underline-offset-4">{d.itemName ?? `Item ${d.itemId}`}</Link></td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.kills}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.drops}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{`${(d.rate * 100).toFixed(1)}%`}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.reporters}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <p className="text-sm text-muted">Loot windows are observations, not a count of every time the object was opened. Distinct install IDs do not prove independent players. No map position yet: no upload gives an object a position.</p>

      <p className="text-sm text-muted">
        <Link href="/database/objects" className="text-accent hover:underline underline-offset-4">All objects</Link>
      </p>
    </article>
  );
}
