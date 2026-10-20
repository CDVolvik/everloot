import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Link from "next/link";
import { guildFactsFromRecords, handleGuildBoard } from "../../../../../kb/src/guild-board";
import { STORAGE_UNREACHABLE, uploadStore } from "@/lib/upload-store";
import { dataAgeLabel } from "@/lib/data-age";
import { trailFor } from "@/lib/breadcrumbs";
import { Card, Container, Disclosure, EmptyState, Field, PageHeader, SourceLine } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({ title: "WoW Forever Guild Board", description: "Officer-published WoW: Forever guild roster, progression, loot and item level. A figure is public only when two uploads agree.", path: "/tools/guild-board" }),
};

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function GuildBoardPage(
  props: {
    searchParams: Promise<{ guild?: string | string[]; realm?: string | string[] }>;
  }
) {
  const searchParams = await props.searchParams;
  const guild = one(searchParams.guild);
  const realm = one(searchParams.realm);
  const corpus = await uploadStore.loadCorpus();
  const facts = corpus.unreachable ? null : guildFactsFromRecords(corpus.records);
  const answer = facts ? handleGuildBoard({ guildName: guild, realm }, facts) : STORAGE_UNREACHABLE;
  // No officer upload of any kind yet: every board would read "no agreed" line by line.
  const pending = facts !== null && Object.values(facts).every((rows) => rows.length === 0);

  return (
    <Container>
      <PageHeader
        trail={trailFor("/tools/guild-board")!}
        title="Guild board"
        lede="Roster, bosses, loot and item level from officer uploads; a figure is public when two of them agree."
        actions={<Link href="/guilds/olympus" className="btn">Olympus family record</Link>}
      />

      <div className="space-y-8">
        <Card>
          <form method="get" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Guild" name="guild" defaultValue={guild} />
              <Field label="Realm" name="realm" defaultValue={realm} />
            </div>
            <button type="submit" className="btn btn-primary text-sm">Show the board</button>
          </form>
        </Card>

        {pending
          ? <EmptyState message="No guild board yet: a board fills in once two officers upload the same guild with the Everloot addon." />
          : <Card><pre className="whitespace-pre-wrap text-sm text-fg">{answer}</pre></Card>}

        <Disclosure summary="Why is there no single guild score?">
          <p>A combined guild score is not available; each component is shown separately.</p>
        </Disclosure>
      </div>

      <SourceLine source="Officer uploads, public once two agree">
        {corpus.unreachable ? "Storage unreachable" : dataAgeLabel(corpus.dataAsOf)}
      </SourceLine>
    </Container>
  );
}
