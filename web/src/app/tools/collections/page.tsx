import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { collectionFactsFromRecords, handleCollectionGap } from "../../../../../kb/src/collection-gap";
import { completionProgress } from "../../../../../kb/src/completion";
import { loadCompletion } from "@/lib/completion-store";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import CompletionView from "./CompletionView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Completionist: Collections, Achievements, Reputation", description: "Owned versus missing in a WoW: Forever collection, plus a character's achievement, reputation, title and quest progress. Lists come from agreeing uploads.", path: "/tools/collections" }),
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CollectionsPage(
  props: {
    searchParams: Promise<{ collection?: string | string[]; install?: string | string[]; character?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const collection = one(searchParams.collection);
  const install = one(searchParams.install);
  const character = one(searchParams.character);
  const corpus = await uploadStore.loadCorpus();
  // An install id with no collection is a completion question: the gap box would only say "Name a collection."
  const showGap = collection.trim() !== "" || install.trim() === "";
  const answer = corpus.unreachable
    ? STORAGE_UNREACHABLE
    : handleCollectionGap({ collection, ownerInstallId: install }, collectionFactsFromRecords(corpus.records));
  const completion = install.trim() ? await loadCompletion() : null;
  const progress = completion ? completionProgress(install, character, completion.facts) : null;
  const completionDown = install.trim() !== "" && completion === null;

  return (
    <article className="space-y-8 max-w-4xl">
      <header className="space-y-3">
        <p className="font-mono text-xs text-muted">WoW: Forever · completionist</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-fg tracking-tight">Collection gap and completion</h1>
        <p className="text-sm text-fg-2 max-w-2xl">
          An item joins a list when 3 installs agree on it. Owned is what one install uploaded.
          This view uses uploaded records, not a Battle.net profile.
        </p>
      </header>

      <form method="get" className="rounded-xl border border-line bg-panel p-5 space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Collection</span>
            <input name="collection" defaultValue={collection} className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-fg" />
          </label>
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Install id</span>
            <input name="install" defaultValue={install} className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-fg" />
          </label>
          <label className="text-sm text-fg-2 space-y-1">
            <span className="block text-xs font-mono text-muted">Character key (optional)</span>
            <input name="character" defaultValue={character} maxLength={8} className="w-full rounded-lg border border-edge bg-canvas px-3 py-2 font-mono text-fg" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary text-sm">Show progress</button>
      </form>

      {showGap && (
        <section className="space-y-3" aria-labelledby="gap-heading">
          <h2 id="gap-heading" className="text-xl text-fg">Collection gap</h2>
          <pre className="whitespace-pre-wrap text-sm text-fg rounded-xl border border-line bg-panel p-5">{answer}</pre>
        </section>
      )}

      <section className="space-y-3" aria-labelledby="completion-heading">
        <h2 id="completion-heading" className="text-xl text-fg">Completion</h2>
        <p className="text-sm text-fg-2 max-w-2xl">
          Per character, from that install&apos;s own upload: what is done, and what is closest to done. Progress needs
          the addon&apos;s completion tracker (off until you turn it on) and an upload that shares your collection ownership.
        </p>
        {completionDown
          ? <p className="text-sm text-fg-2">Completion data is unavailable right now. It is unrecorded, not zero.</p>
          : <CompletionView progress={progress} />}
      </section>

      {!corpus.unreachable && <p className="text-xs text-muted">{dataAgeLabel(completion?.dataAsOf ?? corpus.dataAsOf)}</p>}

      <p className="text-sm text-muted">
        <Link href="/upload" className="text-accent hover:underline underline-offset-4">Upload addon data</Link>
      </p>
    </article>
  );
}
