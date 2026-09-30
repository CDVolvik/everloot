import type { Metadata } from "next";
import Link from "next/link";
import { join } from "node:path";
import { collectionFactsFromRecords, handleCollectionGap } from "../../../../../kb/src/collection-gap";
import { loadUploadRecords } from "../../../../../kb/src/load-uploads";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collection gap",
  description: "Owned versus missing in a WoW: Forever collection. The list is uploads that agree, not a Battle.net profile.",
  alternates: { canonical: "/tools/collections" },
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function CollectionsPage({
  searchParams,
}: {
  searchParams: { collection?: string | string[]; install?: string | string[] };
}) {
  const collection = one(searchParams.collection);
  const install = one(searchParams.install);
  const facts = collectionFactsFromRecords(loadUploadRecords(join(process.cwd(), "data", "uploads")));
  const answer = handleCollectionGap({ collection, ownerInstallId: install }, facts);

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="uppercase tracking-[0.2em] text-xs text-gold-500/80">WoW: Forever · collection</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-parchment-100 tracking-tight">Collection gap</h1>
        <p className="text-sm text-parchment-100/70 max-w-2xl">
          An item joins the list when 3 installs agree on the collection, the source, and the item.
          Owned is what one install uploaded. This is the same answer as the collection_gap tool.
        </p>
      </header>

      <form method="get" className="rounded-xl border border-parchment-100/10 bg-parchment-900 p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Collection</span>
            <input name="collection" defaultValue={collection} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
          <label className="text-sm text-parchment-100/80 space-y-1">
            <span className="block text-xs uppercase tracking-wider text-parchment-100/50">Install id</span>
            <input name="install" defaultValue={install} className="w-full rounded-lg border border-parchment-100/15 bg-parchment-950 px-3 py-2 text-parchment-100" />
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-parchment-950">Show the gap</button>
      </form>

      <pre className="whitespace-pre-wrap text-sm text-parchment-100/85 rounded-xl border border-parchment-100/10 bg-parchment-900 p-5">{answer}</pre>

      <p className="text-sm text-parchment-100/60">
        <Link href="/tools/completionist" className="text-gold-400 hover:underline underline-offset-4">Completionist</Link>
      </p>
    </article>
  );
}
