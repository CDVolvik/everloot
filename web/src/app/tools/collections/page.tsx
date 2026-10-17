import type { Metadata } from "next";
import Link from "next/link";
import { collectionFactsFromRecords, handleCollectionGap } from "../../../../../kb/src/collection-gap";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collection gap",
  description: "Owned versus missing in a WoW: Forever collection. The list is uploads that agree, not a Battle.net profile.",
  alternates: { canonical: "/tools/collections" },
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CollectionsPage(
  props: {
    searchParams: Promise<{ collection?: string | string[]; install?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const collection = one(searchParams.collection);
  const install = one(searchParams.install);
  const corpus = await uploadStore.loadCorpus();
  const answer = corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleCollectionGap({ collection, ownerInstallId: install }, collectionFactsFromRecords(corpus.records));

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · collection</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Collection gap</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          An item joins the list when 3 installs agree on the collection, the source, and the item.
          Owned is what one install uploaded. This view uses uploaded records, not a Battle.net profile.
        </p>
      </header>

      <form method="get" className="rounded-xl border border-line bg-panel p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Collection</span>
            <input name="collection" defaultValue={collection} className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-fg" />
          </label>
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Install id</span>
            <input name="install" defaultValue={install} className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-fg" />
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-parchment-950">Show the gap</button>
      </form>

      <pre className="whitespace-pre-wrap text-sm text-fg rounded-xl border border-line bg-panel p-5">{answer}</pre>
      {!corpus.unreachable && <p className="text-xs text-muted">{dataAgeLabel(corpus.dataAsOf)}</p>}

      <p className="text-sm text-muted">
        <Link href="/tools/completionist" className="text-accent hover:underline underline-offset-4">Completionist</Link>
      </p>
    </article>
  );
}
