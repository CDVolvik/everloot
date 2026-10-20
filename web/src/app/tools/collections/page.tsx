import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { collectionFactsFromRecords, handleCollectionGap } from "../../../../../kb/src/collection-gap";
import { completionProgress } from "../../../../../kb/src/completion";
import { loadCompletion } from "@/lib/completion-store";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import CompletionView from "./CompletionView";
import { trailFor } from "@/lib/breadcrumbs";
import { Card, Container, Disclosure, EmptyState, Field, PageHeader, SectionHeading, SourceLine } from "@/components/ui";

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
  const facts = corpus.unreachable ? null : collectionFactsFromRecords(corpus.records);
  const answer = facts ? handleCollectionGap({ collection, ownerInstallId: install }, facts) : STORAGE_UNREACHABLE;
  // No collection upload of any kind yet: every gap would read "unrecorded".
  const pending = facts !== null && facts.catalog.length + facts.owned.length === 0;
  const completion = install.trim() ? await loadCompletion(install) : null;
  const progress = completion ? completionProgress(install, character, completion.facts) : null;
  const completionDown = install.trim() !== "" && completion === null;

  return (
    <Container>
      <PageHeader
        trail={trailFor("/tools/collections")!}
        title="Collection gap and completion"
        lede="Owned versus missing in a collection, and a character's achievement, reputation, title and quest progress."
        actions={<Link href="/upload" className="btn">Upload addon data</Link>}
      />

      <div className="space-y-8">
        <Card>
          <form method="get" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Collection" name="collection" defaultValue={collection} />
              <Field label="Install id" name="install" defaultValue={install} />
              <Field label="Character key (optional)" name="character" defaultValue={character} maxLength={8} mono />
            </div>
            <button type="submit" className="btn btn-primary text-sm">Show progress</button>
          </form>
        </Card>

        {showGap && (
          <section aria-labelledby="gap-heading">
            <SectionHeading id="gap-heading">Collection gap</SectionHeading>
            {pending
              ? <EmptyState message="No collection list yet: an item joins a list once 3 installs agree on it and its source." />
              : <Card><pre className="whitespace-pre-wrap text-sm text-fg">{answer}</pre></Card>}
          </section>
        )}

        <section aria-labelledby="completion-heading">
          <SectionHeading id="completion-heading">Completion</SectionHeading>
          {completionDown
            ? <Card><p className="text-fg-2" role="status">Completion data is unavailable right now. It is unrecorded, not zero.</p></Card>
            : <CompletionView progress={progress} />}
        </section>

        <Disclosure summary="Where do owned and missing come from?">
          <p>
            An item joins a list when 3 installs agree on it. Owned is what one install uploaded. This view uses
            uploaded records, not a Battle.net profile.
          </p>
          <p>
            Completion is per character, from that install&apos;s own upload: what is done, and what is closest to done.
            Progress needs the addon&apos;s completion tracker (off until you turn it on) and an upload that shares your
            collection ownership.
          </p>
        </Disclosure>
      </div>

      <SourceLine source="Player uploads; a list entry is public once 3 installs agree">
        {corpus.unreachable ? "Storage unreachable" : dataAgeLabel(completion?.dataAsOf ?? corpus.dataAsOf)}
      </SourceLine>
    </Container>
  );
}
